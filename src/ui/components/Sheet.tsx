import { useRef, useState, type ReactNode } from 'react';

/**
 * Bottom sheet with three snap points (peek / half / full). Drag the handle
 * or tap it to cycle. On wide screens CSS turns it into a side panel.
 */
export type Snap = 'peek' | 'half' | 'full';

export function Sheet({ snap, onSnap, header, children }: {
  snap: Snap;
  onSnap: (s: Snap) => void;
  header: ReactNode;
  children: ReactNode;
}) {
  const start = useRef<{ y: number; snap: Snap } | null>(null);
  const [drag, setDrag] = useState(0);
  const order: Snap[] = ['peek', 'half', 'full'];

  return (
    <div className={`sheet snap-${snap}`} style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}>
      <div
        className="sheet-grip"
        onPointerDown={(e) => {
          start.current = { y: e.clientY, snap };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (start.current) setDrag(Math.max(-400, Math.min(400, e.clientY - start.current.y)));
        }}
        onPointerUp={(e) => {
          const s = start.current;
          start.current = null;
          setDrag(0);
          if (!s) return;
          const dy = e.clientY - s.y;
          const i = order.indexOf(s.snap);
          if (Math.abs(dy) < 6) onSnap(order[(i + 1) % order.length]);
          else if (dy < -40) onSnap(order[Math.min(2, i + 1)]);
          else if (dy > 40) onSnap(order[Math.max(0, i - 1)]);
        }}
      >
        <span className="grip-bar" />
        {header}
      </div>
      <div className="sheet-body">{children}</div>
    </div>
  );
}
