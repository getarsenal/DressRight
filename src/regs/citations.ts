import type { Citation } from './types';

/**
 * Shared citations. Paragraph numbers are only filled in where a source
 * quoting the 2021 publications gave one; everything else carries a topic and
 * `verification: 'unverified'` until a maintainer checks the official PDF.
 */
export const C = {
  stateAwardsTitle10: {
    source: 'DAPAM670-1',
    topic: 'State and territory awards — Soldiers on active Federal service',
    quote:
      'Under the provisions of 10 USC, Soldiers on active Federal service are authorized to accept, but not wear State or territory awards.',
    verification: 'secondary',
  },
  stateAwardsArng: {
    source: 'AR670-1',
    topic: 'State awards — ARNG personnel under 32 USC',
    quote:
      'ARNG personnel are authorized to wear State awards under applicable State laws or regulations when assigned to the ARNG under the command and control of the Governor or Adjutant General, under the provisions of 32 USC.',
    verification: 'secondary',
  },
  stateAwardsOrder: {
    source: 'AR670-1',
    topic: 'State awards are worn after Federal and foreign awards, in the State order of precedence',
    verification: 'secondary',
  },
  stateReg: {
    source: 'STATE',
    topic: "Your state's awards regulation (eligibility, precedence and placement of state badges/tabs)",
    verification: 'unverified',
  },
  badgeGroups: {
    source: 'DAPAM670-1',
    para: '22-16',
    topic: 'Combat and special skill badges — groups and how many may be worn above the ribbons',
    verification: 'secondary',
  },
  badgeTotal: {
    source: 'DAPAM670-1',
    para: '22-16',
    topic: 'Total number of combat and special skill badges worn at one time (tabs excluded)',
    verification: 'secondary',
  },
  marksmanship: {
    source: 'DAPAM670-1',
    para: '22-15',
    topic: 'Marksmanship badges and tab — worn on the left pocket flap',
    verification: 'secondary',
  },
  ssiCurrent: {
    source: 'DAPAM670-1',
    para: '21-17',
    topic: 'Shoulder sleeve insignia — current organization (left sleeve)',
    verification: 'secondary',
  },
  ssiMohc: {
    source: 'AR670-1',
    topic:
      'SSI–Military Operations in Hostile Conditions (SSI-MOHC, formerly SSI-FWTS / "combat patch") — right sleeve',
    verification: 'secondary',
  },
  agsuCoat: {
    source: 'DAPAM670-1',
    topic: 'AGSU coat: insignia, accouterments, decorations, badges, unit awards and appurtenances (chs 14–15)',
    verification: 'unverified',
  },
  asuCoat: {
    source: 'DAPAM670-1',
    topic: 'Army blue service uniform coat: insignia, accouterments, decorations, badges and unit awards',
    verification: 'unverified',
  },
  agsuShirtNoUnitAwards: {
    source: 'DAPAM670-1',
    topic: 'Unit awards are not authorized on the Class B AGSU (shirt only)',
    verification: 'secondary',
  },
  agsuPossession: {
    source: 'AR670-1',
    topic: 'AGSU mandatory possession date 1 October 2027; ASU wear-out date 30 September 2027 (army.mil uniform FAQ citing AR 670-1)',
    verification: 'secondary',
  },
  serviceStripes: {
    source: 'AR670-1',
    topic: 'Service stripes — enlisted only, one per 3 years of honorable service, left sleeve',
    verification: 'unverified',
  },
  overseasBars: {
    source: 'AR670-1',
    topic: 'Overseas service bars — one per 6 months in a qualifying hostile-fire area, right sleeve',
    verification: 'unverified',
  },
  foreignBadges: {
    source: 'AR670-1',
    topic: 'Foreign badges — only one may be worn, right side',
    verification: 'unverified',
  },
  unitAwardsTemporary: {
    source: 'AR670-1',
    topic: 'Unit awards — permanent vs. temporary wear (temporary only while assigned to the cited unit)',
    verification: 'unverified',
  },
  rankInsignia: {
    source: 'AR670-1',
    topic: 'Grade insignia on the service and dress coats',
    verification: 'unverified',
  },
  collarInsignia: {
    source: 'DAPAM670-1',
    topic: 'U.S. and branch insignia — collar and lapel placement',
    verification: 'unverified',
  },
  ribbonsRack: {
    source: 'DAPAM670-1',
    topic: 'Wear of ribbons — rows, spacing and placement above the left pocket',
    verification: 'unverified',
  },
  tabsLimit: {
    source: 'AR670-1',
    topic: 'Special skill tabs — worn above the SSI; limit on number worn',
    verification: 'unverified',
  },
} satisfies Record<string, Citation>;
