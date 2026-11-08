import manifest from './publications.json';

/**
 * Publication manifest: the single place that records WHICH versions of the
 * regulations this app's rule data was written against.
 *
 * When the Army publishes a new revision or change:
 *   1. `npm run check-pubs` (and the scheduled GitHub Action) flags the drift.
 *   2. A maintainer updates the affected rules, bumps the entry in
 *      `publications.json`, and adds
 *      an entry to `changes.ts` describing what changed for Soldiers.
 */

export interface Publication {
  id: string;
  title: string;
  /** Publication date of the base revision. */
  date: string;
  /** Latest change incorporated into our data, if any. */
  change?: { number: string; date: string; summary: string };
  /** Army Publishing Directorate index page that lists this publication. */
  apdIndexUrl: string;
  /** Text the drift checker looks for on the index page, e.g. "AR 670-1". */
  apdNumber: string;
  /** Product details page; the only place APD lists changes (e.g. "Changes 001 - 03/04/2025"). */
  apdDetailsUrl?: string;
  /**
   * ISO date a maintainer last compared our data line-by-line against the
   * official PDF. `null` = never reviewed against the primary source.
   */
  lastReviewed: string | null;
}

/** ISO date the rule data was last updated. Shown in the UI. */
export const RULESET_AS_OF: string = manifest.rulesetAsOf;

/** Edit `publications.json`: it is shared with `scripts/check-pubs.mjs`. */
export const PUBLICATIONS: Publication[] = manifest.publications;

/**
 * Directives and messages that modify AR 670-1 between revisions. These are
 * the most common reason a Soldier's understanding is out of date.
 */
export interface Directive {
  id: string;
  title: string;
  date?: string;
  affects: string;
  notes: string;
}

export const DIRECTIVES: Directive[] = [
  {
    id: 'AD 2026-16',
    title: 'Army Directive 2026-16, Chaplain Rank and Insignia (23 Jun 2026)',
    affects: 'Chaplain rank on the ACU/ECWCS',
    notes: 'Does not change rank or branch insignia on the ASU or AGSU (para 4c).',
  },
  {
    id: 'AD 2023-01',
    title: 'Army Directive 2023-01, Army Recruiting Ribbon Program',
    affects: 'Creates the Army Recruiting Ribbon (now in AR 600-8-22 precedence)',
    notes: 'Included in the ribbon catalog.',
  },
  {
    id: 'AD 2025-13 / 2025-18 / 2026-09',
    title: 'Army Directives on facial hair, appearance and grooming, and religious accommodation',
    affects: 'Grooming (ch. 3); not the uniform build itself',
    notes: 'Listed for completeness; not used by the uniform builder.',
  },
];

export const pubById = (id: string) => PUBLICATIONS.find((p) => p.id === id);
