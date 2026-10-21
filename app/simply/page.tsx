import ValuationTerminal from '../page';

export const metadata = {
  title: 'Radar Görsel Analiz | Fair Value Terminal',
  description: 'Borsa İstanbul hisseleri için 360° radar analizi ve infografik değerleme.',
};

export default function SimplyRootPage() {
  return <ValuationTerminal initialLayout="simply" />;
}
