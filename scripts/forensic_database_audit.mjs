import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { computeSectorValuationAndDrivers, calculateSectorScore } from '../lib/valuation.ts';

// Ignore TLS certificate validation in development environment
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// 1. Read environment variables
let env = {};
try {
  const envFile = fs.readFileSync('.env.local', 'utf-8');
  envFile.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [k, ...v] = trimmed.split('=');
      if (k) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
    }
  });
} catch (e) {
  console.warn('Could not read .env.local, using process.env');
  env = process.env;
}

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Parse CLI flags: --fix (auto-correct detected anomalies in DB), --ticker=XXXX (single ticker audit)
const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');
const tickerFilter = args.find(a => a.startsWith('--ticker='))?.split('=')[1]?.toUpperCase();

export async function runForensicAudit() {
  console.log(`\n` + `=`.repeat(85));
  console.log(`🔎 KURUMSAL ADLİ FİNANSAL DENETİM VE ANOMALİ TARAMA SİSTEMİ (FORENSIC AUDIT)`);
  console.log(`Mod: ${shouldFix ? 'OTOMATİK DÜZELTME & GÜNCELLEME (--fix aktif)' : 'YALNIZCA TARAMA VE RAPORLAMA (Dry Run)'}`);
  if (tickerFilter) console.log(`Filtre: Yalnızca ${tickerFilter} hissesi denetleniyor.`);
  console.log(`=`.repeat(85) + `\n`);

  let allData = [];
  let page = 0;
  const pageSize = 30;

  while (true) {
    let query = supabase
      .from('valuation_reports')
      .select('id, ticker, period, price, decision, score, extracted_data, report')
      .order('ticker', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (tickerFilter) {
      query = query.eq('ticker', tickerFilter);
    }

    const { data, error } = await query;
    if (error) {
      console.error(`Supabase sorgu hatası (sayfa ${page}):`, error);
      break;
    }

    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < pageSize) break;
    page++;
  }

  console.log(`Toplam İncelenen Rapor Sayısı: ${allData.length}`);

  const anomalies = [];
  const fixedCount = 0;

  for (const r of allData) {
    const ext = r.extracted_data || {};
    const val = ext.valuation || {};
    const curP = Number(r.price || val.current_price || ext.current_price || 0);
    const tgtP = Number(val.fair_value || ext.fair_value || ext.target_price || 0);
    const dec = r.decision || val.final_decision;
    const score = Number(r.score || ext.score || 0);
    const hist = ext.financial_history || [];
    const latest = hist.length > 0 ? hist[hist.length - 1] : {};

    const netIncome = latest.net_income;
    const ebit = latest.operating_profit ?? latest.ebit;
    const grossProfit = latest.gross_profit;
    const roe = latest.roe;
    const ocf = latest.operating_cash_flow;
    const equity = latest.equity;

    let discount = null;
    if (curP > 0 && tgtP > 0) {
      discount = Number((((tgtP - curP) / curP) * 100).toFixed(1));
    }

    const flags = [];

    // Invariant 1: ALMA with excessive upside (> 30%)
    if (dec === 'ALMA' && discount !== null && discount > 30.0) {
      flags.push({
        rule: 'INV-1: ALMA_EXCESSIVE_UPSIDE',
        message: `Karar ALMA olmasına rağmen kâğıt üzerinde %${discount} iskonto görünüyor (Fiyat: ${curP}, Hedef: ${tgtP}). Değer Kapanı Deflatörü uygulanmalı.`
      });
    }

    // Invariant 2: Loss maker with AL decision
    const isLossMaker = (netIncome != null && netIncome < 0) || (ebit != null && ebit < 0) || (grossProfit != null && grossProfit < 0) || (roe != null && roe < -2.0);
    if (dec === 'AL' && isLossMaker) {
      flags.push({
        rule: 'INV-2: LOSS_MAKER_RECOMMENDED_AS_BUY',
        message: `Şirket net zararda (Net: ${netIncome?.toLocaleString('tr-TR')}, EBIT: ${ebit?.toLocaleString('tr-TR')}) ancak AL tavsiyesi üretilmiş!`
      });
    }

    // Invariant 3: Extreme discount balloon (> 150%)
    if (discount !== null && discount >= 150.0 && dec !== 'ALMA') {
      flags.push({
        rule: 'INV-3: EXTREME_DISCOUNT_BALLOON',
        message: `Aşırı İskonto Balonu (%${discount}). Olası sermaye artırımı/lot uyumsuzluğu veya model kalibrasyonu gereksinimi.`
      });
    }

    // Invariant 4: Window Dressing with AL (Positive Net Income but negative OCF)
    if (dec === 'AL' && netIncome != null && netIncome > 0 && ocf != null && ocf < -100000000) {
      flags.push({
        rule: 'INV-4: ACCRUAL_WINDOW_DRESSING_BUY',
        message: `Net kâr pozitif ancak Faaliyet Nakit Akışı negatif (${ocf?.toLocaleString('tr-TR')}). Kâr kalitesi şüpheliyken AL verilmiş.`
      });
    }

    // Invariant 5: Negative Equity (TTK 376 Insolvency)
    if (equity != null && equity <= 0 && dec !== 'ALMA') {
      flags.push({
        rule: 'INV-5: INSOLVENT_NON_ALMA',
        message: `Özkaynak negatif (${equity?.toLocaleString('tr-TR')}). TTK 376 borca batıklık uyarınca kesinlikle ALMA olmalı.`
      });
    }

    // Invariant 6: Loss Maker High Score Inflation
    if (score >= 70 && isLossMaker) {
      flags.push({
        rule: 'INV-6: LOSS_MAKER_SCORE_INFLATION',
        message: `Zararda olan şirkete ${score}/100 gibi yüksek bir skor atanmış!`
      });
    }

    // Invariant 7: Scenario Monotonicity Violation
    const bear = val.bear_case_price;
    const base = val.fair_value;
    const bull = val.bull_case_price;
    if (bear != null && base != null && bull != null) {
      if (bear > base || base > bull) {
        flags.push({
          rule: 'INV-7: SCENARIO_NON_MONOTONIC',
          message: `Senaryo tekdüzeliği bozuk: Ayı (${bear}) <= Adil (${base}) <= Boğa (${bull}) kuralı ihlal edilmiş.`
        });
      }
    }

    if (flags.length > 0) {
      anomalies.push({
        id: r.id,
        ticker: r.ticker,
        period: r.period,
        price: curP,
        currentFairValue: tgtP,
        currentDecision: dec,
        currentScore: score,
        extractedData: ext,
        flags
      });
    }
  }

  console.log(`\n📊 DENETİM SONUÇLARI:`);
  console.log(`Toplam Rapor: ${allData.length}`);
  console.log(`Kural İhlali Tespit Edilen Rapor: ${anomalies.length}`);

  const byRule = {};
  for (const a of anomalies) {
    for (const f of a.flags) {
      byRule[f.rule] = (byRule[f.rule] || 0) + 1;
    }
  }
  console.log('\nKural Bazında Dağılım:');
  console.table(byRule);

  if (anomalies.length > 0) {
    console.log(`\nTespit Edilen Anomaliler:`);
    for (const a of anomalies) {
      console.log(`\n🚨 [${a.ticker} - ${a.period}] (Fiyat: ${a.price} TL | Hedef: ${a.currentFairValue} TL | Karar: ${a.currentDecision} | Skor: ${a.currentScore})`);
      for (const f of a.flags) {
        console.log(`   └─ ${f.rule}: ${f.message}`);
      }

      if (shouldFix) {
        try {
          console.log(`   🔄 ${a.ticker} için güncel değerleme motoru çalıştırılıyor...`);
          const newValResult = computeSectorValuationAndDrivers(a.extractedData, a.price);
          const newScoreResult = calculateSectorScore(a.extractedData, a.extractedData.sector || 'INDUSTRIAL');

          const newDec = newValResult.valuation.final_decision;
          const newFairValue = newValResult.valuation.fair_value;
          const newScore = `${newScoreResult.totalScore}/100`;

          console.log(`   ✅ Düzeltildi -> Yeni Karar: ${newDec} | Yeni Hedef: ${newFairValue} TL | Yeni Skor: ${newScore}`);

          // Update Supabase
          const updatedExtracted = {
            ...a.extractedData,
            fair_value: newFairValue,
            target_price: newFairValue,
            valuation: {
              ...(a.extractedData.valuation || {}),
              ...newValResult.valuation,
              fair_value: newFairValue
            }
          };

          const { error: updErr } = await supabase
            .from('valuation_reports')
            .update({
              decision: newDec,
              score: newScore,
              extracted_data: updatedExtracted,
              updated_at: new Date().toISOString()
            })
            .eq('id', a.id);

          if (updErr) {
            console.error(`   ❌ Supabase güncelleme hatası (${a.ticker}):`, updErr);
          } else {
            console.log(`   💾 Supabase kaydı başarıyla güncellendi!`);
          }
        } catch (calcErr) {
          console.error(`   ❌ Hesaplama hatası (${a.ticker}):`, calcErr);
        }
      }
    }
  } else {
    console.log(`\n🎉 Tebrikler! Veritabanındaki tüm raporlar 7 Finansal Değişmez Kuralına %100 uygundur.`);
  }

  console.log(`\n` + `=`.repeat(85) + `\n`);
}

runForensicAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
