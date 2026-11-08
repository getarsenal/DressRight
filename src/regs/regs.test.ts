import { describe, expect, it } from 'vitest';
import { DEFAULT_BUILD, type Build } from './build';
import { validate } from './validate';
import { badgePlan, layout, rackRows, sortedRibbons } from './layout';
import { ARTICLES, searchArticles } from './knowledge';
import { RIBBONS, ribbonById } from './catalog/ribbons';
import { BADGES, badgeById } from './catalog/badges';
import { PUBLICATIONS } from './sources';

const build = (p: Partial<Build>): Build => ({ ...DEFAULT_BUILD, ...p });
const ids = (b: Build) => validate(b).map((f) => f.id);
const keys = (b: Build) => layout(b).map((i) => i.key);

describe('state awards (DA PAM 670-1 22-5j)', () => {
  const gov20 = [{ id: 'GOV20' }];
  it('blocks state awards on Title 10', () => {
    expect(ids(build({ component: 'ARNG', dutyStatus: 'T10', badges: gov20 }))).toContain('state-award-title10');
  });
  it('allows them on Title 32', () => {
    expect(ids(build({ component: 'ARNG', dutyStatus: 'T32', badges: gov20 }))).toContain('state-award-ok');
  });
  it('flags State Active Duty as not explicitly listed', () => {
    const f = validate(build({ component: 'ARNG', dutyStatus: 'SAD', badges: gov20 })).find((x) => x.id === 'state-award-sad');
    expect(f?.severity).toBe('warning');
  });
  it('blocks state awards for Regular Army and Reserve', () => {
    expect(ids(build({ component: 'RA', badges: gov20 }))).toContain('state-award-not-arng');
    expect(ids(build({ component: 'USAR', stateRibbons: [{ key: 'S', name: 'X', colors: ['#000'] }] }))).toContain('state-award-not-arng');
  });
  it("personalizes the Governor's Twenty answer", () => {
    const a = ARTICLES.find((x) => x.id === 'gov20')!;
    expect(a.personal!(build({ component: 'ARNG', dutyStatus: 'T32' })).verdict).toBe('yes');
    expect(a.personal!(build({ component: 'ARNG', dutyStatus: 'SAD' })).verdict).toBe('depends');
    expect(a.personal!(build({ component: 'ARNG', dutyStatus: 'T10' })).verdict).toBe('no');
    expect(a.personal!(build({ component: 'RA' })).verdict).toBe('no');
    expect(searchArticles("governor's twenty")[0].id).toBe('gov20');
  });
});

describe('name plate (DA PAM 670-1 14-5n, 21-25c)', () => {
  it('is never placed on the AGSU', () => {
    for (const sex of ['male', 'female'] as const) expect(keys(build({ uniform: 'AGSU', sex }))).not.toContain('nameplate');
  });
  it('is placed on the ASU', () => {
    expect(keys(build({ uniform: 'ASU' }))).toContain('nameplate');
  });
});

describe('sleeve insignia', () => {
  it('puts the SSI left and the SSI-MOHC right on the AGSU', () => {
    const items = layout(build({ uniform: 'AGSU', hasCombatPatch: true }));
    expect(items.find((i) => i.key === 'ssi')?.surface).toBe('leftSleeve');
    expect(items.find((i) => i.key === 'ssi-mohc')?.surface).toBe('rightSleeve');
  });
  it('has no SSI, SSI-MOHC or cloth tabs on the ASU, and shows the CSIB instead', () => {
    const k = keys(build({ uniform: 'ASU', hasCombatPatch: true, badges: [{ id: 'RANGER' }] }));
    expect(k).not.toContain('ssi');
    expect(k).not.toContain('ssi-mohc');
    expect(k.some((x) => x.startsWith('tab-'))).toBe(false);
    expect(k).toContain('csib');
    expect(k).toContain('flap-RANGER'); // metal replica on the pocket flap
  });
  it('allows two skill tabs on the AGSU', () => {
    const b = build({ uniform: 'AGSU', badges: [{ id: 'RANGER' }, { id: 'SAPPER' }, { id: 'SFTAB' }] });
    expect(ids(b)).toContain('tabs-agsu');
    expect(keys(b).filter((k) => k.startsWith('tab-'))).toHaveLength(2);
  });
  it('puts service stripes on the left sleeve and overseas bars on the right, on both uniforms', () => {
    for (const uniform of ['AGSU', 'ASU'] as const) {
      const items = layout(build({ uniform, rankId: 'SFC', yearsService: 13, monthsHostile: 18 }));
      expect(items.find((i) => i.key === 'service-stripes')?.surface).toBe('leftSleeve');
      expect(items.find((i) => i.key === 'overseas-bars')?.surface).toBe('rightSleeve');
    }
  });
  it('sizes chevrons from DA PAM 670-1 21-7b', () => {
    const chev = layout(build({ rankId: 'SFC', sex: 'male' })).find((i) => i.key === 'chev-leftSleeve')!;
    expect(chev.w).toBe(3);
    expect(chev.h).toBeGreaterThan(3.5); // three chevrons over two arcs is taller than wide
    const small = layout(build({ rankId: 'SFC', sex: 'female' })).find((i) => i.key === 'chev-leftSleeve')!;
    expect(small.w).toBe(2.5);
  });
  it('counts stripes and bars; officers get bars but no stripes', () => {
    const items = layout(build({ rankId: 'SFC', yearsService: 13, monthsHostile: 25 }));
    expect(items.find((i) => i.key === 'service-stripes')?.label).toContain('(4)');
    expect(items.find((i) => i.key === 'overseas-bars')?.label).toContain('(4)');
    const off = keys(build({ rankId: 'CPT', yearsService: 9, monthsHostile: 12 }));
    expect(off.some((k) => k.startsWith('service-stripes'))).toBe(false);
    expect(off).toContain('overseas-bars');
  });
});

describe('badges (DA PAM 670-1 22-16)', () => {
  it('allows at most three above the ribbons, one from group 1/2', () => {
    const plan = badgePlan(build({ badges: [{ id: 'CIB' }, { id: 'PARA' }, { id: 'AASLT' }, { id: 'PF' }] }));
    expect(plan.above.map((x) => x.def.id)).toEqual(['CIB', 'PARA', 'AASLT']);
    expect(plan.flap.map((x) => x.def.id)).toEqual(['PF']);
  });
  it('never moves a second group 1/2 badge to the flap', () => {
    const b = build({ badges: [{ id: 'CIB' }, { id: 'EIB' }] });
    const plan = badgePlan(b);
    expect(plan.notWorn.map((x) => x.def.id)).toEqual(['EIB']);
    expect(keys(b)).not.toContain('flap-EIB');
    expect(ids(b)).toContain('badge-g12');
  });
  it('limits the AGSU to four badges and the ASU to six', () => {
    const five = [{ id: 'CIB' }, { id: 'PARA' }, { id: 'AASLT' }, { id: 'RIFLE' }, { id: 'PISTOL' }];
    expect(ids(build({ uniform: 'AGSU', badges: five }))).toContain('badge-total');
    expect(ids(build({ uniform: 'ASU', badges: five }))).not.toContain('badge-total');
  });
  it('limits the pocket flap to three', () => {
    const b = build({ uniform: 'ASU', badges: [{ id: 'CIB' }, { id: 'PARA' }, { id: 'AASLT' }, { id: 'PF' }, { id: 'RIFLE' }, { id: 'PISTOL' }, { id: 'DRVR' }] });
    expect(ids(b)).toContain('flap-limit');
    expect(keys(b).filter((k) => k.startsWith('flap-'))).toHaveLength(3);
  });
  it('limits foreign badges to one and requires a U.S. ribbon', () => {
    expect(ids(build({ badges: [{ id: 'GAFPB' }, { id: 'FPARA' }] }))).toContain('foreign-one');
    expect(ids(build({ ribbons: [], badges: [{ id: 'GAFPB' }] }))).toContain('foreign-needs-ribbon');
  });
  it('stacks unit awards, then foreign badge, then RDI', () => {
    const items = layout(build({ uniform: 'AGSU', rdi: true, badges: [{ id: 'GAFPB' }], unitAwards: [{ id: 'MUC', permanent: true }] }));
    const y = (k: string) => items.find((i) => i.key === k)!.y;
    expect(y('unit-awards')).toBeLessThan(y('foreign-GAFPB'));
    expect(y('foreign-GAFPB')).toBeLessThan(y('rdi'));
  });
  it('has the verified ID badge sides', () => {
    expect(badgeById('REC')?.side).toBe('left');
    expect(badgeById('TOMB')?.side).toBe('right');
    expect(badgeById('DS')?.side).toBe('right');
  });
  it('limits ID badges per side (AGSU 1, ASU 2)', () => {
    const two = [{ id: 'DS' }, { id: 'ASIB' }];
    expect(ids(build({ uniform: 'AGSU', badges: two }))).toContain('id-right');
    expect(ids(build({ uniform: 'ASU', hasCombatPatch: false, badges: two }))).not.toContain('id-right');
  });
  it('has no CAB repeat awards', () => {
    expect(badgeById('CAB')?.levels).toBeUndefined();
  });
});

describe('ribbons', () => {
  it('sorts by order of precedence', () => {
    const b = build({ ribbons: [{ id: 'ASR' }, { id: 'BSM' }, { id: 'NDSM' }, { id: 'AGCM' }] });
    expect(sortedRibbons(b).map((r) => r.name)).toEqual(['Bronze Star Medal', 'Army Good Conduct Medal', 'National Defense Service Medal', 'Army Service Ribbon']);
  });
  it('places the Army Recruiting Ribbon between the AFRM and the NCOPDR', () => {
    const i = (id: string) => RIBBONS.findIndex((r) => r.id === id);
    expect(i('AFRM')).toBeLessThan(i('ARR'));
    expect(i('ARR')).toBeLessThan(i('NCOPDR'));
  });
  it('has the verified device rules', () => {
    expect(ribbonById('BSM')?.devices).not.toContain('C');
    expect(ribbonById('MSM')?.devices).toContain('R');
    expect(ribbonById('MSM')?.devices).not.toContain('C');
    expect(ribbonById('ARCOM')?.devices).toEqual(expect.arrayContaining(['V', 'C', 'R']));
    expect(ribbonById('ACM')?.devices).toContain('arrowhead');
  });
  it('flags manual misordering and duplicates', () => {
    expect(ids(build({ manualRibbonOrder: true, ribbons: [{ id: 'ASR' }, { id: 'BSM' }] }))).toContain('ribbon-order');
    expect(ids(build({ ribbons: [{ id: 'AAM' }, { id: 'AAM' }] }))).toContain('ribbon-dupe');
  });
  it('puts the partial row on top', () => {
    expect(rackRows([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1], [2, 3, 4], [5, 6, 7]]);
  });
  it('has unique ids', () => {
    expect(new Set(RIBBONS.map((r) => r.id)).size).toBe(RIBBONS.length);
    expect(new Set(BADGES.map((r) => r.id)).size).toBe(BADGES.length);
  });
});

describe('unit awards (DA PAM 670-1 table 22-1, 14-5v)', () => {
  it('blocks mixing earned and current unit awards on the AGSU', () => {
    const ua = [{ id: 'MUC', permanent: true }, { id: 'VUA', permanent: false }];
    expect(ids(build({ uniform: 'AGSU', unitAwards: ua }))).toContain('unit-award-agsu-mix');
    expect(ids(build({ uniform: 'ASU', unitAwards: ua }))).not.toContain('unit-award-agsu-mix');
  });
  it('only allows temporary wear of PUC, VUA, MUC, ASUA', () => {
    expect(ids(build({ unitAwards: [{ id: 'JMUA', permanent: false }] }))).toContain('unit-award-temp-invalid');
  });
});

describe('every item and answer is cited', () => {
  it('layout items', () => {
    for (const sex of ['male', 'female'] as const)
      for (const uniform of ['AGSU', 'ASU'] as const)
        for (const rankId of ['SSG', 'CPT'])
          for (const i of layout(build({ sex, uniform, rankId, hasCombatPatch: true }))) expect(i.citations.length, i.key).toBeGreaterThan(0);
  });
  it('knowledge articles', () => {
    for (const a of ARTICLES) expect(a.citations.length, a.id).toBeGreaterThan(0);
  });
  it('publications have been reviewed against the primary source', () => {
    for (const p of PUBLICATIONS) expect(p.lastReviewed, p.id).toBeTruthy();
  });
});
