import type { Build } from './build';
import type { Finding } from './types';
import { C } from './citations';
import { rankById } from './catalog/ranks';
import { badgeById, type BadgeDef } from './catalog/badges';
import { GROUP_ORDER, RIBBONS, ribbonById, PRECEDENCE_CITATION } from './catalog/ribbons';
import { badgePlan } from './layout';

/**
 * Each rule is a small pure function so rules can be added, changed or retired
 * independently when the regulation changes. Keep messages Soldier-facing.
 */
type Rule = (b: Build) => Finding[];

const badgeDefs = (b: Build) => b.badges.map((e) => badgeById(e.id)).filter((d): d is BadgeDef => !!d);
const names = (ds: { name: string }[]) => ds.map((d) => d.name).join(', ');

/** Unit awards that may be worn temporarily (DA PAM 670-1 table 22-1). */
const TEMP_OK = new Set(['PUC', 'VUA', 'MUC', 'ASUA']);

const rules: Rule[] = [
  // ------------------------------------------------------------ state awards
  (b) => {
    const items = [...b.stateRibbons.map((s) => s.name || 'State award'), ...badgeDefs(b).filter((d) => d.kind === 'state').map((d) => d.name)];
    if (!items.length) return [];
    if (b.component !== 'ARNG')
      return [{
        id: 'state-award-not-arng',
        severity: 'error',
        message: `State awards (${items.join(', ')}) may only be worn by Army National Guard Soldiers under the command and control of the Governor or Adjutant General.`,
        fix: 'Remove them from the uniform. They stay in your records; you just can\'t wear them in your current component.',
        citations: [C.stateAwardsArng, C.stateBadges],
      }];
    if (b.dutyStatus === 'T10')
      return [{
        id: 'state-award-title10',
        severity: 'error',
        message: `You're on Title 10 (active Federal service). State awards (${items.join(', ')}) may be accepted but not worn.`,
        fix: 'Take them off while on Title 10 orders. They can go back on when you return to state status.',
        citations: [C.stateAwardsTitle10],
      }];
    if (b.dutyStatus === 'SAD')
      return [{
        id: 'state-award-sad',
        severity: 'warning',
        message: `State Active Duty isn't one of the statuses DA PAM 670-1 lists (AGR, ADT, ADSW, FTNGD, annual training, drill). The authority rests on being under the Governor/Adjutant General, so state awards are likely authorized, but confirm with your state.`,
        fix: "Check your state's awards regulation or ask your JFHQ G-1.",
        citations: [C.stateAwardsArng, C.stateReg],
      }];
    return [{
      id: 'state-award-ok',
      severity: 'info',
      message: `State awards (${items.join(', ')}) are authorized in Title 32 status. They are worn after all Federal and foreign awards, in your state's order of precedence.`,
      fix: "Your state's awards regulation controls eligibility, precedence and where state badges/tabs go. The Army pubs don't specify placement.",
      citations: [C.stateAwardsArng, C.stateAwardsOrder, C.stateReg],
    }];
  },

  (b) =>
    b.component !== 'ARNG' && b.dutyStatus !== 'T10'
      ? [{
          id: 'status-mismatch',
          severity: 'warning',
          message: `Title 32 and State Active Duty apply to the Army National Guard. ${b.component === 'RA' ? 'Regular Army' : 'Army Reserve'} Soldiers serve under Title 10.`,
          fix: 'Set duty status to Title 10, or change component to ARNG.',
          citations: [],
        }]
      : [],

  // ------------------------------------------------------------ name plate
  (b) =>
    b.uniform === 'AGSU'
      ? [{
          id: 'agsu-no-nameplate',
          severity: 'info',
          message: 'No name plate on the AGSU. A lot of setups (and some apps) put one on the right pocket flap; the pamphlet says not to.',
          citations: [C.agsuNoNameplate],
        }]
      : [],

  // ------------------------------------------------------------ badges
  (b) => {
    const out: Finding[] = [];
    const defs = badgeDefs(b);
    const plan = badgePlan(b);
    const agsu = b.uniform === 'AGSU';
    const counted = defs.filter((d) => d.group !== undefined && !(d.kind === 'tab'));
    const limit = agsu ? 4 : 6;
    if (counted.length > limit)
      out.push({
        id: 'badge-total',
        severity: 'error',
        message: `${counted.length} badges selected. The ${agsu ? 'AGSU allows four' : 'ASU allows six'} at one time, including marksmanship badges${agsu ? '' : ' (tab metal replicas don\'t count)'}.`,
        fix: 'Choose which badges to wear on this uniform; the others stay in your records.',
        citations: [agsu ? C.badgeTotalAgsu : C.badgeTotalAsu],
      });
    if (plan.notWorn.length)
      out.push({
        id: 'badge-g12',
        severity: 'warning',
        message: `Only one group 1 or group 2 badge may be worn above the ribbons, and they're never worn on the pocket flap. ${names(plan.notWorn.map((x) => x.def))} isn't shown; pick which one you want to wear.`,
        citations: [C.badgeGroups, C.badgeFlap],
      });
    if (plan.overflow.length)
      out.push({
        id: 'flap-limit',
        severity: 'error',
        message: `No room for ${names(plan.overflow.map((x) => x.def))}: at most three badges above the ribbons and three on the pocket flap.`,
        fix: 'Remove a marksmanship or skill badge.',
        citations: [C.badgeGroups, C.badgeFlap],
      });
    const newOnes = defs.filter((d) => d.isNew);
    if (newOnes.length)
      out.push({
        id: 'badge-new',
        severity: 'info',
        message: `${names(newOnes)}: established in AR 600-8-22, but DA PAM 670-1 (2021) doesn't give a wear group or placement yet. ${newOnes.some((d) => d.group) ? 'Master Combat badges are treated like group 1 here.' : ''} ${newOnes.some((d) => !d.group) ? 'Badges without a group aren\'t placed on the coat.' : ''}`.trim(),
        citations: [C.newBadges],
      });
    const foreign = defs.filter((d) => d.kind === 'foreign');
    if (foreign.length > 1)
      out.push({ id: 'foreign-one', severity: 'error', message: `Only one foreign badge may be worn at a time; you selected ${foreign.length}.`, citations: [C.foreignBadges] });
    if (foreign.length && !b.ribbons.length)
      out.push({ id: 'foreign-needs-ribbon', severity: 'error', message: 'A foreign badge can only be worn when at least one U.S. medal or service ribbon is worn too.', citations: [C.foreignBadges] });
    const tabs = defs.filter((d) => d.kind === 'tab');
    if (agsu && tabs.length > 2)
      out.push({
        id: 'tabs-agsu',
        severity: 'error',
        message: `The AGSU takes two skill tabs of your choosing (plus a tab that's part of the unit SSI); you selected ${tabs.length}. Only the first two are shown.`,
        citations: [C.tabsAgsu],
      });
    if (!agsu && tabs.length)
      out.push({
        id: 'tabs-asu',
        severity: 'info',
        message: 'On the blues, skill tabs are worn as metal replicas on the left pocket flap (never above the ribbons), and they share the flap\'s three spaces.',
        citations: [C.tabReplicas],
      });
    // ID badges per side
    const ids = defs.filter((d) => d.kind === 'id' && d.id !== 'CSIB');
    const perSide = agsu ? 1 : 2;
    for (const side of ['left', 'right'] as const) {
      const extra = (side === 'right' && !agsu && b.hasCombatPatch ? 1 : 0) + ids.filter((d) => d.side === side).length;
      if (extra > perSide)
        out.push({
          id: `id-${side}`,
          severity: 'error',
          message: `${extra} ID badges on your ${side} side${side === 'right' && !agsu && b.hasCombatPatch ? ' (counting the CSIB)' : ''}; the ${agsu ? 'AGSU allows one' : 'ASU allows two'} per side.`,
          citations: [C.idBadges],
        });
    }
    if (defs.some((d) => d.id === 'CSIB'))
      out.push({
        id: 'csib-auto',
        severity: 'info',
        message: 'The CSIB is shown automatically on the blues when you have a combat patch. On the AGSU you wear the SSI-MOHC on the right sleeve instead.',
        citations: [C.csib],
      });
    return out;
  },

  // ------------------------------------------------------------ sleeves
  (b) => {
    const out: Finding[] = [];
    const rank = rankById(b.rankId);
    if (rank.category !== 'enlisted' && b.yearsService >= 3)
      out.push({ id: 'stripes-officer', severity: 'info', message: 'Service stripes are for enlisted Soldiers, so none are shown.', citations: [C.serviceStripesElig] });
    if (b.hasCombatPatch && b.monthsHostile === 0)
      out.push({
        id: 'mohc-no-deployment',
        severity: 'warning',
        message: 'You have a combat patch set, but 0 months deployed. The SSI-MOHC requires qualifying service (hostile action/fire, or CZTE with hostile-fire/imminent-danger pay).',
        fix: 'Confirm eligibility in your records, or turn the combat patch off.',
        citations: [C.ssiMohcEligibility],
      });
    if (b.uniform === 'ASU' && b.hasCombatPatch)
      out.push({
        id: 'asu-csib',
        severity: 'info',
        message: 'The blue coat has no shoulder patches. Your combat patch is worn as the Combat Service Identification Badge on the right pocket.',
        citations: [C.csib, C.ssiCurrent],
      });
    return out;
  },

  // ------------------------------------------------------------ ribbons
  (b) => {
    if (!b.manualRibbonOrder) return [];
    const defs = b.ribbons.map((e) => ribbonById(e.id)).filter((d) => !!d);
    const key = (d: (typeof defs)[number]) => GROUP_ORDER.indexOf(d!.group) * 1000 + RIBBONS.indexOf(d!);
    for (let i = 1; i < defs.length; i++)
      if (key(defs[i]) < key(defs[i - 1]))
        return [{
          id: 'ribbon-order',
          severity: 'error',
          message: `Ribbons are out of order: ${defs[i]!.name} ranks above ${defs[i - 1]!.name}.`,
          fix: 'Turn on automatic order of precedence.',
          citations: [PRECEDENCE_CITATION],
        }];
    return [];
  },
  (b) => {
    const dupes = b.ribbons.map((r) => r.id).filter((id, i, a) => a.indexOf(id) !== i);
    return dupes.length
      ? [{
          id: 'ribbon-dupe',
          severity: 'error',
          message: `Duplicate ribbon: ${[...new Set(dupes)].map((d) => ribbonById(d)?.name ?? d).join(', ')}. More awards are shown with devices on one ribbon (oak leaf clusters, knots, numerals), not a second ribbon.`,
          citations: [C.devices],
        }]
      : [];
  },
  (b) => {
    const many = b.ribbons.filter((r) => (r.count ?? 0) > 4 && r.device !== 'numeral');
    return many.length
      ? [{
          id: 'devices-max',
          severity: 'warning',
          message: `${names(many.map((r) => ribbonById(r.id)!))}: no more than four devices on a ribbon. A silver oak leaf cluster or silver star replaces five bronze ones.`,
          citations: [C.devices],
        }]
      : [];
  },
  (b) =>
    b.ribbons.some((r) => r.id === 'AGCM') && rankById(b.rankId).category === 'officer'
      ? [{ id: 'agcm-officer', severity: 'info', message: 'The Army Good Conduct Medal is for enlisted service. Officers wear it only if earned while enlisted.', citations: [{ source: 'AR600-8-22', topic: 'Army Good Conduct Medal eligibility', verification: 'unverified' }] }]
      : [],

  // ------------------------------------------------------------ unit awards
  (b) => {
    const out: Finding[] = [];
    const temp = b.unitAwards.filter((u) => !u.permanent);
    const perm = b.unitAwards.filter((u) => u.permanent);
    if (temp.length)
      out.push({
        id: 'unit-award-temp',
        severity: 'info',
        message: 'Temporary unit awards are worn only while assigned to the unit, and not for official photos or promotion/selection boards.',
        citations: [C.unitAwardsTemporary],
      });
    const badTemp = temp.filter((u) => !TEMP_OK.has(u.id));
    if (badTemp.length)
      out.push({
        id: 'unit-award-temp-invalid',
        severity: 'error',
        message: `Only the Army PUC, VUA, MUC and ASUA can be worn temporarily. Mark the others permanent (if you were assigned during the award period) or remove them.`,
        citations: [C.unitAwardsTemporary],
      });
    if (b.uniform === 'AGSU' && temp.length && perm.length)
      out.push({
        id: 'unit-award-agsu-mix',
        severity: 'error',
        message: 'On the AGSU, wear either the unit awards you earned or your current unit\'s awards, not both.',
        citations: [C.unitAwardsAgsu],
      });
    return out;
  },

  // ------------------------------------------------------------ uniform transition
  (b) =>
    b.uniform === 'ASU'
      ? [{
          id: 'asu-transition',
          severity: 'info',
          message: 'AGSU mandatory possession date is 1 Oct 2027; the ASU wear-out date is 30 Sep 2027. Check what your event or board requires.',
          citations: [C.agsuPossession],
        }]
      : [],
];

export function validate(b: Build): Finding[] {
  const order = { error: 0, warning: 1, info: 2 } as const;
  return rules.flatMap((r) => r(b)).sort((a, z) => order[a.severity] - order[z.severity]);
}
