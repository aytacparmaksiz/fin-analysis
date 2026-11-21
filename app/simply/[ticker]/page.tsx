import ValuationTerminal from '../../page';
import { getReportForTicker } from '@/lib/report-resolver';
import type { Metadata } from 'next';

type Props = {
  params: Promise<{ ticker: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await params;
  const cleanTicker = decodeURIComponent(resolved?.ticker || '').toUpperCase().replace(/\.IS$/i, '').trim();
  return {
    title: `${cleanTicker} Radar Analizi | Fair Value Terminal`,
    description: `${cleanTicker} hissesi için 360° radar analizi ve görsel değerleme raporu.`,
  };
}

export default async function SimplyTickerPage({ params }: Props) {
  const resolved = await params;
  const cleanTicker = decodeURIComponent(resolved?.ticker || '').toUpperCase().replace(/\.IS$/i, '').trim();
  const initialReport = await getReportForTicker(cleanTicker);
  return <ValuationTerminal initialTicker={cleanTicker} initialReport={initialReport} initialLayout="simply" />;
}
