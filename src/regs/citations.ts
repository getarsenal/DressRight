import type { Citation } from './types';

/**
 * Shared citations. Paragraphs marked `verified` were checked against the
 * official PDFs from armypubs.army.mil on 2026-11-08 (AR 670-1, 26 Jan 2021
 * w/ Change 001; DA PAM 670-1, 26 Jan 2021; AR 600-8-22, 11 May 2026).
 */
export const C = {
  // ---------------------------------------------------------------- state awards
  stateAwardsTitle10: {
    source: 'DAPAM670-1',
    para: '22-5j',
    topic: 'State and territory awards: Soldiers on active Federal service',
    quote:
      'Under the provisions of 10 USC, Soldiers on active Federal service are authorized to accept, but not wear State or territory awards.',
    verification: 'verified',
  },
  stateAwardsArng: {
    source: 'DAPAM670-1',
    para: '22-5j',
    topic: 'State awards: ARNG personnel under 32 USC, and the statuses covered',
    quote:
      'Army National Guard (ARNG) personnel are authorized to wear State awards under applicable State laws or regulations when assigned to the ARNG under the command and control of the governor or Adjutant General. … The following personnel statuses are included in this authorization: Active Guard Reserve; active duty for training; active duty for special work; full-time National Guard duty for special work or training; annual training; and inactive duty training (drill status)',
    verification: 'verified',
  },
  stateAwardsOrder: {
    source: 'AR670-1',
    para: '22-4j',
    topic: 'State awards for ARNG Soldiers are the last category in the order of precedence (after Federal and foreign awards; DA PAM 22-5j: "in the State order of precedence")',
    quote: 'j. State awards for ARNG Soldiers.',
    verification: 'verified',
  },
  stateBadges: {
    source: 'AR670-1',
    para: '22-13a',
    topic: 'State-awarded badges are not authorized, except for ARNG Soldiers in their State status',
    quote:
      'Badges awarded by States and other jurisdictions inferior to the U.S. Government, except as provided in DA Pam 670–1 for ARNG Soldiers in their State status.',
    verification: 'verified',
  },
  stateReg: {
    source: 'STATE',
    topic: "Your state's awards regulation (eligibility, precedence and placement of state badges/tabs). The Army pubs give no placement for state badges or tabs.",
    verification: 'unverified',
  },

  // ---------------------------------------------------------------- badges
  badgeGroups: {
    source: 'DAPAM670-1',
    para: '22-16a, b(3)',
    topic: 'Combat and special skill badge groups; no more than three badges above the ribbons, only one from group 1 or 2',
    quote:
      'One badge from either group 1 or group 2 may be worn with badges from groups 3, 4, and 5, provided that the total number of badges worn above the ribbons … does not exceed three.',
    verification: 'verified',
  },
  badgeFlap: {
    source: 'DAPAM670-1',
    para: '22-16b(3)(b)',
    topic: 'Pocket flap: up to three badges from groups 3–5; groups 1 and 2 never on the flap',
    quote:
      'Only three badges from groups 3, 4, or 5, to include marksmanship badges, can be worn below the ribbons on the pocket flap … Badges from groups 1 and 2 are not authorized for wear below the ribbons on the pocket flap',
    verification: 'verified',
  },
  badgeTotalAsu: {
    source: 'DAPAM670-1',
    para: '22-16b(1)',
    topic: 'ASU: six badges total, including marksmanship badges (tab metal replicas not counted)',
    quote: 'A total of six badges are authorized for wear at one time',
    verification: 'verified',
  },
  badgeTotalAgsu: {
    source: 'DAPAM670-1',
    para: '22-16b(2)',
    topic: 'AGSU: four badges total, including marksmanship; tab metal replicas not authorized; all Soldiers follow the male placement',
    quote:
      'A total of four badges are authorized for wear at one time …, to include any marksmanship badges worn … Special skill tab metal replicas are not authorized for wear on the AGSU.',
    verification: 'verified',
  },
  badgeSpacing: {
    source: 'DAPAM670-1',
    para: '22-16b(3)(d)',
    topic: 'Badges 1/4 inch above the ribbons, 1/2 inch between badges, in group order top to bottom',
    verification: 'verified',
  },
  newBadges: {
    source: 'AR600-8-22',
    para: '8-6 to 8-8, 8-26',
    topic: 'Master Combat badges and Army Mountaineering Badge (established 2024). DA PAM 670-1 (2021) does not yet give their wear group or placement.',
    verification: 'verified',
  },
  marksmanship: {
    source: 'DAPAM670-1',
    para: '22-15c–d',
    topic: 'Marksmanship badges: left pocket flap, upper portion about 1/8 inch below the top of the pocket; up to three; at least 1 inch between two',
    verification: 'verified',
  },
  tabReplicas: {
    source: 'DAPAM670-1',
    para: '22-16b(3)(g), 22-16f(3)',
    topic: 'Skill tab metal replicas: ASU only, on the pocket flap (male) or 1/4 inch below the ribbons (female); never above the ribbons',
    quote: 'special skill tab metal replicas may not be worn above the ribbons',
    verification: 'verified',
  },
  tabsAgsu: {
    source: 'DAPAM670-1',
    para: '22-16f(2)',
    topic: 'AGSU: two skill tabs of the Soldier’s choosing, plus a tab that is part of the unit SSI, 1/4 inch above the SSI',
    quote:
      'Two tabs of the Soldier’s choosing may be sewn on the AGSU coat. The special skill tab will be centered both vertically and horizontally 1/4 inch above the SSI on the left sleeve of the AGSU coat',
    verification: 'verified',
  },
  airborneTab: {
    source: 'AR670-1',
    para: '22-12f(2)–(3)',
    topic: 'Airborne and similar tabs are part of the unit SSI and worn only while assigned to that unit',
    verification: 'verified',
  },
  idBadges: {
    source: 'DAPAM670-1',
    para: '22-17c, e',
    topic: 'Identification badges: which side; no more than two per side on the ASU and one per side on the AGSU',
    verification: 'verified',
  },
  csib: {
    source: 'DAPAM670-1',
    para: '22-17e(5)',
    topic: 'Combat Service Identification Badge: worn on the blue ASU in place of the SSI-MOHC, right side',
    quote:
      'is a pin-on badge authorized to be worn on the Army service/dress uniform and the mess and evening mess uniforms in place of the SSI–MOHC',
    verification: 'verified',
  },
  foreignBadges: {
    source: 'DAPAM670-1',
    para: '22-18a–b',
    topic: 'Foreign badges: one only; 1/8 inch above the right pocket flap or 1/2 inch above unit awards; requires at least one U.S. ribbon; no cloth-only badges',
    quote: 'Personnel may not wear a foreign badge unless at least one U.S. medal or service ribbon is worn at the same time.',
    verification: 'verified',
  },
  otherServiceBadges: {
    source: 'AR670-1',
    para: '22-12g, 22-12c',
    topic: 'Badges from other U.S. Services need written HRC authority; similar badges only if no Army badge in that group; their marksmanship badges are not authorized',
    verification: 'verified',
  },

  // ---------------------------------------------------------------- sleeves
  ssiCurrent: {
    source: 'DAPAM670-1',
    para: '21-17c(2)',
    topic: 'SSI of current organization: AGSU coat, left sleeve, 1/2 inch below the shoulder seam (not authorized on the blue ASU coat)',
    quote:
      'Nonsubdued SSI of an individual’s current organization will be worn centered on the left sleeve 1/2 inch below the top of the shoulder seam on the coats of the AGSU for all personnel',
    verification: 'verified',
  },
  ssiMohc: {
    source: 'DAPAM670-1',
    para: '21-18b(2)',
    topic: 'SSI–military operations in hostile conditions (SSI-MOHC, formerly SSI-FWTS): AGSU coat, right sleeve, 1/2 inch below the shoulder seam',
    quote:
      'Authorized personnel may wear the nonsubdued SSI–MOHC on the right sleeve of the AGSU coat for all personnel. The insignia will be worn centered 1/2 inch below the top of the right shoulder seam',
    verification: 'verified',
  },
  ssiMohcEligibility: {
    source: 'AR670-1',
    para: '21-18a',
    topic: 'SSI-MOHC eligibility (hostile action/fire exposure, CZTE with HFP/IDP, or GO request)',
    verification: 'verified',
  },
  serviceStripes: {
    source: 'DAPAM670-1',
    para: '21-28c',
    topic:
      'Service stripes: ASU left sleeve at 45°, 4 inches from the bottom. AGSU: text says both sleeves at 30° seam to seam, but figure 21-148 shows the left sleeve only (text appears copied from the mess-uniform paragraph)',
    verification: 'verified',
  },
  stripeSizes: {
    source: 'DAPAM670-1',
    para: '21-7b, 21-28a–b, 21-29a–b',
    topic: 'Sizes: large chevrons 3 in wide (5/16-in bands, 3/16-in spaces); service stripes and overseas bars 3/16 x 1-5/16 in on a 3/32-in border',
    verification: 'verified',
  },
  serviceStripesElig: {
    source: 'AR670-1',
    para: '21-28a–b',
    topic: 'Service stripes: enlisted only; one per 3 years of active Federal service and/or Reserve service creditable for non-regular retirement; 10th stripe at 29 1/2 years',
    verification: 'verified',
  },
  overseasBars: {
    source: 'DAPAM670-1',
    para: '21-29d',
    topic: 'Overseas service bars: right sleeve; officers 1/4 inch above the sleeve braid, enlisted 4 inches above the bottom',
    verification: 'verified',
  },
  overseasBarsElig: {
    source: 'AR670-1',
    para: '21-29a',
    topic: 'Overseas service bars: one per 6 months in the listed operations/areas and dates (e.g. OEF, OIF, OND, OIR, OFS)',
    verification: 'verified',
  },
  rankInsignia: {
    source: 'DAPAM670-1',
    para: '21-6, 21-7, 21-8',
    topic: 'Grade insignia: enlisted chevrons midway between shoulder seam and elbow (AGSU: 1/2 inch below the SSI if needed); officers 5/8 inch from the seam on AGSU loops; shoulder straps on the ASU',
    verification: 'verified',
  },
  sleeveBraid: {
    source: 'DAPAM670-1',
    para: '11-7e, 12-7e, 14-7c',
    topic: 'Sleeve braid 3 inches above the sleeve bottom: ASU officers 3/4-inch gold braid, ASU enlisted 1/8-inch soutache; AGSU officers 1/2-inch braid, AGSU enlisted plain',
    verification: 'verified',
  },

  // ---------------------------------------------------------------- coat front
  agsuNoNameplate: {
    source: 'DAPAM670-1',
    para: '14-5n',
    topic: 'No name plate on the AGSU',
    quote: 'No nameplate will be worn with the Class A or Class B AGSU.',
    verification: 'verified',
  },
  nameplateAsu: {
    source: 'DAPAM670-1',
    para: '21-25c(2)',
    topic: 'Name plate (ASU only): male, on the right pocket flap between the top of the button and top of the pocket; female, 1–2 inches above the top button',
    verification: 'verified',
  },
  ribbonsRack: {
    source: 'DAPAM670-1',
    para: '22-6a(2)',
    topic: 'Ribbons: right to left in precedence, no more than four per row, no space or 1/8 inch between rows; centered 1/8 inch above the left pocket (AGSU: all Soldiers)',
    verification: 'verified',
  },
  unitAwards: {
    source: 'DAPAM670-1',
    para: '22-10c',
    topic: 'Unit awards: rows of three, up to 1/8 inch between rows; 1/8 inch above the right pocket flap (AGSU: all Soldiers), female ASU 1/2 inch above the name plate',
    verification: 'verified',
  },
  unitAwardsTemporary: {
    source: 'DAPAM670-1',
    para: 'table 22-1',
    topic:
      'Permanent vs temporary unit awards: temporary only while assigned; only the Army PUC, VUA, MUC and ASUA may be worn temporarily; not in official photos or at boards',
    quote:
      'Temporary unit awards will not be worn for official photographs or for promotion or selection boards.',
    verification: 'verified',
  },
  unitAwardsAgsu: {
    source: 'DAPAM670-1',
    para: '14-5v',
    topic: 'AGSU: earned or current unit awards, not both; none on the Class B AGSU',
    quote: 'Soldiers will wear either earned unit awards or current unit awards, not both',
    verification: 'verified',
  },
  rdi: {
    source: 'DAPAM670-1',
    para: '21-23b',
    topic: 'RDI: 1/8 inch above the right pocket flap, or 1/4 inch above unit awards or a foreign badge (female ASU: 1/2 inch above the name plate)',
    verification: 'verified',
  },
  dui: {
    source: 'DAPAM670-1',
    para: '21-22c(1)',
    topic: 'DUI centered on the shoulder loops, base toward the shoulder seam (not on the dress ASU, Class B, or for general officers)',
    verification: 'verified',
  },
  collarInsignia: {
    source: 'DAPAM670-1',
    para: '21-4, 21-12b, 21-13b',
    topic: 'U.S. and branch insignia: enlisted disks 1 inch above the notch; officer U.S. 5/8 inch above the notch, branch 1 1/4 inches below the U.S. insignia',
    verification: 'verified',
  },
  agsuShirtNoUnitAwards: {
    source: 'DAPAM670-1',
    para: '14-5v',
    topic: 'Unit awards are not authorized on the Class B AGSU',
    verification: 'verified',
  },
  agsuPossession: {
    source: 'DAPAM670-1',
    para: 'app D, tables D-1, D-2',
    topic: 'AGSU mandatory possession 1 October 2027; ASU wear-out date 30 September 2027 (replaced by the AGSU in the clothing bag)',
    verification: 'verified',
  },
  otherServiceDecorations: {
    source: 'DAPAM670-1',
    para: '22-5a, d',
    topic: 'Other Services’ and joint decorations are interleaved by level (e.g. Navy Achievement Medal right after the Army Achievement Medal); their service medals follow Army service ribbons',
    verification: 'verified',
  },
  devices: {
    source: 'AR600-8-22',
    para: '6-3 to 6-12',
    topic: 'Appurtenances: OLCs (silver = 5 bronze, max four), numerals, V/C/R devices (order V, C, R), clasps, arrowhead, AFRM hourglass and M',
    verification: 'verified',
  },
} satisfies Record<string, Citation>;
