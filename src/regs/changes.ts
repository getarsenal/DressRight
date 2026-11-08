import type { Citation } from './types';
import { C } from './citations';

/**
 * "What changed" log for Soldiers who learned the uniform from an older
 * version or from someone else's coat. Newest first.
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
    date: '2026-05-11',
    pub: 'AR 600-8-22 (revision; admin revision 19 May 2026)',
    title: 'New badges, a renamed badge, and the Army Recruiting Ribbon',
    before: 'Driver and Mechanic Badge. No Master Combat badges or Mountaineering Badge. The Army Recruiting Ribbon was not in the order of precedence.',
    now:
      'Driver and Technician Badge. Master Combat Infantryman, Master Combat Medical and Master Combat Action badges and the Army Mountaineering Badge (est. 2024). Military Police and Retired Service ID badges. The Army Recruiting Ribbon sits between the Armed Forces Reserve Medal and the NCOPDR. DA PAM 670-1 (2021) has not yet added placement for the new badges.',
    citations: [C.newBadges, C.devices],
  },
  {
    date: '2025-03-04',
    pub: 'AR 670-1, Change 001',
    title: 'Administrative: "gender" changed to "sex"',
    before: '"Gender" used throughout.',
    now: '"Sex" used throughout. No change to uniform wear.',
    citations: [{ source: 'AR670-1', topic: 'Summary of change, 4 March 2025', verification: 'verified' }],
  },
  {
    date: '2021-01-26',
    pub: 'AR 670-1 / DA PAM 670-1 (major revision)',
    title: 'AGSU rules: no name plate, four badges, two tabs, stripes on both sleeves',
    before: 'Common setups carry over blue-uniform habits: a name plate on the right flap, five or six badges, three tabs, hash marks on the left sleeve only.',
    now: 'On the AGSU: no name plate; four badges total including marksmanship; two skill tabs of your choosing; service stripes on both sleeves at 30°; unit awards earned or current, not both.',
    citations: [C.agsuNoNameplate, C.badgeTotalAgsu, C.tabsAgsu, C.serviceStripes, C.unitAwardsAgsu],
  },
  {
    date: '2021-01-26',
    pub: 'AR 670-1 / DA PAM 670-1 (major revision)',
    title: 'Combat patch renamed SSI-MOHC; no patches on the blues',
    before: 'Right-sleeve patch called SSI-FWTS ("former wartime service"); patches often put on the blue coat.',
    now: 'Called SSI–military operations in hostile conditions (SSI-MOHC), on the AGSU only. On the blue ASU, the Combat Service Identification Badge takes its place on the right pocket.',
    citations: [C.ssiMohc, C.csib],
  },
  {
    date: '2021-01-26',
    pub: 'DA PAM 670-1 (major revision)',
    title: 'Badges above the ribbons: three total',
    before: 'A common reading: one combat/expert badge plus three skill badges above the ribbons, extras on the flap.',
    now: 'No more than three badges above the ribbons in total, only one from group 1 or 2. Group 1 and 2 badges are never worn on the pocket flap.',
    citations: [C.badgeGroups, C.badgeFlap],
  },
  {
    date: '2020',
    pub: 'Army uniform transition',
    title: 'AGSU replaces the blue ASU as the service uniform',
    before: 'The blue ASU was the service uniform ("Class A").',
    now: 'AGSU mandatory possession 1 Oct 2027; ASU wear-out date 30 Sep 2027.',
    citations: [C.agsuPossession],
  },
];
