import { useMemo, useState } from 'react';
import type { Build, RibbonEntry } from '../../regs/build';
import { RIBBONS, UNIT_AWARDS, ribbonById, type DeviceKind, type RibbonDef } from '../../regs/catalog/ribbons';
import { BADGES, badgeById, type BadgeKind } from '../../regs/catalog/badges';
import { sortedRibbons } from '../../regs/layout';
import { textureFor } from '../../three/textures';
import { useArtVersion } from '../art';
import { BadgeArt, RibbonArt } from '../components/Art';
import { Icon } from '../components/Icons';

type Update = (p: Partial<Build>) => void;

const DEVICE_LABEL: Record<DeviceKind, string> = {
  olc: 'Oak leaf',
  knot: 'Knot',
  star: 'Star',
  numeral: 'Numeral',
  V: '"V"',
  C: '"C"',
  R: '"R"',
  M: '"M"',
  hourglass: 'Hourglass',
  arrowhead: 'Arrowhead',
};

const BADGE_GROUPS: [string, BadgeKind[]][] = [
  ['Combat & skill badges', ['combat', 'skill']],
  ['Marksmanship', ['marksmanship']],
  ['Identification badges', ['id']],
  ['Tabs', ['tab']],
  ['Foreign badges', ['foreign']],
  ['State awards', ['state']],
];

function RackPreview({ build }: { build: Build }) {
  const v = useArtVersion();
  const ribbons = useMemo(() => sortedRibbons(build), [build]);
  const src = useMemo(() => {
    if (!ribbons.length) return null;
    const rows = Math.ceil(ribbons.length / 3);
    return (textureFor({ type: 'rack', ribbons, perRow: 3 }, Math.min(3, ribbons.length) * 1.375, rows * 0.375).image as HTMLCanvasElement).toDataURL();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ribbons, v]);
  return (
    <div className="rack-preview">
      {src ? <img src={src} alt="Your ribbon rack" /> : <p className="muted">No ribbons yet</p>}
      <small className="muted">{build.manualRibbonOrder ? 'Manual order' : 'Order of precedence (automatic)'}</small>
    </div>
  );
}

function Stepper({ value, onChange, min = 1, max = 9 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <span className="stepper">
      <button onClick={() => onChange(Math.max(min, value - 1))} aria-label="Fewer"><Icon.minus /></button>
      <span>{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} aria-label="More"><Icon.plus /></button>
    </span>
  );
}

// ------------------------------------------------------------------ library picker

type LibKind = 'ribbons' | 'unit' | BadgeKind;

function Library({ build, update, onClose, initial }: { build: Build; update: Update; onClose: () => void; initial: LibKind }) {
  const [kind, setKind] = useState<LibKind>(initial);
  const [q, setQ] = useState('');
  const match = (name: string) => name.toLowerCase().includes(q.trim().toLowerCase());
  const kinds: [LibKind, string][] = [
    ['ribbons', 'Ribbons'],
    ['unit', 'Unit awards'],
    ['combat', 'Combat'],
    ['skill', 'Skill'],
    ['marksmanship', 'Marksmanship'],
    ['tab', 'Tabs'],
    ['id', 'ID badges'],
    ['foreign', 'Foreign'],
    ['state', 'State'],
  ];

  const toggleRibbon = (d: RibbonDef) => {
    const has = build.ribbons.some((r) => r.id === d.id);
    update({ ribbons: has ? build.ribbons.filter((r) => r.id !== d.id) : [...build.ribbons, { id: d.id }] });
  };

  return (
    <div className="library">
      <header className="lib-head">
        <button className="iconbtn" onClick={onClose} aria-label="Done"><Icon.back /></button>
        <h2>Add awards</h2>
        <button className="link" onClick={onClose}>Done</button>
      </header>
      <label className="searchbox">
        <Icon.search />
        <input placeholder="Search awards" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="chips scroll-x">
        {kinds.map(([k, l]) => (
          <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{l}</button>
        ))}
      </div>
      <div className="lib-grid">
        {kind === 'ribbons' &&
          RIBBONS.filter((r) => match(r.name)).map((r) => {
            const on = build.ribbons.some((x) => x.id === r.id);
            return (
              <button key={r.id} className={`tile ${on ? 'on' : ''}`} onClick={() => toggleRibbon(r)}>
                <RibbonArt def={r} />
                <span>{r.name}</span>
                {on && <i className="tick"><Icon.check /></i>}
              </button>
            );
          })}
        {kind === 'unit' &&
          UNIT_AWARDS.filter((u) => match(u.name)).map((u) => {
            const on = build.unitAwards.some((x) => x.id === u.id);
            return (
              <button
                key={u.id}
                className={`tile ${on ? 'on' : ''}`}
                onClick={() => update({ unitAwards: on ? build.unitAwards.filter((x) => x.id !== u.id) : [...build.unitAwards, { id: u.id, permanent: false }] })}
              >
                <RibbonArt def={u} framed />
                <span>{u.name}</span>
                {on && <i className="tick"><Icon.check /></i>}
              </button>
            );
          })}
        {kind !== 'ribbons' &&
          kind !== 'unit' &&
          BADGES.filter((b) => b.kind === kind && match(b.name)).map((b) => {
            const on = build.badges.some((x) => x.id === b.id);
            return (
              <button
                key={b.id}
                className={`tile badge-tile ${on ? 'on' : ''}`}
                onClick={() => update({ badges: on ? build.badges.filter((x) => x.id !== b.id) : [...build.badges, { id: b.id, level: b.levels?.[0] }] })}
              >
                <BadgeArt def={b} />
                <span>{b.name}</span>
                {on && <i className="tick"><Icon.check /></i>}
              </button>
            );
          })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ screen

export function AwardsScreen({ build, update }: { build: Build; update: Update }) {
  const [lib, setLib] = useState<LibKind | null>(null);
  const setRibbon = (id: string, p: Partial<RibbonEntry>) => update({ ribbons: build.ribbons.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const ordered = build.manualRibbonOrder
    ? build.ribbons
    : sortedRibbons({ ...build, stateRibbons: [] }).map((r) => build.ribbons.find((x) => x.id === r.id)!).filter(Boolean);
  const move = (id: string, d: -1 | 1) => {
    const list = [...ordered];
    const i = list.findIndex((r) => r.id === id);
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    update({ ribbons: list, manualRibbonOrder: true });
  };

  if (lib) return <Library build={build} update={update} onClose={() => setLib(null)} initial={lib} />;

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Awards</h1>
        <button className="primary small" onClick={() => setLib('ribbons')}><Icon.plus /> Add</button>
      </header>
      <RackPreview build={build} />

      <section className="group">
        <div className="group-head">
          <h3>Ribbons <span className="muted">{build.ribbons.length}</span></h3>
          <label className="toggle">
            <input type="checkbox" checked={!build.manualRibbonOrder} onChange={(e) => update({ manualRibbonOrder: !e.target.checked })} />
            <span>Auto order</span>
          </label>
        </div>
        {!ordered.length && <button className="empty" onClick={() => setLib('ribbons')}>Add your first ribbon</button>}
        <ul className="rows">
          {ordered.map((r) => {
            const def = ribbonById(r.id)!;
            return (
              <li key={r.id} className="award-row">
                <RibbonArt def={def} device={r.device} count={r.count} className="thumb-ribbon" />
                <div className="grow">
                  <div className="row-title">{def.name}</div>
                  {def.devices && (
                    <div className="devices">
                      <select value={r.device ?? ''} onChange={(e) => setRibbon(r.id, { device: (e.target.value || undefined) as DeviceKind | undefined, count: r.count ?? 1 })}>
                        <option value="">No device</option>
                        {def.devices.map((d) => <option key={d} value={d}>{DEVICE_LABEL[d]}</option>)}
                      </select>
                      {r.device && <Stepper value={r.count ?? 1} onChange={(count) => setRibbon(r.id, { count })} />}
                    </div>
                  )}
                </div>
                {build.manualRibbonOrder && (
                  <span className="reorder">
                    <button onClick={() => move(r.id, -1)} aria-label="Move up"><Icon.up /></button>
                  </span>
                )}
                <button className="iconbtn subtle" onClick={() => update({ ribbons: build.ribbons.filter((x) => x.id !== r.id) })} aria-label={`Remove ${def.name}`}><Icon.x /></button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="group">
        <div className="group-head">
          <h3>Unit awards <span className="muted">{build.unitAwards.length}</span></h3>
          <button className="link" onClick={() => setLib('unit')}>Add</button>
        </div>
        <ul className="rows">
          {build.unitAwards.map((u) => {
            const def = UNIT_AWARDS.find((d) => d.id === u.id)!;
            return (
              <li key={u.id} className="award-row">
                <RibbonArt def={def} framed className="thumb-ribbon" />
                <div className="grow">
                  <div className="row-title">{def.name}</div>
                  <label className="toggle small">
                    <input type="checkbox" checked={u.permanent} onChange={(e) => update({ unitAwards: build.unitAwards.map((x) => (x.id === u.id ? { ...x, permanent: e.target.checked } : x)) })} />
                    <span>I was assigned during the award period (permanent)</span>
                  </label>
                </div>
                <button className="iconbtn subtle" onClick={() => update({ unitAwards: build.unitAwards.filter((x) => x.id !== u.id) })} aria-label={`Remove ${def.name}`}><Icon.x /></button>
              </li>
            );
          })}
        </ul>
      </section>

      {BADGE_GROUPS.map(([title, kinds]) => {
        const list = build.badges.filter((b) => kinds.includes(badgeById(b.id)?.kind as BadgeKind));
        return (
          <section className="group" key={title}>
            <div className="group-head">
              <h3>{title} <span className="muted">{list.length}</span></h3>
              <button className="link" onClick={() => setLib(kinds[0])}>Add</button>
            </div>
            <ul className="rows">
              {list.map((e) => {
                const d = badgeById(e.id)!;
                return (
                  <li key={e.id} className="award-row">
                    <BadgeArt def={d} level={e.level} className="thumb-badge" />
                    <div className="grow">
                      <div className="row-title">{d.name}</div>
                      {d.levels && (
                        <div className="chips">
                          {d.levels.map((l) => (
                            <button key={l} className={`chip small ${(e.level ?? d.levels![0]) === l ? 'on' : ''}`} onClick={() => update({ badges: build.badges.map((x) => (x.id === e.id ? { ...x, level: l } : x)) })}>{l}</button>
                          ))}
                        </div>
                      )}
                      {d.group && <small className="muted">Group {d.group}</small>}
                    </div>
                    <button className="iconbtn subtle" onClick={() => update({ badges: build.badges.filter((x) => x.id !== e.id) })} aria-label={`Remove ${d.name}`}><Icon.x /></button>
                  </li>
                );
              })}
            </ul>
            {kinds.includes('state') && (
              <>
                {build.stateRibbons.map((s, i) => (
                  <div key={s.key} className="award-row">
                    <span className="swatches">{s.colors.map((c, ci) => (
                      <input key={ci} type="color" value={c} aria-label="Stripe color" onChange={(ev) => update({ stateRibbons: build.stateRibbons.map((x, j) => (j === i ? { ...x, colors: x.colors.map((cc, k) => (k === ci ? ev.target.value : cc)) } : x)) })} />
                    ))}</span>
                    <input className="grow plain" value={s.name} onChange={(ev) => update({ stateRibbons: build.stateRibbons.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)) })} />
                    <button className="iconbtn subtle" onClick={() => update({ stateRibbons: build.stateRibbons.filter((_, j) => j !== i) })} aria-label="Remove"><Icon.x /></button>
                  </div>
                ))}
                <button className="empty" onClick={() => update({ stateRibbons: [...build.stateRibbons, { key: `STATE:${Date.now()}`, name: 'State Service Ribbon', colors: ['#1f3a93', '#f1c40f', '#ffffff'] }] })}>
                  + Add a state ribbon
                </button>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
