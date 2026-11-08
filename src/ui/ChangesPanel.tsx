import { CHANGES } from '../regs/changes';
import { Citations } from './Citations';

export function ChangesPanel() {
  return (
    <main className="page">
      <h2>What changed</h2>
      <p className="muted">
        If you set up your uniform from an older version of AR 670-1 (or from someone else's coat), check these first. Newest first.
      </p>
      <div className="articles">
        {CHANGES.map((c) => (
          <article key={c.date + c.title} className="card">
            <div className="change-meta">
              <span className="tag">{c.date}</span> {c.pub}
            </div>
            <h3>{c.title}</h3>
            <div className="beforenow">
              <div>
                <h5>Before</h5>
                <p>{c.before}</p>
              </div>
              <div>
                <h5>Now</h5>
                <p>{c.now}</p>
              </div>
            </div>
            <Citations items={c.citations} />
          </article>
        ))}
      </div>
    </main>
  );
}
