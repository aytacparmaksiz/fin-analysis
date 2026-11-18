import https from 'node:https';
import { BIST_KAP_OID_MAP } from './kap-mapping.ts';

export function isKapQualitativeSupported(rawTicker: string): boolean {
  const ticker = (rawTicker || '').toUpperCase().trim();
  return Boolean(BIST_KAP_OID_MAP[ticker]);
}

const isProduction = process.env.NODE_ENV === 'production';
const kapHttpsAgent = new https.Agent({
  rejectUnauthorized: isProduction,
  keepAlive: true,
  timeout: 15000
});

export interface KapQualitativeFinding {
  id: string;
  category: 'AUDITOR_OPINION' | 'LITIGATION_AND_TAX' | 'COLLATERAL_AND_OFFBALANCE' | 'RELATED_PARTY' | 'GUIDANCE_AND_CAPEX';
  categoryLabel: string;
  severity: 'HIGH' | 'MEDIUM' | 'POSITIVE' | 'INFO';
  pageRef: string;
  sourceDoc: string;
  title: string;
  excerpt: string;
  impact: string;
}

export interface KapManagementTarget {
  metric: string;
  target: string;
  realized?: string;
  status?: 'BAŞARILI' | 'KISMEN' | 'SAPMA';
  evaluation?: string;
  period: string;
  pageRef: string;
}

export interface KapQualitativeAuditResult {
  schemaVersion?: number;
  ticker: string;
  fetchedAt: string;
  isAutoFetched: boolean;
  activityReport?: {
    disclosureIndex: number;
    title: string;
    publishDate: string;
    periodLabel: string;
    fileName: string;
    kapUrl: string;
    pdfUrl: string;
    pageCount: number;
  };
  financialReport?: {
    disclosureIndex: number;
    title: string;
    publishDate: string;
    periodLabel: string;
    fileName: string;
    kapUrl: string;
    pdfUrl: string;
    pageCount: number;
  };
  auditorStatus: string;
  executiveSummary: string;
  findings: KapQualitativeFinding[];
  managementTargets: KapManagementTarget[];
}

function kapRequest(
  urlStr: string,
  opts: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {}
): Promise<{ status: number; buf: Buffer }> {
  return new Promise((resolve) => {
    let settled = false;
    const timeoutMs = opts.timeoutMs ?? 12000;
    const done = (val: { status: number; buf: Buffer }) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(val);
      }
    };
    const timer = setTimeout(() => done({ status: 0, buf: Buffer.alloc(0) }), timeoutMs);

    try {
      const u = new URL(urlStr);
      const headers: Record<string, string | number> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        ...(opts.headers || {})
      };
      if (opts.body) {
        headers['Content-Length'] = Buffer.byteLength(opts.body);
      }
      const req = https.request(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: opts.method || 'GET',
          agent: kapHttpsAgent,
          headers
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
          res.on('end', () => done({ status: res.statusCode || 0, buf: Buffer.concat(chunks) }));
        }
      );
      req.on('error', () => done({ status: 0, buf: Buffer.alloc(0) }));
      if (opts.body) req.write(opts.body);
      req.end();
    } catch {
      done({ status: 0, buf: Buffer.alloc(0) });
    }
  });
}

interface KapDisclosureItem {
  disclosureIndex: number;
  subject: string;
  publishDate: string;
  year: number;
  ruleType: string;
  attachmentCount: number;
}

async function fetchKapFrDisclosures(oid: string): Promise<KapDisclosureItem[]> {
  const now = new Date();
  const from = new Date(now.getTime() - 365 * 86400 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const body = JSON.stringify({
    mkkMemberOidList: [oid],
    disclosureClass: 'FR',
    fromDate: fmt(from),
    toDate: fmt(now)
  });

  const res = await kapRequest('https://www.kap.org.tr/tr/api/disclosure/members/byCriteria', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body,
    timeoutMs: 10000
  });

  if (res.status !== 200 || res.buf.length === 0) return [];
  try {
    const parsed = JSON.parse(res.buf.toString('utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function fetchKapPdfPages(disclosureIndex: number): Promise<{
  fileName: string;
  pdfUrl: string;
  pages: string[];
} | null> {
  const attRes = await kapRequest(`https://www.kap.org.tr/tr/api/notification/attachment-detail/${disclosureIndex}`, {
    headers: { Accept: 'application/json' },
    timeoutMs: 8000
  });
  if (attRes.status !== 200 || attRes.buf.length === 0) return null;

  let attachments: any[] = [];
  try {
    const j = JSON.parse(attRes.buf.toString('utf8'));
    attachments = Array.isArray(j?.[0]?.attachments) ? j[0].attachments : [];
  } catch {
    return null;
  }

  const pdfAtts = attachments.filter((a) => String(a?.fileExtension || a?.fileName || '').toLowerCase().includes('pdf') && a?.objId);
  if (pdfAtts.length === 0) return null;

  // Türkçe PDF'i önceliklendir
  const preferred =
    pdfAtts.find((a) => !/interim|english|eng\b/i.test(String(a.fileName || ''))) || pdfAtts[0];

  const pdfUrl = `https://www.kap.org.tr/tr/api/file/download/${preferred.objId}`;
  const pdfRes = await kapRequest(pdfUrl, { timeoutMs: 14000 });
  if (pdfRes.status !== 200 || pdfRes.buf.length < 1000) return null;

  try {
    const { extractText } = await import('unpdf');
    const extracted = await extractText(new Uint8Array(pdfRes.buf), { mergePages: false });
    const rawPages: string[] = Array.isArray(extracted?.text)
      ? extracted.text
      : typeof extracted?.text === 'string'
      ? [extracted.text]
      : [];
    const pages = rawPages.map((p) => String(p || '').replace(/\s+/g, ' ').trim());
    return {
      fileName: String(preferred.fileName || `KAP_${disclosureIndex}.pdf`),
      pdfUrl,
      pages
    };
  } catch {
    return null;
  }
}

const MINING_RULES: Array<{
  category: KapQualitativeFinding['category'];
  categoryLabel: string;
  keywords: RegExp;
  negativeSignals: RegExp;
  positiveSignals?: RegExp;
  defaultTitle: string;
  defaultImpact: string;
}> = [
  {
    category: 'AUDITOR_OPINION',
    categoryLabel: 'Bağımsız Denetim Görüşü',
    keywords: /(?:bağımsız\s+denet[çc]i|sınırlı\s+olumlu|şartlı\s+görüş|dikkat\s+çekilen\s+husus|işletmenin\s+sürekliliğine\s+ilişkin\s+önemli\s+belirsizlik|olumsuz\s+görüş|görüş\s+bildirmekten\s+kaçınma)/i,
    negativeSignals: /(?:şartlı\s+görüş|dikkat\s+çekilen\s+husus|sürekliliğ(?:i|ine)\s+ilişkin\s+önemli\s+belirsizlik|olumsuz\s+görüş|görüş\s+bildirmekten\s+kaçınma)/i,
    positiveSignals: /(?:sınırlı\s+denetimden\s+geçmiş|olumlu\s+görüş|aykırı\s+bir\s+husus\s+tespit\s+edilmemiş|dikkatimizi\s+çeken\s+bir\s+husus\s+bulunmamaktadır|herhangi\s+bir\s+husus\s+bulunmamaktadır)/i,
    defaultTitle: 'Bağımsız Denetim Değerlendirmesi',
    defaultImpact: 'Olumlu — Denetçi tarafından mali tablo güvenilirliğini zedeleyen bir şerh bildirilmemiştir.'
  },
  {
    category: 'LITIGATION_AND_TAX',
    categoryLabel: 'Dava, İhtilaf ve Vergi Riski',
    keywords: /(?:dava\s+ve\s+ihtilaf|aleyhte\s+açılan\s+dava|vergi\s+inceleme|vergi\s+cezası|idari\s+para\s+cezası|hukuki\s+süreç|karşılık\s+ayrılmış)/i,
    negativeSignals: /(?:aleyh(?:te|ine)|dava\s+karşılığı|ceza|vergi\s+tarhiyat|ihtilaf|tazminat\s+talebi)/i,
    positiveSignals: /(?:önemli\s+bir\s+dava\s+bulunmamakta|aleyhte\s+dava\s+yok|lehe\s+sonuçlan)/i,
    defaultTitle: 'Dava ve Vergi İhtilafı Kaydı',
    defaultImpact: 'Risk — Olası aleyhte kararlar bilançoda öngörülmeyen nakit çıkışına ve kâr baskısına yol açabilir.'
  },
  {
    category: 'COLLATERAL_AND_OFFBALANCE',
    categoryLabel: 'Teminat, Rehin ve İpotekler',
    keywords: /(?:verilen\s+teminat|rehin\s+ve\s+ipotek|teminat\s+mektu|kefalet|bilanço\s+dışı\s+yükümlülük|ipotek\s+tutarı)/i,
    negativeSignals: /(?:rehin|ipotek|kefalet|üçüncü\s+kişiler\s+lehine|teminat\s+olarak\s+veril)/i,
    positiveSignals: /(?:3\.\s*kişiler\s+lehine\s+verilen\s+teminat\s+bulunmamakta|üçüncü\s+kişiler\s+lehine[^.]{0,40}0\b|yoktur)/i,
    defaultTitle: 'Teminat, Rehin ve İpotek Yükümlülükleri',
    defaultImpact: 'İzlenmeli — Varlıklar üzerindeki rehin ve teminatlar şirketin yeni kredi ve teminat kapasitesini sınırlar.'
  },
  {
    category: 'RELATED_PARTY',
    categoryLabel: 'İlişkili Taraf İşlemleri',
    keywords: /(?:ilişkili\s+taraf|ortaklardan\s+alacak|ortaklara\s+borç|grup\s+şirketleri|üst\s+düzey\s+yönetici(?:lere)?\s+sağlanan\s+fayda)/i,
    negativeSignals: /(?:ortaklardan\s+alacak|ilişkili\s+taraflardan\s+ticari\s+olmayan|yüksek\s+tutarlı\s+alacak)/i,
    defaultTitle: 'İlişkili Taraf Bakiye ve İşlemleri',
    defaultImpact: 'İzlenmeli — Grup içi bakiye ve transferlerin ticari emsallere uygun kalması azınlık hakları açısından kritik önemdedir.'
  },
  {
    category: 'GUIDANCE_AND_CAPEX',
    categoryLabel: 'Yatırım ve Büyüme Görünümü',
    keywords: /(?:geleceğe\s+yönelik\s+beklenti|yatırım\s+harcama|kapasite\s+artış|yeni\s+(?:mağaza|hastane|fabrika|tesis)|sipariş\s+bakiye|ihracat\s+hedef|büyüme\s+strateji|arz\s+kapasite)/i,
    negativeSignals: /(?:gecikme|iptal|kapasite\s+düşüş|talep\s+daralma)/i,
    positiveSignals: /(?:artış|büyüme|yeni\s+yatırım|yatırım\s+harcaması|yeni\s+(?:mağaza|hastane|fabrika|tesis)|kapasite\s+artış|devreye\s+alma|ihracat|yeni\s+sözleşme)/i,
    defaultTitle: 'Yatırım Harcaması ve Büyüme Adımları',
    defaultImpact: 'Olumlu — Aktif büyümesi ve yeni yatırımlar önümüzdeki çeyreklerde ciro ve pazar payı artışını destekler.'
  }
];

function splitTurkishPdfSentences(rawText: string): string[] {
  const normalized = String(rawText || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  // Kısaltmalardaki ve sayılardaki noktaları geçici koru (A.Ş., Tic., No., vb., 1.250, 01.01.2026)
  const sentinel = '\u0000';
  const protectedText = normalized
    .replace(/\b(A|T|Tic|San|Ltd|Şti|Dr|Prof|No|Not|Mad|vb|vs|yakl|ort|Müh|İnş|Tur|Gıda|Paz|Taah|Yay|Hiz|Yat)\./gi, `$1${sentinel}`)
    .replace(/(\d)\.(\d)/g, `$1${sentinel}$2`);

  const rawSentences = protectedText.split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ0-9])/);
  return rawSentences
    .map((s) => s.replace(new RegExp(sentinel, 'g'), '.').trim())
    .filter((s) => s.length >= 25);
}

function cleanNoiseFromSentence(sentence: string): string {
  // Sonradan taşan "5. Dönem Sonrası Önemli Gelişmeler..." veya "Not 31-..." başlık kalıntılarını buda
  let cleaned = sentence
    .replace(/\s+\d+\.\s+(?:Dönem\s+Sonrası|Önemli\s+Gelişmeler|Risk\s+Yönetimi|Sonuç|Giriş|Genel\s+Bilgiler)\b.*$/i, '')
    .replace(/\s+Not\s+\d+\s*[-–:].*$/i, '')
    .replace(/^[\d.,\s•\-–]+(?=[A-ZÇĞİÖŞÜ])/, '')
    .trim();
  if (cleaned.length > 340) {
    const cut = cleaned.slice(0, 340);
    const lastSpace = cut.lastIndexOf(' ');
    cleaned = (lastSpace > 180 ? cut.slice(0, lastSpace) : cut).trim() + '...';
  }
  return cleaned;
}

function isTabularOrBoilerplateNoise(sentence: string): boolean {
  if (!sentence || sentence.length < 30) return true;
  if (/000,00|\bPpt\b/i.test(sentence)) return true;
  if (/^[a-zçğıöşü]/.test(sentence)) return true;
  if (/^[\d.,\s%\-–/()]{4,}/.test(sentence)) return true;
  if (/^\d{1,4}\s+[\d.,]+/.test(sentence)) return true;
  // Üst üste çok fazla sayı içeren tablo satırlarını ele
  const numberTokens = sentence.match(/\b\d+(?:[.,]\d+)?%?\b/g) || [];
  const wordTokens = sentence.match(/[A-Za-zÇĞİÖŞÜçğıöşü]{3,}/g) || [];
  if (numberTokens.length >= 5 && wordTokens.length < numberTokens.length * 1.5) return true;
  if (/(?:kontrol\s+gücünün\s+olup\s+olmadığını|işbu\s+finansal\s+tablolar|karşılaştırmalı\s+olarak\s+sunul|muhasebe\s+politikaları\s+tutarlı|bilanço\s+sonrası\s+hususlara\s+ilişkin|Girişim\s+Sermayesi\s+Yatırım\s+Ortaklığı|konsolidasyon|TMS\s+\d+|TFRS\s+\d+|IFRS)/i.test(sentence)) {
    return true;
  }
  return false;
}

function extractCleanExcerpt(pageText: string, regex: RegExp): string {
  const sentences = splitTurkishPdfSentences(pageText);
  const matchIdx = sentences.findIndex((s) => regex.test(s) && !isTabularOrBoilerplateNoise(s));
  if (matchIdx >= 0) {
    let combined = cleanNoiseFromSentence(sentences[matchIdx]);
    if (combined.length < 110 && matchIdx + 1 < sentences.length && !isTabularOrBoilerplateNoise(sentences[matchIdx + 1])) {
      const nextClean = cleanNoiseFromSentence(sentences[matchIdx + 1]);
      if (combined.length + nextClean.length + 1 <= 340) {
        combined = `${combined} ${nextClean}`;
      }
    }
    return combined;
  }

  // Fallback: kelime ortasından başlamadan tam cümle/kelime sınırına hizala
  const m = regex.exec(pageText);
  if (!m) return cleanNoiseFromSentence(pageText.slice(0, 260));
  let start = Math.max(0, m.index - 110);
  if (start > 0) {
    const nextDot = pageText.indexOf('. ', start);
    if (nextDot !== -1 && nextDot < m.index) {
      start = nextDot + 2;
    } else {
      const nextSpace = pageText.indexOf(' ', start);
      if (nextSpace !== -1 && nextSpace < m.index) start = nextSpace + 1;
    }
  }
  let slice = pageText.slice(start, Math.min(pageText.length, start + 300)).trim();
  slice = cleanNoiseFromSentence(slice);
  return slice;
}

function buildDynamicFindingMeta(
  rule: (typeof MINING_RULES)[number],
  excerpt: string,
  severity: KapQualitativeFinding['severity']
): { title: string; impact: string } {
  const capexMatch = excerpt.match(/(\d+(?:[.,]\d+)?\s*(?:milyar|milyon)\s*(?:TL|USD|EUR))\s*(?:tutarında\s*)?(?:yatırım\s+harcama|yatırım)/i);
  const storeMatch = excerpt.match(/(?:net\s*)?(\d+)\s*(?:adet\s*)?(?:yeni\s*)?(mağaza|şube|hastane|tesis|fabrika|merkez)/i);
  const lawsuitMatch = excerpt.match(/(\d+(?:[.,]\d+)?\s*(?:milyar|milyon|bin)\s*(?:TL|USD|EUR))/i);

  if (rule.category === 'GUIDANCE_AND_CAPEX') {
    const parts: string[] = [];
    if (storeMatch) parts.push(`${storeMatch[1]} Yeni ${storeMatch[2].charAt(0).toUpperCase() + storeMatch[2].slice(1)}`);
    if (capexMatch) parts.push(`${capexMatch[1]} Yatırım Harcaması`);
    if (parts.length > 0) {
      return {
        title: `${parts.join(' • ')}`,
        impact: severity === 'MEDIUM'
          ? `Olumsuz / Risk — Yatırım takvimindeki gecikme veya talep daralması beklenen ciro katkısını öteleyebilir.`
          : `Olumlu (Büyüme Fırsatı) — ${parts.join(' ve ')} şirketin satış alanını/kapasitesini genişleterek önümüzdeki çeyreklerde reel ciro büyümesini destekler; ancak yüksek yatırım temposu kısa vadede serbest nakit akışını sınırlayabilir.`
      };
    }
    return {
      title: rule.defaultTitle,
      impact: severity === 'MEDIUM'
        ? `Olumsuz / Risk — Yönetim görünümündeki yavaşlama sinyali önümüzdeki çeyrek ciro ve marj beklentileri üzerinde baskı oluşturabilir.`
        : `Olumlu (Büyüme Fırsatı) — Operasyonel kapasite ve yatırım adımları ciro potansiyelini artırıyor; serbest nakit dönüşümü ile desteklendiğinde değerlemeyi yukarı taşır.`
    };
  }

  if (rule.category === 'AUDITOR_OPINION') {
    const isNegative = severity === 'HIGH' || severity === 'MEDIUM';
    return {
      title: isNegative ? 'Denetimde Dikkat Çekilen Husus' : 'Temiz Bağımsız Denetim / İnceleme Görüşü',
      impact: isNegative
        ? `Olumsuz / Tehlike — Bağımsız denetçinin şerh veya önemli belirsizlik vurgusu finansal tablo güvenilirliği ve değerleme iskontosu açısından doğrudan risk oluşturur.`
        : `Olumlu — Bağımsız denetçi raporunda şerh veya işletmenin sürekliliğine dair bir uyarı yer almaması mali tabloların güvenilirliğini teyit eder.`
    };
  }

  if (rule.category === 'LITIGATION_AND_TAX') {
    const isNegative = severity === 'HIGH' || severity === 'MEDIUM';
    const amtText = lawsuitMatch ? ` (${lawsuitMatch[1]})` : '';
    return {
      title: isNegative ? `Dava / Vergi Riski Kaydı${amtText}` : 'Önemli Dava ve Vergi İhtilafı Bildirimi',
      impact: isNegative
        ? `Olumsuz / Risk — Aleyhte sonuçlanabilecek dava veya vergi tarhiyatı${amtText} nakit çıkışı yaratarak net kârı ve özkaynakları aşındırabilir.`
        : `Nötr / Olumlu — Mevcut hukuki süreçlerin bilançoyu sarsacak kritik bir karşılık yükü oluşturmadığı izlenmektedir.`
    };
  }

  if (rule.category === 'COLLATERAL_AND_OFFBALANCE') {
    const isNegative = severity === 'HIGH' || severity === 'MEDIUM';
    return {
      title: isNegative ? 'Aktifler Üzerinde Teminat / İpotek Yükü' : 'Teminat, Rehin ve İpotek (TRİ) Durumu',
      impact: isNegative
        ? `Dikkat / Risk — Üçüncü kişiler lehine verilen veya borçlara karşılık tesis edilen rehin/ipotekler şirketin varlık esnekliğini ve yeni kredi kapasitesini sınırlar.`
        : `Olumlu / Dengeli — Bilanço dışı teminat ve rehin yükünün finansal esnekliği tehdit eden bir boyutta olmadığı görülmektedir.`
    };
  }

  // RELATED_PARTY
  const isNegative = severity === 'HIGH' || severity === 'MEDIUM';
  return {
    title: isNegative ? 'İlişkili Taraf Alacak / Fon Aktarımı Riski' : 'İlişkili Taraf İşlemleri ve Bakiye Yapısı',
    impact: isNegative
      ? `Olumsuz / Risk — Grup şirketleri veya ortaklardan ticari olmayan alacak artışı, şirket nakdinin ana faaliyet dışına çıktığına işaret ederek değerleme iskontosu gerektirir.`
      : `İzlenmeli — İlişkili taraflarla ticari işlemler olağan seyrinde görünse de transfer fiyatlaması ve vade dengesi çeyreklik takip edilmelidir.`
  };
}

function mineDeterministicFindings(
  pages: string[],
  sourceDoc: string
): { findings: KapQualitativeFinding[]; targets: KapManagementTarget[]; auditorStatus: string } {
  const findings: KapQualitativeFinding[] = [];
  const targets: KapManagementTarget[] = [];
  const seenCategories = new Map<string, number>();

  let auditorStatus = 'Temiz / Olağan Bildirim';

  for (let i = 0; i < pages.length; i++) {
    const pText = pages[i];
    if (!pText || pText.length < 40) continue;
    const pageNum = i + 1;

    for (const rule of MINING_RULES) {
      if (!rule.keywords.test(pText)) continue;
      const countForCat = seenCategories.get(rule.category) || 0;
      if (countForCat >= 2) continue;

      const excerpt = extractCleanExcerpt(pText, rule.keywords);
      if (isTabularOrBoilerplateNoise(excerpt)) continue;

      const isNeg = rule.negativeSignals.test(excerpt);
      const isPos = rule.positiveSignals ? rule.positiveSignals.test(excerpt) : false;

      let severity: KapQualitativeFinding['severity'] = 'INFO';
      if (isNeg && !isPos) severity = rule.category === 'AUDITOR_OPINION' ? 'HIGH' : 'MEDIUM';
      else if (isPos && !isNeg) severity = 'POSITIVE';
      else if (isNeg) severity = 'MEDIUM';

      if (rule.category === 'AUDITOR_OPINION') {
        if (isNeg && !isPos) auditorStatus = 'Dikkat Çekilen Husus / Şartlı İnceleme';
        else if (isPos) auditorStatus = 'Olumlu / Standart Denetim Görüşü';
      }

      const meta = buildDynamicFindingMeta(rule, excerpt, severity);

      findings.push({
        id: `${rule.category}-${pageNum}-${countForCat}`,
        category: rule.category,
        categoryLabel: rule.categoryLabel,
        severity,
        pageRef: `Sayfa ${pageNum}`,
        sourceDoc,
        title: meta.title,
        excerpt,
        impact: meta.impact
      });
      seenCategories.set(rule.category, countForCat + 1);
    }

    // Yönetim hedefi / somut operasyonel icraat yakalama (yalnızca temiz tam cümleler, tablo gürültüsü hariç)
    if (targets.length < 4) {
      const candidateSentences = splitTurkishPdfSentences(pText);
      for (const rawSent of candidateSentences) {
        if (targets.length >= 4) break;
        const sent = cleanNoiseFromSentence(rawSent);
        if (isTabularOrBoilerplateNoise(sent)) continue;
        if (!/(?:mağaza\s+aç|şube\s+aç|yatırım\s+harcama|kapasite\s+artış|sipariş\s+bakiye|ihracat\s+hedef|hedeflenmektedir|beklenmektedir|planlanmaktadır|yeni\s+(?:mağaza|fabrika|hastane|tesis))/i.test(sent)) {
          continue;
        }
        if (sent.length < 45 || sent.length > 260) continue;
        if (targets.some((t) => t.target === sent)) continue;

        const isCapex = /yatırım\s+harcama|kapasite|mağaza|şube|fabrika|tesis/i.test(sent);
        targets.push({
          metric: isCapex ? 'Yatırım & Kapasite İcraatı' : 'Yönetim Beklentisi',
          target: sent,
          realized: /açmıştır|yapılmıştır|gerçekleşmiştir|tamamlanmıştır/i.test(sent) ? 'Dönem içi icraat gerçekleşti' : 'Süreç / hedef takipte',
          status: /açmıştır|yapılmıştır|artış|büyüme/i.test(sent) ? 'BAŞARILI' : 'KISMEN',
          evaluation: 'Faaliyet raporu resmi dönem içi beyanı',
          period: 'Cari Dönem',
          pageRef: `Sayfa ${pageNum}`
        });
      }
    }
  }

  return { findings: findings.slice(0, 8), targets, auditorStatus };
}

async function refineQualitativeAuditWithGemini(
  ticker: string,
  pages: string[],
  deterministic: { findings: KapQualitativeFinding[]; targets: KapManagementTarget[]; auditorStatus: string },
  sourceDoc: string
): Promise<{ executiveSummary: string; findings: KapQualitativeFinding[]; targets: KapManagementTarget[]; auditorStatus: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || deterministic.findings.length === 0) {
    return {
      executiveSummary: `${ticker} ${sourceDoc} dipnot ve faaliyet raporu bulguları.`,
      ...deterministic
    };
  }

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const contextBlock = deterministic.findings
      .map((f, idx) => `[${idx + 1}] (${f.categoryLabel} | ${f.pageRef}): ${f.excerpt}`)
      .join('\n\n')
      .slice(0, 9000);

    const prompt = `Sen kıdemli bir BIST hisse senedi analistisin. ${ticker} şirketinin resmi KAP "${sourceDoc}" belgesinden (${pages.length} sayfa) alınan aşağıdaki alıntıları analiz et ve yalnızca gerçek verilere dayanarak Türkçe JSON üret. Asla sayı uydurma ve asla "otomatik taranmıştır / çıkarılmıştır / yapay zeka" gibi ifadeler kullanma.
Ham Alıntılar:
${contextBlock}

Kurallar:
- "title": Alıntıdaki somut rakamı veya olguyu içeren kısa ve net başlık (örn. "125 Yeni Mağaza ve 5,3 Milyar TL Yatırım").
- "severity": Yatırımcı açısından net yön ("POSITIVE" = Olumlu/Fırsat, "HIGH" = Yüksek Risk/Tehlike, "MEDIUM" = Dikkat/Sınırlı Risk, "INFO" = Nötr Bilgi).
- "impact": Yatırımcı bu bulgudan ne anlamalı? Şirkete olumlu mu olumsuz mu etki edecek, fırsat mı tehlike mi? Bilanço, nakit akışı, marj veya değerleme etkisini doğrudan 1-2 net cümlede açıkla.

İstenen JSON şeması:
{
  "auditorStatus": "Kısa denetim durumu",
  "executiveSummary": "Yatırımcı için 1-2 net cümlelik özet",
  "findings": [
    {
      "index": 1,
      "title": "Somut ve net başlık",
      "severity": "HIGH" | "MEDIUM" | "POSITIVE" | "INFO",
      "impact": "Olumlu/Olumsuz yönüyle birlikte şirkete somut finansal etkisi (1-2 net cümle)"
    }
  ]
}`;

    const geminiPromise = ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5500));
    const resp: any = await Promise.race([geminiPromise, timeoutPromise]);
    const text = resp?.text || '';
    if (!text) throw new Error('Gemini timeout');
    const parsed = JSON.parse(text);
    const refinedFindings = deterministic.findings.map((orig, idx) => {
      const match = Array.isArray(parsed?.findings)
        ? parsed.findings.find((x: any) => Number(x.index) === idx + 1) || parsed.findings[idx]
        : null;
      if (!match) return orig;
      return {
        ...orig,
        title: String(match.title || orig.title),
        severity: ['HIGH', 'MEDIUM', 'POSITIVE', 'INFO'].includes(match.severity) ? match.severity : orig.severity,
        impact: String(match.impact || orig.impact)
      };
    });

    return {
      auditorStatus: String(parsed?.auditorStatus || deterministic.auditorStatus),
      executiveSummary: String(parsed?.executiveSummary || `${ticker} ${sourceDoc} temel dipnot ve faaliyet bulguları.`),
      findings: refinedFindings,
      targets: deterministic.targets
    };
  } catch {
    return {
      executiveSummary: `${ticker} ${sourceDoc} temel dipnot ve faaliyet bulguları.`,
      ...deterministic
    };
  }
}

const auditCache = new Map<string, { data: KapQualitativeAuditResult; expiresAt: number }>();

export async function fetchAndAnalyzeKapQualitativeAudit(rawTicker: string): Promise<KapQualitativeAuditResult | null> {
  const ticker = (rawTicker || '').toUpperCase().trim();
  if (!ticker) return null;

  const cached = auditCache.get(ticker);
  if (cached && Date.now() < cached.expiresAt && cached.data?.schemaVersion === 2) {
    return cached.data;
  }

  const oid = BIST_KAP_OID_MAP[ticker];
  if (!oid) return null;

  const disclosures = await fetchKapFrDisclosures(oid);
  if (disclosures.length === 0) return null;

  const latestActivity = disclosures.find((d) => /Faaliyet Raporu/i.test(d.subject || '') && d.attachmentCount > 0);
  const latestFinancial = disclosures.find((d) => /Finansal Rapor/i.test(d.subject || '') && d.attachmentCount > 0);

  if (!latestActivity && !latestFinancial) return null;

  const [activityPdf, financialPdf] = await Promise.all([
    latestActivity ? fetchKapPdfPages(latestActivity.disclosureIndex) : Promise.resolve(null),
    latestFinancial ? fetchKapPdfPages(latestFinancial.disclosureIndex) : Promise.resolve(null)
  ]);

  const primaryPages = activityPdf?.pages?.length ? activityPdf.pages : (financialPdf?.pages || []);
  const primaryDocName = activityPdf
    ? `${latestActivity?.year} ${latestActivity?.ruleType} Faaliyet Raporu`
    : `${latestFinancial?.year} ${latestFinancial?.ruleType} Finansal Rapor`;

  if (primaryPages.length === 0) return null;

  // Hem faaliyet raporundan hem finansal dipnot PDF'inden birleşik tarama
  const detActivity = activityPdf ? mineDeterministicFindings(activityPdf.pages, 'Faaliyet Raporu') : { findings: [], targets: [], auditorStatus: '' };
  const detFinancial = financialPdf ? mineDeterministicFindings(financialPdf.pages, 'Finansal Dipnotlar') : { findings: [], targets: [], auditorStatus: '' };

  const combinedDet = {
    findings: [...detActivity.findings, ...detFinancial.findings].slice(0, 8),
    targets: detActivity.targets.length > 0 ? detActivity.targets : detFinancial.targets,
    auditorStatus: detFinancial.auditorStatus || detActivity.auditorStatus || 'Temiz / Olağan Bildirim'
  };

  const refined = await refineQualitativeAuditWithGemini(ticker, primaryPages, combinedDet, primaryDocName);

  const result: KapQualitativeAuditResult = {
    schemaVersion: 2,
    ticker,
    fetchedAt: new Date().toISOString(),
    isAutoFetched: true,
    activityReport: latestActivity && activityPdf ? {
      disclosureIndex: latestActivity.disclosureIndex,
      title: latestActivity.subject,
      publishDate: latestActivity.publishDate,
      periodLabel: `${latestActivity.year} ${latestActivity.ruleType}`,
      fileName: activityPdf.fileName,
      kapUrl: `https://www.kap.org.tr/tr/Bildirim/${latestActivity.disclosureIndex}`,
      pdfUrl: activityPdf.pdfUrl,
      pageCount: activityPdf.pages.length
    } : undefined,
    financialReport: latestFinancial && financialPdf ? {
      disclosureIndex: latestFinancial.disclosureIndex,
      title: latestFinancial.subject,
      publishDate: latestFinancial.publishDate,
      periodLabel: `${latestFinancial.year} ${latestFinancial.ruleType}`,
      fileName: financialPdf.fileName,
      kapUrl: `https://www.kap.org.tr/tr/Bildirim/${latestFinancial.disclosureIndex}`,
      pdfUrl: financialPdf.pdfUrl,
      pageCount: financialPdf.pages.length
    } : undefined,
    auditorStatus: refined.auditorStatus,
    executiveSummary: refined.executiveSummary,
    findings: refined.findings,
    managementTargets: refined.targets
  };

  auditCache.set(ticker, { data: result, expiresAt: Date.now() + 6 * 3600 * 1000 });
  return result;
}
