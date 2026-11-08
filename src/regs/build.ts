import type { Component, DutyStatus, Sex, Uniform } from './types';
import type { DeviceKind } from './catalog/ribbons';

export interface RibbonEntry {
  id: string; // RibbonDef id, or 'STATE:<n>' for custom state ribbons
  device?: DeviceKind;
  /** number of devices, e.g. 2 OLCs, 3 knots, numeral 4 */
  count?: number;
}

export interface StateRibbon {
  key: string; // 'STATE:1'
  name: string;
  colors: string[]; // simple symmetric stripe colors, left half → center
}

export interface BadgeEntry {
  id: string;
  level?: string;
}

/** Image / generated insignia (DUI, SSI, SSI-MOHC combat patch). */
export interface InsigniaArt {
  mode: 'generated' | 'upload';
  /** data: URL when mode === 'upload' */
  dataUrl?: string;
  shape: 'shield' | 'circle' | 'oval' | 'square' | 'arrowhead';
  field: string;
  accent: string;
  text: string;
}

export interface Build {
  version: 1;
  uniform: Uniform;
  sex: Sex;
  component: Component;
  /** ARNG state/territory, e.g. "PA" */
  state: string;
  dutyStatus: DutyStatus;
  /** has the Soldier finished first-run setup */
  onboarded: boolean;
  rankId: string;
  branchId: string;
  lastName: string;
  yearsService: number;
  /** months spent in qualifying hostile-fire / imminent-danger areas */
  monthsHostile: number;
  dui: InsigniaArt;
  ssi: InsigniaArt;
  hasCombatPatch: boolean;
  combatPatch: InsigniaArt;
  airborneTab: boolean;
  /** temporary unit awards earned by your current unit vs permanent ones you earned */
  unitAwards: { id: string; permanent: boolean }[];
  ribbons: RibbonEntry[];
  stateRibbons: StateRibbon[];
  badges: BadgeEntry[];
  /** regimental distinctive insignia (affiliated regiment) */
  rdi: boolean;
  /** has the user reordered ribbons by hand instead of auto precedence */
  manualRibbonOrder: boolean;
}

const art = (shape: InsigniaArt['shape'], field: string, accent: string, text: string): InsigniaArt => ({
  mode: 'generated',
  shape,
  field,
  accent,
  text,
});

export const DEFAULT_BUILD: Build = {
  version: 1,
  uniform: 'AGSU',
  sex: 'male',
  component: 'RA',
  state: '',
  dutyStatus: 'T10',
  onboarded: false,
  rankId: 'SSG',
  branchId: 'IN',
  lastName: 'SOLDIER',
  yearsService: 7,
  monthsHostile: 12,
  dui: art('shield', '#2b6cb0', '#f1c40f', 'DUTY FIRST'),
  ssi: art('square', '#1f3a5f', '#d4af37', '1'),
  hasCombatPatch: true,
  combatPatch: art('circle', '#2f4f2f', '#c0392b', '★'),
  airborneTab: false,
  unitAwards: [{ id: 'MUC', permanent: false }],
  ribbons: [
    { id: 'ARCOM', device: 'olc', count: 1 },
    { id: 'AAM', device: 'olc', count: 2 },
    { id: 'AGCM', device: 'knot', count: 2 },
    { id: 'NDSM' },
    { id: 'ACM', device: 'star', count: 1 },
    { id: 'GWOTSM' },
    { id: 'NCOPDR', device: 'numeral', count: 2 },
    { id: 'ASR' },
    { id: 'OSR' },
  ],
  stateRibbons: [],
  badges: [
    { id: 'CIB', level: '1st award' },
    { id: 'PARA', level: 'Basic' },
    { id: 'RIFLE', level: 'Expert' },
  ],
  rdi: true,
  manualRibbonOrder: false,
};

const STORAGE_KEY = 'dressright.build.v1';

export function loadBuild(): Build {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BUILD;
    const parsed = JSON.parse(raw) as Partial<Build>;
    if (parsed.version !== 1) return DEFAULT_BUILD;
    return { ...DEFAULT_BUILD, ...parsed };
  } catch {
    return DEFAULT_BUILD;
  }
}

export function saveBuild(b: Build) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {
    /* storage unavailable (private mode / quota) – the app still works */
  }
}
