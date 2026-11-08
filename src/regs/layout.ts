/**
 * Layout engine: turns a Build into a list of placed items on the coat.
 *
 * Units are INCHES so the regulation measurements ("1/8 inch above the
 * pocket flap") can be written literally. The 3D scene uses the same units.
 *
 * Coordinate system (front surface): x = 0 at the coat's centerline,
 * POSITIVE x is the WEARER'S LEFT (viewer's right). y is up. Sleeve items use
 * `along` (inches down from the shoulder seam) on the named sleeve.
 */
import type { Build, InsigniaArt } from './build';
import type { Citation, Rank } from './types';
import { C } from './citations';
import { rankById } from './catalog/ranks';
import { branchById, type Branch } from './catalog/branches';
import { BADGES, badgeById, type BadgeDef } from './catalog/badges';
import {
  GROUP_ORDER,
  RIBBONS,
  STATE_RIBBON_TEMPLATE,
  UNIT_AWARDS,
  ribbonById,
  type DeviceKind,
} from './catalog/ribbons';

// ---------------------------------------------------------------- geometry

export interface CoatGeometry {
  width: number;
  height: number;
  depth: number;
  /** y of the shoulder line (top of torso) */
  top: number;
  /** y of the lapel notch, x of the gorge */
  notchY: number;
  notchX: number;
  /** y of the top button */
  topButtonY: number;
  buttons: number[];
  /** breast pockets (male); null for coats without them */
  pocket: { cx: number; top: number; width: number; height: number; flap: number; style: 'flap' | 'welt' } | null;
  sleeveLength: number;
  sleeveRadius: number;
}

export function coatGeometry(b: Pick<Build, 'uniform' | 'sex'>): CoatGeometry {
  const male = b.sex === 'male';
  return {
    width: male ? 19 : 17,
    height: male ? 30 : 26,
    depth: male ? 10 : 9,
    top: male ? 15 : 13,
    notchY: male ? 9 : 7,
    notchX: male ? 3.6 : 2.9,
    topButtonY: male ? 0 : 1,
    buttons: male ? [0, -4.3, -8.6, -12.9] : [1, -3, -7],
    pocket: male
      ? b.uniform === 'AGSU'
        ? { cx: 5.9, top: 4.6, width: 4.6, height: 5.4, flap: 2.2, style: 'flap' }
        : { cx: 5.9, top: 4.6, width: 4.6, height: 0.35, flap: 0.35, style: 'welt' }
      : null,
    sleeveLength: male ? 24 : 22,
    sleeveRadius: male ? 2.6 : 2.3,
  };
}

// ---------------------------------------------------------------- item types

export interface RackRibbon {
  stripes: [string, number][];
  device?: DeviceKind;
  count?: number;
  name: string;
  framed?: boolean;
}

export type TextureSpec =
  | { type: 'rack'; ribbons: RackRibbon[]; perRow: number }
  | { type: 'badge'; def: BadgeDef; level?: string }
  | { type: 'nameplate'; text: string }
  | { type: 'disk'; variant: 'us' | 'branch'; branch: Branch }
  | { type: 'usLetters' }
  | { type: 'branchPin'; branch: Branch }
  | { type: 'art'; art: InsigniaArt }
  | { type: 'chevrons'; rank: Rank; uniform: Build['uniform'] }
  | { type: 'officerRank'; rank: Rank }
  | { type: 'shoulderStrap'; rank: Rank; branch: Branch }
  | { type: 'serviceStripes'; count: number; uniform: Build['uniform'] }
  | { type: 'overseasBars'; count: number; uniform: Build['uniform'] }
  | { type: 'tab'; label: string; color?: string }
  | { type: 'rdi'; branch: Branch };

export type Surface = 'front' | 'leftLoop' | 'rightLoop' | 'leftSleeve' | 'rightSleeve';

export interface PlacedItem {
  key: string;
  label: string;
  surface: Surface;
  /** front: x/y in inches. loops: x = distance from neck end. sleeves: along = inches below shoulder seam */
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
  tex: TextureSpec;
  /** the placement rule, in plain language */
  rule: string;
  citations: Citation[];
}

// ---------------------------------------------------------------- helpers

export const RIBBON_W = 1.375;
export const RIBBON_H = 0.375;

export function sortedRibbons(b: Build): RackRibbon[] {
  const rows: { order: number; r: RackRibbon }[] = [];
  b.ribbons.forEach((e, i) => {
    const def = ribbonById(e.id);
    if (!def) return;
    const order = b.manualRibbonOrder
      ? i
      : GROUP_ORDER.indexOf(def.group) * 1000 + RIBBONS.indexOf(def);
    rows.push({ order, r: { stripes: def.stripes, device: e.device, count: e.count, name: def.name } });
  });
  b.stateRibbons.forEach((s, i) => {
    const half: [string, number][] = s.colors.map((c) => [c, 1]);
    const stripes = [...half, ...half.slice(0, -1).reverse()];
    rows.push({
      order: GROUP_ORDER.indexOf('state') * 1000 + 900 + i,
      r: { stripes: stripes.length ? stripes : STATE_RIBBON_TEMPLATE.stripes, name: s.name || 'State award' },
    });
  });
  rows.sort((a, z) => a.order - z.order);
  return rows.map((x) => x.r);
}

/**
 * Split a precedence-ordered list into rack rows, TOP row first.
 * The highest-precedence ribbon is worn uppermost, on the wearer's right; when
 * the count is not a multiple of the row length, the partial row is the top
 * row (centered).
 */
export function rackRows<T>(items: T[], perRow: number): T[][] {
  const rows: T[][] = [];
  const partial = items.length % perRow;
  let i = 0;
  if (partial) {
    rows.push(items.slice(0, partial));
    i = partial;
  }
  for (; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));
  return rows;
}

const rackSize = (n: number, perRow: number, w = RIBBON_W, h = RIBBON_H) => {
  const rows = Math.ceil(n / perRow);
  return { w: Math.min(n, perRow) * w, h: rows * h };
};

// ---------------------------------------------------------------- layout

export function layout(b: Build): PlacedItem[] {
  const g = coatGeometry(b);
  const rank = rankById(b.rankId);
  const branch = branchById(b.branchId);
  const officer = rank.category !== 'enlisted';
  const items: PlacedItem[] = [];
  const coatCite = b.uniform === 'AGSU' ? C.agsuCoat : C.asuCoat;

  // Reference lines. Male: top of the breast pockets. Female: bottom edge of the name plate.
  const npW = 3;
  const npH = 0.6;
  const female = !g.pocket;
  const npY = female
    ? g.topButtonY + 1.5 + npH / 2
    : g.pocket!.style === 'flap'
      ? g.pocket!.top - g.pocket!.flap / 2
      : g.pocket!.top - g.pocket!.flap - 0.125 - npH / 2;
  const leftRef = female ? npY - npH / 2 : g.pocket!.top;
  const rightRef = female ? npY + npH / 2 : g.pocket!.top;
  const pcx = g.pocket?.cx ?? 4.6;

  // ----- name plate
  items.push({
    key: 'nameplate',
    label: `Name plate (${b.lastName || 'NAME'})`,
    surface: 'front',
    x: -pcx,
    y: npY,
    w: npW,
    h: npH,
    tex: { type: 'nameplate', text: (b.lastName || 'NAME').toUpperCase() },
    rule: female
      ? 'Centered horizontally on the right side, 1 to 2 inches above the top button.'
      : g.pocket!.style === 'flap'
        ? 'Centered on the right breast pocket flap, between the top of the button and the top of the pocket.'
        : 'Centered on the right side, just below the top of the pocket opening.',
    citations: [coatCite],
  });

  // ----- ribbons
  const ribbons = sortedRibbons(b);
  const perRow = 3;
  const rack = rackSize(ribbons.length, perRow);
  let leftTop = leftRef;
  if (ribbons.length) {
    const bottom = female ? leftRef : leftRef + 0.125;
    items.push({
      key: 'ribbons',
      label: `Ribbons (${ribbons.length})`,
      surface: 'front',
      x: pcx,
      y: bottom + rack.h / 2,
      w: rack.w,
      h: rack.h,
      tex: { type: 'rack', ribbons, perRow },
      rule: female
        ? 'Centered on the left side, bottom row parallel to the bottom edge of the name plate. Rows of 3; highest precedence uppermost on the wearer\'s right, partial row on top.'
        : 'Centered 1/8 inch above the left breast pocket. Rows of 3 (4 allowed when the lapel does not cover them), no space between rows. Highest precedence uppermost on the wearer\'s right; a partial row goes on top, centered.',
      citations: [C.ribbonsRack, { ...C.ribbonsRack, source: 'AR600-8-22', topic: 'Order of precedence' }],
    });
    leftTop = bottom + rack.h;
  }

  // ----- badges (left side)
  const chosen = b.badges
    .map((e) => ({ e, def: badgeById(e.id) }))
    .filter((x): x is { e: typeof x.e; def: BadgeDef } => !!x.def);

  const g12 = chosen.filter((x) => x.def.group === 1 || x.def.group === 2).sort((a, z) => a.def.group! - z.def.group!);
  const g34 = chosen.filter((x) => x.def.group === 3 || x.def.group === 4).sort((a, z) => a.def.group! - z.def.group!);
  const above = [...g12.slice(0, 1), ...g34.slice(0, 3)];
  const flapOverflow = [...g12.slice(1), ...g34.slice(3), ...chosen.filter((x) => x.def.group === 5)];
  const marks = chosen.filter((x) => x.def.kind === 'marksmanship');

  let y = leftTop + 0.25;
  above.forEach((x, i) => {
    const h = 0.7;
    items.push({
      key: `badge-${x.def.id}`,
      label: x.def.name + (x.e.level ? ` (${x.e.level})` : ''),
      surface: 'front',
      x: pcx,
      y: y + h / 2,
      w: 2.4,
      h,
      tex: { type: 'badge', def: x.def, level: x.e.level },
      rule:
        i === 0
          ? 'First badge centered 1/4 inch above the ribbons (or pocket). Only one group 1 or group 2 badge is worn above the ribbons.'
          : 'Each additional badge centered 1/2 inch above the one below it. Up to three badges from groups 3–4 above the ribbons.',
      citations: [C.badgeGroups, coatCite],
    });
    y += h + 0.5;
  });

  // ASU: metal replicas of special skill tabs go above the badges.
  const tabs = chosen.filter((x) => x.def.kind === 'tab');
  if (b.uniform === 'ASU') {
    tabs.forEach((x) => {
      items.push({
        key: `tabrep-${x.def.id}`,
        label: `${x.def.name} (metal replica)`,
        surface: 'front',
        x: pcx,
        y: y + 0.2,
        w: 2.2,
        h: 0.4,
        tex: { type: 'tab', label: x.def.label, color: '#c9b037' },
        rule: 'Special skill tab metal replicas are worn on the left side above the ribbons and badges.',
        citations: [C.tabsLimit, coatCite],
      });
      y += 0.65;
    });
  }

  // pocket flap (male) or below ribbons (female)
  const flapItems = [...flapOverflow, ...marks].slice(0, 3);
  const flapY = female ? leftRef - 0.25 - 0.35 : g.pocket!.top - Math.min(0.75, g.pocket!.flap / 2);
  flapItems.forEach((x, i) => {
    const n = flapItems.length;
    const spacing = 1.45;
    items.push({
      key: `flap-${x.def.id}`,
      label: x.def.name + (x.e.level ? ` (${x.e.level})` : ''),
      surface: 'front',
      x: pcx + (i - (n - 1) / 2) * spacing,
      y: flapY,
      w: 1.25,
      h: 0.7,
      tex: { type: 'badge', def: x.def, level: x.e.level },
      rule: female
        ? 'Marksmanship badges are worn 1/4 inch below the ribbons, centered; up to three, equally spaced.'
        : 'Worn on the left pocket flap, 1/8 inch below the top of the flap: one centered, two or three equally spaced. No more than three on the flap. Special skill badges go to the wearer\'s right of marksmanship badges.',
      citations: [C.marksmanship, C.badgeGroups],
    });
  });

  // ----- right side: unit awards, RDI, foreign badge
  let rightTop = rightRef;
  const ua = b.unitAwards
    .map((u) => ({ u, def: UNIT_AWARDS.find((d) => d.id === u.id) }))
    .filter((x) => !!x.def)
    .sort((a, z) => UNIT_AWARDS.indexOf(a.def!) - UNIT_AWARDS.indexOf(z.def!));
  if (ua.length) {
    const UW = 1.5;
    const UH = 0.5;
    const s = rackSize(ua.length, 3, UW, UH);
    const bottom = rightRef + (female ? 0.5 : 0.125);
    items.push({
      key: 'unit-awards',
      label: `Unit awards (${ua.length})`,
      surface: 'front',
      x: -pcx,
      y: bottom + s.h / 2,
      w: s.w,
      h: s.h,
      tex: {
        type: 'rack',
        perRow: 3,
        ribbons: ua.map((x) => ({ stripes: x.def!.stripes, name: x.def!.name, framed: true })),
      },
      rule: female
        ? 'Centered on the right side, 1/2 inch above the name plate. Rows of 3, no space between rows.'
        : 'Centered 1/8 inch above the right breast pocket flap, rows of 3 with no space between rows. Not worn on the AGSU Class B shirt.',
      citations: [coatCite, C.unitAwardsTemporary],
    });
    rightTop = bottom + s.h;
  }
  if (b.rdi) {
    items.push({
      key: 'rdi',
      label: 'Regimental distinctive insignia',
      surface: 'front',
      x: -pcx,
      y: rightTop + 0.25 + 0.5,
      w: 1,
      h: 1,
      tex: { type: 'rdi', branch },
      rule: 'Centered 1/4 inch above the unit awards (or above the pocket / name plate when no unit awards are worn).',
      citations: [coatCite],
    });
    rightTop += 1.25;
  }
  const foreign = chosen.filter((x) => x.def.kind === 'foreign').slice(0, 1);
  foreign.forEach((x) => {
    items.push({
      key: `foreign-${x.def.id}`,
      label: x.def.name + (x.e.level ? ` (${x.e.level})` : ''),
      surface: 'front',
      x: -pcx,
      y: rightTop + 0.5 + 0.45,
      w: 1.6,
      h: 0.9,
      tex: { type: 'badge', def: x.def, level: x.e.level },
      rule: 'Only one foreign badge is worn, on the right side above the unit awards / RDI.',
      citations: [C.foreignBadges],
    });
  });

  // ----- identification badges (pocket face)
  chosen
    .filter((x) => x.def.kind === 'id')
    .forEach((x) => {
      const side = x.def.side === 'left' ? 1 : -1;
      const cy = female ? g.topButtonY - 3 : g.pocket!.top - g.pocket!.flap - (g.pocket!.height - g.pocket!.flap) / 2;
      items.push({
        key: `id-${x.def.id}`,
        label: x.def.name,
        surface: 'front',
        x: side * pcx,
        y: g.pocket?.style === 'welt' ? g.pocket.top - 2.2 : cy,
        w: 1.4,
        h: 1.4,
        tex: { type: 'badge', def: x.def },
        rule: `Centered on the ${x.def.side} pocket (between the bottom of the flap and the bottom of the pocket).`,
        citations: [coatCite],
      });
    });

  // ----- collar & lapel insignia
  if (officer) {
    [-1, 1].forEach((s) => {
      items.push({
        key: `us-${s}`,
        label: 'U.S. insignia (officer)',
        surface: 'front',
        x: s * (g.notchX + 0.9),
        y: g.notchY + 0.625 + 0.3,
        w: 0.75,
        h: 0.4,
        rot: s * 0.35,
        tex: { type: 'usLetters' },
        rule: 'Worn on both collars, 5/8 inch above the notch, centerline parallel to the inside edge of the lapel.',
        citations: [C.collarInsignia],
      });
      items.push({
        key: `br-${s}`,
        label: `Branch insignia (${branch.name})`,
        surface: 'front',
        x: s * (g.notchX + 0.2),
        y: g.notchY - 1.25,
        w: 0.85,
        h: 0.85,
        rot: s * 0.35,
        tex: { type: 'branchPin', branch },
        rule: 'Worn on both lapels, centered 1 1/4 inches below the notch, centerline bisecting the notch and parallel to the inside edge of the lapel.',
        citations: [C.collarInsignia],
      });
    });
  } else {
    [-1, 1].forEach((s) => {
      items.push({
        key: `disk-${s}`,
        label: s < 0 ? 'U.S. insignia disk (right collar)' : `Branch insignia disk (${branch.name}, left collar)`,
        surface: 'front',
        x: s * (g.notchX + 1.0),
        y: g.notchY + 1.0 + 0.5,
        w: 1,
        h: 1,
        rot: s * 0.35,
        tex: { type: 'disk', variant: s < 0 ? 'us' : 'branch', branch },
        rule: s < 0
          ? 'U.S. disk on the right collar, bottom of the disk about 1 inch above the notch, centerline parallel to the inside edge of the lapel.'
          : 'Branch disk on the left collar, bottom of the disk about 1 inch above the notch, centerline parallel to the inside edge of the lapel.',
        citations: [C.collarInsignia],
      });
    });
  }

  // ----- shoulder loops: DUI and officer grade
  const loopLen = g.width / 2 - g.notchX - 0.5;
  (['leftLoop', 'rightLoop'] as const).forEach((surface) => {
    if (officer && b.uniform === 'ASU') {
      items.push({
        key: `strap-${surface}`,
        label: `Shoulder strap (${rank.abbr})`,
        surface,
        x: loopLen / 2,
        y: 0,
        w: loopLen,
        h: 2,
        tex: { type: 'shoulderStrap', rank, branch },
        rule: 'Officers wear grade insignia on shoulder straps on the blue coat; branch colors on the strap.',
        citations: [C.rankInsignia],
      });
      return;
    }
    if (officer) {
      items.push({
        key: `orank-${surface}`,
        label: `Grade insignia (${rank.abbr})`,
        surface,
        x: loopLen - 0.625 - 0.5,
        y: 0,
        w: 1,
        h: 1,
        tex: { type: 'officerRank', rank },
        rule: 'Pin-on grade insignia centered on the shoulder loop, 5/8 inch from the shoulder seam.',
        citations: [C.rankInsignia],
      });
    }
    items.push({
      key: `dui-${surface}`,
      label: 'Distinctive unit insignia (DUI)',
      surface,
      x: officer ? (loopLen - 1.6) / 2 + 0.3 : loopLen / 2,
      y: 0,
      w: 1,
      h: 1.1,
      tex: { type: 'art', art: b.dui },
      rule: officer
        ? 'Centered on the shoulder loop between the grade insignia and the button.'
        : 'Centered on the shoulder loop, equidistant from the outside shoulder seam and the outside edge of the button, base toward the shoulder seam.',
      citations: [coatCite],
    });
  });

  // ----- sleeves
  const tabList = chosen.filter((x) => x.def.kind === 'tab' || (x.def.kind === 'state' && x.def.id === 'GOV20'));
  let along = 0.5;
  if (b.uniform === 'AGSU') {
    tabList.slice(0, 3).forEach((x) => {
      items.push({
        key: `tab-${x.def.id}`,
        label: x.def.name,
        surface: 'leftSleeve',
        x: 0,
        y: along + 0.25,
        w: 2.6,
        h: 0.5,
        tex: { type: 'tab', label: x.def.label },
        rule: 'Special skill tabs are worn above the SSI, starting 1/2 inch below the shoulder seam, 1/8 inch apart.',
        citations: [C.tabsLimit],
      });
      along += 0.625;
    });
  }
  if (b.airborneTab) {
    items.push({
      key: 'airborne-tab',
      label: 'Airborne tab (part of the SSI)',
      surface: 'leftSleeve',
      x: 0,
      y: along + 0.2,
      w: 2.4,
      h: 0.4,
      tex: { type: 'tab', label: 'AIRBORNE', color: '#1b1b1b' },
      rule: 'The Airborne tab is part of the organization\'s SSI and is worn directly above it.',
      citations: [C.ssiCurrent],
    });
    along += 0.4;
  }
  items.push({
    key: 'ssi',
    label: 'Shoulder sleeve insignia (current unit)',
    surface: 'leftSleeve',
    x: 0,
    y: along + (along > 0.5 ? 0.125 : 0) + 1.4,
    w: 2.5,
    h: 2.8,
    tex: { type: 'art', art: b.ssi },
    rule: 'Left sleeve, centered, 1/2 inch below the shoulder seam (or 1/8 inch below any tab).',
    citations: [C.ssiCurrent],
  });
  if (b.hasCombatPatch) {
    items.push({
      key: 'ssi-mohc',
      label: 'SSI-MOHC (combat patch)',
      surface: 'rightSleeve',
      x: 0,
      y: 0.5 + 1.4,
      w: 2.5,
      h: 2.8,
      tex: { type: 'art', art: b.combatPatch },
      rule: 'Right sleeve, centered, 1/2 inch below the shoulder seam.',
      citations: [C.ssiMohc],
    });
  }

  if (!officer && rank.chevrons) {
    (['leftSleeve', 'rightSleeve'] as const).forEach((surface) =>
      items.push({
        key: `chev-${surface}`,
        label: `Grade insignia (${rank.abbr})`,
        surface,
        x: 0,
        y: g.sleeveLength * 0.3,
        w: 3,
        h: 3,
        tex: { type: 'chevrons', rank, uniform: b.uniform },
        rule: 'Centered on the outside of each sleeve, midway between the shoulder seam and the elbow.',
        citations: [C.rankInsignia],
      }),
    );
  }

  const stripes = officer ? 0 : Math.floor(b.yearsService / 3);
  if (stripes > 0) {
    items.push({
      key: 'service-stripes',
      label: `Service stripes (${stripes})`,
      surface: 'leftSleeve',
      x: 0,
      y: g.sleeveLength - 4 - stripes * 0.2,
      w: 2.4,
      h: 0.4 + stripes * 0.4,
      tex: { type: 'serviceStripes', count: stripes, uniform: b.uniform },
      rule: 'Enlisted only. Left sleeve, at a 45-degree angle, lower end 4 inches from the bottom of the sleeve. One stripe per 3 years of honorable service.',
      citations: [C.serviceStripes],
    });
  }
  const bars = Math.floor(b.monthsHostile / 6);
  if (bars > 0) {
    items.push({
      key: 'overseas-bars',
      label: `Overseas service bars (${bars})`,
      surface: 'rightSleeve',
      x: 0,
      y: g.sleeveLength - 4 - bars * 0.2,
      w: 1.6,
      h: bars * 0.45,
      tex: { type: 'overseasBars', count: bars, uniform: b.uniform },
      rule: 'Right sleeve, centered, bottom bar 4 inches from the bottom of the sleeve. One bar per 6 months in a qualifying area.',
      citations: [C.overseasBars],
    });
  }

  return items;
}

export const ALL_BADGES = BADGES;
