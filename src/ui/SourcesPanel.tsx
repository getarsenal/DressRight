import { DIRECTIVES, PUBLICATIONS, RULESET_AS_OF } from '../regs/sources';

export function SourcesPanel() {
  return (
    <main className="page">
      <h2>Sources & how this stays current</h2>
      <p>
        Every rule, placement and answer in DressRight cites the publication it comes from and says how well that citation has been
        checked:
      </p>
      <ul>
        <li><span className="ver ver-verified">Verified</span> checked against the current official PDF.</li>
        <li><span className="ver ver-secondary">Secondary source</span> taken from a source quoting the regulation; still needs a primary check.</li>
        <li><span className="ver ver-unverified">Needs verification</span> written from knowledge of the regulation; paragraph and wording must be confirmed.</li>
      </ul>
      <p className="muted">
        DressRight is not an official Army product. The official text on the Army Publishing Directorate site (armypubs.army.mil) and
        your chain of command always win.
      </p>

      <h3>Publications</h3>
      <table className="table">
        <thead>
          <tr><th>Publication</th><th>Date</th><th>Latest change in our data</th><th>Last primary-source review</th></tr>
        </thead>
        <tbody>
          {PUBLICATIONS.map((p) => (
            <tr key={p.id}>
              <td>{p.title}</td>
              <td>{p.date}</td>
              <td>{p.change ? `Change ${p.change.number} (${p.change.date}): ${p.change.summary}` : 'none'}</td>
              <td>{p.lastReviewed ?? <span className="ver ver-unverified">Not yet</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Interim directives tracked</h3>
      <ul>
        {DIRECTIVES.map((d) => (
          <li key={d.id}><strong>{d.title}</strong>: {d.affects}. {d.notes}</li>
        ))}
      </ul>

      <h3>Staying current</h3>
      <p>
        A scheduled check compares the publication dates on armypubs.army.mil with the versions above and flags any drift, so rule
        data gets updated when the Army publishes a new revision or change. Rule data last updated {RULESET_AS_OF}.
      </p>
    </main>
  );
}
