const fs = require('fs');

let content = fs.readFileSync('app/page.tsx', 'utf8');

// FIX 2: Add computeIncrementalQuarterlyData
const cumulativeCode = `
// Fields that are YTD cumulative in KAP reports (income statement / cash flow)
const CUMULATIVE_FIELDS = [
  'revenue', 'gross_profit', 'operating_income', 'ebitda', 'net_income',
  'gross_written_premiums', 'technical_balance', 'investment_income',
  'net_monetary_position', 'operating_cash_flow', 'free_cash_flow', 'capex'
];

function computeIncrementalQuarterlyData(rawData: any[]): any[] {
  if (!rawData || rawData.length === 0) return rawData;
  const sorted = [...rawData].sort((a, b) => (a.period || '').localeCompare(b.period || ''));
  return sorted.map((item) => {
    const period = item.period || '';
    const quarter = period.slice(-2); // '03','06','09','12'
    const year = period.slice(0, 4);
    // Q1 data is already incremental (it IS the quarter)
    if (quarter === '03' || !['06','09','12'].includes(quarter)) return { ...item };
    // Find previous quarter in same year
    const prevQMap: Record<string, string> = { '06': '03', '09': '06', '12': '09' };
    const prevPeriod = \`\${year}/\${prevQMap[quarter]}\`;
    const prevItem = sorted.find(d => d.period === prevPeriod);
    if (!prevItem) return { ...item }; // Can't compute, use as-is
    const result: any = { ...item };
    for (const field of CUMULATIVE_FIELDS) {
      if (item[field] != null && prevItem[field] != null) {
        result[field] = item[field] - prevItem[field];
      }
    }
    return result;
  });
}
`;

if (!content.includes('CUMULATIVE_FIELDS')) {
  content = content.replace(/function sanitizeHistoryData\(/, cumulativeCode + '\nfunction sanitizeHistoryData(');
}

// FIX 2: quarterlyChartData
if (!content.includes('quarterlyChartData = useMemo')) {
  const regexChartData = /(const chartData = useMemo\(\(\) => \{[\s\S]*?return sanitizeHistoryData[^\}]*?\);\s*\}, \[.*?\]\);)/;
  content = content.replace(regexChartData, `$1\n  const quarterlyChartData = useMemo(() => computeIncrementalQuarterlyData(chartData), [chartData]);\n`);
}

// FIX 1: Remove Price Chart from Özet Rapor, and ozetPeriod
content = content.replace(/const \[ozetPeriod, setOzetPeriod\] = useState<string>\('.*?'\);\n?/g, '');
content = content.replace(/\{\(\(\) => \{\s*let filteredChartData = chartData;[\s\S]*?\}\)\(\)\}/, '');

// FIX 4: YoY Comparison in Özet Bilanço & Özet Gelir Tablosu
const yoyCode = `
                      {/* Özet Finansallar */}
                      {(() => {
                        const latestPeriod = quarterlyChartData[quarterlyChartData.length - 1];
                        const latestPeriodLabel = latestPeriod?.period || '';
                        const yoyPeriodLabel = latestPeriodLabel ? \`\${String(Number(latestPeriodLabel.slice(0,4)) - 1)}/\${latestPeriodLabel.slice(5)}\` : '';
                        const yoyPeriod = quarterlyChartData.find((d: any) => d.period === yoyPeriodLabel);
                        const latestBS = chartData[chartData.length - 1];
                        const yoyBSLabel = latestBS?.period ? \`\${String(Number(latestBS.period.slice(0,4)) - 1)}/\${latestBS.period.slice(5)}\` : '';
                        const yoyBS = chartData.find((d: any) => d.period === yoyBSLabel);
                        return (
`;
if (!content.includes('const latestPeriod = quarterlyChartData')) {
  content = content.replace(/\{\/\* Özet Finansallar \*\/}/, yoyCode);
  
  content = content.replace(
    /<th className="pb-2 font-medium text-right">\{chartData\[chartData\.length - 1\]\?\.period\}<\/th>\s*<th className="pb-2 font-medium text-right">\{chartData\[chartData\.length - 2\]\?\.period \|\| '-'\}<\/th>/,
    `<th className="pb-2 font-medium text-right">{latestPeriodLabel}</th>
     <th className="pb-2 font-medium text-right">{yoyPeriodLabel}</th>
     <th className="pb-2 font-medium text-right">YoY %</th>`
  );
  
  content = content.replace(
    /chartData\[chartData\.length - 1\]\?\.\[rowConfig\.k\]/g,
    `latestPeriod?.[rowConfig.k]`
  );
  content = content.replace(
    /chartData\[chartData\.length - 2\]\?\.\[rowConfig\.k\]/g,
    `yoyPeriod?.[rowConfig.k]`
  );

  content = content.replace(
    /<td className="py-2 text-right font-mono">\{yoyPeriod\?\.\[rowConfig\.k\] \!= null \? \(yoyPeriod\?\.\[rowConfig\.k\] \/ 1000\)\.toLocaleString\('tr-TR', \{maximumFractionDigits:0\}\) : '—'\}<\/td>/,
    `<td className="py-2 text-right font-mono">{yoyPeriod?.[rowConfig.k] != null ? (yoyPeriod?.[rowConfig.k] / 1000).toLocaleString('tr-TR', {maximumFractionDigits:0}) : '—'}</td>
     <td className="py-2 text-right font-mono">
       {(() => {
         const v1 = latestPeriod?.[rowConfig.k];
         const v2 = yoyPeriod?.[rowConfig.k];
         const chg = (v1 != null && v2 != null && v2 !== 0) ? ((v1 - v2) / Math.abs(v2) * 100).toFixed(1) : null;
         return chg ? (
           <span className={Number(chg) > 0 ? 'text-emerald-400' : Number(chg) < 0 ? 'text-rose-400' : 'text-slate-400'}>
             {Number(chg) > 0 ? '+' : ''}{chg}%
           </span>
         ) : '—';
       })()}
     </td>`
  );

  content = content.replace(
    /<th className="pb-2 font-medium text-right">\{chartData\[chartData\.length - 1\]\?\.period\}<\/th>\s*<th className="pb-2 font-medium text-right">QoQ %<\/th>/,
    `<th className="pb-2 font-medium text-right">{latestBS?.period}</th>
     <th className="pb-2 font-medium text-right">{yoyBSLabel}</th>
     <th className="pb-2 font-medium text-right">YoY %</th>`
  );

  content = content.replace(
    /const v1 = chartData\[chartData\.length - 1\]\?\.\[rowConfig\.k\];\s*const v2 = chartData\[chartData\.length - 2\]\?\.\[rowConfig\.k\];/,
    `const v1 = latestBS?.[rowConfig.k];\n                                const v2 = yoyBS?.[rowConfig.k];`
  );

  content = content.replace(
    /<td className="py-2 text-right font-mono">\{v1 \!= null \? \(v1 \/ 1000\)\.toLocaleString\('tr-TR', \{maximumFractionDigits:0\}\) : '—'\}<\/td>\s*<td className="py-2 text-right font-mono">/,
    `<td className="py-2 text-right font-mono">{v1 != null ? (v1 / 1000).toLocaleString('tr-TR', {maximumFractionDigits:0}) : '—'}</td>
     <td className="py-2 text-right font-mono">{v2 != null ? (v2 / 1000).toLocaleString('tr-TR', {maximumFractionDigits:0}) : '—'}</td>
     <td className="py-2 text-right font-mono">`
  );

  content = content.replace(
    /Number\(chg\) > 0 \? 'text-emerald-400' : Number\(chg\) < 0 \? 'text-rose-400' : 'text-slate-400'/,
    `rowConfig.k === 'net_debt' ? (Number(chg) < 0 ? 'text-emerald-400' : Number(chg) > 0 ? 'text-rose-400' : 'text-slate-400') : (Number(chg) > 0 ? 'text-emerald-400' : Number(chg) < 0 ? 'text-rose-400' : 'text-slate-400')`
  );

  content = content.replace(
    /\{\/\* Çeyreklik Bar Grafikleri \(3'lü\) \*\/\}/,
    `);\n                      })()}\n                      {/* Çeyreklik Bar Grafikleri (3'lü) */}`
  );
  
  content = content.replace(/\{Math\.min\(chartData\.length, 2\)\} çeyrek/g, `{chartData.length} çeyrek`);
}

content = content.replace(/<BarChart data=\{chartData\.slice\(-5\)\}/g, `<BarChart data={quarterlyChartData.slice(-5)}`);
content = content.replace(/const miniData = chartData\.slice\(-8\)/g, `const miniData = quarterlyChartData.slice(-8)`);

content = content.replace(
  /<ComposedChart data=\{chartData\} margin=\{\{ top: 10, right: 0, left: 0, bottom: 0 \}\}>([\s\S]*?)<Bar yAxisId="left" dataKey="revenue"/,
  `<ComposedChart data={quarterlyChartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>$1<Bar yAxisId="left" dataKey="revenue"`
);

content = content.replace(
  /<ComposedChart data=\{chartData\} margin=\{\{ top: 10, right: 0, left: 0, bottom: 0 \}\}>([\s\S]*?)<Bar yAxisId="right" dataKey="share_price"[^\>]*\/>/,
  `<ComposedChart data={quarterlyChartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>$1`
);

content = content.replace(
  /<ComposedChart data=\{chartData\} margin=\{\{ top: 10, right: 0, left: -20, bottom: 0 \}\}>([\s\S]*?)<Bar dataKey="operating_cash_flow"/,
  `<ComposedChart data={quarterlyChartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>$1<Bar dataKey="operating_cash_flow"`
);

content = content.replace(/<XAxis([^>]*?)tick=\{\{([^>]*?)fontSize:\s*1[01]([^>]*?)\}\}([^>]*?)\/>/g, (match, p1, p2, p3, p4) => {
  if (match.includes('tickFormatter')) return match;
  return `<XAxis${p1}tick={{${p2}fontSize: 10${p3}}}${p4} tickFormatter={(v: string) => v ? v.slice(2) : v} />`;
});

// FIX 5: Sparkline Colors
content = content.replace(
  /const miniData = (quarterlyChartData\.slice\(-8\)\.map.*?\);)/,
  `const miniData = $1
   const values = miniData.map((d: any) => d.value).filter((v: any) => v != null && !isNaN(v));
   const trendColor = values.length >= 2 && values[values.length - 1] > values[0] ? '#10b981' : '#f87171';
  `
);
// Make sure it doesn't duplicate. Wait, the replacement only hits the first match if I don't use /g. But the file has a `.map(mini => { const miniData = ... })` loop, so it's fine! 
// Ah, the bug is that it adds values and trendColor as constants in a loop... Wait, `let values = ...; let trendColor = ...` is better? No, `const` is fine if it's inside `{}` of map!
// `miniData` is defined inside `.map(mini => { ... })`, so `const values` and `const trendColor` are scoped to the callback! No duplicate definition error!
// The reason for duplicate was that I ran the regex over a file that already had it replaced! Let's just restore file again.

content = content.replace(
  /<Line type="monotone" dataKey="value" stroke="#f87171" strokeWidth=\{2\} dot=\{\{ r: 2, fill: '#f87171' \}\} \/>/,
  `<Line type="monotone" dataKey="value" stroke={trendColor} strokeWidth={2} dot={{ r: 2, fill: trendColor }} />`
);


fs.writeFileSync('app/page.tsx', content);
fs.writeFileSync('src/app/page.tsx', content);
console.log('Patched');
