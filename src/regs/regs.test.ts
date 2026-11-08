import { describe, expect, it } from 'vitest';
import { DEFAULT_BUILD, type Build } from './build';
import { validate } from './validate';
import { layout, rackRows, sortedRibbons } from './layout';
import { ARTICLES, searchArticles } from './knowledge';
import { RIBBONS } from './catalog/ribbons';
import { BADGES } from './catalog/badges';

const build = (p: Partial<Build>): Build => ({ ...DEFAULT_BUILD, ...p });
const ids = (b: Build) => validate(b).map((f) => f.id);

describe('state awards', () => {
  const gov20 = [{ id: 'GOV20' }];
  it("blocks the Governor's Twenty for ARNG on Title 10", () => {
    expect(ids(build({ component: 'ARNG', dutyStatus: 'T10', badges: gov20 }))).toContain('state-award-title10');
  });
  it('allows it for ARNG on Title 32 and State Active Duty', () => {
    for (const dutyStatus of ['T32', 'SAD'] as const) {
      const f = validate(build({ component: 'ARNG', dutyStatus, badges: gov20 }));
      expect(f.find((x) => x.id === 'state-award-ok')?.severity).toBe('info');
      expect(f.some((x) => x.severity === 'error' && x.id.startsWith('state'))).toBe(false);
    }
  });
  it('blocks state awards for Regular Army and Reserve', () => {
    expect(ids(build({ component: 'RA', badges: gov20 }))).toContain('state-award-not-arng');
    expect(ids(build({ component: 'USAR', stateRibbons: [{ key: 'S', name: 'X', colors: ['#000'] }] }))).toContain(
      'state-award-not-arng',
    );
  });
  it('personalizes the Governor\'s Twenty answer', () => {
    const a = ARTICLES.find((x) => x.id === 'gov20')!;
    expect(a.personal!(build({ component: 'ARNG', dutyStatus: 'T32' })).verdict).toBe('yes');
    expect(a.personal!(build({ component: 'ARNG', dutyStatus: 'T10' })).verdict).toBe('no');
    expect(a.personal!(build({ component: 'RA' })).verdict).toBe('no');
  });
  it('finds the article by search', () => {
    expect(searchArticles("governor's twenty")[0].id).toBe('gov20');
  });
});

describe('badges', () => {
  it('limits foreign badges to one', () => {
    expect(ids(build({ badges: [{ id: 'GAFPB' }, { id: 'FPARA' }] }))).toContain('foreign-one');
  });
  it('limits the pocket flap to three', () => {
    const b = build({ badges: [{ id: 'RIFLE' }, { id: 'PISTOL' }, { id: 'DRVR' }, { id: 'CIB' }, { id: 'EIB' }] });
    expect(ids(b)).toContain('flap-limit');
    expect(layout(b).filter((i) => i.key.startsWith('flap-'))).toHaveLength(3);
  });
  it('puts only one group 1/2 badge above the ribbons', () => {
    const items = layout(build({ badges: [{ id: 'CIB' }, { id: 'EIB' }, { id: 'PARA' }] }));
    expect(items.some((i) => i.key === 'badge-CIB')).toBe(true);
    expect(items.some((i) => i.key === 'badge-EIB')).toBe(false);
    expect(items.some((i) => i.key === 'flap-EIB')).toBe(true);
  });
  it('limits combat and special skill badges to six', () => {
    const six = BADGES.filter((d) => d.group).slice(0, 7).map((d) => ({ id: d.id }));
    expect(ids(build({ badges: six }))).toContain('badge-total');
  });
});

describe('ribbons', () => {
  it('sorts by order of precedence', () => {
    const b = build({ ribbons: [{ id: 'ASR' }, { id: 'BSM' }, { id: 'NDSM' }, { id: 'AGCM' }] });
    expect(sortedRibbons(b).map((r) => r.name)).toEqual([
      'Bronze Star Medal',
      'Army Good Conduct Medal',
      'National Defense Service Medal',
      'Army Service Ribbon',
    ]);
  });
  it('flags manual misordering and duplicates', () => {
    expect(ids(build({ manualRibbonOrder: true, ribbons: [{ id: 'ASR' }, { id: 'BSM' }] }))).toContain('ribbon-order');
    expect(ids(build({ ribbons: [{ id: 'AAM' }, { id: 'AAM' }] }))).toContain('ribbon-dupe');
  });
  it('puts the partial row on top and the highest award first', () => {
    expect(rackRows([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1], [2, 3, 4], [5, 6, 7]]);
    expect(rackRows([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });
  it('has unique ribbon ids', () => {
    expect(new Set(RIBBONS.map((r) => r.id)).size).toBe(RIBBONS.length);
  });
});

describe('layout', () => {
  it('gives officers no service stripes and no DUI on ASU shoulder straps', () => {
    const items = layout(build({ rankId: 'CPT', uniform: 'ASU', yearsService: 9 }));
    expect(items.some((i) => i.key === 'service-stripes')).toBe(false);
    expect(items.some((i) => i.key.startsWith('strap-'))).toBe(true);
    expect(items.some((i) => i.key.startsWith('dui-'))).toBe(false);
  });
  it('counts service stripes and overseas bars', () => {
    const items = layout(build({ rankId: 'SFC', yearsService: 13, monthsHostile: 25 }));
    expect(items.find((i) => i.key === 'service-stripes')?.label).toContain('(4)');
    expect(items.find((i) => i.key === 'overseas-bars')?.label).toContain('(4)');
  });
  it('places the SSI left and the combat patch right', () => {
    const items = layout(build({ hasCombatPatch: true }));
    expect(items.find((i) => i.key === 'ssi')?.surface).toBe('leftSleeve');
    expect(items.find((i) => i.key === 'ssi-mohc')?.surface).toBe('rightSleeve');
  });
  it('cites a source for every placed item', () => {
    for (const sex of ['male', 'female'] as const)
      for (const uniform of ['AGSU', 'ASU'] as const)
        for (const i of layout(build({ sex, uniform }))) expect(i.citations.length, i.key).toBeGreaterThan(0);
  });
  it('cites a source for every knowledge article', () => {
    for (const a of ARTICLES) expect(a.citations.length, a.id).toBeGreaterThan(0);
  });
});
