import ValuationTerminal from '../../page';
import { getReportForTicker } from '@/lib/report-resolver';
import type { Metadata } from 'next';

type Props = {
  params: Promise<{ ticker: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await params;
  const cleanTicker = (resolved?.ticker || '').toUpperCase().trim();
  return {
    title: `${cleanTicker} Değerleme Raporu & Finansal Analiz | Fair Value Terminal`,
    description: `${cleanTicker} hissesi için BIST finansal tabloları, kâr kalitesi denetimi ve değerleme raporu.`,
  };
}

export default async function ReportTickerPage({ params }: Props) {
  const resolved = await params;
  const cleanTicker = (resolved?.ticker || '').toUpperCase().trim();
  const initialReport = await getReportForTicker(cleanTicker);
  return <ValuationTerminal initialTicker={cleanTicker} initialReport={initialReport} initialTab="report" />;
}
