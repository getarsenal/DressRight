import type { Citation } from '../types';

/**
 * Service ribbons, in Army order of precedence (AR 600-8-22 / AR 670-1).
 *
 * `stripes` is a left-to-right list of [color, relative width]. These are
 * VISUAL APPROXIMATIONS for the 3D preview only; they are not intended as a
 * color-standard reference.
 *
 * `group` drives where the item sits in the precedence order and which rules
 * apply (e.g. `state` ribbons are only wearable in state status).
 */
export type RibbonGroup =
  | 'decoration'
  | 'conduct'
  | 'service-medal'
  | 'service-ribbon'
  | 'foreign-decoration'
  | 'international'
  | 'state';

export type DeviceKind = 'olc' | 'knot' | 'star' | 'numeral' | 'V' | 'C' | 'R' | 'M' | 'hourglass' | 'arrowhead';

export interface RibbonDef {
  id: string;
  name: string;
  group: RibbonGroup;
  stripes: [string, number][];
  devices?: DeviceKind[];
}

const W = '#ffffff';
const R = '#b22234';
const B = '#1f3a93';
const LB = '#5dade2';
const G = '#1e8449';
const Y = '#f1c40f';
const O = '#d35400';
const K = '#1b1b1b';
const P = '#6c3483';
const BR = '#7b4a2a';
const MAR = '#7b241c';

export const RIBBONS: RibbonDef[] = [
  { id: 'MOH', name: 'Medal of Honor', group: 'decoration', stripes: [[LB, 1]] },
  { id: 'DSC', name: 'Distinguished Service Cross', group: 'decoration', stripes: [[B, 2], [W, 1], [R, 6], [W, 1], [B, 2]], devices: ['olc'] },
  { id: 'DDSM', name: 'Defense Distinguished Service Medal', group: 'decoration', stripes: [[R, 1], [Y, 2], [B, 6], [Y, 2], [R, 1]], devices: ['olc'] },
  { id: 'DSM', name: 'Distinguished Service Medal', group: 'decoration', stripes: [[R, 2], [B, 1], [W, 6], [B, 1], [R, 2]], devices: ['olc', 'C'] },
  { id: 'SS', name: 'Silver Star', group: 'decoration', stripes: [[Y, 1], [W, 1], [B, 2], [W, 1], [R, 2], [W, 1], [B, 2], [W, 1], [Y, 1]], devices: ['olc'] },
  { id: 'DSSM', name: 'Defense Superior Service Medal', group: 'decoration', stripes: [[R, 1], [W, 1], [B, 2], [Y, 4], [B, 2], [W, 1], [R, 1]], devices: ['olc'] },
  { id: 'LOM', name: 'Legion of Merit', group: 'decoration', stripes: [[W, 1], [MAR, 10], [W, 1]], devices: ['olc', 'C', 'R'] },
  { id: 'DFC', name: 'Distinguished Flying Cross', group: 'decoration', stripes: [[R, 1], [W, 1], [B, 3], [W, 1], [R, 1], [W, 1], [B, 3], [W, 1], [R, 1]], devices: ['olc', 'V', 'C'] },
  { id: 'SM', name: "Soldier's Medal", group: 'decoration', stripes: [[B, 3], [W, 1], [R, 1], [W, 1], [R, 1], [W, 1], [R, 1], [W, 1], [R, 1], [W, 1], [B, 3]], devices: ['olc'] },
  { id: 'BSM', name: 'Bronze Star Medal', group: 'decoration', stripes: [[R, 4], [W, 1], [B, 1], [R, 1], [B, 1], [W, 1], [R, 4]], devices: ['olc', 'V'] },
  { id: 'PH', name: 'Purple Heart', group: 'decoration', stripes: [[W, 1], [P, 10], [W, 1]], devices: ['olc'] },
  { id: 'DMSM', name: 'Defense Meritorious Service Medal', group: 'decoration', stripes: [[W, 1], [MAR, 3], [W, 1], [B, 2], [W, 1], [MAR, 3], [W, 1]], devices: ['olc'] },
  { id: 'MSM', name: 'Meritorious Service Medal', group: 'decoration', stripes: [[MAR, 2], [W, 1], [MAR, 6], [W, 1], [MAR, 2]], devices: ['olc', 'R'] },
  { id: 'AM', name: 'Air Medal', group: 'decoration', stripes: [[B, 2], [Y, 1], [B, 6], [Y, 1], [B, 2]], devices: ['numeral', 'V', 'C'] },
  { id: 'JSCM', name: 'Joint Service Commendation Medal', group: 'decoration', stripes: [[G, 1], [W, 1], [G, 2], [W, 1], [LB, 2], [W, 1], [G, 2], [W, 1], [G, 1]], devices: ['olc', 'V', 'C'] },
  { id: 'ARCOM', name: 'Army Commendation Medal', group: 'decoration', stripes: [[W, 1], [G, 4], [W, 1], [G, 4], [W, 1], [G, 4], [W, 1]], devices: ['olc', 'V', 'C', 'R'] },
  { id: 'JSAM', name: 'Joint Service Achievement Medal', group: 'decoration', stripes: [[R, 1], [W, 1], [B, 2], [LB, 3], [B, 2], [W, 1], [R, 1]], devices: ['olc', 'C'] },
  { id: 'AAM', name: 'Army Achievement Medal', group: 'decoration', stripes: [[G, 1], [W, 1], [B, 3], [W, 1], [G, 3], [W, 1], [B, 3], [W, 1], [G, 1]], devices: ['olc', 'C', 'R'] },
  { id: 'POW', name: 'Prisoner of War Medal', group: 'decoration', stripes: [[K, 1], [W, 1], [B, 1], [W, 1], [R, 4], [W, 1], [B, 1], [W, 1], [K, 1]], devices: ['star'] },
  { id: 'AGCM', name: 'Army Good Conduct Medal', group: 'conduct', stripes: [[R, 1], [W, 0.4], [R, 1], [W, 0.4], [R, 1], [W, 0.4], [R, 1], [W, 0.4], [R, 1]], devices: ['knot'] },
  { id: 'ARCAM', name: 'Army Reserve Components Achievement Medal', group: 'conduct', stripes: [[R, 2], [B, 1], [R, 2], [W, 0.5], [B, 1], [W, 0.5], [R, 2], [B, 1], [R, 2]], devices: ['olc'] },
  { id: 'NDSM', name: 'National Defense Service Medal', group: 'service-medal', stripes: [[R, 4], [W, 0.5], [B, 0.5], [W, 0.5], [R, 0.5], [Y, 3], [R, 0.5], [W, 0.5], [B, 0.5], [W, 0.5], [R, 4]], devices: ['star'] },
  { id: 'AFEM', name: 'Armed Forces Expeditionary Medal', group: 'service-medal', stripes: [[G, 1], [Y, 0.7], [BR, 0.7], [K, 0.7], [W, 0.5], [R, 1], [W, 0.5], [B, 1], [W, 0.5], [R, 1], [W, 0.5], [K, 0.7], [BR, 0.7], [Y, 0.7], [G, 1]], devices: ['star', 'arrowhead'] },
  { id: 'SWASM', name: 'Southwest Asia Service Medal', group: 'service-medal', stripes: [[BR, 2], [K, 0.5], [W, 0.4], [R, 0.4], [W, 0.4], [B, 0.4], [G, 2], [B, 0.4], [W, 0.4], [R, 0.4], [W, 0.4], [K, 0.5], [BR, 2]], devices: ['star'] },
  { id: 'KCM', name: 'Kosovo Campaign Medal', group: 'service-medal', stripes: [[R, 2], [W, 0.5], [B, 3], [W, 0.5], [R, 2]], devices: ['star'] },
  { id: 'ACM', name: 'Afghanistan Campaign Medal', group: 'service-medal', stripes: [[G, 1], [K, 1], [R, 1], [W, 0.5], [R, 1], [W, 0.5], [B, 1], [W, 0.5], [R, 1], [W, 0.5], [R, 1], [K, 1], [G, 1]], devices: ['star', 'arrowhead'] },
  { id: 'ICM', name: 'Iraq Campaign Medal', group: 'service-medal', stripes: [[G, 1], [W, 0.5], [K, 1], [Y, 3], [R, 1], [W, 0.5], [B, 1], [W, 0.5], [R, 1], [Y, 3], [K, 1], [W, 0.5], [G, 1]], devices: ['star', 'arrowhead'] },
  { id: 'IRCM', name: 'Inherent Resolve Campaign Medal', group: 'service-medal', stripes: [[K, 1], [Y, 1], [BR, 3], [B, 1], [W, 0.5], [R, 1], [W, 0.5], [B, 1], [BR, 3], [Y, 1], [K, 1]], devices: ['star', 'arrowhead'] },
  { id: 'GWOTEM', name: 'Global War on Terrorism Expeditionary Medal', group: 'service-medal', stripes: [[B, 1], [Y, 4], [W, 0.5], [R, 1], [W, 0.5], [B, 1], [W, 0.5], [R, 1], [W, 0.5], [Y, 4], [B, 1]], devices: ['star', 'arrowhead'] },
  { id: 'GWOTSM', name: 'Global War on Terrorism Service Medal', group: 'service-medal', stripes: [[B, 2], [Y, 3], [R, 0.6], [W, 0.6], [B, 0.6], [W, 0.6], [R, 0.6], [Y, 3], [B, 2]] },
  { id: 'KDSM', name: 'Korea Defense Service Medal', group: 'service-medal', stripes: [[G, 1], [Y, 0.5], [G, 3], [B, 1], [W, 0.5], [R, 1], [W, 0.5], [B, 1], [G, 3], [Y, 0.5], [G, 1]] },
  { id: 'AFSM', name: 'Armed Forces Service Medal', group: 'service-medal', stripes: [[G, 1], [Y, 1], [LB, 4], [Y, 1], [LB, 4], [Y, 1], [G, 1]], devices: ['star'] },
  { id: 'HSM', name: 'Humanitarian Service Medal', group: 'service-medal', stripes: [[B, 2], [W, 0.5], [P, 2], [W, 0.5], [P, 2], [W, 0.5], [P, 2], [W, 0.5], [B, 2]], devices: ['star'] },
  { id: 'MOVSM', name: 'Military Outstanding Volunteer Service Medal', group: 'service-medal', stripes: [[B, 1], [W, 0.6], [G, 4], [O, 1], [G, 4], [W, 0.6], [B, 1]], devices: ['star'] },
  { id: 'AFRM', name: 'Armed Forces Reserve Medal', group: 'service-medal', stripes: [[Y, 2], [LB, 0.7], [Y, 2], [LB, 0.7], [Y, 2], [LB, 0.7], [Y, 2]], devices: ['hourglass', 'M', 'numeral'] },
  { id: 'ARR', name: 'Army Recruiting Ribbon', group: 'service-ribbon', stripes: [[B, 2], [W, 0.6], [R, 1], [Y, 3], [R, 1], [W, 0.6], [B, 2]], devices: ['numeral'] },
  { id: 'NCOPDR', name: 'NCO Professional Development Ribbon', group: 'service-ribbon', stripes: [[Y, 2], [B, 1], [Y, 0.5], [G, 3], [Y, 0.5], [B, 1], [Y, 2]], devices: ['numeral'] },
  { id: 'ASR', name: 'Army Service Ribbon', group: 'service-ribbon', stripes: [[R, 1], [O, 1], [Y, 1], [G, 1], [B, 1], [P, 1], [B, 1], [G, 1], [Y, 1], [O, 1], [R, 1]] },
  { id: 'OSR', name: 'Overseas Service Ribbon', group: 'service-ribbon', stripes: [[B, 2], [W, 0.4], [R, 0.4], [Y, 4], [G, 0.4], [Y, 4], [R, 0.4], [W, 0.4], [B, 2]], devices: ['numeral'] },
  { id: 'ARCOTR', name: 'Army Reserve Components Overseas Training Ribbon', group: 'service-ribbon', stripes: [[G, 2], [W, 0.4], [R, 0.4], [W, 0.4], [Y, 4], [B, 0.6], [Y, 4], [W, 0.4], [R, 0.4], [W, 0.4], [G, 2]], devices: ['numeral'] },
  { id: 'NATO', name: 'NATO Medal', group: 'international', stripes: [[B, 4], [W, 1], [B, 4]], devices: ['star'] },
  { id: 'MFO', name: 'Multinational Force and Observers Medal', group: 'international', stripes: [[O, 3], [W, 1], [O, 3]], devices: ['numeral'] },
  { id: 'KLM-SA', name: 'Kuwait Liberation Medal (Saudi Arabia)', group: 'international', stripes: [[G, 1], [W, 0.6], [K, 0.6], [W, 0.6], [G, 6], [W, 0.6], [K, 0.6], [W, 0.6], [G, 1]] },
  { id: 'KLM-K', name: 'Kuwait Liberation Medal (Government of Kuwait)', group: 'international', stripes: [[R, 2], [W, 2], [G, 2], [K, 2]] },
];

/** Placeholder entries a Guard Soldier can rename/recolor for their state. */
export const STATE_RIBBON_TEMPLATE: RibbonDef = {
  id: 'STATE',
  name: 'State award',
  group: 'state',
  stripes: [[B, 3], [Y, 2], [B, 3]],
  devices: ['olc'],
};

export const GROUP_ORDER: RibbonGroup[] = [
  'decoration',
  'conduct',
  'service-medal',
  'service-ribbon',
  'foreign-decoration',
  'international',
  'state',
];

export const PRECEDENCE_CITATION: Citation = {
  source: 'DAPAM670-1',
  para: '22-5',
  topic: 'Order of precedence of U.S. decorations and service medals/ribbons (with AR 670-1 para 22-4 and AR 600-8-22 app B)',
  verification: 'verified',
};

export const ribbonById = (id: string): RibbonDef | undefined =>
  RIBBONS.find((r) => r.id === id);

export interface UnitAwardDef {
  id: string;
  name: string;
  stripes: [string, number][];
}

/** U.S. Army unit awards (worn in gold frames above the right pocket). */
export const UNIT_AWARDS: UnitAwardDef[] = [
  { id: 'PUC', name: 'Presidential Unit Citation', stripes: [[B, 1]] },
  { id: 'JMUA', name: 'Joint Meritorious Unit Award', stripes: [[B, 1], [Y, 1], [R, 2], [Y, 1], [B, 1]] },
  { id: 'VUA', name: 'Valorous Unit Award', stripes: [[R, 1], [W, 0.4], [B, 2], [W, 0.4], [R, 1]] },
  { id: 'MUC', name: 'Meritorious Unit Commendation', stripes: [[R, 1]] },
  { id: 'ASUA', name: 'Army Superior Unit Award', stripes: [[R, 1], [G, 0.3], [Y, 3], [G, 0.3], [R, 1]] },
];
