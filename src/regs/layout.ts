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
import { chevronSize, overseasBarsSize, serviceStripesSize } from './insigniaSpec';
import { rankById } from './catalog/ranks';
import { branchById, type Branch } from './catalog/branches';
import { BADGES, badgeById, type BadgeDef } from './catalog/badges';
import {
  GROUP_ORDER,
  RIBBONS,
  STATE_RIBBON_TEMPLATE,
  UNIT_AWARDS,
  ribbonById,
  PRECEDENCE_CITATION,
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
  /** breast pockets; null for coats without them (female ASU) */
  pocket: { cx: number; top: number; width: number; height: number; flap: number; style: 'flap' | 'welt'; pleat: boolean } | null;
  sleeveLength: number;
  sleeveRadius: number;
  /** shoulder loop length, collar seam end to shoulder seam */
  loopLength: number;
  /**
   * Tilt (radians) of the lapel's inside edge. When set, collar and lapel
   * insignia are placed along that axis from the notch (sculpted coat);
   * otherwise the legacy offsets for the procedural coat are used.
   */
  collarTilt?: number;
}

export function coatGeometry(b: Pick<Build, 'uniform' | 'sex'>): CoatGeometry {
  const male = b.sex === 'male';
  if (male) {
    // Measured on the sculpted 40R coat (tools/blender/asset_coat.py, from the purchased model):
    // origin at the centre of the top button, inches.
    return {
      width: 17,
      height: 30,
      depth: 9.5,
      top: 15,
      notchY: 7.73,
      notchX: 4.2,
      topButtonY: 0,
      buttons: [0, -1.7, -3.65, -5.6],
      pocket: { cx: 4.3, top: 3.58, width: 4.0, height: 3.77, flap: 1.75, style: 'flap', pleat: true },
      sleeveLength: 23.1,
      sleeveRadius: 2.6,
      loopLength: 3.4, // collar edge to the shoulder seam
      collarTilt: 0.45,
    };
  }
  // proportions of a 12R female coat (procedural model)
  return {
    width: 15.5,
    height: 26,
    depth: 8.6,
    top: 13,
    notchY: 7,
    notchX: 2.7,
    topButtonY: 1,
    buttons: [1, -3, -7],
    pocket: b.uniform === 'AGSU' ? { cx: 4.3, top: 4.4, width: 3.9, height: 4.6, flap: 1.9, style: 'flap', pleat: true } : null,
    sleeveLength: 22,
    sleeveRadius: 2.3,
    loopLength: 15.5 / 2 - 2.7 - 0.5,
  };
}

// ---------------------------------------------------------------- item types

export interface RackRibbon {
  /** catalog id, used to look up real artwork */
  id?: string;
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
  | { type: 'chevrons'; rank: Rank; uniform: Build['uniform']; small: boolean }
  | { type: 'officerRank'; rank: Rank }
  | { type: 'shoulderStrap'; rank: Rank; branch: Branch }
  | { type: 'serviceStripes'; count: number; uniform: Build['uniform']; small: boolean }
  | { type: 'overseasBars'; count: number; uniform: Build['uniform']; small: boolean }
  | { type: 'tab'; label: string; color?: string; id?: string }
  | { type: 'rdi'; branch: Branch };

export type Surface = 'front' | 'leftLoop' | 'rightLoop' | 'leftSleeve' | 'rightSleeve';

/**
 * A dimension line drawn in the 3D view (like a tailor's callout).
 * Coordinates are in the item's surface space: front = [x, y];
 * sleeves = [across, along] where along is inches below the shoulder seam.
 */
export interface Measure {
  from: [number, number];
  to: [number, number];
  label: string;
}

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
  /** dimension callouts for this item */
  measures?: Measure[];
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
    rows.push({ order, r: { id: def.id, stripes: def.stripes, device: e.device, count: e.count, name: def.name } });
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

export interface SleeveBraid {
  width: number;
  color: 'gold' | 'braid';
  label: string;
}

/** Sleeve braid, lower edge 3 inches above the bottom of the sleeve (DA PAM 670-1 11-7e, 12-7e, 14-7c). */
export function sleeveBraid(b: Pick<Build, 'uniform' | 'rankId'>): SleeveBraid | null {
  const officer = rankById(b.rankId).category !== 'enlisted';
  if (b.uniform === 'ASU') return officer ? { width: 0.75, color: 'gold', label: '3/4-inch gold braid' } : { width: 0.125, color: 'gold', label: '1/8-inch soutache braid' };
  return officer ? { width: 0.5, color: 'braid', label: '1/2-inch cotton braid' } : null;
}

type Chosen = { e: Build['badges'][number]; def: BadgeDef };
const label = (x: Chosen) => x.def.name + (x.e.level ? ` (${x.e.level})` : '');

/**
 * Which badges go where, per DA PAM 670-1 22-16b(3):
 * - above the ribbons: at most three in total, only one of them from group 1 or 2
 * - pocket flap: up to three from groups 3–5 (incl. marksmanship and, on the ASU, tab metal replicas)
 * - extra group 1/2 badges are not worn at all (never on the flap)
 * - the driver badge is not worn above the ribbons
 */
export function badgePlan(b: Build) {
  const chosen = b.badges.map((e) => ({ e, def: badgeById(e.id) })).filter((x): x is Chosen => !!x.def);
  const byGroup = (x: Chosen) => x.def.group ?? 9;
  const g12 = chosen.filter((x) => x.def.group === 1 || x.def.group === 2).sort((a, z) => byGroup(a) - byGroup(z));
  const g34 = chosen.filter((x) => x.def.group === 3 || x.def.group === 4).sort((a, z) => byGroup(a) - byGroup(z));
  const drivers = chosen.filter((x) => x.def.group === 5 && x.def.kind !== 'marksmanship');
  const marks = chosen.filter((x) => x.def.kind === 'marksmanship');
  const replicas = b.uniform === 'ASU' ? chosen.filter((x) => x.def.kind === 'tab') : [];
  const above = [...g12.slice(0, 1)];
  const room = 3 - above.length;
  above.push(...g34.slice(0, room));
  const notWorn = g12.slice(1);
  const flapCandidates = [...g34.slice(room), ...replicas, ...drivers, ...marks];
  const flap = flapCandidates.slice(0, 3);
  const overflow = flapCandidates.slice(3);
  const undefinedGroup = chosen.filter((x) => (x.def.kind === 'skill' || x.def.kind === 'combat') && x.def.group === undefined);
  return { chosen, above, flap, notWorn, overflow, undefinedGroup };
}

export function layout(b: Build): PlacedItem[] {
  const g = coatGeometry(b);
  const rank = rankById(b.rankId);
  const branch = branchById(b.branchId);
  const officer = rank.category !== 'enlisted';
  const agsu = b.uniform === 'AGSU';
  const femaleAsu = !agsu && b.sex === 'female';
  const items: PlacedItem[] = [];
  const pk = g.pocket;
  const pcx = pk?.cx ?? 4.2;

  // Name plate: ASU only (DA PAM 14-5n: none on the AGSU).
  const npW = 3;
  const npH = 1;
  const npY = femaleAsu ? g.topButtonY + 1.5 + npH / 2 : pk ? pk.top - pk.flap / 2 + 0.05 : 0;
  if (!agsu) {
    items.push({
      key: 'nameplate',
      label: `Name plate (${b.lastName || 'NAME'})`,
      surface: 'front',
      x: -pcx,
      y: npY,
      w: npW,
      h: npH * 0.62,
      tex: { type: 'nameplate', text: (b.lastName || 'NAME').toUpperCase() },
      rule: femaleAsu
        ? 'Worn 1 to 2 inches above the top button, centered horizontally on the right side.'
        : 'Centered left to right on the flap of the right breast pocket, and centered between the top of the button and the top of the pocket.',
      citations: [C.nameplateAsu],
    });
  }

  // Reference lines: top of the breast pockets (male ASU, all AGSU) or the name plate (female ASU).
  const leftRef = femaleAsu ? npY - npH / 2 : pk!.top;
  const rightRef = femaleAsu ? npY + npH / 2 : pk!.top;

  // ----- ribbons
  const ribbons = sortedRibbons(b);
  const perRow = 3;
  const rack = rackSize(ribbons.length, perRow);
  let leftTop = leftRef;
  if (ribbons.length) {
    const bottom = femaleAsu ? leftRef : leftRef + 0.125;
    items.push({
      key: 'ribbons',
      label: `Ribbons (${ribbons.length})`,
      surface: 'front',
      x: pcx,
      y: bottom + rack.h / 2,
      w: rack.w,
      h: rack.h,
      tex: { type: 'rack', ribbons, perRow },
      rule: femaleAsu
        ? 'Centered on the left side, with the bottom row parallel to the bottom edge of the name plate. Worn right to left in order of precedence; no more than four per row; no space or 1/8 inch between rows.'
        : `Centered 1/8 inch above the left breast pocket${agsu ? ' (all Soldiers on the AGSU)' : ''}. Worn right to left in order of precedence, three or four per row depending on the lapel, no space or 1/8 inch between rows; the top row is centered or aligned to the wearer's left.`,
      citations: [C.ribbonsRack, PRECEDENCE_CITATION],
    });
    leftTop = bottom + rack.h;
  }

  // ----- badges
  const plan = badgePlan(b);
  let y = leftTop + 0.25;
  plan.above.forEach((x, i) => {
    const h = 0.7;
    items.push({
      key: `badge-${x.def.id}`,
      label: label(x),
      surface: 'front',
      x: pcx,
      y: y + h / 2,
      w: 2.4,
      h,
      tex: { type: 'badge', def: x.def, level: x.e.level },
      rule:
        i === 0
          ? 'Centered 1/4 inch above the ribbons (or the top of the pocket). No more than three badges above the ribbons, and only one from group 1 or 2.'
          : 'Centered 1/2 inch above the badge below it, in group order from top to bottom.',
      citations: [C.badgeSpacing, C.badgeGroups],
    });
    y += h + 0.5;
  });

  const flapY = femaleAsu ? leftRef - 0.25 - 0.35 : pk!.top - 0.125 - 0.35;
  const n = plan.flap.length;
  const spacing = n === 2 ? 2.25 : 1.5;
  plan.flap.forEach((x, i) => {
    const isTab = x.def.kind === 'tab';
    items.push({
      key: `flap-${x.def.id}`,
      label: isTab ? `${x.def.name} (metal replica)` : label(x),
      surface: 'front',
      x: pcx + (i - (n - 1) / 2) * spacing,
      y: flapY,
      w: isTab ? 1.4 : 1.2,
      h: isTab ? 0.35 : 0.7,
      tex: isTab ? { type: 'tab', label: x.def.label, color: '#c9b037', id: `${x.def.id}__metal` } : { type: 'badge', def: x.def, level: x.e.level },
      rule: femaleAsu
        ? 'Centered below the ribbons, upper portion 1/4 inch below the ribbon bar; up to three, equally spaced (at least 1 inch apart when two are worn).'
        : 'On the left pocket flap, upper portion about 1/8 inch below the top of the pocket: one centered; two equally spaced at least 1 inch apart; three equally spaced. Up to three from groups 3–5 (incl. marksmanship). Special skill badges sit to the wearer\'s right of marksmanship badges.',
      citations: isTab ? [C.tabReplicas, C.badgeFlap] : [C.marksmanship, C.badgeFlap],
    });
  });

  // ----- right side: unit awards → foreign badge → RDI
  let rightTop = rightRef;
  let rightHasItem = false;
  const ua = b.unitAwards
    .map((u) => ({ u, def: UNIT_AWARDS.find((d) => d.id === u.id) }))
    .filter((x) => !!x.def)
    .sort((a, z) => UNIT_AWARDS.indexOf(a.def!) - UNIT_AWARDS.indexOf(z.def!));
  if (ua.length) {
    const s = rackSize(ua.length, 3, 1.5, 0.5);
    const bottom = rightRef + (femaleAsu ? 0.5 : 0.125);
    items.push({
      key: 'unit-awards',
      label: `Unit awards (${ua.length})`,
      surface: 'front',
      x: -pcx,
      y: bottom + s.h / 2,
      w: s.w,
      h: s.h,
      tex: { type: 'rack', perRow: 3, ribbons: ua.map((x) => ({ id: x.def!.id, stripes: x.def!.stripes, name: x.def!.name, framed: true })) },
      rule: femaleAsu
        ? 'Bottom edge 1/2 inch above the top of the name plate. Rows of three, no space between emblems, up to 1/8 inch between rows.'
        : `Bottom edge 1/8 inch above the right breast pocket flap${agsu ? ' (all Soldiers on the AGSU; earned or current unit awards, not both)' : ''}. Rows of three, no space between emblems, up to 1/8 inch between rows.`,
      citations: agsu ? [C.unitAwards, C.unitAwardsAgsu, C.unitAwardsTemporary] : [C.unitAwards, C.unitAwardsTemporary],
    });
    rightTop = bottom + s.h;
    rightHasItem = true;
  }
  const foreign = plan.chosen.filter((x) => x.def.kind === 'foreign').slice(0, 1);
  foreign.forEach((x) => {
    const h = 0.9;
    const bottom = rightHasItem ? rightTop + 0.5 : femaleAsu ? rightRef + 0.5 : rightRef + 0.125;
    items.push({
      key: `foreign-${x.def.id}`,
      label: label(x),
      surface: 'front',
      x: -pcx,
      y: bottom + h / 2,
      w: 1.6,
      h,
      tex: { type: 'badge', def: x.def, level: x.e.level },
      rule: femaleAsu
        ? 'One foreign badge only: 1/2 inch above the name plate or 1/2 inch above any unit awards.'
        : 'One foreign badge only: centered 1/8 inch above the right pocket flap, or 1/2 inch above any unit awards. Requires at least one U.S. ribbon to be worn.',
      citations: [C.foreignBadges],
    });
    rightTop = bottom + h;
    rightHasItem = true;
  });
  if (b.rdi) {
    const bottom = rightHasItem ? rightTop + 0.25 : femaleAsu ? rightRef + 0.5 : rightRef + 0.125;
    items.push({
      key: 'rdi',
      label: 'Regimental distinctive insignia',
      surface: 'front',
      x: -pcx,
      y: bottom + 0.5,
      w: 1,
      h: 1,
      tex: { type: 'rdi', branch },
      rule: femaleAsu
        ? 'Centered 1/2 inch above the name plate, or 1/4 inch above any unit awards or foreign badge.'
        : 'Centered 1/8 inch above the top of the right pocket flap, or 1/4 inch above any unit awards or foreign badge.',
      citations: [C.rdi],
    });
  }

  // ----- identification badges (and the CSIB on the blues)
  const ids = plan.chosen.filter((x) => x.def.kind === 'id' && x.def.id !== 'CSIB');
  const idItems: { key: string; label: string; side: 1 | -1; tex: TextureSpec; w: number; h: number; cites: Citation[] }[] = ids.map((x) => ({
    key: `id-${x.def.id}`,
    label: x.def.name,
    side: x.def.side === 'left' ? 1 : -1,
    tex: { type: 'badge', def: x.def },
    w: 1.4,
    h: 1.4,
    cites: [C.idBadges],
  }));
  if (!agsu && b.hasCombatPatch) {
    idItems.unshift({ key: 'csib', label: 'Combat Service Identification Badge (in place of the combat patch)', side: -1, tex: { type: 'art', art: b.combatPatch }, w: 1.6, h: 1.9, cites: [C.csib, C.idBadges] });
  }
  for (const side of [-1, 1] as const) {
    const list = idItems.filter((i) => i.side === side).slice(0, agsu ? 1 : 2);
    list.forEach((it, k) => {
      const cy = femaleAsu ? g.topButtonY - 5 : pk!.top - pk!.flap - (pk!.height - pk!.flap) / 2;
      const offset = list.length === 2 ? (k === 0 ? -0.9 : 0.9) * -side : 0;
      items.push({
        key: it.key,
        label: it.label,
        surface: 'front',
        x: side * pcx + offset,
        y: cy,
        w: list.length === 2 ? Math.min(it.w, 1.3) : it.w,
        h: list.length === 2 ? Math.min(it.h, 1.5) : it.h,
        tex: it.tex,
        rule: femaleAsu
          ? `Wearer's ${side < 0 ? 'right' : 'left'} side, parallel to the waistline of the coat (1 inch between badges when two are worn).`
          : `Centered on the wearer's ${side < 0 ? 'right' : 'left'} pocket, between the bottom of the flap and the bottom of the pocket. ${agsu ? 'Only one ID badge per side on the AGSU.' : 'No more than two per side on the ASU (highest precedence to the wearer\'s right).'}`,
        citations: it.cites,
      });
    });
  }

  // ----- collar & lapel insignia
  const collarNote = femaleAsu ? ' (female ASU coat: measured about 5/8 inch up from the collar and lapel seam)' : '';
  /** a point `up` inches along the lapel's inside-edge axis from the notch (sculpted coat) */
  const fromNotch = (s: 1 | -1, up: number) => {
    const t = g.collarTilt ?? 0;
    return { x: s * (g.notchX - Math.sin(t) * up), y: g.notchY + Math.cos(t) * up };
  };
  const tilted = g.collarTilt !== undefined;
  if (officer) {
    ([-1, 1] as const).forEach((s) => {
      const usY = g.notchY + 0.625 + 0.2;
      const us = tilted ? fromNotch(s, 0.625 + 0.2) : { x: s * (g.notchX + 0.9), y: usY };
      const br = tilted ? fromNotch(s, 0.625 + 0.2 - 1.25) : { x: s * (g.notchX + 0.45), y: usY - 1.25 };
      items.push({
        key: `us-${s}`,
        label: 'U.S. insignia (officer)',
        surface: 'front',
        x: us.x,
        y: us.y,
        w: 0.75,
        h: 0.4,
        rot: s * 0.35,
        tex: { type: 'usLetters' },
        rule: `On both collars, 5/8 inch above the notch, centerline bisecting the notch and parallel to the inside edge of the lapel${collarNote}.`,
        citations: [C.collarInsignia],
      });
      items.push({
        key: `br-${s}`,
        label: `Branch insignia (${branch.name})`,
        surface: 'front',
        x: br.x,
        y: br.y,
        w: 0.85,
        h: 0.85,
        rot: s * 0.35,
        tex: { type: 'branchPin', branch },
        rule: 'On both lapels, about 1 1/4 inches below the U.S. insignia, centerline bisecting the centerline of the U.S. insignia and parallel to the inside edge of the lapel.',
        citations: [C.collarInsignia],
      });
    });
  } else {
    ([-1, 1] as const).forEach((s) => {
      items.push({
        key: `disk-${s}`,
        label: s < 0 ? 'U.S. insignia disk (right collar)' : `Branch insignia disk (${branch.name}, left collar)`,
        surface: 'front',
        ...(tilted ? fromNotch(s, 1.0 + 0.5) : { x: s * (g.notchX + 1.0), y: g.notchY + (femaleAsu ? 0.625 : 1.0) + 0.5 }),
        w: 1,
        h: 1,
        rot: s * 0.35,
        tex: { type: 'disk', variant: s < 0 ? 'us' : 'branch', branch },
        rule:
          (s < 0
            ? 'U.S. disk on the right collar: bottom of the disk about 1 inch above the notch, centerline parallel to the inside edge of the lapel'
            : 'Branch disk on the left collar: bottom of the disk about 1 inch above the notch, centerline bisecting the notch and parallel to the inside edge of the lapel') + collarNote + '.',
        citations: [C.collarInsignia],
      });
    });
  }

  // ----- shoulder loops: DUI and officer grade
  const loopLen = g.loopLength;
  const general = ['BG', 'MG', 'LTG', 'GEN'].includes(rank.id);
  (['leftLoop', 'rightLoop'] as const).forEach((surface) => {
    if (officer && !agsu) {
      items.push({
        key: `strap-${surface}`,
        label: `Shoulder strap (${rank.abbr})`,
        surface,
        x: loopLen / 2,
        y: 0,
        w: loopLen,
        h: 1.625,
        tex: { type: 'shoulderStrap', rank, branch },
        rule: 'Officers wear shoulder straps on the blue coat, centered lengthwise on the outside shoulder seam, in the first-named branch color (blue-black for general officers).',
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
        rule: 'Oxidized pin-on grade insignia on the shoulder loops, 5/8 inch from the outside shoulder seam, centered front to back.',
        citations: [C.rankInsignia],
      });
    }
    if (!general) {
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
          ? 'Centered on the shoulder loop an equal distance from the inside edge of the grade insignia to the outside edge of the button, base toward the shoulder seam.'
          : 'Centered on the shoulder loop an equal distance from the outside shoulder seam to the outside edge of the button, base toward the shoulder seam.',
        citations: [C.dui],
      });
    }
  });

  // ----- sleeves (SSI, tabs and SSI-MOHC are AGSU-only)
  let ssiBottom = 0;
  if (agsu) {
    const skillTabs = plan.chosen.filter((x) => x.def.kind === 'tab').slice(0, 2);
    const stateTabs = plan.chosen.filter((x) => x.def.id === 'GOV20');
    let along = 0.5;
    [...skillTabs, ...stateTabs].forEach((x) => {
      items.push({
        key: `tab-${x.def.id}`,
        label: x.def.name,
        surface: 'leftSleeve',
        x: 0,
        y: along + 0.25,
        w: 2.6,
        h: 0.5,
        tex: { type: 'tab', label: x.def.label, id: x.def.id },
        rule:
          x.def.kind === 'state'
            ? 'State tab: placement is set by your state\'s regulation (the Army pubs give none). Shown here above the SSI as a stand-in.'
            : 'Up to two skill tabs of your choosing, centered 1/4 inch above the SSI (plus any tab that is part of the unit SSI). The pamphlet does not say how far the SSI moves down to make room.',
        citations: x.def.kind === 'state' ? [C.stateBadges, C.stateReg] : [C.tabsAgsu],
      });
      along += 0.5 + 0.125;
    });
    if (skillTabs.length || stateTabs.length) along += 0.125;
    if (b.airborneTab) {
      items.push({
        key: 'airborne-tab',
        label: 'Airborne tab (part of the unit SSI)',
        surface: 'leftSleeve',
        x: 0,
        y: along + 0.2,
        w: 2.4,
        h: 0.4,
        tex: { type: 'tab', label: 'AIRBORNE', color: '#1b1b1b', id: 'AIRBORNE' },
        rule: 'Part of the unit\'s SSI, worn directly above it, and only while assigned to a unit whose SSI is approved with the tab.',
        citations: [C.airborneTab],
      });
      along += 0.4;
    }
    items.push({
      key: 'ssi',
      label: 'Shoulder sleeve insignia (current unit)',
      surface: 'leftSleeve',
      x: 0,
      y: along + 1.4,
      w: 2.5,
      h: 2.8,
      tex: { type: 'art', art: b.ssi },
      rule: 'Centered on the left sleeve, 1/2 inch below the top of the shoulder seam.',
      citations: [C.ssiCurrent],
    });
    ssiBottom = along + 2.8;
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
        rule: 'Centered on the right sleeve, 1/2 inch below the top of the shoulder seam. Wearing it is optional.',
        citations: [C.ssiMohc, C.ssiMohcEligibility],
      });
    }
  }

  const small = b.sex === 'female';
  if (!officer && rank.chevrons) {
    const size = chevronSize(rank, small);
    // centered between the shoulder seam and the elbow (elbow ≈ 55% down the sleeve)
    const midway = g.sleeveLength * 0.275;
    const cy = agsu ? Math.max(midway, ssiBottom + 0.5 + size.h / 2) : midway;
    (['leftSleeve', 'rightSleeve'] as const).forEach((surface) =>
      items.push({
        key: `chev-${surface}`,
        label: `Grade insignia (${rank.abbr})`,
        surface,
        x: 0,
        y: cy,
        w: size.w,
        h: size.h,
        tex: { type: 'chevrons', rank, uniform: b.uniform, small },
        rule: `${small ? 'Small' : 'Large'} insignia, ${size.w} inches wide (${small ? '1/4-inch chevrons and arcs, 5/32 inch apart' : '5/16-inch chevrons and arcs, 3/16 inch apart'}, 1/8-inch edging), centered on each sleeve between the shoulder seam and the elbow${agsu ? '; if the SSI doesn\'t allow that, 1/2 inch below the SSI. Heritage tan on heritage green' : '. Golden-light on Army blue'}.`,
        citations: [C.rankInsignia],
      }),
    );
  }

  const braid = sleeveBraid(b);
  const stripes = officer ? 0 : Math.min(15, Math.floor(b.yearsService / 3) + (b.yearsService >= 29.5 && b.yearsService < 30 ? 1 : 0));
  if (stripes > 0) {
    const size = serviceStripesSize(stripes, small, b.uniform);
    items.push({
      key: 'service-stripes',
      label: `Service stripes (${stripes})`,
      surface: 'leftSleeve',
      x: 0,
      y: g.sleeveLength - 4 - size.h / 2,
      w: size.w,
      h: size.h,
      tex: { type: 'serviceStripes', count: stripes, uniform: b.uniform, small },
      rule: agsu
        ? 'Left sleeve, outside bottom half, at 30 degrees with the lower end toward the front, 1/8 inch between stripes, as drawn in DA PAM 670-1 figure 21-148. Note: the text of para 21-28c(2) says "both sleeves, seam to seam", which conflicts with its own figure and matches the mess-uniform paragraph; we follow the figure. Confirm with your unit. One stripe per 3 years of creditable service.'
        : 'Left sleeve, outside bottom half, at 45 degrees with the lower end toward the inside seam, 4 inches from the bottom of the sleeve, 1/16 inch between stripes. One stripe per 3 years of creditable service.',
      citations: [C.serviceStripes, C.serviceStripesElig],
    });
  }
  const bars = Math.floor(b.monthsHostile / 6);
  if (bars > 0) {
    const base = officer && braid ? 3 + braid.width + 0.25 : 4;
    const size = overseasBarsSize(bars, small);
    items.push({
      key: 'overseas-bars',
      label: `Overseas service bars (${bars})`,
      surface: 'rightSleeve',
      x: 0,
      y: g.sleeveLength - base - size.h / 2,
      w: size.w,
      h: size.h,
      tex: { type: 'overseasBars', count: bars, uniform: b.uniform, small },
      rule: officer
        ? 'Right sleeve, outside bottom half, parallel to the bottom of the sleeve; lower edge 1/4 inch above the sleeve braid, 1/16 inch between bars. One bar per 6 months in a listed operation/area.'
        : 'Right sleeve, outside bottom half, parallel to the bottom of the sleeve; lower edge 4 inches above the bottom of the sleeve, 1/16 inch between bars. One bar per 6 months in a listed operation/area.',
      citations: [C.overseasBars, C.overseasBarsElig],
    });
  }

  addMeasures(items, g, { leftRef, rightRef, femaleAsu, officer, braid });
  return items;
}

function addMeasures(
  items: PlacedItem[],
  g: CoatGeometry,
  r: { leftRef: number; rightRef: number; femaleAsu: boolean; officer: boolean; braid: SleeveBraid | null },
) {
  const get = (k: string) => items.find((i) => i.key === k);
  const bottom = (i: PlacedItem) => i.y - i.h / 2;
  const top = (i: PlacedItem) => i.y + i.h / 2;
  const rib = get('ribbons');
  if (rib && !r.femaleAsu) rib.measures = [{ from: [rib.x + rib.w / 2 + 0.4, r.leftRef], to: [rib.x + rib.w / 2 + 0.4, bottom(rib)], label: '1/8 in' }];
  const firstBadge = items.find((i) => i.key.startsWith('badge-'));
  if (firstBadge) {
    const base = rib ? top(rib) : r.leftRef;
    firstBadge.measures = [{ from: [firstBadge.x - firstBadge.w / 2 - 0.4, base], to: [firstBadge.x - firstBadge.w / 2 - 0.4, bottom(firstBadge)], label: '1/4 in' }];
  }
  const ua = get('unit-awards');
  if (ua) ua.measures = [{ from: [ua.x - ua.w / 2 - 0.4, r.rightRef], to: [ua.x - ua.w / 2 - 0.4, bottom(ua)], label: r.femaleAsu ? '1/2 in' : '1/8 in' }];
  const fb = items.find((i) => i.key.startsWith('foreign-'));
  if (fb) fb.measures = [{ from: [fb.x - 1.1, ua ? top(ua) : r.rightRef], to: [fb.x - 1.1, bottom(fb)], label: ua || r.femaleAsu ? '1/2 in' : '1/8 in' }];
  const rdi = get('rdi');
  if (rdi) {
    const below = fb ? top(fb) : ua ? top(ua) : r.rightRef;
    rdi.measures = [{ from: [rdi.x - 1, below], to: [rdi.x - 1, bottom(rdi)], label: fb || ua ? '1/4 in' : r.femaleAsu ? '1/2 in' : '1/8 in' }];
  }
  const np = get('nameplate');
  if (np && g.pocket)
    np.measures = [
      { from: [np.x - g.pocket.width / 2, np.y + 0.9], to: [np.x, np.y + 0.9], label: 'center' },
      { from: [np.x, np.y + 0.9], to: [np.x + g.pocket.width / 2, np.y + 0.9], label: '' },
    ];
  for (const s of [-1, 1]) {
    const disk = get(`disk-${s}`);
    if (disk && !r.femaleAsu) disk.measures = [{ from: [disk.x + s * 0.9, g.notchY], to: [disk.x + s * 0.9, bottom(disk)], label: '1 in' }];
    const us = get(`us-${s}`);
    if (us && !r.femaleAsu) us.measures = [{ from: [us.x + s * 0.8, g.notchY], to: [us.x + s * 0.8, bottom(us)], label: '5/8 in' }];
    const br = get(`br-${s}`);
    if (br && us) br.measures = [{ from: [br.x + s * 0.9, us.y], to: [br.x + s * 0.9, br.y], label: '1 1/4 in' }];
  }
  const ssi = get('ssi');
  if (ssi) {
    const firstTab = items.find((i) => i.surface === 'leftSleeve' && i.key.startsWith('tab-'));
    if (firstTab) firstTab.measures = [{ from: [-1.7, firstTab.y + firstTab.h / 2], to: [-1.7, ssi.y - ssi.h / 2], label: '1/4 in' }];
    else ssi.measures = [{ from: [-ssi.w / 2 - 0.4, 0], to: [-ssi.w / 2 - 0.4, ssi.y - ssi.h / 2], label: '1/2 in' }];
  }
  const mohc = get('ssi-mohc');
  if (mohc) mohc.measures = [{ from: [mohc.w / 2 + 0.4, 0], to: [mohc.w / 2 + 0.4, mohc.y - mohc.h / 2], label: '1/2 in' }];
  const st = get('service-stripes');
  if (st) {
    st.measures = [{ from: [st.w / 2 + 0.5, g.sleeveLength], to: [st.w / 2 + 0.5, st.y + st.h / 2], label: '4 in' }];
  }
  const ob = get('overseas-bars');
  if (ob) {
    const base = r.officer && r.braid ? g.sleeveLength - 3 - r.braid.width : g.sleeveLength;
    ob.measures = [{ from: [ob.w / 2 + 0.5, base], to: [ob.w / 2 + 0.5, ob.y + ob.h / 2], label: r.officer && r.braid ? '1/4 in' : '4 in' }];
  }
}

export const ALL_BADGES = BADGES;
