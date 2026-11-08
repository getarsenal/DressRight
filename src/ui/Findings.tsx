import { useState } from 'react';
import type { Finding } from '../regs/types';
import { Citations } from './Citations';

const ICON = { error: '✖', warning: '▲', info: 'ℹ' } as const;

export function Findings({ findings }: { findings: Finding[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="card">
      <h3>Compliance check</h3>
      {!findings.length && <p className="muted">Nothing to flag for this build.</p>}
      <ul className="findings">
        {findings.map((f) => (
          <li key={f.id} className={`finding ${f.severity}`}>
            <button className="finding-head" onClick={() => setOpen(open === f.id ? null : f.id)}>
              <span className="ico">{ICON[f.severity]}</span>
              <span>{f.message}</span>
            </button>
            {open === f.id && (
              <div className="finding-body">
                {f.fix && <p><strong>What to do:</strong> {f.fix}</p>}
                <Citations items={f.citations} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
