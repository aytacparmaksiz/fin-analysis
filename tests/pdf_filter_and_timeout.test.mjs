import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { 
  normalizeTextForSearch, 
  scoreFinancialPage, 
  filterFinancialPages,
  scoreActivityPage,
  scorePresentationPage,
  filterActivityPages,
  filterPresentationPages,
  filterDocumentPages
} from '../lib/pdf-filter.ts';
import { 
  cleanAndParseJson,
  enrichAndSanitizeFinancialHistory
} from '../lib/valuation.ts';

describe('PDF Filter & Timeout Resilience', () => {
  describe('Turkish Diacritic & Text Normalization', () => {
    it('normalizes Turkish letters, dotless ı, uppercase İ, and diacritics', () => {
      assert.equal(normalizeTextForSearch('BİLANÇO'), 'bilanco');
      assert.equal(normalizeTextForSearch('Gelir Tablosu'), 'gelir tablosu');
      assert.equal(normalizeTextForSearch('KÂR VEYA ZARAR TABLOSU'), 'kar veya zarar tablosu');
      assert.equal(normalizeTextForSearch('Özkaynak Değişim'), 'ozkaynak degisim');
      assert.equal(normalizeTextForSearch('Nakit Akışları'), 'nakit akislari');
      assert.equal(normalizeTextForSearch('Dönen Varlıklar'), 'donen varliklar');
      assert.equal(normalizeTextForSearch('Kısa Vadeli Yükümlülükler'), 'kisa vadeli yukumlulukler');
    });
  });

  describe('Primary Statement Keyword Coverage (All 9 Required Keywords)', () => {
    const requiredKeywords = [
      'Bilanço',
      'Gelir Tablosu',
      'Nakit Akış',
      'Finansal Durum',
      'Kar veya Zarar',
      'Özkaynak Değişim',
      'Teknik Bölüm',
      'Varlıklar',
      'Yükümlülükler'
    ];

    for (const kw of requiredKeywords) {
      it(`identifies and scores primary statement keyword: "${kw}"`, () => {
        const sampleText = `${kw} Tablosu \n 1.250.000 TL \n 450.000 TL \n (120.000) TL \n 85.000 TL \n 34.000 TL`;
        const res = scoreFinancialPage(sampleText, 5);
        assert.ok(res.isPrimary, `Keyword "${kw}" must mark isPrimary as true`);
        assert.ok(res.score >= 12, `Keyword "${kw}" must have score >= 12 (got ${res.score})`);
        assert.ok(res.matchedKeywords.length > 0, `Keyword "${kw}" must record matched keywords`);
      });
    }

    it('identifies KAP standard statement headers: Varlıklar and Yükümlülükler', () => {
      const pageAssets = 'KONSOLİDE FİNANSAL DURUM BİLGİLERİ VARLIKLAR \n Dönen Varlıklar: 1.000.000 TL \n Duran Varlıklar: 2.000.000 TL';
      const scoreAssets = scoreFinancialPage(pageAssets, 5);
      assert.ok(scoreAssets.isPrimary, 'Assets page must be isPrimary');
      assert.ok(scoreAssets.score >= 12, `Assets score must be >= 12 (got ${scoreAssets.score})`);

      const pageLiabilities = 'KONSOLİDE FİNANSAL DURUM BİLGİLERİ YÜKÜMLÜLÜKLER VE ÖZKAYNAKLAR \n Kısa Vadeli Yükümlülükler: 500.000 TL \n Uzun Vadeli Yükümlülükler: 300.000 TL';
      const scoreLiabilities = scoreFinancialPage(pageLiabilities, 6);
      assert.ok(scoreLiabilities.isPrimary, 'Liabilities page must be isPrimary');
      assert.ok(scoreLiabilities.score >= 12, `Liabilities score must be >= 12 (got ${scoreLiabilities.score})`);
    });
  });

  describe('Page Selection & Continuation Boosting', () => {
    it('preserves all pages for short documents (<= 12 pages)', () => {
      const shortDoc = Array.from({ length: 8 }, (_, i) => `Sayfa metni ${i + 1}`);
      const res = filterFinancialPages(shortDoc, 14);
      assert.equal(res.totalPages, 8);
      assert.equal(res.matchedCount, 8);
      assert.deepEqual(res.selectedIndices, [0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it('filters 80-page KAP filing down to core statements and retains continuation pages without cascading', () => {
      const doc = Array.from({ length: 80 }, (_, i) => `Rapor metni ve aciklamalar sayfa ${i + 1}`);
      doc[0] = 'FAALİYET RAPORU ÖZETİ VE YÖNETİCİ GÖSTERGELERİ';
      doc[5] = 'KONSOLİDE FİNANSAL DURUM BİLGİLERİ VARLIKLAR \n ' + '1.000.000 TL '.repeat(15);
      doc[6] = 'KONSOLİDE FİNANSAL DURUM BİLGİLERİ YÜKÜMLÜLÜKLER \n ' + '500.000 TL '.repeat(15);
      doc[7] = 'KONSOLİDE KÂR VEYA ZARAR TABLOSU \n ' + '2.000.000 TL '.repeat(15);
      doc[8] = 'KONSOLİDE NAKİT AKIŞ TABLOSU \n ' + '3.000.000 TL '.repeat(15);
      doc[20] = 'Satış gelirleri ve hasılat ve brüt kâr detayları dipnotu \n ' + '2.000.000 TL '.repeat(15);
      doc[21] = 'Esas faaliyet kârı ve finansman giderleri dipnotu \n ' + '3.000.000 TL '.repeat(15);

      const res = filterFinancialPages(doc, 14);
      assert.ok(res.matchedCount <= 14, `Matched count must not exceed 14 (got ${res.matchedCount})`);
      // Both Assets (index 5) and Liabilities (index 6) must be selected
      assert.ok(res.selectedIndices.includes(5), 'Assets page (index 5) must be selected');
      assert.ok(res.selectedIndices.includes(6), 'Liabilities continuation page (index 6) must be selected');
      assert.ok(res.selectedIndices.includes(7), 'Income statement page (index 7) must be selected');
      assert.ok(res.selectedIndices.includes(8), 'Cash flow page (index 8) must be selected');
      // Random narrative pages should be excluded
      assert.ok(!res.selectedIndices.includes(40), 'Narrative page 40 must be excluded');
      assert.ok(!res.selectedIndices.includes(70), 'Narrative page 70 must be excluded');
    });

    it('falls back to top scoring pages and first 3 pages on zero-keyword documents', () => {
      const doc = Array.from({ length: 50 }, (_, i) => `Sadece genel metinler sayfa ${i + 1}`);
      const res = filterFinancialPages(doc, 14);
      assert.ok(res.selectedIndices.length >= 4, 'Should select at least 4 fallback pages');
      assert.ok(res.selectedIndices.includes(0), 'Should include page 1');
      assert.ok(res.selectedIndices.includes(1), 'Should include page 2');
      assert.ok(res.selectedIndices.includes(2), 'Should include page 3');
    });
  });

  describe('Clean and Safe JSON Parsing', () => {
    it('parses raw JSON strings', () => {
      const res = cleanAndParseJson('{"ticker": "THYAO", "status": "ok"}');
      assert.equal(res.ticker, 'THYAO');
    });

    it('strips markdown code blocks (```json ... ```)', () => {
      const res = cleanAndParseJson('```json\n{"ticker": "EREGL", "price": 45.2}\n```');
      assert.equal(res.ticker, 'EREGL');
      assert.equal(res.price, 45.2);
    });

    it('extracts embedded JSON when surrounded by commentary', () => {
      const raw = 'İşte çıkardığım veri seti:\n```json\n{"ticker": "KCHOL"}\n```\nUmarım faydalı olur.';
      const res = cleanAndParseJson(raw);
      assert.equal(res.ticker, 'KCHOL');
    });
  });

  describe('API Response Parsing & HTML / Gateway Timeout Interception', () => {
    // Replicate parseApiResponse logic for direct testing
    async function parseApiResponse(res, defaultError) {
      const status = res.status;
      const rawText = await res.text();

      const isHtml = rawText.trim().startsWith('<!DOCTYPE') || rawText.trim().startsWith('<html') || rawText.includes('<body') || rawText.includes('</html>');
      const isTimeout = status === 504 || status === 524 || status === 408 || 
                        /function_invocation_timeout/i.test(rawText) ||
                        /gateway\s*time-?out/i.test(rawText) || 
                        /notification:\s*gateway_timeout/i.test(rawText) ||
                        /timed?\s*out/i.test(rawText) ||
                        /time-?out\s+occurred/i.test(rawText);
      const isPayloadTooLarge = status === 413 || /function_payload_too_large/i.test(rawText) || /payload\s*too\s*large/i.test(rawText);

      if (isTimeout) {
        throw new Error('Sunucu yanıt süresi aşıldı (Gateway Timeout). Lütfen sadece finansal tabloları içeren sayfaları yüklemeyi deneyin.');
      }

      if (isPayloadTooLarge) {
        throw new Error('Yüklenen dosya boyutu sunucu sınırını aştı (Payload Too Large). Lütfen daha az sayıda veya daha küçük boyutlu PDF yükleyin.');
      }

      if (isHtml) {
        throw new Error(`Sunucu veya ağ geçidi beklenmeyen bir HTML yanıtı döndürdü (HTTP ${status}). Lütfen internet bağlantınızı veya kurumsal proxy ayarlarınızı kontrol edip tekrar deneyin.`);
      }

      let parsed = null;
      try {
        parsed = cleanAndParseJson(rawText);
      } catch {
        if (!res.ok) {
          throw new Error(`Sunucu hatası (HTTP ${status}): ${rawText.slice(0, 150)}`);
        }
        throw new Error('Sunucudan geçersiz veri formatı alındı.');
      }

      if (!parsed || typeof parsed !== 'object') {
        if (!res.ok) {
          throw new Error(`Sunucu hatası (HTTP ${status}): ${rawText.slice(0, 150)}`);
        }
        throw new Error('Sunucudan geçersiz veri formatı alındı.');
      }

      if (!res.ok) {
        throw new Error(parsed?.error || defaultError || `İşlem başarısız oldu (HTTP ${status}).`);
      }

      return parsed;
    }

    it('gracefully intercepts the exact ZHCORP 504 Gateway Timeout HTML page', async () => {
      const zhcorp504Html = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd"> <html> <head> <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"> <title>Notification: Gateway Timeout</title> <style type="text/css"> body { font-family: Arial, Helvetica, sans-serif; font-size: 14px; color:#333333; background-color: #ffffff; } </style> </head> <body> <div class="shadow"> <h1>This Page Cannot Be Displayed</h1> <p> The system cannot communicate with the external server (&nbsp;fin-analysis-drab.vercel.app&nbsp;). </p> </div> <div class="details"><p> Date: Wed, 30 Sep 2026 08:29:22 +03<br /> Username: ZHCORP\\aytacpa@zh.corp<br /> Source IP: 10.146.0.78<br /> URL: POST https://fin-analysis-drab.vercel.app/api/extract<br /> Notification: GATEWAY_TIMEOUT </p></div> </body> </html>`;
      const mockResponse = new Response(zhcorp504Html, { status: 504 });

      await assert.rejects(
        async () => await parseApiResponse(mockResponse, 'Veri çıkarımı başarısız oldu.'),
        {
          name: 'Error',
          message: 'Sunucu yanıt süresi aşıldı (Gateway Timeout). Lütfen sadece finansal tabloları içeren sayfaları yüklemeyi deneyin.'
        }
      );
    });

    it('intercepts Cloudflare 524 timeout and Nginx 504 Gateway Time-out', async () => {
      const cloudflareResp = new Response('error code: 524\nA timeout occurred', { status: 524 });
      await assert.rejects(
        async () => await parseApiResponse(cloudflareResp, 'Hata'),
        { message: 'Sunucu yanıt süresi aşıldı (Gateway Timeout). Lütfen sadece finansal tabloları içeren sayfaları yüklemeyi deneyin.' }
      );

      const nginxResp = new Response('<html><body><h1>504 Gateway Time-out</h1></body></html>', { status: 504 });
      await assert.rejects(
        async () => await parseApiResponse(nginxResp, 'Hata'),
        { message: 'Sunucu yanıt süresi aşıldı (Gateway Timeout). Lütfen sadece finansal tabloları içeren sayfaları yüklemeyi deneyin.' }
      );
    });

    it('intercepts HTTP 413 Payload Too Large', async () => {
      const resp413 = new Response('FUNCTION_PAYLOAD_TOO_LARGE', { status: 413 });
      await assert.rejects(
        async () => await parseApiResponse(resp413, 'Hata'),
        { message: 'Yüklenen dosya boyutu sunucu sınırını aştı (Payload Too Large). Lütfen daha az sayıda veya daha küçük boyutlu PDF yükleyin.' }
      );
    });

    it('intercepts corporate proxy login / captive portal HTML page', async () => {
      const portalHtml = '<html><body><h1>Corporate Proxy Authentication Required</h1></body></html>';
      const mockResponse = new Response(portalHtml, { status: 407 });
      await assert.rejects(
        async () => await parseApiResponse(mockResponse, 'Hata'),
        /Sunucu veya ağ geçidi beklenmeyen bir HTML yanıtı döndürdü \(HTTP 407\)/
      );
    });

    it('parses valid JSON successfully', async () => {
      const mockResponse = new Response(JSON.stringify({ success: true, data: { ticker: 'THYAO' } }), { status: 200 });
      const res = await parseApiResponse(mockResponse, 'Hata');
      assert.equal(res.success, true);
      assert.equal(res.data.ticker, 'THYAO');
    });

    it('extracts API error message from JSON error response', async () => {
      const mockResponse = new Response(JSON.stringify({ error: 'GEMINI_API_KEY eksik.' }), { status: 500 });
      await assert.rejects(
        async () => await parseApiResponse(mockResponse, 'Varsayılan hata'),
        { message: 'GEMINI_API_KEY eksik.' }
      );
    });

    it('intercepts HTTP 429 rate limit response with friendly message', async () => {
      const mockResponse = new Response(JSON.stringify({ error: 'Gemini API hız sınırına ulaşıldı (Rate Limit 429). Lütfen 5 saniye sonra tekrar deneyin.', retryAfter: 5 }), { status: 429 });
      await assert.rejects(
        async () => await parseApiResponse(mockResponse, 'Hata'),
        /Gemini API hız/
      );
    });
    it('intercepts Vercel FUNCTION_INVOCATION_TIMEOUT response', async () => {
      const vercelTimeoutBody = 'An error occurred with your deployment FUNCTION_INVOCATION_TIMEOUT fra1::4brkc-1790749921648-32bcaea113d5';
      const mockResponse = new Response(vercelTimeoutBody, { status: 504 });
      await assert.rejects(
        async () => await parseApiResponse(mockResponse, 'Hata'),
        { message: 'Sunucu yanıt süresi aşıldı (Gateway Timeout). Lütfen sadece finansal tabloları içeren sayfaları yüklemeyi deneyin.' }
      );
    });
  });

  describe('Serverless & Vercel Timeout Resilience', () => {
    it('uses only real official Google Gen AI models in CANDIDATE_MODELS (no 404 models)', async () => {
      const { CANDIDATE_MODELS } = await import('../lib/gemini.ts');
      assert.deepEqual(CANDIDATE_MODELS, ['gemini-2.0-flash', 'gemini-1.5-flash']);
      // Must not contain experimental or fake models
      assert.ok(!CANDIDATE_MODELS.includes('gemini-2.5-flash'));
      assert.ok(!CANDIDATE_MODELS.includes('gemini-3.8-flash'));
      assert.ok(!CANDIDATE_MODELS.includes('gemini-3.6-flash'));
    });

    it('scheduleRequestSlot executes immediately (< 50ms) without in-function 13-second sleep', async () => {
      const { scheduleRequestSlot } = await import('../lib/gemini.ts');
      const start = Date.now();
      const wait = await scheduleRequestSlot(2000);
      const elapsed = Date.now() - start;
      assert.equal(wait, 0);
      assert.ok(elapsed < 50, `scheduleRequestSlot must resolve immediately (took ${elapsed}ms)`);
    });

    it('extractSmartFinancialText safely parses Node.js Buffer without pdfjs Buffer exception', async () => {
      const { extractSmartFinancialText } = await import('../lib/pdf-filter.ts');
      const minimalPdfBase64 = 'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+CmVuZG9iagoyIDAgb2JqPDwvVHlwZS9QYWdlcy9LaWRzWzMgMCBSXS9Db3VudCAxPj4KZW5kb2JqCjMgMCBvYmo8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCA2MTIgNzkyXS9Db250ZW50cyA0IDAgUj4+CmVuZG9iago0IDAgb2JqPDwvTGVuZ3RoIDcwPj4Kc3RyZWFtCkJUCi9GMSAxMiBUZgoxMDAgNzAwIFRkCihLSU5TT0xJREUgRklOQU5TQUwgRFVSVU0gQklMR0lMRVJJIFZBUkxJS0xBUikgVGoKRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1NiAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyMTIgMDAwMDAgbiAKdHJhaWxlcjw8L1NpemUgNS9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjMzMQolJUVPRg==';
      const nodeBuf = Buffer.from(minimalPdfBase64, 'base64');
      
      const res = await extractSmartFinancialText(nodeBuf);
      assert.equal(res.totalPages, 1);
      assert.ok(res.text.includes('VARLIKLAR'));
    });

    it('generateWithRateLimitAndBackoff falls back to secondary model when primary is rate-limited', async () => {
      const { generateWithRateLimitAndBackoff } = await import('../lib/gemini.ts');
      
      const calls = [];
      const mockAi = {
        models: {
          generateContent: async ({ model }) => {
            calls.push(model);
            if (model === 'gemini-2.0-flash') {
              const err = new Error('Resource has been exhausted (e.g. check quota).');
              err.status = 429;
              throw err;
            }
            return { text: JSON.stringify({ success: true, modelUsed: model }) };
          }
        }
      };

      const res = await generateWithRateLimitAndBackoff({
        ai: mockAi,
        baseParams: { contents: 'test' }
      });

      assert.ok(calls.includes('gemini-2.0-flash'), 'Should attempt primary model');
      assert.ok(calls.includes('gemini-1.5-flash'), 'Should fall back to secondary model');
      const parsed = JSON.parse(res.text);
      assert.equal(parsed.modelUsed, 'gemini-1.5-flash');
    });

    it('generateWithRateLimitAndBackoff throws 429 with retryAfter: 5 when all models rate-limited', async () => {
      const { generateWithRateLimitAndBackoff } = await import('../lib/gemini.ts');
      
      const mockAi = {
        models: {
          generateContent: async () => {
            const err = new Error('429 RESOURCE_EXHAUSTED');
            err.status = 429;
            throw err;
          }
        }
      };

      await assert.rejects(
        async () => await generateWithRateLimitAndBackoff({
          ai: mockAi,
          baseParams: { contents: 'test' }
        }),
        (err) => {
          assert.equal(err.status, 429);
          assert.equal(err.retryAfter, 5);
          assert.equal(err.isRateLimit, true);
          return true;
        }
      );
    });

    it('handles sampled > 40 page document arrays (first 25 + last 10) without crashing', () => {
      const totalPages = 100;
      const sampledDoc = new Array(totalPages).fill('');
      // Populate pages in the first 25
      sampledDoc[0] = 'FAALİYET RAPORU ÖZETİ';
      sampledDoc[4] = 'KONSOLİDE FİNANSAL DURUM BİLGİLERİ VARLIKLAR \n ' + '1.000.000 TL '.repeat(15);
      sampledDoc[5] = 'KONSOLİDE FİNANSAL DURUM BİLGİLERİ YÜKÜMLÜLÜKLER \n ' + '500.000 TL '.repeat(15);
      sampledDoc[6] = 'KONSOLİDE KÂR VEYA ZARAR TABLOSU \n ' + '2.000.000 TL '.repeat(15);
      sampledDoc[7] = 'KONSOLİDE NAKİT AKIŞ TABLOSU \n ' + '3.000.000 TL '.repeat(15);
      // Populate pages in the last 10 (e.g. index 95)
      sampledDoc[95] = 'FİNANSAL GÖSTERGELER VE BORÇLULUK DİPNOTLARI \n ' + '5.000.000 TL '.repeat(25);

      const res = filterFinancialPages(sampledDoc, 14);
      assert.equal(res.totalPages, 100);
      assert.ok(res.selectedIndices.includes(4), 'Should include balance sheet assets (page 5)');
      assert.ok(res.selectedIndices.includes(5), 'Should include balance sheet liabilities (page 6)');
      assert.ok(res.selectedIndices.includes(6), 'Should include income statement (page 7)');
      assert.ok(res.selectedIndices.includes(7), 'Should include cash flow statement (page 8)');
      assert.ok(res.selectedIndices.includes(95), 'Should include note page 96');
      assert.ok(res.matchedCount <= 14);
    });
  });

  describe('3-Area Separated Upload Architecture & Categorized Filtering', () => {
    it('scoreActivityPage accurately identifies Activity Report keywords and guidance', () => {
      const page1 = 'YÖNETİM KURULU BAŞKANI MESAJI \n 2025 yılında pazar payımızı %24 seviyesine çıkardık.';
      const res1 = scoreActivityPage(page1, 1);
      assert.ok(res1.score >= 10);
      assert.ok(res1.isGuidance);

      const pageRisk = 'İÇ KONTROL VE RİSK YÖNETİMİ \n Döviz kuru ve faiz riski analizi.';
      const resRisk = scoreActivityPage(pageRisk, 25);
      assert.ok(resRisk.score >= 10);
      assert.ok(resRisk.matchedKeywords.length > 0);
    });

    it('filterActivityPages preserves guidance and risk management pages from 60-page filing', () => {
      const doc = Array.from({ length: 60 }, (_, i) => `Genel kurumsal metin sayfa ${i + 1}`);
      doc[0] = 'FAALİYET RAPORU İÇİNDEKİLER VE YÖNETİCİ ÖZETİ';
      doc[2] = 'GENEL MÜDÜR MESAJI VE GELECEĞE YÖNELİK BEKLENTİLER \n 2026 ciro hedefi 15 milyar TL.';
      doc[15] = 'RİSK YÖNETİMİ VE RİSKLERİN DEĞERLENDİRİLMESİ \n Kredi ve likidite risk matrisi.';
      doc[22] = 'GÜÇLÜ YÖNLER VE FIRSATLAR SWOT ANALİZİ \n Pazar liderliği ve ihracat kanalları.';

      const res = filterActivityPages(doc, 14);
      assert.ok(res.matchedCount <= 14);
      assert.ok(res.selectedIndices.includes(0), 'Page 1 must be selected');
      assert.ok(res.selectedIndices.includes(2), 'General Manager message (index 2) must be selected');
      assert.ok(res.selectedIndices.includes(15), 'Risk management (index 15) must be selected');
      assert.ok(res.selectedIndices.includes(22), 'SWOT analysis (index 22) must be selected');
    });

    it('scorePresentationPage and filterPresentationPages preserve investor deck targets', () => {
      const pageDeck = 'YATIRIMCI SUNUMU 2026 STRATEJİK HEDEFLER \n Ciro büyüme hedefi %45, FAVÖK marjı %28, CAPEX planı 500 Mn TL.';
      const resScore = scorePresentationPage(pageDeck, 4);
      assert.ok(resScore.score >= 15);
      assert.ok(resScore.isPrimary);

      const deck = Array.from({ length: 45 }, (_, i) => `Slayt ${i + 1}`);
      deck[0] = 'YATIRIMCI SUNUMU BAŞLIK';
      deck[5] = 'ORTA VADELİ HEDEFLER VE MARJ BEKLENTİLERİ %35 %45 %20';
      deck[12] = 'CAPEX PLANI VE YATIRIM BÜTÇESİ %15 %25';

      const resFilter = filterPresentationPages(deck, 14);
      assert.ok(resFilter.matchedCount <= 14);
      assert.ok(resFilter.selectedIndices.includes(0));
      assert.ok(resFilter.selectedIndices.includes(5));
      assert.ok(resFilter.selectedIndices.includes(12));
    });

    it('filterDocumentPages properly routes requests according to category parameter', () => {
      const pages = Array.from({ length: 25 }, (_, i) => `Sayfa ${i + 1}`);
      pages[3] = 'KONSOLİDE BİLANÇO VE FİNANSAL DURUM TABLOSU \n 1.000.000 TL \n 2.000.000 TL';
      pages[8] = 'YÖNETİM KURULU BAŞKANI MESAJI VE HEDEFLER';
      pages[12] = 'YATIRIMCI SUNUMU GELECEK HEDEFLERİ';

      const finRes = filterDocumentPages(pages, 'financial', 14);
      assert.ok(finRes.selectedIndices.includes(3), 'Financial category must capture balance sheet');

      const actRes = filterDocumentPages(pages, 'activity', 14);
      assert.ok(actRes.selectedIndices.includes(8), 'Activity category must capture board message');

      const presRes = filterDocumentPages(pages, 'presentation', 14);
      assert.ok(presRes.selectedIndices.includes(12), 'Presentation category must capture investor presentation');
    });

    it('enrichAndSanitizeFinancialHistory enforces pure deterministic math with zero hallucination', () => {
      const rawData = {
        ticker: 'EREGL',
        sector: 'INDUSTRIAL',
        financial_history: [
          {
            period: '2025/12',
            revenue: 1000000,
            gross_profit: 250000,
            ebitda: 200000,
            net_income: 120000,
            equity: 800000,
            total_assets: 1600000,
            current_assets: 600000,
            cash_and_equivalents: 200000,
            operating_cash_flow: 180000,
            capex: 50000,
          }
        ]
      };

      const enriched = enrichAndSanitizeFinancialHistory(rawData);
      const item = enriched.financial_history[0];

      // Pure math verifications:
      // Gross margin: (250000 / 1000000) * 100 = 25.0%
      assert.equal(item.gross_margin, 25.0);
      // EBITDA margin: (200000 / 1000000) * 100 = 20.0%
      assert.equal(item.ebitda_margin, 20.0);
      // Net margin: (120000 / 1000000) * 100 = 12.0%
      assert.equal(item.net_margin, 12.0);
      // ROE: (120000 / 800000) * 100 = 15.0%
      assert.equal(item.roe, 15.0);
      // ROA: (120000 / 1600000) * 100 = 7.5%
      assert.equal(item.roa, 7.5);
      // Kaldıraç: ((1600000 - 800000) / 1600000) * 100 = 50.0%
      assert.equal(item.leverage_ratio, 50.0);
      // Non-current assets derived: 1600000 - 600000 = 1000000
      assert.equal(item.non_current_assets, 1000000);
      // FCF: 180000 - 50000 = 130000
      assert.equal(item.free_cash_flow, 130000);

      // ZERO HALLUCINATION TEST:
      // If bank/insurance specific fields like npl_ratio or car_ratio were NOT reported,
      // they must NOT be hallucinated or invented; they must be undefined or null!
      assert.ok(item.npl_ratio == null, 'npl_ratio must be null or undefined if not reported');
      assert.ok(item.car_ratio == null, 'car_ratio must be null or undefined if not reported');
    });
  });
});


