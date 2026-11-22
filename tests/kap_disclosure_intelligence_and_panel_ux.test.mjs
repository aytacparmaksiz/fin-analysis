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
      ['lib/news-service.ts', 'src/lib/news-service.ts'],
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
});
