import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { computeSectorValuationAndDrivers, calculateSectorScore, syncReportTextWithValuation } from '../lib/valuation.ts';
import { detectSector } from '../lib/sectors.ts';

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

// Parse CLI flags: --fix (auto-correct detected anomalies in DB), --all (refresh & upgrade ALL records in DB), --ticker=XXXX (single ticker audit)
const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');
const shouldUpgradeAll = args.includes('--all');
const tickerFilter = args.find(a => a.startsWith('--ticker='))?.split('=')[1]?.toUpperCase();

export async function runForensicAudit() {
  console.log(`\n` + `=`.repeat(85));
  console.log(`🔎 KURUMSAL ADLİ FİNANSAL DENETİM VE ANOMALİ ONARIM SİSTEMİ (FORENSIC AUDIT & HEALER)`);
  console.log(`Mod: ${shouldUpgradeAll ? 'TÜM VERİTABANINI YENİ MOTORLA TOPLU GÜNCELLEME (--all aktif)' : (shouldFix ? 'OTOMATİK ANOMALİ ONARIMI (--fix aktif)' : 'YALNIZCA TARAMA VE RAPORLAMA (Dry Run)')}`);
  if (tickerFilter) console.log(`Filtre: Yalnızca ${tickerFilter} hissesi denetleniyor.`);
  console.log(`=`.repeat(85) + `\n`);

  let allData = [];
  let idQuery = supabase
    .from('valuation_reports')
    .select('id, ticker')
    .order('ticker', { ascending: true });
  if (tickerFilter) {
    idQuery = idQuery.eq('ticker', tickerFilter);
  }
  const { data: idRows, error: idError } = await idQuery;
  if (idError) {
    console.error('Supabase ID listesi sorgu hatası:', idError);
    process.exit(1);
  }

  const allIds = (idRows || []).map(r => r.id);
  const pageSize = 15;
  for (let i = 0; i < allIds.length; i += pageSize) {
    const batchIds = allIds.slice(i, i + pageSize);
    const { data, error } = await supabase
      .from('valuation_reports')
      .select('id, ticker, period, price, decision, score, extracted_data, report')
      .in('id', batchIds);
    if (error) {
      console.error(`Supabase sorgu hatası (batch ${i / pageSize}):`, error);
      break;
    }
    if (data && data.length > 0) {
      allData = allData.concat(data);
    }
  }
  allData.sort((a, b) => String(a.ticker || '').localeCompare(String(b.ticker || '')));

  console.log(`Toplam İncelenen Rapor Sayısı: ${allData.length}`);

  const anomalies = [];
  const fixedCount = 0;

  for (const r of allData) {
    const ext = r.extracted_data || {};
    const val = ext.valuation || {};
    const curP = Number(r.price || val.current_price || ext.current_price || 0);
    const tgtP = Number(val.fair_value || ext.fair_value || ext.target_price || 0);
    const dec = r.decision || val.final_decision;
    const score = parseInt(String(r.score || ext.score || ext.scoreResult?.totalScore || 0), 10) || 0;
    const hist = ext.financial_history || [];
    const latest = hist.length > 0 ? hist[hist.length - 1] : {};

    const netIncome = latest.net_income;
    const ebit = latest.operating_profit ?? latest.ebit;
    const grossProfit = latest.gross_profit;
    const roe = latest.roe;
    const ocf = latest.operating_cash_flow;
    const equity = latest.equity;

    let upsidePct = null;
    let discountPct = null;
    if (curP > 0 && tgtP > 0) {
      upsidePct = Number((((tgtP - curP) / curP) * 100).toFixed(1));
      discountPct = Number((((tgtP - curP) / tgtP) * 100).toFixed(1));
    }

    const flags = [];

    // Invariant 1: ALMA with excessive upside (> 30%)
    if (dec === 'ALMA' && upsidePct !== null && upsidePct > 30.0) {
      flags.push({
        rule: 'INV-1: ALMA_EXCESSIVE_UPSIDE',
        message: `Karar ALMA olmasına rağmen kâğıt üzerinde +%${upsidePct} potansiyel (%${discountPct} iskonto) görünüyor (Fiyat: ${curP}, Hedef: ${tgtP}). Değer Kapanı Deflatörü uygulanmalı.`
      });
    }

    // Invariant 2: Loss maker with AL decision
    const netIncomeTTM = latest.net_income_ttm;
    const isBankOrFin = ['BANKING', 'INSURANCE', 'FINANCIAL_SERVICES'].includes(ext?.sector);
    const isHarmlessRetailReeskont = ext?.sector === 'RETAIL' && grossProfit > 0 && (latest.ebitda ?? 0) > 0 && netIncome > 0;
    const isLossMaker = (
      (netIncome != null && netIncome < 0 && (netIncomeTTM == null || netIncomeTTM < 0)) ||
      (!isBankOrFin && !isHarmlessRetailReeskont && ebit != null && ebit < 0) ||
      (!isBankOrFin && grossProfit != null && grossProfit < 0) ||
      (netIncome != null && netIncome < 0 && roe != null && roe < -2.0)
    );
    if (dec === 'AL' && isLossMaker) {
      flags.push({
        rule: 'INV-2: LOSS_MAKER_RECOMMENDED_AS_BUY',
        message: `Şirket net zararda (Net: ${netIncome?.toLocaleString('tr-TR')}, EBIT: ${ebit?.toLocaleString('tr-TR')}) ancak AL tavsiyesi üretilmiş!`
      });
    }

    // Invariant 3: Extreme upside balloon (> 250% upside / > 71% discount for standard industrial/service; > 400% for REIT & Holding NAV models)
    const isReitOrHolding = ext?.sector === 'REIT' || ext?.sector === 'HOLDING' || ['RGYAS', 'SNGYO', 'TRGYO', 'EKGYO', 'ISGYO', 'VKGYO', 'KGYO', 'PSGYO'].includes(r.ticker);
    const maxUpsideThreshold = isReitOrHolding ? 400.0 : 250.0;
    if (upsidePct !== null && upsidePct >= maxUpsideThreshold && dec !== 'ALMA') {
      flags.push({
        rule: 'INV-3: EXTREME_DISCOUNT_BALLOON',
        message: `Aşırı Potansiyel Balonu (+%${upsidePct} potansiyel / %${discountPct} iskonto). Olası sermaye artırımı/lot uyumsuzluğu veya model kalibrasyonu gereksinimi.`
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

    // Invariant 8: Stale "Neden AL Verilmedi?" block when decision is AL
    const hasNedenAlBlock = Boolean(
      r.report && (
        r.report.includes('Neden "AL" Verilmedi?') ||
        r.report.includes('Neden AL Verilmedi') ||
        r.report.includes('Neden \\"AL\\" Verilmedi?')
      )
    );
    if (dec === 'AL' && hasNedenAlBlock) {
      flags.push({
        rule: 'INV-8: STALE_WHY_NOT_BUY_BLOCK_IN_AL_REPORT',
        message: 'Karar AL olmasına rağmen rapor metninde eski [NÖTR] "Neden AL Verilmedi?" bloğu bulunmaktadır.'
      });
    }

    // Invariant 9: Value Trap or General Asset Trap with AL decision
    const isTrapFlagged = Boolean(val.is_value_trap || ext?.optimization?.isValueTrap);
    if (dec === 'AL' && isTrapFlagged) {
      flags.push({
        rule: 'INV-9: VALUE_TRAP_RECOMMENDED_AS_BUY',
        message: 'Şirket Değer Tuzağı (is_value_trap=true) olarak işaretlenmiş olmasına rağmen AL kararı üretilmiş!'
      });
    }

    // Invariant 10: Sign contradiction (+- or -+) in report text
    if (r.report && /(\+-|-\+)\d/.test(r.report)) {
      flags.push({
        rule: 'INV-10: REPORT_TEXT_SIGN_CONTRADICTION',
        message: 'Rapor metninde çift işaret (+- / -+) matematiksel/dilbilgisel çelişkisi tespit edildi.'
      });
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
        report: r.report,
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

      if (shouldFix && !shouldUpgradeAll) {
        try {
          console.log(`   🔄 ${a.ticker} için güncel değerleme motoru çalıştırılıyor...`);
          const trueSector = detectSector(a.ticker, a.extractedData?.company_name) || a.extractedData?.sector || 'INDUSTRIAL';
          const cleanExt = { ...a.extractedData, ticker: a.ticker, sector: trueSector };
          const newValResult = computeSectorValuationAndDrivers(cleanExt, a.price, trueSector);
          const newScoreResult = newValResult.scoreResult || calculateSectorScore(cleanExt, trueSector);

          const newDec = newValResult.valuation.final_decision;
          const newFairValue = newValResult.valuation.fair_value;
          const newScore = `${newScoreResult.totalScore}/100`;

          console.log(`   ✅ Düzeltildi -> Yeni Karar: ${newDec} | Yeni Hedef: ${newFairValue} TL | Yeni Skor: ${newScore}`);

          // Update Supabase
          const updatedExtracted = {
            ...cleanExt,
            fair_value: newFairValue,
            target_price: newFairValue,
            drivers: newValResult.drivers,
            scoreResult: newScoreResult,
            optimization: newValResult.optimization,
            valuation: {
              ...(a.extractedData.valuation || {}),
              ...newValResult.valuation,
              fair_value: newFairValue
            }
          };

          const syncedReport = syncReportTextWithValuation(
            a.report,
            {
              ...newValResult.valuation,
              final_decision: newDec,
              decision: newDec
            },
            newScoreResult,
            newValResult.drivers,
            Number(a.price || 0),
            a.extractedData
          );

          const { error: updErr } = await supabase
            .from('valuation_reports')
            .update({
              decision: newDec,
              score: newScore,
              extracted_data: updatedExtracted,
              report: syncedReport,
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

  if (shouldUpgradeAll) {
    console.log(`\n🚀 TÜM VERİTABANI (${allData.length} RAPOR) YENİ MOTORLA GÜNCELLENİYOR...\n`);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < allData.length; i++) {
      const r = allData[i];
      try {
        const curPrice = Number(r.price) || 0;
        const ext = r.extracted_data || {};
        const trueSector = detectSector(r.ticker, ext.company_name) || ext.sector || 'INDUSTRIAL';
        const cleanExt = { ...ext, ticker: r.ticker, sector: trueSector };
        const newValResult = computeSectorValuationAndDrivers(cleanExt, curPrice, trueSector);
        const newScoreResult = newValResult.scoreResult || calculateSectorScore(cleanExt, trueSector);

        const newDec = newValResult.valuation.final_decision;
        const newFairValue = newValResult.valuation.fair_value;
        const newScore = `${newScoreResult.totalScore}/100`;

        const updatedExtracted = {
          ...cleanExt,
          fair_value: newFairValue,
          target_price: newFairValue,
          drivers: newValResult.drivers,
          scoreResult: newScoreResult,
          optimization: newValResult.optimization,
          valuation: {
            ...(ext.valuation || {}),
            ...newValResult.valuation,
            fair_value: newFairValue
          }
        };

        const syncedReport = syncReportTextWithValuation(
          r.report,
          {
            ...newValResult.valuation,
            final_decision: newDec,
            decision: newDec
          },
          newScoreResult,
          newValResult.drivers,
          curPrice,
          ext
        );

        const { error: updErr } = await supabase
          .from('valuation_reports')
          .update({
            decision: newDec,
            score: newScore,
            extracted_data: updatedExtracted,
            report: syncedReport,
            updated_at: new Date().toISOString()
          })
          .eq('id', r.id);

        if (updErr) {
          console.error(`   ❌ [${i + 1}/${allData.length}] ${r.ticker} güncelleme hatası:`, updErr.message);
          failCount++;
        } else {
          successCount++;
          if ((i + 1) % 15 === 0 || i === allData.length - 1) {
            console.log(`   ✅ [${i + 1}/${allData.length}] ${r.ticker} (${r.period}) güncellendi -> Karar: ${newDec} | Hedef: ${newFairValue} TL | Skor: ${newScore}`);
          }
        }
      } catch (err) {
        console.error(`   ❌ [${i + 1}/${allData.length}] ${r.ticker} hesaplama hatası:`, err.message);
        failCount++;
      }
    }
    console.log(`\n🎉 Toplu Güncelleme Tamamlandı! Başarılı: ${successCount}, Hata: ${failCount}`);
  }

  console.log(`\n` + `=`.repeat(85) + `\n`);
}

runForensicAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
