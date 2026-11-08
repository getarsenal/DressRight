import type { PlacedItem } from '../regs/layout';
import { Citations } from './Citations';

export function Inspector({ item }: { item: PlacedItem | null }) {
  return (
    <div className="card">
      <h3>Placement rule</h3>
      {!item ? (
        <p className="muted">Click any insignia, ribbon or badge on the coat to see where the regulation says it goes, and why.</p>
      ) : (
        <>
          <h4>{item.label}</h4>
          <p>{item.rule}</p>
          <Citations items={item.citations} />
        </>
      )}
    </div>
  );
}
