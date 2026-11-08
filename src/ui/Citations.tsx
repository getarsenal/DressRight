import type { Citation } from '../regs/types';
import { pubById } from '../regs/sources';

const LABEL: Record<Citation['verification'], string> = {
  verified: 'Verified',
  secondary: 'Secondary source',
  unverified: 'Needs verification',
};

const SOURCE_NAME: Record<string, string> = {
  STATE: 'State awards regulation',
  'USC-T10': '10 U.S.C.',
  'USC-T32': '32 U.S.C.',
};

export function sourceLabel(c: Citation) {
  const pub = pubById(c.source);
  const name = pub ? pub.title.split(',')[0] : SOURCE_NAME[c.source] ?? c.source;
  return c.para ? `${name}, para ${c.para}` : name;
}

export function Citations({ items }: { items: Citation[] }) {
  if (!items.length) return null;
  return (
    <ul className="cites">
      {items.map((c, i) => (
        <li key={i}>
          <div className="cite-head">
            <span className="cite-src">{sourceLabel(c)}</span>
            <span className={`ver ver-${c.verification}`} title="How well this citation has been checked against the current official publication">
              {LABEL[c.verification]}
            </span>
          </div>
          <div className="cite-topic">{c.topic}</div>
          {c.quote && <blockquote>“{c.quote}”</blockquote>}
        </li>
      ))}
    </ul>
  );
}
