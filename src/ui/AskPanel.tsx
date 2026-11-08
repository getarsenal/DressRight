import { useMemo, useState } from 'react';
import type { Build } from '../regs/build';
import { searchArticles } from '../regs/knowledge';
import { rankById } from '../regs/catalog/ranks';
import { Citations } from './Citations';

const STATUS = { T10: 'Title 10', T32: 'Title 32', SAD: 'State Active Duty' } as const;
const COMPONENT = { RA: 'Regular Army', USAR: 'Army Reserve', ARNG: 'Army National Guard' } as const;

export function AskPanel({ build }: { build: Build }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => searchArticles(q), [q]);
  return (
    <div className="screen">
      <header className="screen-head"><h1>Can I wear…?</h1></header>
      <p className="muted pad">
        Answers to the questions the regulation buries in sub-paragraphs. Where the answer depends on your situation, it's worked out
        from your builder profile: <strong>{rankById(build.rankId).abbr}, {COMPONENT[build.component]}</strong>
        {build.component === 'ARNG' && <>, <strong>{STATUS[build.dutyStatus]}</strong></>}.
      </p>
      <input
        className="search"
        placeholder="Try: governor's twenty, combat patch, GAFPB, hash marks, unit award…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {!results.length && <p className="muted">No answer for that yet. Check DA PAM 670-1 or ask your unit's S-1.</p>}
      <div className="articles">
        {results.map((a) => {
          const p = a.personal?.(build);
          return (
            <article key={a.id} className="card">
              <h3>{a.question}</h3>
              {p && (
                <div className={`verdict v-${p.verdict}`}>
                  <strong>{p.verdict === 'yes' ? 'For you: Yes' : p.verdict === 'no' ? 'For you: No' : 'For you: Depends'}</strong>
                  <span>{p.text}</span>
                </div>
              )}
              <p>{a.answer}</p>
              <Citations items={a.citations} />
            </article>
          );
        })}
      </div>
    </div>
  );
}
