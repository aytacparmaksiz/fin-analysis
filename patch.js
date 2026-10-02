const fs = require('fs');

const path = 'app/page.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Add ozet to activeTab state
code = code.replace(
  "const [activeTab, setActiveTab] = useState<'overview'",
  "const [activeTab, setActiveTab] = useState<'ozet' | 'overview'"
);
code = code.replace(
  "useState<'overview' | 'fairvalue' | 'tables' | 'proscons' | 'guidance' | 'report' | 'history'>('overview')",
  "useState<'ozet' | 'overview' | 'fairvalue' | 'tables' | 'proscons' | 'guidance' | 'report' | 'history'>('ozet')"
);

// 2. Add ozetPeriod state
code = code.replace(
  "const [activeTab, setActiveTab] = useState",
  "const [ozetPeriod, setOzetPeriod] = useState<string>('Tüm');\n  const [activeTab, setActiveTab] = useState"
);

// 3. Update setActiveTab('overview') defaults to 'ozet'
code = code.replace(/setActiveTab\('overview'\);/g, "setActiveTab('ozet');");

// 4. Calculate Piyasa Degeri
const piyasaDegeriCode = `
  const piyasaDegeri = (valuationInfo.current_price ?? 0) * (currentExtractedData?.shares_outstanding ?? currentExtractedData?.share_count ?? 0);
  let piyasaDegeriStr = '';
  if (piyasaDegeri >= 1_000_000_000) {
    piyasaDegeriStr = (piyasaDegeri / 1e9).toFixed(1) + ' Bn TL';
  } else if (piyasaDegeri >= 1_000_000) {
    piyasaDegeriStr = (piyasaDegeri / 1e6).toFixed(0) + ' Mn TL';
  } else if (currentExtractedData?.marketCap) {
      const mc = currentExtractedData.marketCap;
      if (mc >= 1_000_000_000) {
        piyasaDegeriStr = (mc / 1e9).toFixed(1) + ' Bn TL';
      } else if (mc >= 1_000_000) {
        piyasaDegeriStr = (mc / 1e6).toFixed(0) + ' Mn TL';
      }
  }

  return (
`;
code = code.replace("  return (\n    <div className=\"min-h-screen", piyasaDegeriCode + "    <div className=\"min-h-screen");

// 5. Add Piyasa Degeri Pill
const pillCode = `
                      {valuationInfo?.fair_value != null && (
                        <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          Adil Değer: {typeof valuationInfo.fair_value === 'number' ? valuationInfo.fair_value.toFixed(2) : valuationInfo.fair_value} TL
                        </span>
                      )}
                      {piyasaDegeriStr && (
                        <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/30">
                          Piyasa Değeri: {piyasaDegeriStr}
                        </span>
                      )}
`;
code = code.replace(
  /\{\s*valuationInfo\?.fair_value != null && \(\s*<span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-md bg-emerald-500\/10 text-emerald-400 border border-emerald-500\/30">\s*Adil Değer:[^<]+<\/span>\s*\)\s*\}/s,
  pillCode
);

// 6. Add tab button
const tabButtonCode = `
                <button
                  type="button"
                  onClick={() => setActiveTab('ozet')}
                  className={\`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition cursor-pointer whitespace-nowrap \${
                    activeTab === 'ozet'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }\`}
                >
                  <PieChart className="w-3.5 h-3.5" /> Özet Rapor
                </button>
                <button
`;
code = code.replace(
  '<div className="flex flex-wrap items-center gap-1 bg-[#0F1523] p-1.5 rounded-xl border border-slate-800/90 print:hidden">\n                <button',
  '<div className="flex flex-wrap items-center gap-1 bg-[#0F1523] p-1.5 rounded-xl border border-slate-800/90 print:hidden">\n' + tabButtonCode
);

// 7. Generate Ozet Rapor Content
const ozetRaporContent = `
              {/* SEKME 0: ÖZET RAPOR */}
              {activeTab === 'ozet' && (
                <div className="space-y-6">
                  {chartData.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 bg-[#0F1523] rounded-xl border border-slate-800 text-sm">
                      Grafik verisi bulunamadı.
                    </div>
                  ) : (
                    <>
                      {(() => {
                        let filteredChartData = chartData;
                        if (ozetPeriod === '1Ç') filteredChartData = chartData.slice(-1);
                        else if (ozetPeriod === '4Ç') filteredChartData = chartData.slice(-4);
                        else if (ozetPeriod === '1Y') filteredChartData = chartData.slice(-5);
                        else if (ozetPeriod === '3Y') filteredChartData = chartData.slice(-12);
                        
                        const validPrices = filteredChartData.map((d: any) => d.share_price).filter((p: any) => typeof p === 'number' && p > 0);
                        const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : null;
                        const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;
                        const firstPrice = validPrices.length > 0 ? validPrices[0] : null;
                        const lastPrice = valuationInfo.current_price;
                        
                        return (
                          <div className="bg-gray-900/80 border border-slate-800/90 rounded-2xl p-5 shadow-lg space-y-4">
                            <div className="flex items-center justify-between flex-wrap gap-4">
                              <div className="flex gap-6 text-sm">
                                <div><span className="text-slate-400">Güncel Fiyat:</span> <span className="text-white font-bold">{lastPrice} TL</span></div>
                                {maxPrice && <div><span className="text-slate-400">52H Yüksek:</span> <span className="text-white font-bold">{maxPrice.toFixed(2)} TL</span></div>}
                                {minPrice && <div><span className="text-slate-400">52H Düşük:</span> <span className="text-white font-bold">{minPrice.toFixed(2)} TL</span></div>}
                                {piyasaDegeriStr && <div><span className="text-slate-400">Piyasa Değeri:</span> <span className="text-white font-bold">{piyasaDegeriStr}</span></div>}
                              </div>
                              <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                                {['1Ç', '4Ç', '1Y', '3Y', 'Tüm'].map(p => (
                                  <button
                                    key={p}
                                    onClick={() => setOzetPeriod(p)}
                                    className={\`px-3 py-1 text-xs font-semibold rounded-md transition \${ozetPeriod === p ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}\`}
                                  >{p}</button>
                                ))}
                              </div>
                            </div>
                            <div className="h-64 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={filteredChartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.5} />
                                  <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 11 }} />
                                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                                  <Tooltip content={<CustomChartTooltip />} />
                                  <Line type="monotone" dataKey="share_price" name="Hisse Fiyatı" stroke="#10b981" strokeWidth={2.5} dot={false} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        );
                      })()}
                      
                      {/* Özet Finansallar */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div className="bg-[#0F1523] border border-slate-800/90 rounded-2xl p-5 shadow-lg">
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-bold text-white">Özet Gelir Tablosu (Bin TRY)</h3>
                            <div className="flex gap-2">
                              <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">TRY</span>
                              <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">{Math.min(chartData.length, 2)} çeyrek</span>
                            </div>
                          </div>
                          <table className="w-full text-sm text-left">
                            <thead>
                              <tr className="text-slate-400 border-b border-slate-800">
                                <th className="pb-2 font-medium">Kalem</th>
                                <th className="pb-2 font-medium text-right">{chartData[chartData.length - 1]?.period}</th>
                                <th className="pb-2 font-medium text-right">{chartData[chartData.length - 2]?.period || '-'}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50 text-slate-300">
                              {[
                                currentSector === 'INSURANCE' ? { k: 'gross_written_premiums', l: 'Prim Üretimi' } : { k: 'revenue', l: 'Satışlar' },
                                currentSector === 'INSURANCE' ? null : { k: 'gross_profit', l: 'Brüt Kar' },
                                currentSector === 'INSURANCE' ? null : { k: 'operating_income', l: 'Esas Faaliyet Karı' },
                                currentSector === 'INSURANCE' ? { k: 'technical_balance', l: 'Teknik Bölüm Dengesi' } : { k: 'ebitda', l: 'FAVÖK' },
                                currentSector === 'INSURANCE' ? { k: 'investment_income', l: 'Yatırım Gelirleri' } : null,
                                { k: 'net_income', l: 'Net Dönem Karı' }
                              ].filter(Boolean).map((rowConfig: any) => (
                                <tr key={rowConfig.k} className="hover:bg-slate-800/30">
                                  <td className="py-2">{rowConfig.l}</td>
                                  <td className="py-2 text-right font-mono">{chartData[chartData.length - 1]?.[rowConfig.k] != null ? (chartData[chartData.length - 1]?.[rowConfig.k] / 1000).toLocaleString('tr-TR', {maximumFractionDigits:0}) : '—'}</td>
                                  <td className="py-2 text-right font-mono">{chartData[chartData.length - 2]?.[rowConfig.k] != null ? (chartData[chartData.length - 2]?.[rowConfig.k] / 1000).toLocaleString('tr-TR', {maximumFractionDigits:0}) : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        
                        <div className="bg-[#0F1523] border border-slate-800/90 rounded-2xl p-5 shadow-lg">
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-bold text-white">Özet Bilanço (Bin TRY)</h3>
                            <div className="flex gap-2">
                              <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">TRY</span>
                              <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">{Math.min(chartData.length, 2)} çeyrek</span>
                            </div>
                          </div>
                          <table className="w-full text-sm text-left">
                            <thead>
                              <tr className="text-slate-400 border-b border-slate-800">
                                <th className="pb-2 font-medium">Kalem</th>
                                <th className="pb-2 font-medium text-right">{chartData[chartData.length - 1]?.period}</th>
                                <th className="pb-2 font-medium text-right">QoQ %</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50 text-slate-300">
                              {[
                                { k: 'current_assets', l: 'Dönen Varlıklar' },
                                { k: 'non_current_assets', l: 'Duran Varlıklar' },
                                { k: 'total_assets', l: 'Toplam Varlıklar' },
                                { k: 'financial_debt', l: 'Finansal Borçlar' },
                                { k: 'net_debt', l: 'Net Borç' },
                                { k: 'equity', l: 'Özkaynaklar' }
                              ].map((rowConfig: any) => {
                                const v1 = chartData[chartData.length - 1]?.[rowConfig.k];
                                const v2 = chartData[chartData.length - 2]?.[rowConfig.k];
                                const chg = (v1 != null && v2 != null && v2 !== 0) ? ((v1 - v2) / Math.abs(v2) * 100).toFixed(1) : null;
                                return (
                                  <tr key={rowConfig.k} className="hover:bg-slate-800/30">
                                    <td className="py-2">{rowConfig.l}</td>
                                    <td className="py-2 text-right font-mono">{v1 != null ? (v1 / 1000).toLocaleString('tr-TR', {maximumFractionDigits:0}) : '—'}</td>
                                    <td className="py-2 text-right font-mono">
                                      {chg ? (
                                        <span className={Number(chg) > 0 ? 'text-emerald-400' : Number(chg) < 0 ? 'text-rose-400' : 'text-slate-400'}>
                                          {Number(chg) > 0 ? '+' : ''}{chg}%
                                        </span>
                                      ) : '—'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      
                      {/* Çeyreklik Bar Grafikleri (3'lü) */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {[
                          { title: currentSector === 'INSURANCE' ? 'Çeyreklik Prim Üretimi' : 'Çeyreklik Satışlar', key: currentSector === 'INSURANCE' ? 'gross_written_premiums' : 'revenue' },
                          { title: currentSector === 'INSURANCE' ? 'Çeyreklik Teknik Bölüm Dengesi' : 'Çeyreklik FAVÖK', key: currentSector === 'INSURANCE' ? 'technical_balance' : 'ebitda' },
                          { title: 'Çeyreklik Net Kar', key: 'net_income' }
                        ].map(chart => (
                          <div key={chart.key} className="bg-[#0F1523] border border-slate-800/90 rounded-2xl p-4 shadow-lg">
                            <div className="text-xs font-bold text-white mb-2">{chart.title}</div>
                            <div className="h-40 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData.slice(-5)} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                                  <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 10 }} />
                                  <Tooltip content={<CustomChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                  <Bar dataKey={chart.key} name={chart.title} fill="#3b82f6" radius={[2, 2, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* Mini Sparkline Çizgi Grafikleri (3x2) */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {[
                          { title: 'Brüt Kar Marjı (Çeyreklik)', calc: (d:any) => d.revenue ? (d.gross_profit / d.revenue * 100) : null },
                          { title: currentSector === 'INSURANCE' ? 'Teknik Kâr Marjı (Çeyreklik)' : 'FAVÖK Marjı (Çeyreklik)', calc: (d:any) => {
                            if (currentSector === 'INSURANCE') return (d.gross_written_premiums ? (d.technical_balance || d.net_income) / d.gross_written_premiums * 100 : null);
                            return d.revenue ? (d.ebitda / d.revenue * 100) : null;
                          }},
                          { title: 'Net Kar Marjı (Çeyreklik)', calc: (d:any) => d.revenue ? (d.net_income / d.revenue * 100) : null },
                          { title: 'Cari Oran', calc: (d:any) => d.current_liabilities ? (d.current_assets / d.current_liabilities) : null },
                          { title: 'Kaldıraç Oranı', calc: (d:any) => d.equity ? ((d.total_assets - d.equity) / d.equity) : null },
                          { title: 'Özkaynak Karlılığı', calc: (d:any) => d.equity ? (d.net_income / d.equity * 100 * getAnnualizationFactor(d.period)) : null }
                        ].map(mini => {
                          const miniData = chartData.slice(-8).map((d:any) => ({ period: d.period, value: mini.calc(d) }));
                          return (
                            <div key={mini.title} className="bg-[#0F1523] border border-slate-800/90 rounded-2xl p-4 shadow-lg">
                              <div className="text-xs font-bold text-white mb-2">{mini.title}</div>
                              <div className="h-[150px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={miniData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                                    <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 10 }} />
                                    <YAxis hide />
                                    <Tooltip content={({ active, payload }) => {
                                      if (active && payload && payload.length) {
                                        const val = payload[0].value as number;
                                        return (
                                          <div className="bg-slate-900 border border-slate-700 p-2 text-xs text-white rounded shadow-xl">
                                            {mini.title.includes('Marj') || mini.title.includes('Karlılığı') ? \`%\${val?.toFixed(1)}\` : val?.toFixed(2)}
                                          </div>
                                        );
                                      }
                                      return null;
                                    }} />
                                    <Line type="monotone" dataKey="value" stroke="#f87171" strokeWidth={2} dot={{ r: 2, fill: '#f87171' }} />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                    </>
                  )}
                </div>
              )}
`;

code = code.replace(
  "{/* SEKME 1: GRAFİK TERMİNALİ (4'LÜ IZGARA) */}",
  ozetRaporContent + "\n              {/* SEKME 1: GRAFİK TERMİNALİ (4'LÜ IZGARA) */}"
);

fs.writeFileSync(path, code, 'utf8');
fs.writeFileSync('src/' + path, code, 'utf8');
console.log('Successfully updated app/page.tsx');
