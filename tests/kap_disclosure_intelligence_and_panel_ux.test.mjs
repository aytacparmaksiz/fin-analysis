import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  sanitizeDisclosureTitle,
  deriveMeaningfulDisclosureTitle,
  extractDisclosureMetrics,
  extractKapDisclosureBody,
  categorizeDisclosure,
  buildDisclosureKeySummary,
  buildDisclosureKeyTakeaways,
  formatPriceSensitiveText,
  formatCompactCurrencyAmount,
  parseKapPublishDate,
  fetchLiveBistNewsFeed,
  isStrictCorporateAnnouncement,
} from '../lib/news-service.ts';
import {
  buildForensicPortfolioPlan,
  computeCapitalAllocationPlan,
  DEFAULT_PORTFOLIO_ARCHITECT_CONFIG,
  PORTFOLIO_ARCHITECT_PRESETS,
} from '../lib/portfolio-architect.ts';
import {
  computeSectorValuationAndDrivers,
  calculateCompanyMultiples,
} from '../lib/valuation.ts';

const ROOT = process.cwd();
const sha256 = (rel) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');

describe('KAP Disclosure Intelligence & Redesigned Panel UI/UX Verification Suite', () => {
  it('1. BRISA Rekabet Kurumu Fine: meaningful title, NEGATIVE/PENALTY impact, metrics, zero boilerplate', () => {
    const rawBigparaTitle = '***BRISA*** BRİSA BRIDGESTONE SABANCI LASTİK SANAYİ VE TİCARET A.Ş.(Özel Durum Açıklaması (Genel))';
    const sanitized = sanitizeDisclosureTitle(rawBigparaTitle, 'BRISA', 'Brisa');
    assert.equal(sanitized, 'Özel Durum Açıklaması (Genel)', 'Nested parentheses must not truncate into unclosed "(Genel"');

    // Also repairs already-truncated dangling open paren
    assert.equal(sanitizeDisclosureTitle('Özel Durum Açıklaması (Genel', 'BRISA'), 'Özel Durum Açıklaması (Genel)');

    const brisaBody = [
      '10 Haziran 2026 tarihli özel durum açıklamamızda, Rekabet Kurumu tarafından, kısa karar yazısı ile Şirketimize toplam 1.019.069.577 TL idari para cezası verilmesine karar verildiği ve gerekçeli kararın ayrıca tebliğ edileceği bildirilmişti.',
      'Konuya ilişkin gerekçeli karar Şirketimize tebliğ edilmiş olup, idari para cezası, yasal haklarımız saklı tutulmak kaydıyla, %25 oranında peşin ödeme indiriminden yararlanılmak suretiyle, 764.302.183 TL olarak 30 günlük ödeme süresi içinde ödenecektir. Söz konusu karara karşı bütün yasal haklarımız kullanılacaktır.'
    ].join('\n\n');

    const title = deriveMeaningfulDisclosureTitle({
      rawTitle: 'Özel Durum Açıklaması (Genel)',
      kapSummary: 'Rekabet Kurumu gerekçeli karar',
      bodyText: brisaBody,
      ticker: 'BRISA',
      companyName: 'Brisa'
    });
    assert.ok(title.includes('Rekabet Kurumu') && title.includes('İdari Para Cezası'), `Title must clearly express Rekabet Kurumu fine, got: ${title}`);
    assert.ok(title.includes('764,3 Mn TL') && title.includes('%25'), `Title must surface discounted amount & rate, got: ${title}`);
    assert.ok(!title.includes('Özel Durum Açıklaması'), 'Title must not remain generic');

    const cat = categorizeDisclosure(title, brisaBody);
    assert.equal(cat.impact, 'NEGATIVE');
    assert.equal(cat.eventType, 'PENALTY');
    assert.equal(cat.categoryLabel, 'İdari Ceza / Yaptırım');

    const metrics = extractDisclosureMetrics({ title, bodyText: brisaBody });
    assert.ok(metrics.some(m => m.label === 'İndirimli Ödeme' && m.value === '764,3 Mn TL' && m.tone === 'negative'));
    assert.ok(metrics.some(m => m.label === 'Brüt Ceza' && m.value === '1,02 Mr TL' && m.tone === 'negative'));
    assert.ok(metrics.some(m => m.label === 'Peşin İndirim' && m.value === '%25'));
    assert.ok(metrics.some(m => m.label === 'Ödeme Süresi' && m.value === '30 Gün'));

    const summary = buildDisclosureKeySummary(title, 'BRISA', 'Brisa', cat.category, brisaBody, 'Rekabet Kurumu gerekçeli karar');
    assert.ok(summary.includes('**764.302.183 TL**') && summary.includes('**%25**'), `Summary must highlight real figures, got: ${summary}`);
    assert.ok(!summary.includes('mevzuat hükümleri uyarınca kamuoyunu aydınlatma amacıyla'), 'Must NEVER output generic boilerplate');

    const takeaways = buildDisclosureKeyTakeaways(title, 'BRISA', 'Brisa', cat.category, brisaBody);
    assert.ok(takeaways.length >= 2 && takeaways.length <= 4, 'Should extract 2-4 real factual bullets');
    assert.ok(takeaways.some(t => t.includes('**1.019.069.577 TL**')));
    assert.ok(takeaways.some(t => t.includes('**764.302.183 TL**')));
    assert.ok(!takeaways.some(t => t.includes('mevzuat hükümleri doğrultusunda resmi duyuru yayımlanmıştır')), 'Takeaways must NEVER output boilerplate');
  });

  it('2. Contracts (Turkish ABD Doları & Avro), Bond Coupon, Buyback, Dividend & Bare Finansal Rapor', () => {
    // Turkish "ABD Doları" non-ASCII boundary handling
    assert.equal(formatCompactCurrencyAmount('1,1 milyar ABD Doları'), '1,1 Mr USD');
    assert.equal(formatCompactCurrencyAmount('1.281.101.744 Avro'), '1,28 Mr Avro');
    assert.ok(
      formatPriceSensitiveText('toplam tutarı 1,1 milyar ABD Doları olan ihracat sözleşmesi').includes('**1,1 milyar ABD Doları**'),
      'Must bold Turkish ABD Doları amount'
    );

    const aselsExportTitle = deriveMeaningfulDisclosureTitle({
      rawTitle: 'Yeni İş İlişkisi',
      kapSummary: 'Sözleşme İmzalanması',
      bodyText: 'ASELSAN, uluslararası bir müşterisi ile Hava Savunma Sistemlerinin satışına ilişkin toplam tutarı 1,1 milyar ABD Doları olan ihracat sözleşmesi imzalamıştır.',
      ticker: 'ASELS'
    });
    assert.ok(aselsExportTitle.includes('1,1 Mr USD') && aselsExportTitle.includes('Hava Savunma Sistemleri'), `Got: ${aselsExportTitle}`);
    assert.ok(!aselsExportTitle.includes('Sistemlerinin'), 'Must strip Turkish genitive suffix cleanly');

    const aselsRoketsanTitle = deriveMeaningfulDisclosureTitle({
      rawTitle: 'Yeni İş İlişkisi',
      kapSummary: 'Sözleşme İmzalanması',
      bodyText: 'ASELSAN ile ROKETSAN arasında Füze Veri Bağı ve Arayıcı Başlık Sistemlerinin tedariki kapsamında toplam tutarı 1.281.101.744 Avro olan sözleşmeler imzalanmıştır.',
      ticker: 'ASELS'
    });
    assert.ok(aselsRoketsanTitle.includes('ROKETSAN') && aselsRoketsanTitle.includes('1,28 Mr Avro'), `Got: ${aselsRoketsanTitle}`);

    const bondTitle = deriveMeaningfulDisclosureTitle({
      rawTitle: 'Pay Dışında Sermaye Piyasası Aracı İşlemlerine İlişkin Bildirim (Faiz İçeren)',
      kapSummary: 'TRSBRSA22817 ISIN Kodlu Tahvilin 3.Kupon Ödemesi',
      bodyText: 'Şirketimizin TRSBRSA22817 ISIN kodlu tahvilinin üçüncü kupon ödemesi 16 Kasım 2026 tarihinde (bugün) gerçekleştirilmiştir.',
      ticker: 'BRISA'
    });
    assert.ok(bondTitle.includes('Kupon Ödemesi') && bondTitle.includes('TRSBRSA22817'), `Got: ${bondTitle}`);

    const frTitle = deriveMeaningfulDisclosureTitle({
      rawTitle: 'Finansal Rapor',
      kapSummary: '',
      bodyText: '',
      ticker: 'THYAO',
      year: 2026,
      period: '3'
    });
    assert.equal(frTitle, '2026 3. Çeyrek (9 Aylık) Finansal Raporu');

    const buybackTitle = deriveMeaningfulDisclosureTitle({
      rawTitle: 'Payların Geri Alınmasına İlişkin Bildirim',
      bodyText: 'Şirketimizce Borsa İstanbul\'da 125.000 adet pay 48,50 TL ortalama fiyatla geri alınmıştır.',
      ticker: 'TURSG'
    });
    assert.ok(buybackTitle.includes('125.000 Adet') && buybackTitle.includes('48,50 TL'), `Got: ${buybackTitle}`);

    const divTitle = deriveMeaningfulDisclosureTitle({
      rawTitle: 'Kâr Payı Dağıtım İşlemlerine İlişkin Bildirim',
      bodyText: 'Yönetim Kurulumuz pay başına net 12,45 TL nakit temettü dağıtılmasına karar vermiştir.',
      ticker: 'FROTO'
    });
    assert.ok(divTitle.includes('12,45 TL') && divTitle.includes('Temettü'), `Got: ${divTitle}`);
  });

  it('3. KAP HTML Body Extractor strips hidden English, deduplicates SSR/RSC blocks & decodes entities', () => {
    const fakeKapHtml = `
      <table><tr>
        <td class="taxonomy-context-value-summernote content-tr"><div>ASELSAN&#160;ile ROKETSAN arasında 1.281.101.744 Avro sözleşme imzalandı.</div><div>(İşbu açıklamamız ile açıklamamızın İngilizce çevirisinde herhangi bir farklılık olması durumunda, Türkçe açıklama esas kabul edilecektir.)</div></td>
        <td class="taxonomy-context-value-summernote content-en" style="display: none;"><div>An agreement worth EUR 1.28B was signed.</div></td>
      </tr></table>
      <script>self.__next_f.push([1,"\\u003ctd class=\\"taxonomy-context-value-summernote content-tr\\"\\u003e\\u003cdiv\\u003eASELSAN&#160;ile ROKETSAN arasında 1.281.101.744 Avro sözleşme imzalandı.\\u003c/div\\u003e\\u003c/td\\u003e"])</script>
    `;
    const parsed = extractKapDisclosureBody(fakeKapHtml);
    assert.equal(parsed.bodyText, 'ASELSAN ile ROKETSAN arasında 1.281.101.744 Avro sözleşme imzalandı.');
    assert.ok(!parsed.bodyText.includes('An agreement worth'), 'English content must be stripped');
    assert.ok(!parsed.bodyText.includes('İngilizce çevirisinde'), 'Legal translation disclaimer must be stripped');
  });

  it('4. Date parser & empty/malformed boundary safety', () => {
    assert.equal(parseKapPublishDate('20.11.2026 21:12:27'), '2026-11-20T18:12:27.000Z');
    assert.ok(!isNaN(Date.parse(parseKapPublishDate(''))));
    assert.ok(!isNaN(Date.parse(parseKapPublishDate('invalid-date'))));
    assert.equal(extractKapDisclosureBody('').bodyText, '');
    assert.equal(deriveMeaningfulDisclosureTitle({ ticker: 'TEST' }), 'TEST Resmi KAP Bildirimi');
  });

  it('5. Live KAP API integration for BRISA produces meaningful titles and real fullText', async () => {
    const liveBrisa = await fetchLiveBistNewsFeed({ tickers: ['BRISA'] });
    assert.ok(liveBrisa.length >= 1, 'Expected live official KAP disclosures for BRISA');
    for (const item of liveBrisa) {
      assert.equal(item.ticker, 'BRISA');
      assert.ok(!item.title.includes('Özel Durum Açıklaması (Genel'), `Generic or broken title leaked: ${item.title}`);
      assert.ok(!item.summary.includes('mevzuat hükümleri uyarınca kamuoyunu aydınlatma amacıyla'), `Boilerplate summary leaked: ${item.summary}`);
      assert.ok(item.url.startsWith('https://www.kap.org.tr/'), `Invalid KAP URL: ${item.url}`);
    }
  });

  it('6. UI/UX Redesign, Tactile Micro-Interaction System & Mirror Parity', () => {
    const mirrorPairs = [
      ['app/components/tactile-feedback.tsx', 'src/app/components/tactile-feedback.tsx'],
      ['app/api/feed/route.ts', 'src/app/api/feed/route.ts'],
      ['app/layout.tsx', 'src/app/layout.tsx'],
      ['app/globals.css', 'src/app/globals.css'],
      ['app/page.tsx', 'src/app/page.tsx'],
      ['app/components/market-cockpit.tsx', 'src/app/components/market-cockpit.tsx'],
      ['app/components/spotlight-search.tsx', 'src/app/components/spotlight-search.tsx'],
      ['app/components/login-modal.tsx', 'src/app/components/login-modal.tsx'],
      ['app/simply/simply-view.tsx', 'src/app/simply/simply-view.tsx'],
      ['app/simply/snowflake-radar.tsx', 'src/app/simply/snowflake-radar.tsx'],
      ['lib/news-service.ts', 'src/lib/news-service.ts'],
      ['lib/portfolio-architect.ts', 'src/lib/portfolio-architect.ts'],
    ];
    for (const [a, b] of mirrorPairs) {
      assert.equal(sha256(a), sha256(b), `Mirror SHA-256 mismatch: ${a} !== ${b}`);
    }

    const layoutSrc = fs.readFileSync(path.join(ROOT, 'app/layout.tsx'), 'utf8');
    assert.ok(layoutSrc.includes('<TactileFeedback />'), 'TactileFeedback must be mounted in RootLayout');

    const cssSrc = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');
    for (const token of ['.fv-click-pulse', '.fv-tactile-tap', '.fv-row-tap', '.fv-card', '.fv-row', '.fv-pill', '.fv-panel-enter', '.fv-modal-panel', 'prefers-reduced-motion', '[data-theme="light"] .bg-sky-600', 'hover:bg-[#181c24]']) {
      assert.ok(cssSrc.includes(token), `globals.css missing token: ${token}`);
    }
    assert.ok(cssSrc.includes('fvPanelIn 240ms cubic-bezier(0.16, 1, 0.3, 1) backwards'), '.fv-panel-enter must use backwards fill so fixed modals are never trapped');

    const pageSrc = fs.readFileSync(path.join(ROOT, 'app/page.tsx'), 'utf8');
    const cockpitSrc = fs.readFileSync(path.join(ROOT, 'app/components/market-cockpit.tsx'), 'utf8');
    const simplySrc = fs.readFileSync(path.join(ROOT, 'app/simply/simply-view.tsx'), 'utf8');
    assert.ok(!pageSrc.includes('py-0.2') && !cockpitSrc.includes('py-0.2') && !simplySrc.includes('py-0.2'), 'Invalid Tailwind py-0.2 class must not exist');
    for (const marker of ['KAP Bildirim Akışı', 'newsImpactFilter', 'Resmi KAP Bildirim Metni', 'themeVisualMeta', 'SEKTÖR KAPSAMA', 'findOfficialSectorAverage', 'KARAR DAĞILIMI', 'EN YÜKSEK POTANSİYEL', 'quickAddOpen', 'unanalyzedWatchTickers', 'openDisclosureModal', 'Şirket Analizine Git', 'topAccent', 'alInTheme']) {
      assert.ok(pageSrc.includes(marker), `page.tsx missing redesigned panel marker: ${marker}`);
    }
    for (const bannedUiText of ['{selectedDisclosure.ticker} Raporuna Git', 'şirket izleniyor', 'bildirim listeleniyor', 'otomatik ayıklanan başlık', '53 Resmi Alt Sektör', '7 Temel Strateji', 'Aktif Kapsam: Tüm Analiz Edilmiş']) {
      assert.ok(!pageSrc.includes(bannedUiText), `page.tsx should not retain removed UI clutter/duplicate: ${bannedUiText}`);
    }
    const pfStart = pageSrc.indexOf('const { key, direction } = savedTableSort;');
    const pfEnd = pageSrc.indexOf('{/* Gizli Yedek Yükleme Dosya Girişi */}');
    assert.ok(pfStart !== -1 && pfEnd > pfStart, 'Expected Portföy & Favoriler panel slice markers in page.tsx');
    const pfPanelSrc = pageSrc.slice(pfStart, pfEnd);
    assert.ok(!pfPanelSrc.includes('exportBackup') && !pfPanelSrc.includes('Yedek Yükle') && !pfPanelSrc.includes('JSON İndir'), 'Portföy & Favoriler panel must not render duplicate backup load/download buttons');
    assert.ok(pfPanelSrc.includes("toggleSavedSort('date')"), 'Portföy & Favoriler table header must support clicking Tarih to sort');

    // Paket 1-4 Next-Gen UI/UX Kaliteleştirme Kontrolleri
    const spotlightSrc = fs.readFileSync(path.join(ROOT, 'app/components/spotlight-search.tsx'), 'utf8');
    for (const marker of ['OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE', 'bistCatalog', 'matchedBistCatalog', 'onNavigateTab']) {
      assert.ok(spotlightSrc.includes(marker), `spotlight-search.tsx missing Paket 1 marker: ${marker}`);
    }
    for (const marker of ['Canlı KAP &amp; Portföy Bildirimleri', 'fv-compare-tray', 'fv-compare-modal', 'toggleCompareTicker', 'TARANAN ŞİRKET', 'ORTALAMA POTANSİYEL']) {
      assert.ok(pageSrc.includes(marker), `page.tsx missing Paket 1/3 marker: ${marker}`);
    }
    for (const marker of ['fv-sticky-context-bar', 'fv-forensic-4pillar', '4 Boyutlu Adli Denetim Özeti', 'fv-whatif-simulator', 'simWaccDelta', 'simMarginDelta', 'simGrowthDelta']) {
      assert.ok(simplySrc.includes(marker), `simply-view.tsx missing Paket 2 marker: ${marker}`);
    }
    for (const marker of ['topAlSeeds', 'latestUniqueReports']) {
      assert.ok(cockpitSrc.includes(marker), `market-cockpit.tsx missing Paket 4 marker: ${marker}`);
    }
    assert.ok(!cockpitSrc.includes('fv-cockpit-pulse') && !cockpitSrc.includes('Takip/Portföy Ort. Potansiyel'), 'market-cockpit.tsx must not render removed fv-cockpit-pulse strip');

    // 5 Boyutlu Grafik Tasarım & Görsel Cila Kontrolleri
    assert.ok(layoutSrc.includes('IBM_Plex_Mono') && layoutSrc.includes('ibmPlexMono.variable'), 'layout.tsx must load IBM_Plex_Mono font');
    assert.ok(cssSrc.includes('--font-ibm-plex-mono') && cssSrc.includes('tabular-nums') && cssSrc.includes('.fv-monogram') && cssSrc.includes('.fv-inline-sparkbar'), 'globals.css missing typography/surface graphic design tokens');
    assert.ok(cockpitSrc.includes('cockpitSparkGrad-') && cockpitSrc.includes('getTickerMonogramCls'), 'market-cockpit.tsx missing AreaChart gradient sparklines and monogram badges');
    const radarSrc = fs.readFileSync(path.join(ROOT, 'app/simply/snowflake-radar.tsx'), 'utf8');
    assert.ok(radarSrc.includes('radarPalette') && radarSrc.includes('totalScore >= 20'), 'snowflake-radar.tsx must compute dynamic score-based gradient palette');
    assert.ok(pageSrc.includes('getSectorMonogramCls') && simplySrc.includes('fv-inline-sparkbar'), 'page.tsx / simply-view.tsx missing sector monogram or inline sparkbar');
    for (const marker of ['fv-portfolio-architect', 'Model Portföy', 'applyPortfolioSet', 'swapPortfolioTicker']) {
      assert.ok(pageSrc.includes(marker), `page.tsx missing Portfolio Architect marker: ${marker}`);
    }
    for (const bannedPortfolioBuzzword of ['Eleme Evreni', 'Rotasyon Masası', 'Model Portföy Mimarı']) {
      assert.ok(!pageSrc.includes(bannedPortfolioBuzzword), `page.tsx must not contain AI buzzword: ${bannedPortfolioBuzzword}`);
    }
  });

  it('7. Adversarial Real-World KAP Regression Guard: Moody downgrade, buyback daily vs cumulative, numeric integrity, inline tags & substring traps', () => {
    // 7a. SISE Moody's Credit Rating Downgrade (must be NEGATIVE / RATING, never POSITIVE / INVESTMENT)
    const siseMoodyBody = 'Uluslararası Kredi Derecelendirme kuruluşu Moody\'s, 18/11/2026 tarihli yıllık değerlendirmesi sonucunda Şirketimiz\'in kredi notunu "B2"den "B3"e indirmiş ve "Negatif" olan görünümünü "Durağan" olarak revize etmiştir. Son yılların yoğun yatırım programının nakit akışı üzerindeki etkisine yer vermiştir.';
    const siseTitle = deriveMeaningfulDisclosureTitle({
      rawTitle: 'Kredi Derecelendirmesi',
      kapSummary: 'Kredi Derecelendirme Notu',
      bodyText: siseMoodyBody,
      ticker: 'SISE'
    });
    assert.ok(siseTitle.includes("Moody's") && siseTitle.includes('B2') && siseTitle.includes('B3') && siseTitle.includes('İndirdi'), `Bad Moody title: ${siseTitle}`);
    const siseCat = categorizeDisclosure(`${siseTitle} Kredi Derecelendirmesi`, siseMoodyBody);
    assert.equal(siseCat.impact, 'NEGATIVE');
    assert.equal(siseCat.eventType, 'RATING');
    assert.equal(siseCat.categoryLabel, 'Kredi Derecelendirme');
    const siseMetrics = extractDisclosureMetrics({ title: siseTitle, bodyText: siseMoodyBody });
    assert.ok(siseMetrics.some(m => m.label === 'Kredi Notu' && m.value === 'B2 → B3' && m.tone === 'negative'), `Missing rating metric: ${JSON.stringify(siseMetrics)}`);

    // 7b. MAVI Buyback: daily 310.000 vs cumulative 23.693.977, plus "(ortalama 33,47)"
    const maviBody = 'Şirketimiz tarafından, 16/09/2026 tarihli yönetim kurulu kararı ile başlatılan pay geri alım işlemleri kapsamında, 20/11/2026 tarihinde; Borsa İstanbul\'da pay başına 33,24 TL - 33,74 TL fiyat aralığından (ortalama 33,47) toplam 310.000 TL nominal değerli MAVI B Grubu pay senedi geri alınmıştır. Bu işlemle birlikte, bugüne kadar geri alınan toplam B grubu pay sayısı 23.693.977 adet olup, bu payların sermayeye oranı yaklaşık %2,98\'dir.';
    const maviTitle = deriveMeaningfulDisclosureTitle({ rawTitle: 'Payların Geri Alınmasına İlişkin Bildirim', bodyText: maviBody, ticker: 'MAVI' });
    assert.ok(maviTitle.includes('310.000 Adet') && maviTitle.includes('33,47 TL'), `Bad MAVI buyback title: ${maviTitle}`);
    const maviMetrics = extractDisclosureMetrics({ title: maviTitle, bodyText: maviBody });
    assert.ok(maviMetrics.some(m => m.label === 'Geri Alınan' && m.value === '310.000 Adet'), `Must use daily lot 310.000, not cumulative 23.693.977: ${JSON.stringify(maviMetrics)}`);
    assert.ok(maviMetrics.some(m => m.label === 'Ort. Fiyat' && m.value === '33,47 TL'), `Must parse (ortalama 33,47): ${JSON.stringify(maviMetrics)}`);

    // 7c. Inline <span> tag spacing & company-name substring trap ("Fabrikaları")
    const siseHtml = '<td class="taxonomy-context-value-summernote content-tr"><div>Türkiye Şişe ve Cam Fab<span>r</span>ikaları A.Ş. 2025 Yılı Sürdürülebilirlik Raporu ektedir.</div></td>';
    const parsedSise = extractKapDisclosureBody(siseHtml);
    assert.ok(parsedSise.bodyText.includes('Fabrikaları') && !parsedSise.bodyText.includes('Fab r ikaları'), `Broken inline tag spacing: ${parsedSise.bodyText}`);
    const sustCat = categorizeDisclosure('Türkiye Şişe ve Cam Fabrikaları A.Ş. 2025 Yılı Sürdürülebilirlik Raporu', parsedSise.bodyText);
    assert.equal(sustCat.impact, 'NEUTRAL');
    assert.notEqual(sustCat.category, 'INVESTMENT');

    // 7d. Numeric hallucination guards (Billion numbers, 1 TL nominal vs 0.55 TL dividend, bedelsiz vs cash dividend, THYAO swing to profit)
    const bimasEarnSummary = buildDisclosureKeySummary('BIMAS Bim Birleşik Mağazalar konsolide bilanço 2025 Yıllık net karı 18,632,108,000 TL (Önceki: 24,328,622,000 TL net kar)', 'BIMAS', 'BİM', 'FINANCIALS');
    assert.ok(!bimasEarnSummary.includes('**108,000 TL**'), `Numeric truncation hallucination: ${bimasEarnSummary}`);
    assert.ok(bimasEarnSummary.includes('18,632,108,000 TL'), `Must preserve full billion figure: ${bimasEarnSummary}`);

    const thyaoCat = categorizeDisclosure('THYAO Türk Hava Yolları A.O. konsolide bilanço 2026 3 aylık net karı 9,915,000,000 TL (Önceki: 1,818,000,000 TL net zarar)');
    assert.notEqual(thyaoCat.impact, 'NEGATIVE', 'Swing to 9.9B net profit must NOT be classified NEGATIVE due to prior-year loss in parentheses');

    const ereglDivSum = buildDisclosureKeySummary('Erdemir 1 TL nominal değerli paya brüt 0.55 TL nakit kar payı ödenmesini Genel Kurul\'un onayına sunacak', 'EREGL', 'Ereğli', 'DIVIDEND');
    assert.ok(ereglDivSum.includes('**0.55 TL**') && !ereglDivSum.includes('**1 TL**'), `Must extract 0.55 TL dividend, not 1 TL nominal: ${ereglDivSum}`);

    const bimasBonusSum = buildDisclosureKeySummary('BİM sermayesini %100 oranında bedelsiz artırarak 1.2 milyar TL\'ye yükseltmeye karar verdi', 'BIMAS', 'BİM', 'DIVIDEND');
    assert.ok(!bimasBonusSum.includes('hisse başına **1.2 milyar TL** nakit'), `Bedelsiz must never become cash dividend per share: ${bimasBonusSum}`);

    // 7e. Non-commercial contracts, hyphen preservation, mojibake repair, wire noise filtering
    assert.notEqual(categorizeDisclosure('Akbank BM İklim Değişikliği Çerçeve Sözleşmesi konferans programını açıkladı').category, 'CONTRACT');
    assert.notEqual(categorizeDisclosure('Koç Finansman paylarının Ford Otomotiv\'e satışına yönelik Pay Alım Satım Sözleşmesi imzalandı').category, 'BUYBACK');
    assert.ok(sanitizeDisclosureTitle('Migros, Tez-Koop. İş Sendikası ile yürütülen 2026 - 2027 Dönemi Toplu İş Sözleşmesi', 'MGROS').includes('2026 - 2027'));
    assert.equal(
      deriveMeaningfulDisclosureTitle({ rawTitle: 'Özel Durum Açıklaması (Genel)', kapSummary: '7596 sayılı Kanun ve Sermaye Piyasası Kurulu?nun İlgili Kararlarına İstinaden Yapılan Ödeme Hk.', ticker: 'TURSG' }),
      "7596 sayılı Kanun ve Sermaye Piyasası Kurulu'nun İlgili Kararlarına İstinaden Yapılan Ödeme Hk."
    );
    assert.equal(isStrictCorporateAnnouncement('THY/Olmuştur: THY Türkiye\'nin en büyük bilançolarından birine sahip'), false);
    assert.equal(isStrictCorporateAnnouncement('BİST şirketlerinin 2026 yılı 6 aylık dönem finansal sonuçları açıklama tarihleri (Tablo)'), false);
    assert.equal(isStrictCorporateAnnouncement('Borsa İstanbul yatırımcı bazında tedbir uygulaması'), false);
  });

  it('8. Forensic Portfolio Architect & Quarterly Rotation Engine: 4-pillar filtering, group deduplication, A+ NÖTR vs traps & take-profit rotation', () => {
    const mkHistory = ({ ni, ocf, wc, ebM, roic, wacc, netDebt, eb }) => [
      { period: '2025/12', net_income: ni, operating_cash_flow: ocf, working_capital_change: wc, ebitda_margin: ebM, net_margin: ebM * 0.6, roic, real_wacc: wacc, eva_spread: roic - wacc, net_debt: netDebt, ebitda: eb },
      { period: '2026/03', net_income: ni, operating_cash_flow: ocf, working_capital_change: wc, ebitda_margin: ebM, net_margin: ebM * 0.6, roic, real_wacc: wacc, eva_spread: roic - wacc, net_debt: netDebt, ebitda: eb },
      { period: '2026/06', net_income: ni, operating_cash_flow: ocf, working_capital_change: wc, ebitda_margin: ebM, net_margin: ebM * 0.6, roic, real_wacc: wacc, eva_spread: roic - wacc, net_debt: netDebt, ebitda: eb },
      { period: '2026/09', net_income: ni, operating_cash_flow: ocf, working_capital_change: wc, ebitda_margin: ebM, net_margin: ebM * 0.6, roic, real_wacc: wacc, eva_spread: roic - wacc, net_debt: netDebt, ebitda: eb },
    ];
    const mkReport = (ticker, sector, price, fairValue, score, decision, histArgs) => ({
      id: `rep-${ticker}`,
      ticker,
      price: String(price),
      fairValue: String(fairValue),
      createdAt: '2026-11-26',
      period: '2026/09',
      report: '',
      decision,
      score: `${score}/100`,
      sector,
      extractedData: {
        company_name: ticker,
        sector,
        reporting_period: '2026/09',
        financial_history: mkHistory(histArgs),
        valuation: { fair_value: fairValue, score, roic: histArgs.roic, real_wacc: histArgs.wacc, eva_spread: histArgs.roic - histArgs.wacc },
      },
    });

    const sampleReports = [
      // Tier-1 Çekirdek AL'lar
      mkReport('TUPRS', 'INDUSTRIAL', 322, 681, 85, 'AL', { ni: 1000, ocf: 1700, wc: 200, ebM: 14, roic: 40.5, wacc: 14.2, netDebt: -5000, eb: 4000 }),
      mkReport('TBORG', 'RETAIL', 116, 230, 89, 'AL', { ni: 500, ocf: 600, wc: -50, ebM: 30, roic: 31.8, wacc: 17.7, netDebt: -400, eb: 1800 }),
      mkReport('SAYAS', 'INDUSTRIAL', 42, 59, 100, 'AL', { ni: 200, ocf: 248, wc: -30, ebM: 25, roic: 39.8, wacc: 14.6, netDebt: -100, eb: 300 }),
      mkReport('TRENJ', 'UTILITIES_TELCO', 65, 97, 95, 'AL', { ni: 400, ocf: 900, wc: 100, ebM: 41, roic: 43.5, wacc: 13.9, netDebt: -2000, eb: 1100 }),
      // Tier-3 elenecek AL'lar: TRMET (grup çift sayımı), ORGE (OCF/Net %35), PCILT (dar marj %7.1), OFSYM (WC/OCF %68)
      mkReport('TRMET', 'INDUSTRIAL', 98, 133, 93, 'AL', { ni: 400, ocf: 900, wc: 100, ebM: 41, roic: 20.2, wacc: 18.6, netDebt: -2000, eb: 1100 }),
      mkReport('ORGE', 'INDUSTRIAL', 18, 33, 83, 'AL', { ni: 700, ocf: 245, wc: -200, ebM: 56, roic: 38.6, wacc: 13.8, netDebt: -50, eb: 500 }),
      mkReport('PCILT', 'TECH', 26, 66, 79, 'AL', { ni: 100, ocf: 268, wc: 40, ebM: 7.1, roic: 45.6, wacc: 17.9, netDebt: -300, eb: 150 }),
      mkReport('OFSYM', 'RETAIL', 41, 69, 78, 'AL', { ni: 50, ocf: 450, wc: 310, ebM: 12, roic: 18.0, wacc: 13.4, netDebt: 400, eb: 220 }),
      // A+ Kalite NÖTR & Adli Tuzak NÖTR & Rotasyon Çıkışı (Mevcut portföyde kalan potansiyeli %4 olan hisse)
      mkReport('GUBRF', 'INDUSTRIAL', 273, 336, 94, 'NÖTR', { ni: 600, ocf: 1070, wc: 90, ebM: 19.6, roic: 37.7, wacc: 16.7, netDebt: -1000, eb: 2000 }),
      mkReport('TCKRC', 'INDUSTRIAL', 118, 293, 83, 'NÖTR', { ni: 500, ocf: 60, wc: -200, ebM: 38.4, roic: 26.9, wacc: 17.6, netDebt: 150, eb: 400 }),
      mkReport('FROTO', 'INDUSTRIAL', 100, 104, 86, 'NÖTR', { ni: 800, ocf: 950, wc: 50, ebM: 12.0, roic: 22.0, wacc: 14.0, netDebt: 500, eb: 1500 }),
    ];

    const plan = buildForensicPortfolioPlan(sampleReports, ['TUPRS', 'ORGE', 'FROTO']);

    assert.ok(plan.tier1CoreAl.some(c => c.ticker === 'TUPRS') && plan.tier1CoreAl.some(c => c.ticker === 'TBORG'));
    const filteredTickers = plan.tier3FilteredAl.map(c => c.ticker);
    assert.ok(filteredTickers.includes('TRMET'), 'Consolidated twin TRMET must be filtered when TRENJ is present');
    assert.ok(filteredTickers.includes('ORGE'), 'Low OCF/Net (35%) must filter ORGE into Tier-3');
    assert.ok(filteredTickers.includes('PCILT'), 'Thin EBITDA margin (< 8%) must filter PCILT into Tier-3');
    assert.ok(filteredTickers.includes('OFSYM'), 'WC share >= 65% must filter OFSYM into Tier-3');

    assert.ok(plan.tierANeutralCandidates.some(c => c.ticker === 'GUBRF'), 'GUBRF must qualify as A+ quality NOTR');
    assert.ok(plan.neutralValueTraps.some(c => c.ticker === 'TCKRC'), 'TCKRC (12% OCF conversion) must be flagged as Trap NOTR');

    const totalWeight = plan.modelPortfolio.reduce((s, m) => s + m.recommendedWeightPct, 0);
    assert.ok(
      Math.abs(totalWeight + plan.cashReserveWeightPct - 100) < 0.25,
      `Model portfolio equity weights (${totalWeight}) + Cash/PPF reserve (${plan.cashReserveWeightPct}) must equal 100%`
    );
    for (const m of plan.modelPortfolio) {
      assert.ok(
        m.recommendedWeightPct <= DEFAULT_PORTFOLIO_ARCHITECT_CONFIG.maxSingleStockWeightPct + 0.05,
        `${m.ticker} weight (${m.recommendedWeightPct}%) must never exceed maxSingleStockWeightPct`
      );
    }

    const outTickers = plan.rotationSignals.rotateOut.map(x => x.candidate.ticker);
    assert.ok(outTickers.includes('ORGE'), 'Existing holding ORGE must trigger forensic rotate-out');
    assert.ok(outTickers.includes('FROTO'), 'Existing holding FROTO (+4% upside < 12%) must trigger take-profit rotation');
    assert.ok(plan.rotationSignals.hold.some(h => h.candidate.ticker === 'TUPRS'), 'Existing clean holding TUPRS must stay HOLD');
    assert.ok(plan.rotationSignals.rotateOut[0].suggestedReplacement != null, 'Rotate-out must suggest a valid model replacement');
  });

  it('9. Institutional Default (10 stocks), TRY Whole-Lot Initial Allocation (100.000 TL) & Smart Monthly Top-Up Rebalancing (+50.000 TL)', () => {
    assert.equal(DEFAULT_PORTFOLIO_ARCHITECT_CONFIG.targetCount, 10);
    assert.equal(DEFAULT_PORTFOLIO_ARCHITECT_CONFIG.maxSectorWeightPct, 25);
    assert.equal(DEFAULT_PORTFOLIO_ARCHITECT_CONFIG.maxSingleStockWeightPct, 15);

    const presetIds = PORTFOLIO_ARCHITECT_PRESETS.map(p => p.id);
    assert.deepEqual(presetIds, ['INSTITUTIONAL_10', 'FOCUSED_8', 'BROAD_12']);

    const mkHistory = ({ ni, ocf, wc, ebM, roic, wacc, netDebt, eb }) => [
      { period: '2025/12', net_income: ni, operating_cash_flow: ocf, working_capital_change: wc, ebitda_margin: ebM, net_margin: ebM * 0.6, roic, real_wacc: wacc, eva_spread: roic - wacc, net_debt: netDebt, ebitda: eb },
      { period: '2026/03', net_income: ni, operating_cash_flow: ocf, working_capital_change: wc, ebitda_margin: ebM, net_margin: ebM * 0.6, roic, real_wacc: wacc, eva_spread: roic - wacc, net_debt: netDebt, ebitda: eb },
      { period: '2026/06', net_income: ni, operating_cash_flow: ocf, working_capital_change: wc, ebitda_margin: ebM, net_margin: ebM * 0.6, roic, real_wacc: wacc, eva_spread: roic - wacc, net_debt: netDebt, ebitda: eb },
      { period: '2026/09', net_income: ni, operating_cash_flow: ocf, working_capital_change: wc, ebitda_margin: ebM, net_margin: ebM * 0.6, roic, real_wacc: wacc, eva_spread: roic - wacc, net_debt: netDebt, ebitda: eb },
    ];
    const mkReport = (ticker, sector, price, fairValue, score, decision, histArgs) => ({
      id: `rep-${ticker}`,
      ticker,
      price: String(price),
      fairValue: String(fairValue),
      createdAt: '2026-11-26',
      period: '2026/09',
      report: '',
      decision,
      score: `${score}/100`,
      sector,
      extractedData: {
        company_name: ticker,
        sector,
        reporting_period: '2026/09',
        financial_history: mkHistory(histArgs),
        valuation: { fair_value: fairValue, score, roic: histArgs.roic, real_wacc: histArgs.wacc, eva_spread: histArgs.roic - histArgs.wacc },
      },
    });

    const sampleReports = [
      mkReport('TUPRS', 'INDUSTRIAL', 322, 681, 88, 'AL', { ni: 1000, ocf: 1700, wc: 200, ebM: 14, roic: 40.5, wacc: 14.2, netDebt: -5000, eb: 4000 }),
      mkReport('TBORG', 'RETAIL', 116, 230, 90, 'AL', { ni: 500, ocf: 600, wc: -50, ebM: 30, roic: 31.8, wacc: 17.7, netDebt: -400, eb: 1800 }),
      mkReport('SAYAS', 'TECH', 42, 65, 92, 'AL', { ni: 200, ocf: 248, wc: -30, ebM: 25, roic: 39.8, wacc: 14.6, netDebt: -100, eb: 300 }),
      mkReport('MAVI', 'RETAIL', 32.2, 43.02, 87, 'AL', { ni: 300, ocf: 500, wc: -20, ebM: 20, roic: 22.0, wacc: 11.9, netDebt: -200, eb: 600 }),
      mkReport('FROTO', 'INDUSTRIAL', 100, 104, 86, 'NÖTR', { ni: 800, ocf: 950, wc: 50, ebM: 12.0, roic: 22.0, wacc: 14.0, netDebt: 500, eb: 1500 }),
      mkReport('ASELS', 'INDUSTRIAL', 75, 70, 88, 'NÖTR', { ni: 600, ocf: 750, wc: 20, ebM: 24.0, roic: 25.0, wacc: 15.0, netDebt: -300, eb: 1200 }),
      mkReport('ORGE', 'INDUSTRIAL', 18, 33, 83, 'AL', { ni: 700, ocf: 245, wc: -200, ebM: 56, roic: 38.6, wacc: 13.8, netDebt: -50, eb: 500 }),
    ];

    const plan = buildForensicPortfolioPlan(sampleReports, ['TUPRS', 'TBORG', 'MAVI', 'FROTO', 'ASELS']);

    assert.equal(plan.candidatesByTicker.TUPRS.targetStatus, 'ACCUMULATE');
    assert.equal(plan.candidatesByTicker.FROTO.targetStatus, 'NEAR_TARGET', '0 < +4% < 12% threshold must classify NEAR_TARGET');
    assert.equal(plan.candidatesByTicker.ASELS.targetStatus, 'TARGET_REACHED', 'upside <= 0 must classify TARGET_REACHED');
    assert.equal(plan.candidatesByTicker.ORGE.targetStatus, 'FORENSIC_EXIT', 'Tier-3 filtered stock must classify FORENSIC_EXIT');

    // A. Başlangıç 100.000 TL Tam Lot Tahsisat Testi
    const initialAlloc = computeCapitalAllocationPlan({
      holdings: plan.modelPortfolio,
      mode: 'initial',
      initialCapitalTry: 100000,
      topUpCapitalTry: 50000,
      topUpStrategy: 'smart_rebalance',
      maxSingleStockWeightPct: 15,
    });

    assert.equal(initialAlloc.mode, 'initial');
    assert.ok(initialAlloc.deployedAmountTry <= 100000.01, 'Deployed cash must not exceed budget');
    assert.ok(
      Math.abs(initialAlloc.deployedAmountTry + initialAlloc.unallocatedCashTry - 100000) < 0.05,
      'Deployed + unallocated cash must equal 100.000 TL'
    );
    for (const row of initialAlloc.rows) {
      assert.equal(row.orderLots, Math.floor(row.orderLots), 'Lots must be integer whole lots');
      assert.ok(row.orderLots >= 0);
      assert.ok(Math.abs(row.orderAmountTry - row.orderLots * row.candidate.price) < 0.05);
    }

    // B. Aylık +50.000 TL Akıllı İlave Yatırım & Hedefe Yakın Hisseyi Atlamalı Dengeleme Testi
    const customHoldings = [
      { ...plan.candidatesByTicker.TUPRS, recommendedWeightPct: 35 },
      { ...plan.candidatesByTicker.TBORG, recommendedWeightPct: 35 },
      { ...plan.candidatesByTicker.FROTO, recommendedWeightPct: 30 }, // +4% -> NEAR_TARGET
    ];
    const topUpAlloc = computeCapitalAllocationPlan({
      holdings: customHoldings,
      mode: 'topup',
      initialCapitalTry: 100000,
      topUpCapitalTry: 50000,
      topUpStrategy: 'smart_rebalance',
      savedPositions: {
        TUPRS: { shares: 220 }, // ~70.840 TL (çok yüksek ağırlık -> dengelemede az pay almalı)
        TBORG: { shares: 50 },  // ~5.800 TL (düşük ağırlık -> ağırlık tamamlamak için çok pay almalı)
        FROTO: { shares: 200 }, // ~20.000 TL (NEAR_TARGET -> 0 TL ilave almalı!)
      },
    });

    assert.equal(topUpAlloc.mode, 'topup');
    assert.equal(topUpAlloc.hasSavedLots, true);
    assert.ok(
      Math.abs(topUpAlloc.deployedAmountTry + topUpAlloc.unallocatedCashTry - 50000) < 0.05,
      'Top-up deployed + cash remainder must equal 50.000 TL'
    );

    const frotoRow = topUpAlloc.rows.find(r => r.ticker === 'FROTO');
    const tborgRow = topUpAlloc.rows.find(r => r.ticker === 'TBORG');
    const tuprsRow = topUpAlloc.rows.find(r => r.ticker === 'TUPRS');
    assert.equal(frotoRow?.isSkippedForRotation, true, 'NEAR_TARGET holding must be skipped in smart_rebalance');
    assert.equal(frotoRow?.orderAmountTry, 0, 'Skipped holding must receive 0 TL top-up');
    assert.ok((tborgRow?.orderAmountTry || 0) > (tuprsRow?.orderAmountTry || 0), 'Underweight TBORG must receive larger top-up than overweight TUPRS');

    // C. Mirror Dosya Eşitliği Doğrulaması
    assert.equal(sha256('src/lib/portfolio-architect.ts'), sha256('lib/portfolio-architect.ts'));
    assert.equal(sha256('src/app/page.tsx'), sha256('app/page.tsx'));
  });

  it('10. Risk-Free Rate (38%) Model Portfolio Hurdle, MACKO Valuation/Peer/Singularity Fixes & Full 4-File Mirror Parity', () => {
    const mkHist = ({ ni, ocf, wc, ebM, roic, wacc, netDebt, eb }) => [
      { period: '2025/12', net_income: ni, operating_cash_flow: ocf, working_capital_change: wc, ebitda_margin: ebM, net_margin: ebM * 0.6, roic, real_wacc: wacc, eva_spread: roic - wacc, net_debt: netDebt, ebitda: eb },
      { period: '2026/03', net_income: ni, operating_cash_flow: ocf, working_capital_change: wc, ebitda_margin: ebM, net_margin: ebM * 0.6, roic, real_wacc: wacc, eva_spread: roic - wacc, net_debt: netDebt, ebitda: eb },
      { period: '2026/06', net_income: ni, operating_cash_flow: ocf, working_capital_change: wc, ebitda_margin: ebM, net_margin: ebM * 0.6, roic, real_wacc: wacc, eva_spread: roic - wacc, net_debt: netDebt, ebitda: eb },
      { period: '2026/09', net_income: ni, operating_cash_flow: ocf, working_capital_change: wc, ebitda_margin: ebM, net_margin: ebM * 0.6, roic, real_wacc: wacc, eva_spread: roic - wacc, net_debt: netDebt, ebitda: eb },
    ];
    const mkReport = (ticker, sector, price, fairValue, score, decision, histArgs, extra = {}) => ({
      id: `rep10-${ticker}`,
      ticker,
      price: String(price),
      fairValue: String(fairValue),
      createdAt: '2026-11-26',
      period: '2026/09',
      report: '',
      decision,
      score: `${score}/100`,
      sector,
      extractedData: {
        company_name: ticker,
        sector,
        reporting_period: '2026/09',
        macro: { risk_free_rate: 38.0 },
        financial_history: mkHist(histArgs),
        valuation: { fair_value: fairValue, score, roic: histArgs.roic, real_wacc: histArgs.wacc, eva_spread: histArgs.roic - histArgs.wacc },
        ...extra,
      },
    });

    const universe = [
      mkReport('TUPRS', 'INDUSTRIAL', 322, 681, 88, 'AL', { ni: 1000, ocf: 1700, wc: 200, ebM: 14, roic: 40.5, wacc: 14.2, netDebt: -5000, eb: 4000 }),
      mkReport('MACKO', 'INDUSTRIAL', 20.64, 27.24, 89, 'AL', { ni: 275.6, ocf: 481.7, wc: 86.9, ebM: 54.9, roic: 49.26, wacc: 18.8, netDebt: 104.6, eb: 469.4 }, { official_sector_name: 'Eğlence Hizmetleri' }),
      mkReport('MAVI', 'RETAIL', 32.2, 43.02, 87, 'AL', { ni: 300, ocf: 500, wc: -20, ebM: 20, roic: 22.0, wacc: 11.9, netDebt: -200, eb: 600 }),
    ];

    // 1A. enforceRiskFreeHurdle = true (Default Rf = 38.0%): MACKO (+32.0%) ve MAVI (+33.6%) Model Portföye giremez
    const planStrict = buildForensicPortfolioPlan(universe, []);
    assert.equal(DEFAULT_PORTFOLIO_ARCHITECT_CONFIG.enforceRiskFreeHurdle, true);
    assert.equal(planStrict.effectiveRiskFreeRatePct, 38.0);
    assert.equal(planStrict.belowRiskFreeAlCount, 2);
    assert.ok(planStrict.modelPortfolio.some(h => h.ticker === 'TUPRS'), 'TUPRS (>38% upside) must remain in modelPortfolio');
    assert.ok(!planStrict.modelPortfolio.some(h => h.ticker === 'MACKO'), 'MACKO (+32% < 38% Rf) must be excluded from modelPortfolio');
    assert.ok(!planStrict.modelPortfolio.some(h => h.ticker === 'MAVI'), 'MAVI (+33.6% < 38% Rf) must be excluded from modelPortfolio');
    assert.equal(planStrict.candidatesByTicker.MACKO.targetStatus, 'BELOW_RF_HURDLE');
    assert.ok((planStrict.candidatesByTicker.MACKO.excessReturnOverRfPct ?? 0) < 0);
    assert.ok(planStrict.tier3FilteredAl.some(h => h.ticker === 'MACKO' && h.targetStatus === 'BELOW_RF_HURDLE'));

    // 1B. enforceRiskFreeHurdle = false: MACKO ve MAVI tekrar Model Portföye girebilir
    const planRelaxed = buildForensicPortfolioPlan(universe, [], { enforceRiskFreeHurdle: false });
    assert.equal(planRelaxed.belowRiskFreeAlCount, 0);
    assert.ok(planRelaxed.modelPortfolio.some(h => h.ticker === 'MACKO'), 'Relaxing Rf hurdle must allow MACKO back into modelPortfolio');
    assert.ok(planRelaxed.modelPortfolio.some(h => h.ticker === 'MAVI'), 'Relaxing Rf hurdle must allow MAVI back into modelPortfolio');

    // 2. MACKO (Eğlence Hizmetleri, 0010) değerleme modeli, tekillik giderimi, diğer alacak uyarısı ve TCMB KKO izolasyonu
    const mackoExtracted = {
      ticker: 'MACKO',
      company_name: 'Maçkolik İnternet Hizmetleri A.Ş.',
      sector: 'INDUSTRIAL',
      official_sector_name: 'Eğlence Hizmetleri',
      currency: 'TL (Milyon)',
      share_count: 100000000,
      macro: { risk_free_rate: 38.0, expected_inflation: 23.7, tcmb_capacity_utilization: 74.1 },
      market_multiples: {
        pe: 6.4,
        pb: 3.0,
        ev_ebitda: 3.5,
        ev_sales: 1.8,
        sector_code: '0010',
        sector_name: 'Eğlence Hizmetleri',
        sector_averages: { sector_code: '0010', sector_name: 'Eğlence Hizmetleri', pe: 6.39, pb: 2.95, ev_ebitda: 3.54, ev_sales: 1.8 },
      },
      financial_history: [
        {
          period: '2025/09',
          revenue: 1050.7,
          gross_profit: 746.0,
          operating_profit: 519.7,
          ebitda: 604.9,
          net_income: 390.0,
          equity: 520.0,
          total_assets: 820.0,
          is_tms29: true,
        },
        {
          period: '2026/09',
          revenue: 855.02,
          gross_profit: 551.5,
          operating_profit: 395.8,
          ebitda: 469.4,
          net_income: 275.6,
          equity: 677.63,
          total_assets: 995.58,
          other_receivables: 304.14,
          non_current_other_receivables: 115.11,
          trade_receivables: 259.69,
          total_debt: 158.17,
          cash_and_equivalents: 53.54,
          net_debt: 104.63,
          operating_cash_flow: 481.7,
          working_capital_change: 86.9,
          capex: -51.0,
          free_cash_flow: 430.6,
          roic: 49.26,
          roe: 58.5,
          ebitda_margin: 54.9,
          net_margin: 32.2,
          real_wacc: 18.8,
          nominal_wacc: 47.0,
          expected_inflation: 23.7,
          is_tms29: true,
          capacity_utilization_rate: 74.1,
        },
      ],
    };

    const valRes = computeSectorValuationAndDrivers(mackoExtracted, '20.64', 'INDUSTRIAL');
    assert.equal(
      valRes.valuation.valuation_model_name,
      'Dijital Eğlence, İçerik & Reklam Platformu Modeli (Yüksek Marjlı Reklam/Lisans Nakit Akışı)'
    );
    assert.equal(valRes.valuation.sensitivity_matrix?.hasSingularity, false, 'Real WACC vs Real g must have zero singularity');
    assert.equal(valRes.valuation.sensitivity_matrix?.singularityCount, 0);
    assert.equal(valRes.valuation.sensitivity_matrix?.baseGrowth, 3);
    assert.ok(
      String(valRes.valuation.capital_allocation_risk?.summaryTitle || '').includes('DİĞER ALACAK YOĞUNLAŞMASI'),
      'Severe non-trade other_receivables (>=25% assets) must surface executive warning'
    );
    const hasKkoLeak = valRes.scoreResult.breakdown.some(b => /TCMB İmalat KKO/i.test(b.reason || ''));
    assert.equal(hasKkoLeak, false, 'Digital platform MACKO must not display TCMB İmalat KKO');

    // Harici Medya (0028) akran çarpanları kontrolü (kendini kendiyle kıyaslama hatası çözümü)
    const multRes = calculateCompanyMultiples(
      mackoExtracted.financial_history[1],
      20.64,
      100000000,
      'INDUSTRIAL',
      mackoExtracted.market_multiples,
      'TL (Milyon)',
      null,
      mackoExtracted.financial_history
    );
    assert.equal(multRes.benchmark.peMedian, 6.98);
    assert.equal(multRes.benchmark.pbMedian, 2.98);
    assert.equal(multRes.benchmark.evEbitdaMedian, 11.01);

    // 3. Tüm 4 Mirror Dosya SHA-256 Eşitliği Doğrulaması
    assert.equal(sha256('src/lib/valuation.ts'), sha256('lib/valuation.ts'));
    assert.equal(sha256('src/lib/portfolio-architect.ts'), sha256('lib/portfolio-architect.ts'));
    assert.equal(sha256('src/app/simply/simply-view.tsx'), sha256('app/simply/simply-view.tsx'));
    assert.equal(sha256('src/app/page.tsx'), sha256('app/page.tsx'));
  });
});
