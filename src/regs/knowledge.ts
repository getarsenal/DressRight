import type { Build } from './build';
import type { Citation } from './types';
import { C } from './citations';
import { rankById } from './catalog/ranks';

/**
 * "Can I wear…?" knowledge base. These are the questions Soldiers actually
 * ask that the regulation answers in a sub-paragraph nobody reads.
 *
 * `personal(b)` returns an answer tailored to the Soldier's current build
 * (component, duty status, rank), so the same question gets the right answer
 * for an active-duty SPC and a Guard SFC on drill status.
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
    return {
      verdict: 'no' as const,
      text: `You're set as ${b.component === 'RA' ? 'Regular Army' : 'Army Reserve'}. You may keep your ${item}, but you can't wear it on the Army uniform.`,
    };
  if (b.dutyStatus === 'T10')
    return {
      verdict: 'no' as const,
      text: `You're set as ARNG on Title 10 orders (active Federal service). You may accept the ${item} but not wear it until you're back under the Governor/TAG (Title 32 or State Active Duty).`,
    };
  return {
    verdict: 'yes' as const,
    text: `You're set as ARNG in ${b.dutyStatus === 'T32' ? 'Title 32' : 'State Active Duty'} status, so you may wear the ${item}, after all Federal and foreign awards, per your state's regulation.`,
  };
};

export const ARTICLES: Article[] = [
  {
    id: 'gov20',
    question: "I earned the Governor's Twenty. Can I wear it on my dress uniform?",
    tags: ['state', 'governor', 'twenty', 'tab', 'marksmanship', 'arng', 'guard', 'badge'],
    answer:
      "The Governor's Twenty is a STATE marksmanship award. State awards may be worn only by Army National Guard Soldiers serving under the command and control of their Governor / Adjutant General (32 USC: drill, AT, AGR Title 32, State Active Duty). On Title 10 active Federal service you may accept it but not wear it. Each state sets its own eligibility, form (tab or badge) and placement, so your state's awards regulation controls exactly where it goes.",
    personal: (b) => stateVerdict(b, "Governor's Twenty"),
    citations: [C.stateAwardsArng, C.stateAwardsTitle10, C.stateReg],
  },
  {
    id: 'state-ribbons',
    question: 'Can I wear my state service ribbon / state active duty ribbon?',
    tags: ['state', 'ribbon', 'guard', 'arng', 'hurricane', 'sad'],
    answer:
      'Same rule as all state awards: ARNG Soldiers under 32 USC may wear them, after all Federal and foreign ribbons, in the state order of precedence. Soldiers on Title 10 active Federal service may not wear them. This applies even if the state award was for a federal-adjacent mission such as hurricane response.',
    personal: (b) => stateVerdict(b, 'state ribbon'),
    citations: [C.stateAwardsArng, C.stateAwardsOrder, C.stateAwardsTitle10],
  },
  {
    id: 'state-after-transfer',
    question: 'I transferred from the Guard to active duty. Can I keep wearing my state awards?',
    tags: ['state', 'transfer', 'active', 'title 10', 'guard'],
    answer:
      'No. Once you are on Title 10 active Federal service you may not wear state awards on the Army uniform. They remain yours and stay in your records.',
    citations: [C.stateAwardsTitle10],
  },
  {
    id: 'mohc',
    question: 'What happened to the "combat patch" (SSI-FWTS)?',
    tags: ['combat patch', 'ssi-fwts', 'mohc', 'right sleeve', 'deployment'],
    answer:
      'The 2021 revision renamed the former SSI-FWTS ("former wartime service") to SSI-MOHC: Shoulder Sleeve Insignia – Military Operations in Hostile Conditions. It is still worn on the right sleeve by Soldiers with qualifying service. If your references still say "FWTS", they predate the 2021 revision.',
    citations: [C.ssiMohc],
  },
  {
    id: 'left-vs-right',
    question: "Can I wear my old unit's patch on my left sleeve?",
    tags: ['ssi', 'patch', 'left sleeve', 'old unit', 'combat patch'],
    answer:
      "No. The left sleeve is the SSI of the unit you are currently assigned to. A previous unit's patch can only be worn on the RIGHT sleeve, and only as an SSI-MOHC earned with that unit during qualifying service in a hostile area.",
    citations: [C.ssiCurrent, C.ssiMohc],
  },
  {
    id: 'agsu-asu',
    question: 'Do I need the AGSU or the ASU (blues)? When?',
    tags: ['agsu', 'asu', 'blues', 'greens', 'possession', '2027', 'class a'],
    answer:
      'The Army Green Service Uniform (AGSU) has replaced the blue ASU for everyday service wear. The AGSU mandatory possession date is 1 October 2027; the ASU wear-out date is 30 September 2027, after which the blues remain as a dress uniform. Boards and ceremonies can specify either, so check the memo or your chain of command.',
    citations: [C.agsuPossession],
  },
  {
    id: 'badge-limits',
    question: 'How many badges can I wear on my coat?',
    tags: ['badge', 'limit', 'how many', 'pocket flap', 'cib', 'airborne', 'marksmanship'],
    answer:
      'No more than six combat and special skill badges at one time (tabs are not counted). Above the ribbons: only one badge from group 1 (CIB, CMB, CAB) or group 2 (EIB, EFMB, ESB), plus up to three from groups 3–4 (aviation, EOD, parachutist, air assault, pathfinder, diver…). No more than three badges on the left pocket flap, including marksmanship badges.',
    citations: [C.badgeTotal, C.badgeGroups, C.marksmanship],
  },
  {
    id: 'cib-eib',
    question: 'I have both a CIB and an EIB. Do I wear both above my ribbons?',
    tags: ['cib', 'eib', 'esb', 'cab', 'group'],
    answer:
      'Only one group 1 or group 2 badge is worn above the ribbons. The builder puts the group 1 badge (e.g. CIB) above the ribbons and moves the other to the pocket flap. Confirm the arrangement against DA PAM 670-1 para 22-16; this is one of the paragraphs most often misread from older versions, which had five groups.',
    citations: [C.badgeGroups],
  },
  {
    id: 'foreign',
    question: 'Can I wear my German Armed Forces Proficiency Badge (or foreign jump wings)?',
    tags: ['foreign', 'gafpb', 'german', 'schutzenschnur', 'wings', 'jump'],
    answer:
      'Foreign badges that were properly awarded and approved for acceptance may be worn, but only ONE foreign badge at a time, on the right side of the coat above the unit awards / regimental insignia. Make sure the award is in your records; an unofficial or unapproved award may not be worn.',
    citations: [C.foreignBadges],
  },
  {
    id: 'unit-awards',
    question: 'My unit got a Meritorious Unit Commendation. Do I keep wearing it after I PCS?',
    tags: ['unit award', 'muc', 'puc', 'vua', 'permanent', 'temporary', 'pcs'],
    answer:
      'Only if you were assigned to the unit during the period the award covers; then you wear it permanently. If the unit earned it before or after your time there, you wear it only while assigned to that unit (temporary wear) and remove it when you leave.',
    personal: (b) => {
      const temp = b.unitAwards.filter((u) => !u.permanent);
      return temp.length
        ? { verdict: 'depends', text: `You have ${temp.length} unit award(s) marked temporary. Take them off when you leave the unit.` }
        : { verdict: 'yes', text: 'All your unit awards are marked permanent, so they stay on after you PCS.' };
    },
    citations: [C.unitAwardsTemporary],
  },
  {
    id: 'stripes',
    question: 'How many service stripes (hash marks) and overseas bars do I get?',
    tags: ['hash marks', 'service stripes', 'overseas bars', 'sleeve'],
    answer:
      'Service stripes are for enlisted Soldiers only: one for each three years of honorable service, on the left sleeve. Overseas service bars go on the right sleeve: one for each six months in a qualifying hostile-fire / imminent-danger area. Rules for counting Reserve Component time differ, so verify against AR 670-1 for your situation.',
    personal: (b) => ({
      verdict: 'depends',
      text: `With ${b.yearsService} years and ${b.monthsHostile} qualifying months, the builder shows ${rankById(b.rankId).category === 'enlisted' ? Math.floor(b.yearsService / 3) : 0} service stripe(s) and ${Math.floor(b.monthsHostile / 6)} overseas bar(s).`,
    }),
    citations: [C.serviceStripes, C.overseasBars],
  },
  {
    id: 'airborne-tab',
    question: 'I am airborne qualified. Do I wear an Airborne tab?',
    tags: ['airborne', 'tab', 'parachutist', 'ssi'],
    answer:
      "The Airborne tab is part of a unit's SSI, not a personal award. Wear it only when your assigned unit's SSI includes it. Your personal qualification is shown by the Parachutist Badge.",
    citations: [C.ssiCurrent],
  },
  {
    id: 'unit-awards-shirt',
    question: 'Do unit awards go on the AGSU shirt (Class B)?',
    tags: ['unit award', 'class b', 'shirt', 'agsu'],
    answer: 'No. Unit awards are not authorized on the Class B AGSU shirt; they go on the coat.',
    citations: [C.agsuShirtNoUnitAwards],
  },
  {
    id: 'ribbon-dupe',
    question: 'I received a second ARCOM. Do I add a second ribbon?',
    tags: ['ribbon', 'oak leaf', 'olc', 'second award', 'device'],
    answer:
      'No. Subsequent awards of the same decoration are shown with devices on the one ribbon: oak leaf clusters for most Army decorations, knots for the Good Conduct Medal, numerals for the Air Medal and NCOPDR, etc.',
    citations: [C.ribbonsRack, { source: 'AR600-8-22', topic: 'Appurtenances and devices', verification: 'unverified' }],
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
