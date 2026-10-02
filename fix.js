const fs = require('fs');
let code = fs.readFileSync('app/page.tsx', 'utf-8');

// FIX 2 & 4: YoY Comparison logic in Ozet Rapor
const yoyLogic = `
                      {(() => {
                        const latestPeriod = quarterlyChartData[quarterlyChartData.length - 1];
                        const latestPeriodLabel = latestPeriod?.period || ''; 
                        const yoyPeriodLabel = latestPeriodLabel ? \`\${String(Number(latestPeriodLabel.slice(0,4)) - 1)}/\${latestPeriodLabel.slice(5)}\` : '';
                        const yoyPeriod = quarterlyChartData.find((d: any) => d.period === yoyPeriodLabel);
                        const latestBS = chartData[chartData.length - 1];
                        const yoyBSLabel = latestBS?.period ? \`\${String(Number(latestBS.period.slice(0,4)) - 1)}/\${latestBS.period.slice(5)}\` : '';
                        const yoyBS = chartData.find((d: any) => d.period === yoyBSLabel);
                        
                        const getYoYChange = (v1: any, v2: any) => {
                          if (v1 == null || v2 == null || v2 === 0) return null;
                          return ((v1 - v2) / Math.abs(v2) * 100);
                        };
                        
                        const renderYoYBadge = (val: number | null, inverse = false) => {
                          if (val == null) return <span className="text-[10px] text-slate-500">—</span>;
                          const isGood = inverse ? val <= 0 : val >= 0;
                          return (
                            <span className={\`text-[10px] font-mono font-bold \${isGood ? 'text-emerald-400' : 'text-rose-400'}\`}>
                              {val > 0 ? '↑' : val < 0 ? '↓' : ''} %{Math.abs(val).toFixed(1)}
                            </span>
                          );
                        };
`;

code = code.replace(/\{\/\* Özet Finansallar \*\/\}\s*<div className="grid grid-cols-1 lg:grid-cols-2 gap-5">/, yoyLogic + '\n                        return (\n                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">');

// Gelir tablosu updates
code = code.replace(/<th className="pb-2 font-medium text-right">\{chartData\[chartData\.length - 1\]\?\.period\}<\/th>\s*<th className="pb-2 font-medium text-right">\{chartData\[chartData\.length - 2\]\?\.period \|\| '-'\}<\/th>/, '<th className="pb-2 font-medium text-right">{latestPeriodLabel}</th>\n                                <th className="pb-2 font-medium text-right">{yoyPeriodLabel || \'?\'}</th>\n                                <th className="pb-2 font-medium text-right">%</th>');

code = code.replace(/<td className="py-2 text-right font-mono">\{chartData\[chartData\.length - 1\]\?\.\[rowConfig\.k\] !=\s*null \? \(chartData\[chartData\.length - 1\]\?\.\[rowConfig\.k\] \/ 1000\)\.toLocaleString\('tr-TR', \{maximumFractionDigits:0\}\) : '—'\}<\/td>\s*<td className="py-2 text-right font-mono">\{chartData\[chartData\.length - 2\]\?\.\[rowConfig\.k\] != null \? \(chartData\[chartData\.length - 2\]\?\.\[rowConfig\.k\] \/ 1000\)\.toLocaleString\('tr-TR', \{maximumFractionDigits:0\}\) : '—'\}<\/td>/, `<td className="py-2 text-right font-mono">{latestPeriod?.[rowConfig.k] != null ? (latestPeriod[rowConfig.k] / 1000).toLocaleString('tr-TR', {maximumFractionDigits:0}) : '—'}</td>
                                  <td className="py-2 text-right font-mono">{yoyPeriod?.[rowConfig.k] != null ? (yoyPeriod[rowConfig.k] / 1000).toLocaleString('tr-TR', {maximumFractionDigits:0}) : '—'}</td>
                                  <td className="py-2 text-right font-mono">{renderYoYBadge(getYoYChange(latestPeriod?.[rowConfig.k], yoyPeriod?.[rowConfig.k]))}</td>`);

// Bilanco updates
code = code.replace(/<th className="pb-2 font-medium text-right">\{chartData\[chartData\.length - 1\]\?\.period\}<\/th>\s*<th className="pb-2 font-medium text-right">\{chartData\[chartData\.length - 2\]\?\.period \|\| '-'\}<\/th>/, '<th className="pb-2 font-medium text-right">{latestBS?.period}</th>\n                                <th className="pb-2 font-medium text-right">{yoyBSLabel || \'?\'}</th>\n                                <th className="pb-2 font-medium text-right">%</th>');

code = code.replace(/const v1 = chartData\[chartData\.length - 1\]\?\.\[rowConfig\.k\];\s*const v2 = chartData\[chartData\.length - 2\]\?\.\[rowConfig\.k\];/, `const v1 = latestBS?.[rowConfig.k];
                                const v2 = yoyBS?.[rowConfig.k];
                                const yoyChange = getYoYChange(v1, v2);`);

code = code.replace(/<td className="py-2 text-right font-mono">\{v1 != null \? \(v1 \/ 1000\)\.toLocaleString\('tr-TR', \{maximumFractionDigits:0\}\) : '—'\}<\/td>\s*<td className="py-2 text-right font-mono">\{v2 != null \? \(v2 \/ 1000\)\.toLocaleString\('tr-TR', \{maximumFractionDigits:0\}\) : '—'\}<\/td>/, `<td className="py-2 text-right font-mono">{v1 != null ? (v1 / 1000).toLocaleString('tr-TR', {maximumFractionDigits:0}) : '—'}</td>
                                  <td className="py-2 text-right font-mono">{v2 != null ? (v2 / 1000).toLocaleString('tr-TR', {maximumFractionDigits:0}) : '—'}</td>
                                  <td className="py-2 text-right font-mono">{renderYoYBadge(yoyChange, rowConfig.k === 'net_debt')}</td>`);

// Close the IIFE at the end of the grid
code = code.replace(/<\/div>\s*\{\/\* Mini Sparkline Kartları \*\/\}/, `</div>\n                        );\n                      })()}\n                      {/* Mini Sparkline Kartları */}`);

// FIX 2: quarterlyChartData replacements
code = code.replace(/<BarChart data=\{chartData\.slice\(-5\)\}/g, '<BarChart data={quarterlyChartData.slice(-5)}');
code = code.replace(/const miniData = chartData\.slice\(-8\)\.map/g, 'const miniData = quarterlyChartData.slice(-8).map');
code = code.replace(/(<h4 className="text-sm font-bold text-white mb-4">Satışlar ve Kârlılık<\/h4>\s*<div className="h-64 w-full">\s*<ResponsiveContainer width="100%" height="100%">\s*)<ComposedChart data=\{chartData\}/g, '$1<ComposedChart data={quarterlyChartData}');
code = code.replace(/(<h4 className="text-sm font-bold text-white mb-4">Satışlar ve Hisse Fiyatı<\/h4>\s*<div className="h-64 w-full">\s*<ResponsiveContainer width="100%" height="100%">\s*)<ComposedChart data=\{chartData\}/g, '$1<ComposedChart data={quarterlyChartData}');
code = code.replace(/(<h4 className="text-sm font-bold text-white mb-4">Nakit Akışı Kalitesi<\/h4>\s*<div className="h-64 w-full">\s*<ResponsiveContainer width="100%" height="100%">\s*)<LineChart data=\{chartData\}/g, '$1<LineChart data={quarterlyChartData}');

// FIX 3: XAxis tickFormatter
code = code.replace(/<XAxis dataKey="period" stroke="#64748b" tick=\{\{ fontSize: (10|11)(, fill: '#94a3b8')? \}\}\s*\/>/g, '<XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: $1$2 }} tickFormatter={(v: string) => v ? v.slice(2) : v} />');

// FIX 5: Sparkline colors
code = code.replace(/const miniData = quarterlyChartData\.slice\(-8\)\.map\(\(d:any\) => \(\{ period: d\.period, value: mini\.calc\(d\) \}\)\);/g, `const miniData = quarterlyChartData.slice(-8).map((d:any) => ({ period: d.period, value: mini.calc(d) }));
                          const values = miniData.map((d: any) => d.value).filter((v: any) => v != null && !isNaN(v));
                          const trendColor = values.length >= 2 && values[values.length - 1] > values[0] ? '#10b981' : '#f87171';`);
code = code.replace(/<Line type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth=\{2\} dot=\{\{ r: 2, fill: '#38bdf8', strokeWidth: 0 \}\}/g, `<Line type="monotone" dataKey="value" stroke={trendColor} strokeWidth={2} dot={{ r: 2, fill: trendColor, strokeWidth: 0 }}`);
// For the fill area if present
code = code.replace(/<Area type="monotone" dataKey="value" stroke="none" fill="url\(#colorValue\)"/g, `<Area type="monotone" dataKey="value" stroke="none" fill={trendColor}`);

// FIX 6: Remove share_price Bar in Chart 2
code = code.replace(/<Bar yAxisId="right" dataKey="share_price" name="Hisse Fiyatı \(TL\)" fill="#10b981" radius=\{\[4, 4, 0, 0\]\} maxBarSize=\{22\} \/>\n?\s*/g, '');

fs.writeFileSync('app/page.tsx', code, 'utf-8');
