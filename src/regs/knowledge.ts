import type { Build } from './build';
import type { Citation } from './types';
import { C } from './citations';
import { rankById } from './catalog/ranks';
import { stateName } from './catalog/states';

/**
 * "Can I wear…?" knowledge base: the questions Soldiers actually ask that the
 * regulation answers in a sub-paragraph nobody reads. `personal(b)` tailors
 * the answer to the Soldier's profile (component, state, duty status, rank).
 */
export interface Article {
  id: string;
  question: string;
  tags: string[];
  answer: string;
  personal?: (b: Build) => { verdict: 'yes' | 'no' | 'depends'; text: string };
  citations: Citation[];
}

const stateVerdict = (b: Build, item: string) => {
  if (b.component !== 'ARNG')
    return { verdict: 'no' as const, text: `You're set as ${b.component === 'RA' ? 'Regular Army' : 'Army Reserve'}. You can keep the ${item}, but you can't wear it on the Army uniform.` };
  if (b.dutyStatus === 'T10')
    return { verdict: 'no' as const, text: `You're on Title 10 orders (active Federal service). You may accept the ${item} but not wear it until you're back under the Governor/TAG.` };
  const st = b.state ? `${stateName(b.state)}'s` : "your state's";
  if (b.dutyStatus === 'SAD')
    return { verdict: 'depends' as const, text: `State Active Duty isn't in DA PAM 670-1's list of covered statuses, though you are under the Governor. Most likely yes; confirm with ${st} awards regulation.` };
  return { verdict: 'yes' as const, text: `You're ARNG in Title 32 status, so you may wear the ${item}, after all Federal and foreign awards, per ${st} regulation.` };
};

export const ARTICLES: Article[] = [
  {
    id: 'gov20',
    question: "I earned the Governor's Twenty. Can I wear it on my dress uniform?",
    tags: ['state', 'governor', 'twenty', 'tab', 'marksmanship', 'arng', 'guard', 'badge'],
    answer:
      "The Governor's Twenty is a STATE marksmanship award. State awards may be worn only by Army National Guard Soldiers under the command and control of their Governor or Adjutant General (AGR, ADT, ADSW, full-time NG duty, annual training and drill). On Title 10 active Federal service you may accept it but not wear it. AR 670-1 bars state badges except for ARNG Soldiers in their State status. The Army pubs don't mention the Governor's Twenty by name or give placement for state badges and tabs, so your state's awards regulation decides where it goes.",
    personal: (b) => stateVerdict(b, "Governor's Twenty"),
    citations: [C.stateAwardsArng, C.stateAwardsTitle10, C.stateBadges, C.stateReg],
  },
  {
    id: 'state-ribbons',
    question: 'Can I wear my state service ribbon or state active duty ribbon?',
    tags: ['state', 'ribbon', 'guard', 'arng', 'hurricane', 'sad'],
    answer:
      'Same rule as all state awards: ARNG Soldiers under the Governor may wear them, after all Federal and foreign ribbons, in the state order of precedence. On Title 10 active Federal service you may not.',
    personal: (b) => stateVerdict(b, 'state ribbon'),
    citations: [C.stateAwardsArng, C.stateAwardsOrder, C.stateAwardsTitle10],
  },
  {
    id: 'state-after-transfer',
    question: 'I transferred from the Guard to active duty. Can I keep wearing my state awards?',
    tags: ['state', 'transfer', 'active', 'title 10', 'guard'],
    answer: 'No. On Title 10 active Federal service you may accept but not wear state awards. They stay in your records.',
    citations: [C.stateAwardsTitle10],
  },
  {
    id: 'agsu-nameplate',
    question: 'Where does the name plate go on the AGSU?',
    tags: ['name plate', 'nameplate', 'agsu', 'greens', 'name tag'],
    answer:
      "Nowhere. DA PAM 670-1 is explicit: no name plate is worn with the Class A or Class B AGSU. It's one of the most common mistakes, and some uniform apps get it wrong too. Name plates are for the blue ASU: men wear it on the right pocket flap, women 1 to 2 inches above the top button.",
    personal: (b) =>
      b.uniform === 'AGSU'
        ? { verdict: 'no', text: 'Your builder is on the AGSU, so no name plate is shown.' }
        : { verdict: 'yes', text: 'Your builder is on the blues, which do take a name plate.' },
    citations: [C.agsuNoNameplate, C.nameplateAsu],
  },
  {
    id: 'mohc',
    question: 'What happened to the "combat patch" (SSI-FWTS)?',
    tags: ['combat patch', 'ssi-fwts', 'mohc', 'right sleeve', 'deployment'],
    answer:
      'The 2021 revision renamed it the SSI–military operations in hostile conditions (SSI-MOHC). It goes on the right sleeve of the AGSU coat, 1/2 inch below the shoulder seam, and wearing it is optional. If your references still say "FWTS", they predate 2021.',
    citations: [C.ssiMohc, C.ssiMohcEligibility],
  },
  {
    id: 'blues-patches',
    question: 'Do I wear my unit patch and combat patch on the blues?',
    tags: ['asu', 'blues', 'ssi', 'patch', 'combat patch', 'csib'],
    answer:
      'No. Shoulder sleeve insignia, the SSI-MOHC and cloth skill tabs are AGSU-only in the 2021 pamphlet; none are listed for the blue ASU coat. On the blues, the combat patch is replaced by the Combat Service Identification Badge, a pin-on badge on the right pocket. Skill tabs go on the left pocket flap as metal replicas.',
    citations: [C.ssiCurrent, C.csib, C.tabReplicas],
  },
  {
    id: 'left-vs-right',
    question: "Can I wear my old unit's patch on my left sleeve?",
    tags: ['ssi', 'patch', 'left sleeve', 'old unit', 'combat patch'],
    answer:
      "No. The left sleeve is the SSI of the unit you're assigned to now. A former unit's patch can only go on the right sleeve, and only as an SSI-MOHC earned with that unit.",
    citations: [C.ssiCurrent, C.ssiMohc],
  },
  {
    id: 'agsu-asu',
    question: 'Do I need the AGSU or the ASU (blues)? When?',
    tags: ['agsu', 'asu', 'blues', 'greens', 'possession', '2027', 'class a'],
    answer:
      "The AGSU mandatory possession date is 1 October 2027. The ASU's wear-out date is 30 September 2027, when the clothing-bag tables list it as replaced by the AGSU. Boards and ceremonies may call for either one, so check the memo or ask your chain of command.",
    citations: [C.agsuPossession],
  },
  {
    id: 'badge-limits',
    question: 'How many badges can I wear on my coat?',
    tags: ['badge', 'limit', 'how many', 'pocket flap', 'cib', 'airborne', 'marksmanship'],
    answer:
      'AGSU: four total, counting marksmanship badges. ASU: six total, counting marksmanship (tab metal replicas excluded). Above the ribbons: no more than three, and only one of those from group 1 (CIB, CMB, CAB) or group 2 (EIB, EFMB, ESB). Pocket flap: up to three from groups 3–5 (aviation, EOD, rigger, parachutist, air assault, pathfinder, diver, driver, marksmanship). Group 1 and 2 badges are never worn on the flap.',
    personal: (b) => ({ verdict: 'depends', text: `You're on the ${b.uniform === 'AGSU' ? 'AGSU: four badges max' : 'blues: six badges max'}.` }),
    citations: [C.badgeTotalAgsu, C.badgeTotalAsu, C.badgeGroups, C.badgeFlap],
  },
  {
    id: 'cib-eib',
    question: 'I have both a CIB and an EIB. Do I wear both?',
    tags: ['cib', 'eib', 'esb', 'cab', 'group', 'master'],
    answer:
      "Not on the same coat. Only one group 1 or group 2 badge may be worn above the ribbons, and those groups can't go on the pocket flap, so you pick one. (AR 600-8-22 now has Master Combat badges, e.g. CIB plus EIB, EFMB or ESB earns the Master Combat Infantryman Badge, but DA PAM 670-1 hasn't added their placement yet.)",
    citations: [C.badgeGroups, C.badgeFlap, C.newBadges],
  },
  {
    id: 'tabs',
    question: 'How many tabs can I wear on the AGSU?',
    tags: ['tab', 'ranger', 'sapper', 'special forces', 'presidents hundred', 'agsu'],
    answer:
      "Two skill tabs of your choosing, centered 1/4 inch above the SSI on the left sleeve, plus any tab that's part of your unit's SSI (like Airborne). On the blues there are no cloth tabs; metal replicas go on the left pocket flap, never above the ribbons. Replicas aren't authorized on the AGSU.",
    citations: [C.tabsAgsu, C.tabReplicas, C.airborneTab],
  },
  {
    id: 'foreign',
    question: 'Can I wear my German Armed Forces Proficiency Badge (or foreign jump wings)?',
    tags: ['foreign', 'gafpb', 'german', 'schutzenschnur', 'wings', 'jump'],
    answer:
      'Yes, if it was awarded for military activities by the host country\'s military and is in your records. Only one foreign badge at a time, and only when you\'re also wearing at least one U.S. ribbon. It goes 1/8 inch above the right pocket flap, or 1/2 inch above any unit awards (your RDI then goes 1/4 inch above it). Cloth-only foreign badges can\'t be worn, and the German Schützenschnur is enlisted-only.',
    citations: [C.foreignBadges],
  },
  {
    id: 'other-service-badges',
    question: 'Can I wear a badge I earned from the Navy, Air Force or Marines?',
    tags: ['navy', 'air force', 'marine', 'other service', 'badge', 'wings', 'trident'],
    answer:
      "Only with written authority from HRC Awards and Decorations Branch (memo or DA Form 4187). Badges similar to an Army badge are worn in that group only if you have no Army badge in the same group; dissimilar skill badges are worn as group 4. Career-field badges and other Services' marksmanship badges aren't authorized.",
    citations: [C.otherServiceBadges],
  },
  {
    id: 'other-service-decorations',
    question: 'Where does my Navy Achievement Medal go in my rack?',
    tags: ['navy', 'air force', 'coast guard', 'joint', 'achievement', 'commendation', 'order', 'precedence'],
    answer:
      "Other Services' decorations are interleaved by level: Joint Service Achievement Medal, then Army Achievement Medal, then Navy Achievement Medal, Air Force, Coast Guard. Commendation medals follow the same pattern. Other Services' service medals go after all Army service and training ribbons and before foreign awards.",
    citations: [C.otherServiceDecorations],
  },
  {
    id: 'unit-awards',
    question: 'My unit got a Meritorious Unit Commendation. Do I keep wearing it after I PCS?',
    tags: ['unit award', 'muc', 'puc', 'vua', 'permanent', 'temporary', 'pcs'],
    answer:
      'It\'s permanent if you were assigned and present for duty any time during the award period (or attached for the whole period or at least 30 consecutive days). Otherwise it\'s temporary: worn only while you\'re assigned to that unit, and never for official photos or promotion boards. Only the Army PUC, VUA, MUC and ASUA can be worn temporarily. On the AGSU, wear earned or current unit awards, not both.',
    personal: (b) => {
      const temp = b.unitAwards.filter((u) => !u.permanent);
      return temp.length
        ? { verdict: 'depends', text: `${temp.length} unit award(s) are marked temporary. Remove them when you leave the unit, and for your board photo.` }
        : { verdict: 'yes', text: 'All your unit awards are marked permanent.' };
    },
    citations: [C.unitAwardsTemporary, C.unitAwardsAgsu],
  },
  {
    id: 'stripes',
    question: 'How many service stripes (hash marks) and overseas bars do I get, and where do they go?',
    tags: ['hash marks', 'service stripes', 'overseas bars', 'sleeve'],
    answer:
      'Service stripes (enlisted only): one per 3 years of active Federal service, Reserve service creditable for non-regular retirement, or both; the 10th comes at 29 1/2 years. On the ASU they go on the left sleeve at 45°, 4 inches up; on the AGSU, on BOTH sleeves at 30°, seam to seam. Overseas service bars (officers and enlisted): one per 6 months in a listed operation (e.g. OEF, OIF, OND, OIR, OFS) on the right sleeve: 4 inches up for enlisted, 1/4 inch above the braid for officers.',
    personal: (b) => ({
      verdict: 'depends',
      text: `With ${b.yearsService} years and ${b.monthsHostile} qualifying months: ${rankById(b.rankId).category === 'enlisted' ? Math.floor(b.yearsService / 3) : 0} service stripe(s) and ${Math.floor(b.monthsHostile / 6)} overseas bar(s).`,
    }),
    citations: [C.serviceStripes, C.serviceStripesElig, C.overseasBars, C.overseasBarsElig],
  },
  {
    id: 'airborne-tab',
    question: "I'm airborne qualified. Do I wear an Airborne tab?",
    tags: ['airborne', 'tab', 'parachutist', 'ssi'],
    answer:
      "Only while assigned to a unit whose SSI is approved with the Airborne tab: it's part of that unit's patch, not a personal award. Your qualification is shown by the Parachutist Badge.",
    citations: [C.airborneTab],
  },
  {
    id: 'driver-badge',
    question: 'Is it still the Driver and Mechanic Badge?',
    tags: ['driver', 'mechanic', 'technician', 'badge'],
    answer:
      "AR 600-8-22 (2026) renamed it the Driver and Technician Badge. It's a group 5 badge, worn on the pocket flap, never above the ribbons.",
    citations: [{ source: 'AR600-8-22', para: '8-24', topic: 'Driver and Technician Badge', verification: 'verified' }, C.badgeGroups],
  },
  {
    id: 'unit-awards-shirt',
    question: 'Do unit awards and ribbons go on the AGSU shirt (Class B)?',
    tags: ['unit award', 'class b', 'shirt', 'agsu', 'ribbons'],
    answer: 'No. Ribbons, unit awards, ID badges and the name plate aren\'t worn on the Class B AGSU.',
    citations: [C.agsuShirtNoUnitAwards, C.ribbonsRack, C.agsuNoNameplate],
  },
  {
    id: 'ribbon-dupe',
    question: 'I received a second ARCOM. Do I add a second ribbon?',
    tags: ['ribbon', 'oak leaf', 'olc', 'second award', 'device'],
    answer:
      'No. Later awards are shown with devices on the one ribbon: oak leaf clusters for most decorations, knots for the Good Conduct Medal, numerals for the Air Medal and NCOPDR. A silver oak leaf cluster replaces five bronze ones, with no more than four devices per ribbon. "V", "C" and "R" devices go in that order.',
    citations: [C.devices],
  },
];

export function searchArticles(q: string): Article[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return ARTICLES;
  return ARTICLES.map((a) => {
    const hay = (a.question + ' ' + a.tags.join(' ') + ' ' + a.answer).toLowerCase();
    const score = terms.reduce((s, t) => s + (hay.includes(t) ? (a.tags.some((g) => g.includes(t)) ? 3 : 1) : 0), 0);
    return { a, score };
  })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a);
}
