import https from 'node:https';
import { BIST_KAP_OID_MAP } from './kap-mapping.ts';

export const KAP_AUTO_QUALITATIVE_TICKERS = new Set(['SAYAS', 'MPARK']);

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
  period: string;
  pageRef: string;
}

export interface KapQualitativeAuditResult {
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
    categoryLabel: 'Bağımsız Denetçi Görüşü',
    keywords: /(?:bağımsız\s+denet[çc]i|sınırlı\s+olumlu|şartlı\s+görüş|dikkat\s+çekilen\s+husus|işletmenin\s+sürekliliği|olumsuz\s+görüş|görüş\s+bildirmekten\s+kaçınma)/i,
    negativeSignals: /(?:şartlı\s+görüş|dikkat\s+çekilen|sürekliliğ(?:i|ine)\s+ilişkin\s+önemli\s+belirsizlik|olumsuz\s+görüş|sınırlı\s+olumlu\s+sonuç\s+dışında\s+dikkat)/i,
    positiveSignals: /(?:sınırlı\s+denetimden\s+geçmiş|olumlu\s+görüş|aykırı\s+bir\s+husus\s+tespit\s+edilmemiş|dikkatimizi\s+çeken\s+bir\s+husus\s+bulunmamaktadır)/i,
    defaultTitle: 'Bağımsız Denetim / İnceleme Bulgusu',
    defaultImpact: 'Finansal tabloların güvenilirliği ve muhasebe standartlarına uyumunu gösterir.'
  },
  {
    category: 'LITIGATION_AND_TAX',
    categoryLabel: 'Dava, İhtilaf & Vergi Riskleri',
    keywords: /(?:dava\s+ve\s+ihtilaf|aleyhte\s+açılan\s+dava|vergi\s+inceleme|vergi\s+cezası|idari\s+para\s+cezası|hukuki\s+süreç|karşılık\s+ayrılmış)/i,
    negativeSignals: /(?:aleyh(?:te|ine)|dava\s+karşılığı|ceza|vergi\s+tarhiyat|ihtilaf|tazminat\s+talebi)/i,
    defaultTitle: 'Hukuki İhtilaf, Dava veya Vergi Karşılığı Kaydı',
    defaultImpact: 'Bilançoda öngörülmeyen nakit çıkışı veya karşılık gideri yaratma potansiyeli taşır.'
  },
  {
    category: 'COLLATERAL_AND_OFFBALANCE',
    categoryLabel: 'TRİ (Teminat, Rehin, İpotek) & Taahhütler',
    keywords: /(?:verilen\s+teminat|rehin\s+ve\s+ipotek|teminat\s+mektu|kefalet|bilanço\s+dışı\s+yükümlülük|ipotek\s+tutarı)/i,
    negativeSignals: /(?:rehin|ipotek|kefalet|üçüncü\s+kişiler\s+lehine|teminat\s+olarak\s+veril)/i,
    defaultTitle: 'Teminat, Rehin, İpotek ve Bilanço Dışı Yükümlülükler',
    defaultImpact: 'Varlıkların üzerindeki takyidat oranını ve finansal esnekliği etkiler.'
  },
  {
    category: 'RELATED_PARTY',
    categoryLabel: 'İlişkili Taraf İşlemleri',
    keywords: /(?:ilişkili\s+taraf|ortaklardan\s+alacak|ortaklara\s+borç|grup\s+şirketleri|üst\s+düzey\s+yönetici(?:lere)?\s+sağlanan\s+fayda)/i,
    negativeSignals: /(?:ortaklardan\s+alacak|ilişkili\s+taraflardan\s+ticari\s+olmayan|yüksek\s+tutarlı\s+alacak)/i,
    defaultTitle: 'İlişkili Taraf Bakiye ve İşlem Detayı',
    defaultImpact: 'Sermaye tahsisi şeffaflığı ve nakit çıkışının grup içi aktarım riskini izler.'
  },
  {
    category: 'GUIDANCE_AND_CAPEX',
    categoryLabel: 'Yönetim Beklentisi, Yatırım & Sipariş',
    keywords: /(?:geleceğe\s+yönelik\s+beklenti|yatırım\s+harcama|kapasite\s+artış|yeni\s+hastane|sipariş\s+bakiye|ihracat\s+hedef|büyüme\s+strateji|arz\s+kapasite)/i,
    negativeSignals: /(?:gecikme|iptal|kapasite\s+düşüş|talep\s+daralma)/i,
    positiveSignals: /(?:artış|büyüme|yeni\s+yatırım|kapasite\s+artış|devreye\s+alma|ihracat|yeni\s+sözleşme)/i,
    defaultTitle: 'Yönetim Stratejisi, Kapasite ve Yatırım Görünümü',
    defaultImpact: 'Gelecek dönem ciro ve FAVÖK büyümesinin kalitatif dayanağını oluşturur.'
  }
];

function extractFocusedSnippet(pageText: string, regex: RegExp): string {
  const m = regex.exec(pageText);
  if (!m) return pageText.slice(0, 280);
  const start = Math.max(0, m.index - 110);
  const end = Math.min(pageText.length, m.index + 240);
  let slice = pageText.slice(start, end).trim();
  if (start > 0) slice = '...' + slice;
  if (end < pageText.length) slice = slice + '...';
  return slice;
}

function mineDeterministicFindings(
  pages: string[],
  sourceDoc: string
): { findings: KapQualitativeFinding[]; targets: KapManagementTarget[]; auditorStatus: string } {
  const findings: KapQualitativeFinding[] = [];
  const targets: KapManagementTarget[] = [];
  const seenCategories = new Map<string, number>();

  let auditorStatus = 'Denetim kaydı taranıyor / Olağan ara dönem bildirimi';

  for (let i = 0; i < pages.length; i++) {
    const pText = pages[i];
    if (!pText || pText.length < 40) continue;
    const pageNum = i + 1;

    for (const rule of MINING_RULES) {
      if (!rule.keywords.test(pText)) continue;
      const countForCat = seenCategories.get(rule.category) || 0;
      if (countForCat >= 2) continue;

      const excerpt = extractFocusedSnippet(pText, rule.keywords);
      const isNeg = rule.negativeSignals.test(excerpt);
      const isPos = rule.positiveSignals ? rule.positiveSignals.test(excerpt) : false;

      let severity: KapQualitativeFinding['severity'] = 'INFO';
      if (isNeg && !isPos) severity = rule.category === 'AUDITOR_OPINION' ? 'HIGH' : 'MEDIUM';
      else if (isPos && !isNeg) severity = 'POSITIVE';
      else if (isNeg) severity = 'MEDIUM';

      if (rule.category === 'AUDITOR_OPINION') {
        if (/şartlı|sürekliliğ/i.test(excerpt)) auditorStatus = 'Dikkat Çekilen Husus / Şartlı İnceleme';
        else if (isPos) auditorStatus = 'Olumlu / Standart Denetim Görüşü';
      }

      findings.push({
        id: `${rule.category}-${pageNum}-${countForCat}`,
        category: rule.category,
        categoryLabel: rule.categoryLabel,
        severity,
        pageRef: `Sayfa ${pageNum}`,
        sourceDoc,
        title: rule.defaultTitle,
        excerpt,
        impact: rule.defaultImpact
      });
      seenCategories.set(rule.category, countForCat + 1);
    }

    // Yönetim hedefi / sayısal beklenti yakalama (ör. % büyüme veya TL/USD yatırım)
    if (targets.length < 4 && /(?:hedef|beklenti|yatırım|büyüme|kapasite)/i.test(pText)) {
      const targetMatch = pText.match(/([^.]{15,120}(?:%\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*(?:Milyon|Milyar)\s*(?:TL|USD|EUR)|yatırım|kapasite)[^.]{5,90}\.)/i);
      if (targetMatch && targetMatch[1]) {
        targets.push({
          metric: 'Faaliyet Raporu Beyanı',
          target: targetMatch[1].trim().slice(0, 180),
          period: '2026 / İleriye Dönük',
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
    const highCount = deterministic.findings.filter((f) => f.severity === 'HIGH' || f.severity === 'MEDIUM').length;
    return {
      executiveSummary: `${ticker} için resmi KAP ${sourceDoc} metni taranmıştır (${pages.length} sayfa). Toplam ${deterministic.findings.length} adet kalitatif bulgu (${highCount} adet dikkat/risk unsuru) dipnot ve yönetim açıklamalarından çıkarılmıştır.`,
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

    const prompt = `Sen kurumsal bir BIST adli finansal analistisin. ${ticker} şirketinin resmi KAP "${sourceDoc}" belgesinden (${pages.length} sayfa) çıkarılan aşağıdaki ham alıntıları incele ve yalnızca gerçek veriye dayanarak Türkçe JSON üret. Asla uydurma sayı yazma.
Ham Alıntılar:
${contextBlock}

İstenen JSON şeması:
{
  "auditorStatus": "Kısa denetim durumu özeti (örn. Standart Ara Dönem / Dikkat Çekilen Husus Yok)",
  "executiveSummary": "Faaliyet raporu ve dipnotlardan çıkan kalitatif risk ve beklenti özeti (2-3 net cümle)",
  "findings": [
    {
      "index": 1,
      "title": "Kısa ve net bulgu başlığı",
      "severity": "HIGH" | "MEDIUM" | "POSITIVE" | "INFO",
      "impact": "Yatırımcı için bilanço/risk etkisi (1 net cümle)"
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
      executiveSummary: String(parsed?.executiveSummary || `${ticker} KAP raporu (${pages.length} sayfa) incelenmiştir.`),
      findings: refinedFindings,
      targets: deterministic.targets
    };
  } catch {
    return {
      executiveSummary: `${ticker} için resmi KAP ${sourceDoc} (${pages.length} sayfa) otomatik olarak taranmış ve ${deterministic.findings.length} adet kalitatif bulgu çıkarılmıştır.`,
      ...deterministic
    };
  }
}

const auditCache = new Map<string, { data: KapQualitativeAuditResult; expiresAt: number }>();

export async function fetchAndAnalyzeKapQualitativeAudit(rawTicker: string): Promise<KapQualitativeAuditResult | null> {
  const ticker = (rawTicker || '').toUpperCase().trim();
  if (!KAP_AUTO_QUALITATIVE_TICKERS.has(ticker)) return null;

  const cached = auditCache.get(ticker);
  if (cached && Date.now() < cached.expiresAt) {
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
    auditorStatus: detFinancial.auditorStatus || detActivity.auditorStatus || 'Standart Denetim'
  };

  const refined = await refineQualitativeAuditWithGemini(ticker, primaryPages, combinedDet, primaryDocName);

  const result: KapQualitativeAuditResult = {
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
