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
    title: `${cleanTicker} Simply Wall St Görünümü | Fair Value Terminal`,
    description: `${cleanTicker} hissesi için Simply Wall St tarzı kar tanesi analizi ve görsel değerleme raporu.`,
  };
}

export default async function SimplyTickerPage({ params }: Props) {
  const resolved = await params;
  const cleanTicker = (resolved?.ticker || '').toUpperCase().trim();
  const initialReport = await getReportForTicker(cleanTicker);
  return <ValuationTerminal initialTicker={cleanTicker} initialReport={initialReport} initialLayout="simply" />;
}
