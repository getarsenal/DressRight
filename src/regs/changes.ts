import type { Citation } from './types';
import { C } from './citations';

/**
 * "What changed" log, aimed at the Soldier who learned the uniform from an
 * older version. Newest first. Add an entry every time the rule data changes
 * because the regulation changed.
 */
export interface Change {
  /** ISO date, or just a year when the exact date isn't confirmed */
  date: string;
  pub: string;
  title: string;
  before: string;
  now: string;
  citations: Citation[];
}

export const CHANGES: Change[] = [
  {
    date: '2025-03-04',
    pub: 'AR 670-1, Change 001',
    title: 'AGSU policy implemented; terminology updated',
    before: 'AGSU wear guidance lived largely in Army Directives and messages.',
    now: 'AGSU policy is written into the regulation. "Gender" is replaced with "sex" throughout. ACU sleeve-roll guidance corrected.',
    citations: [C.agsuCoat],
  },
  {
    date: '2021-01-26',
    pub: 'AR 670-1 / DA PAM 670-1 (revision)',
    title: 'Combat patch renamed SSI-MOHC',
    before: 'Right-sleeve patch called SSI-FWTS ("former wartime service").',
    now: 'Called SSI-MOHC, Shoulder Sleeve Insignia – Military Operations in Hostile Conditions.',
    citations: [C.ssiMohc],
  },
  {
    date: '2021-01-26',
    pub: 'DA PAM 670-1 (revision)',
    title: 'Combat and special skill badge groups',
    before: 'Older guidance used five badge groups and a five-badge total.',
    now: 'Badges are grouped differently and up to six combat/special skill badges may be worn (tabs excluded). Only one group 1 or 2 badge above the ribbons.',
    citations: [C.badgeGroups, C.badgeTotal],
  },
  {
    date: '2020',
    pub: 'Army uniform transition',
    title: 'AGSU replaces the blue ASU for daily service wear',
    before: 'The blue ASU was the service uniform ("Class A").',
    now: 'The AGSU is the service uniform; mandatory possession 1 Oct 2027. The blues remain as a dress uniform.',
    citations: [C.agsuPossession],
  },
];
