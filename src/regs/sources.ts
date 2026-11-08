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
    id: 'AD 2025-13',
    title: 'Army Directive 2025-13, Facial Hair Grooming Standards',
    affects: 'Grooming (ch. 3); not the uniform build itself',
    notes:
      'Listed so the in-app version banner reflects interim changes. Not used by the uniform builder.',
  },
];

export const pubById = (id: string) => PUBLICATIONS.find((p) => p.id === id);
