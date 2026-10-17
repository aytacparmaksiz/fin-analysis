import ValuationTerminal from '../page';

export const metadata = {
  title: 'Simply Wall St Görünümü | Fair Value Terminal',
  description: 'Borsa İstanbul hisseleri için Simply Wall St tarzı kar tanesi analizi ve infografik değerleme.',
};

export default function SimplyRootPage() {
  return <ValuationTerminal initialLayout="simply" />;
}
