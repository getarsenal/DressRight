/**
 * Badges and tabs. `kind` controls where a badge goes and which limits apply.
 *
 * - combat       : CIB / CAB / CMB, worn above ribbons
 * - skill        : special skill badges (parachutist, air assault, EIB, ESB …),
 *                  worn above ribbons or on the pocket flap
 * - marksmanship : rifle/pistol qualification badges and Driver & Mechanic,
 *                  worn on the left pocket flap
 * - id           : identification badges, worn on the pocket (side varies)
 * - foreign      : badges awarded by a foreign government (one only)
 * - tab          : special skill tabs (cloth on AGSU sleeve; metal replicas
 *                  on the left side of the coat)
 * - state        : state-awarded badges/tabs (ARNG, state status only)
 */
export type BadgeKind = 'combat' | 'skill' | 'marksmanship' | 'id' | 'foreign' | 'tab' | 'state';

export interface BadgeDef {
  id: string;
  name: string;
  kind: BadgeKind;
  /** finish used by the procedural texture */
  metal: 'silver' | 'gold' | 'blue-silver' | 'oxidized' | 'cloth';
  /** short text drawn on the stylized badge */
  label: string;
  /** levels such as Basic/Senior/Master, shown as a selector */
  levels?: string[];
  /** id badges: which pocket */
  side?: 'left' | 'right';
  /**
   * Combat & special skill badge group (DA PAM 670-1 para 22-16, per a
   * secondary-source summary — verify). Only one group 1 or 2 badge is worn
   * above the ribbons; up to three from groups 3–4 may be worn above it.
   */
  group?: 1 | 2 | 3 | 4 | 5;
}

export const BADGES: BadgeDef[] = [
  // combat
  { id: 'CIB', name: 'Combat Infantryman Badge', kind: 'combat', metal: 'blue-silver', label: 'CIB', levels: ['1st award', '2nd award', '3rd award'], group: 1 },
  { id: 'CAB', name: 'Combat Action Badge', kind: 'combat', metal: 'silver', label: 'CAB', levels: ['1st award', '2nd award', '3rd award'], group: 1 },
  { id: 'CMB', name: 'Combat Medical Badge', kind: 'combat', metal: 'silver', label: 'CMB', levels: ['1st award', '2nd award', '3rd award'], group: 1 },
  // special skill
  { id: 'EIB', name: 'Expert Infantryman Badge', kind: 'skill', metal: 'blue-silver', label: 'EIB', group: 2 },
  { id: 'ESB', name: 'Expert Soldier Badge', kind: 'skill', metal: 'silver', label: 'ESB', group: 2 },
  { id: 'EFMB', name: 'Expert Field Medical Badge', kind: 'skill', metal: 'silver', label: 'EFMB', group: 2 },
  { id: 'PARA', name: 'Parachutist Badge', kind: 'skill', metal: 'silver', label: 'AIRBORNE', levels: ['Basic', 'Senior', 'Master'], group: 4 },
  { id: 'AASLT', name: 'Air Assault Badge', kind: 'skill', metal: 'silver', label: 'AIR ASLT', group: 4 },
  { id: 'PF', name: 'Pathfinder Badge', kind: 'skill', metal: 'silver', label: 'PATHFNDR', group: 4 },
  { id: 'MFF', name: 'Military Free Fall Parachutist Badge', kind: 'skill', metal: 'silver', label: 'MFF', levels: ['Basic', 'Jumpmaster'], group: 4 },
  { id: 'AVN', name: 'Army Aviator Badge', kind: 'skill', metal: 'silver', label: 'AVIATOR', levels: ['Basic', 'Senior', 'Master'], group: 3 },
  { id: 'EOD', name: 'Explosive Ordnance Disposal Badge', kind: 'skill', metal: 'silver', label: 'EOD', levels: ['Basic', 'Senior', 'Master'], group: 3 },
  { id: 'DIVER', name: 'Diver Badge', kind: 'skill', metal: 'silver', label: 'DIVER', group: 4 },
  // marksmanship
  { id: 'RIFLE', name: 'Marksmanship Qualification Badge', kind: 'marksmanship', metal: 'silver', label: 'RIFLE', levels: ['Marksman', 'Sharpshooter', 'Expert'] },
  { id: 'PISTOL', name: 'Marksmanship Qualification Badge (Pistol bar)', kind: 'marksmanship', metal: 'silver', label: 'PISTOL', levels: ['Marksman', 'Sharpshooter', 'Expert'] },
  { id: 'DRVR', name: 'Driver and Mechanic Badge', kind: 'skill', metal: 'silver', label: 'DRIVER', group: 5 },
  // identification
  { id: 'DS', name: 'Drill Sergeant Identification Badge', kind: 'id', metal: 'gold', label: 'DS', side: 'right' },
  { id: 'REC', name: 'Recruiter Identification Badge', kind: 'id', metal: 'silver', label: 'REC', side: 'right' },
  { id: 'ASIB', name: 'Army Staff Identification Badge', kind: 'id', metal: 'gold', label: 'ARSTAF', side: 'right' },
  { id: 'TOMB', name: 'Tomb of the Unknown Soldier Guard Identification Badge', kind: 'id', metal: 'oxidized', label: 'TOMB', side: 'left' },
  // foreign
  { id: 'GAFPB', name: 'German Armed Forces Proficiency Badge', kind: 'foreign', metal: 'gold', label: 'GAFPB', levels: ['Bronze', 'Silver', 'Gold'] },
  { id: 'FPARA', name: 'Foreign Parachutist Badge', kind: 'foreign', metal: 'silver', label: 'FGN JUMP' },
  // tabs
  { id: 'RANGER', name: 'Ranger Tab', kind: 'tab', metal: 'cloth', label: 'RANGER' },
  { id: 'SFTAB', name: 'Special Forces Tab', kind: 'tab', metal: 'cloth', label: 'SPECIAL FORCES' },
  { id: 'SAPPER', name: 'Sapper Tab', kind: 'tab', metal: 'cloth', label: 'SAPPER' },
  { id: 'P100', name: "President's Hundred Tab", kind: 'tab', metal: 'cloth', label: "PRESIDENT'S HUNDRED" },
  // state
  { id: 'GOV20', name: "Governor's Twenty Tab / Badge (state marksmanship)", kind: 'state', metal: 'cloth', label: "GOVERNOR'S TWENTY" },
];

export const badgeById = (id: string) => BADGES.find((b) => b.id === id);
