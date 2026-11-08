import { PUBLICATIONS, RULESET_AS_OF } from '../regs/sources';

const fmt = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

export function VersionBanner({ compact }: { compact?: boolean }) {
  const ar = PUBLICATIONS.find((p) => p.id === 'AR670-1')!;
  const pam = PUBLICATIONS.find((p) => p.id === 'DAPAM670-1')!;
  const unreviewed = PUBLICATIONS.some((p) => !p.lastReviewed);
  return (
    <div className={`banner ${unreviewed ? 'warn' : ''}`}>
      <span>
        Per <strong>AR 670-1</strong> ({fmt(ar.date)}
        {ar.change ? `, Ch ${Number(ar.change.number)} ${fmt(ar.change.date)}` : ''}) and <strong>DA PAM 670-1</strong> ({fmt(pam.date)}).
        {!compact && <> Rule data updated {fmt(RULESET_AS_OF)}.</>}
      </span>
      {unreviewed && !compact && (
        <span>
          {' '}Not yet checked line-by-line against the official PDFs: confirm anything marked <em>Needs verification</em> with your chain of command.
        </span>
      )}
      {unreviewed && compact && <span> Some rules still need verification.</span>}
    </div>
  );
}
