import { PUBLICATIONS, RULESET_AS_OF } from '../regs/sources';

const fmt = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

export function VersionBanner({ onOpenSources }: { onOpenSources: () => void }) {
  const ar = PUBLICATIONS.find((p) => p.id === 'AR670-1')!;
  const pam = PUBLICATIONS.find((p) => p.id === 'DAPAM670-1')!;
  const unreviewed = PUBLICATIONS.some((p) => !p.lastReviewed);
  return (
    <div className={`banner ${unreviewed ? 'warn' : ''}`}>
      <span>
        Built against <strong>AR 670-1</strong> ({fmt(ar.date)}
        {ar.change ? `, Change ${ar.change.number} ${fmt(ar.change.date)}` : ''}) and <strong>DA PAM 670-1</strong> ({fmt(pam.date)}).
        Rule data updated {fmt(RULESET_AS_OF)}.
      </span>
      {unreviewed && (
        <span>
          {' '}Not yet checked line-by-line against the official PDFs: confirm anything marked <em>Needs verification</em> with your chain of command.
        </span>
      )}
      <button className="link" onClick={onOpenSources}>Details</button>
    </div>
  );
}
