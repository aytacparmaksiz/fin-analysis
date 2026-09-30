import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { 
  normalizeTextForSearch, 
  scoreFinancialPage, 
  filterFinancialPages 
} from '../lib/pdf-filter.ts';
import { cleanAndParseJson } from '../lib/valuation.ts';

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
});

