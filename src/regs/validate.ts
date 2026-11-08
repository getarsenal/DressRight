import type { Build } from './build';
import type { Finding } from './types';
import { C } from './citations';
import { rankById } from './catalog/ranks';
import { badgeById, type BadgeDef } from './catalog/badges';
import { GROUP_ORDER, RIBBONS, ribbonById, PRECEDENCE_CITATION } from './catalog/ribbons';

/**
 * Each rule is a small pure function so rules can be added, changed or retired
 * independently when the regulation changes. Keep messages Soldier-facing.
 */
type Rule = (b: Build) => Finding[];

const badgeDefs = (b: Build) =>
  b.badges.map((e) => badgeById(e.id)).filter((d): d is BadgeDef => !!d);

const stateItems = (b: Build) => {
  const names = b.stateRibbons.map((s) => s.name || 'State award');
  badgeDefs(b)
    .filter((d) => d.kind === 'state')
    .forEach((d) => names.push(d.name));
  return names;
};

const rules: Rule[] = [
  // ------------------------------------------------------------ state awards
  (b) => {
    const items = stateItems(b);
    if (!items.length) return [];
    if (b.component !== 'ARNG') {
      return [
        {
          id: 'state-award-not-arng',
          severity: 'error',
          message: `State awards (${items.join(', ')}) are only wearable by Army National Guard Soldiers serving under the Governor/Adjutant General (32 USC).`,
          fix: 'Remove state awards from this uniform. You may keep them; you may not wear them in your current component.',
          citations: [C.stateAwardsArng, C.stateAwardsTitle10],
        },
      ];
    }
    if (b.dutyStatus === 'T10') {
      return [
        {
          id: 'state-award-title10',
          severity: 'error',
          message: `You are on Title 10 (active Federal service). State awards (${items.join(', ')}) may be accepted but not worn.`,
          fix: 'Remove them while on Title 10 orders. They can go back on when you return to Title 32 / state status.',
          citations: [C.stateAwardsTitle10],
        },
      ];
    }
    return [
      {
        id: 'state-award-ok',
        severity: 'info',
        message: `State awards (${items.join(', ')}) are authorized in your current status (ARNG, ${b.dutyStatus === 'T32' ? 'Title 32' : 'State Active Duty'}). They are worn after all Federal and foreign awards, in your state's order of precedence.`,
        fix: "Check your state's awards regulation for placement of state badges and tabs; it governs eligibility and precedence.",
        citations: [C.stateAwardsArng, C.stateAwardsOrder, C.stateReg],
      },
    ];
  },

  // ------------------------------------------------------------ status sanity
  (b) =>
    b.component !== 'ARNG' && b.dutyStatus !== 'T10'
      ? [
          {
            id: 'status-mismatch',
            severity: 'warning',
            message: `Title 32 / State Active Duty status applies to the Army National Guard. ${b.component === 'RA' ? 'Regular Army' : 'Army Reserve'} Soldiers serve under Title 10.`,
            fix: 'Set duty status to Title 10, or change component to ARNG.',
            citations: [],
          },
        ]
      : [],

  // ------------------------------------------------------------ badges
  (b) => {
    const defs = badgeDefs(b);
    const out: Finding[] = [];
    const cs = defs.filter((d) => d.group !== undefined);
    if (cs.length > 6) {
      out.push({
        id: 'badge-total',
        severity: 'error',
        message: `${cs.length} combat and special skill badges selected. No more than six may be worn at one time (tabs not counted).`,
        fix: 'Choose which badges to wear; you may still be awarded the others.',
        citations: [C.badgeTotal],
      });
    }
    const g12 = defs.filter((d) => d.group === 1 || d.group === 2);
    if (g12.length > 1) {
      out.push({
        id: 'badge-g12',
        severity: 'warning',
        message: `Only one group 1 or group 2 badge is worn above the ribbons. You selected ${g12.map((d) => d.label).join(', ')}; the builder places ${g12[0].label} above the ribbons and moves the rest to the pocket flap.`,
        fix: 'Confirm this arrangement against DA PAM 670-1 para 22-16.',
        citations: [C.badgeGroups],
      });
    }
    const g34 = defs.filter((d) => d.group === 3 || d.group === 4);
    if (g34.length > 3) {
      out.push({
        id: 'badge-g34',
        severity: 'warning',
        message: `Up to three group 3–4 badges are worn above the ribbons; ${g34.length} selected. Extras are moved to the pocket flap.`,
        citations: [C.badgeGroups],
      });
    }
    const flap =
      Math.max(0, g12.length - 1) +
      Math.max(0, g34.length - 3) +
      defs.filter((d) => d.group === 5 || d.kind === 'marksmanship').length;
    if (flap > 3) {
      out.push({
        id: 'flap-limit',
        severity: 'error',
        message: `${flap} badges would go on the left pocket flap; no more than three may be worn there. The 3D view only shows the first three.`,
        fix: 'Remove marksmanship or special skill badges until three or fewer remain on the flap.',
        citations: [C.marksmanship, C.badgeGroups],
      });
    }
    const foreign = defs.filter((d) => d.kind === 'foreign');
    if (foreign.length > 1) {
      out.push({
        id: 'foreign-one',
        severity: 'error',
        message: `Only one foreign badge may be worn; ${foreign.length} selected (${foreign.map((d) => d.label).join(', ')}).`,
        citations: [C.foreignBadges],
      });
    }
    const tabs = defs.filter((d) => d.kind === 'tab');
    if (tabs.length > 3) {
      out.push({
        id: 'tabs-limit',
        severity: 'error',
        message: `${tabs.length} special skill tabs selected; no more than three are worn.`,
        citations: [C.tabsLimit],
      });
    }
    return out;
  },

  // ------------------------------------------------------------ sleeves
  (b) => {
    const rank = rankById(b.rankId);
    const out: Finding[] = [];
    if (rank.category !== 'enlisted' && b.yearsService >= 3) {
      out.push({
        id: 'stripes-officer',
        severity: 'info',
        message: 'Service stripes are worn by enlisted Soldiers only, so none are shown for officers and warrant officers.',
        citations: [C.serviceStripes],
      });
    }
    if (b.hasCombatPatch && b.monthsHostile === 0) {
      out.push({
        id: 'mohc-no-deployment',
        severity: 'warning',
        message:
          'You selected an SSI-MOHC (combat patch) but recorded 0 months in a hostile-fire area. The SSI-MOHC requires qualifying service in a designated area of operations.',
        fix: 'Confirm eligibility in your records, or remove the patch.',
        citations: [C.ssiMohc],
      });
    }
    return out;
  },

  // ------------------------------------------------------------ ribbons
  (b) => {
    if (!b.manualRibbonOrder) return [];
    const defs = b.ribbons.map((e) => ribbonById(e.id)).filter((d) => !!d);
    const key = (d: (typeof defs)[number]) => GROUP_ORDER.indexOf(d!.group) * 1000 + RIBBONS.indexOf(d!);
    for (let i = 1; i < defs.length; i++) {
      if (key(defs[i]) < key(defs[i - 1])) {
        return [
          {
            id: 'ribbon-order',
            severity: 'error',
            message: `Ribbons are out of order: ${defs[i]!.name} ranks above ${defs[i - 1]!.name}.`,
            fix: 'Turn on automatic order of precedence.',
            citations: [PRECEDENCE_CITATION],
          },
        ];
      }
    }
    return [];
  },
  (b) => {
    const dupes = b.ribbons.map((r) => r.id).filter((id, i, a) => a.indexOf(id) !== i);
    return dupes.length
      ? [
          {
            id: 'ribbon-dupe',
            severity: 'error',
            message: `Duplicate ribbon(s): ${[...new Set(dupes)].map((d) => ribbonById(d)?.name ?? d).join(', ')}. Additional awards are shown with devices (oak leaf clusters, knots, numerals), not a second ribbon.`,
            citations: [PRECEDENCE_CITATION],
          },
        ]
      : [];
  },
  (b) => {
    const rank = rankById(b.rankId);
    return b.ribbons.some((r) => r.id === 'AGCM') && rank.category === 'officer'
      ? [
          {
            id: 'agcm-officer',
            severity: 'info',
            message:
              'The Army Good Conduct Medal is awarded for enlisted service. Officers may wear it only if earned while enlisted.',
            citations: [{ source: 'AR600-8-22', topic: 'Army Good Conduct Medal eligibility', verification: 'unverified' }],
          },
        ]
      : [];
  },

  // ------------------------------------------------------------ unit awards
  (b) =>
    b.unitAwards.some((u) => !u.permanent)
      ? [
          {
            id: 'unit-award-temp',
            severity: 'info',
            message:
              'Temporary unit awards are worn only while you are assigned to the unit that earned them. Remove them when you PCS or change units.',
            citations: [C.unitAwardsTemporary],
          },
        ]
      : [],

  // ------------------------------------------------------------ uniform transition
  (b) =>
    b.uniform === 'ASU'
      ? [
          {
            id: 'asu-transition',
            severity: 'info',
            message:
              'The AGSU has replaced the blue ASU for everyday service wear. AGSU mandatory possession date is 1 Oct 2027 (ASU wear-out date 30 Sep 2027), after which the blues remain as a dress uniform. Check what your event or board actually requires.',
            citations: [C.agsuPossession],
          },
        ]
      : [],
];

export function validate(b: Build): Finding[] {
  const order = { error: 0, warning: 1, info: 2 } as const;
  return rules.flatMap((r) => r(b)).sort((a, z) => order[a.severity] - order[z.severity]);
}
