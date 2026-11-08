/**
 * Core types for the regulation layer.
 *
 * Design principle: every rule, placement and answer in this app must point
 * back to a source publication, and must say how confident we are that the
 * text still matches the *current* published version. Uniform policy changes
 * often (Army Directives, ALARACTs, rapid action revisions), so stale data is
 * the main way this app could mislead a Soldier.
 */

export type SourceId =
  | 'AR670-1'
  | 'DAPAM670-1'
  | 'AR600-8-22'
  | 'STATE'
  | 'USC-T10'
  | 'USC-T32';

/**
 * How confident we are that the cited text matches the current publication.
 * - `verified`   – checked against the current official PDF by a maintainer.
 * - `secondary`  – taken from a secondary source quoting the regulation; needs a
 *                  primary-source check.
 * - `unverified` – written from general knowledge of the regulation; the
 *                  paragraph and wording must be confirmed before relying on it.
 */
export type Verification = 'verified' | 'secondary' | 'unverified';

export interface Citation {
  source: SourceId;
  /** Paragraph / figure / table if known, e.g. "21-27b" or "fig 21-4". */
  para?: string;
  /** Human-readable topic, used when the paragraph is not yet confirmed. */
  topic: string;
  /** Verbatim text, only when we have it. */
  quote?: string;
  verification: Verification;
}

export type Uniform = 'AGSU' | 'ASU';
export type Sex = 'male' | 'female';
export type Component = 'RA' | 'USAR' | 'ARNG';
/**
 * Duty status matters for state awards: ARNG Soldiers under 32 USC (or State
 * Active Duty) may wear state awards; anyone on Title 10 active federal
 * service may accept but not wear them.
 */
export type DutyStatus = 'T10' | 'T32' | 'SAD';
export type RankCategory = 'enlisted' | 'warrant' | 'officer';

export interface Rank {
  id: string;
  abbr: string;
  name: string;
  grade: string; // E-4, W-2, O-3 ...
  category: RankCategory;
  /** chevrons: number of chevrons, arcs (rockers), center device */
  chevrons?: { up: number; rockers: number; device?: 'diamond' | 'star' | 'wreath-star' | 'eagle' | 'none' };
}

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  id: string;
  severity: Severity;
  message: string;
  fix?: string;
  citations: Citation[];
}
