import type { InsigniaArt } from '../regs/build';

const SHAPES: InsigniaArt['shape'][] = ['shield', 'circle', 'oval', 'square', 'arrowhead'];

/** Downscale uploads so builds stay small enough for local storage. */
function readImage(file: File, max = 384): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read image'));
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function InsigniaEditor({ label, value, onChange, hint }: {
  label: string;
  value: InsigniaArt;
  onChange: (v: InsigniaArt) => void;
  hint?: string;
}) {
  const set = (p: Partial<InsigniaArt>) => onChange({ ...value, ...p });
  return (
    <fieldset className="insignia">
      <legend>{label}</legend>
      {hint && <p className="muted small">{hint}</p>}
      <div className="seg">
        <button className={value.mode === 'generated' ? 'on' : ''} onClick={() => set({ mode: 'generated' })}>Design</button>
        <button className={value.mode === 'upload' ? 'on' : ''} onClick={() => set({ mode: 'upload' })}>Upload image</button>
      </div>
      {value.mode === 'generated' ? (
        <div className="grid2">
          <label>
            Shape
            <select value={value.shape} onChange={(e) => set({ shape: e.target.value as InsigniaArt['shape'] })}>
              {SHAPES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>
            Text / motto
            <input value={value.text} maxLength={24} onChange={(e) => set({ text: e.target.value })} />
          </label>
          <label>
            Field color
            <input type="color" value={value.field} onChange={(e) => set({ field: e.target.value })} />
          </label>
          <label>
            Accent color
            <input type="color" value={value.accent} onChange={(e) => set({ accent: e.target.value })} />
          </label>
        </div>
      ) : (
        <div>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) set({ dataUrl: await readImage(f) });
            }}
          />
          {value.dataUrl ? <img className="thumb" src={value.dataUrl} alt={`${label} preview`} /> : <p className="muted small">PNG with a transparent background works best. The image stays in your browser.</p>}
        </div>
      )}
    </fieldset>
  );
}
