#!/usr/bin/env node
/**
 * Regulation drift checker.
 *
 * Fetches the Army Publishing Directorate index pages, finds each publication
 * listed in src/regs/publications.json, and reports when APD shows a date
 * newer than the one our rule data was written against (base date or latest
 * change). Exits 1 on drift so a scheduled CI job turns red and notifies the
 * maintainers; exits 2 when APD can't be reached or parsed (so a silent
 * failure is never mistaken for "up to date").
 *
 *   npm run check-pubs
 */
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../src/regs/publications.json', import.meta.url), 'utf8'));

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Pull every date in common APD formats out of a chunk of text. */
function datesIn(text) {
  const out = [];
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) out.push(new Date(Date.UTC(+m[3], +m[1] - 1, +m[2])));
  for (const m of text.matchAll(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})\b/gi))
    out.push(new Date(Date.UTC(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1])));
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.push(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
  return out.filter((d) => !Number.isNaN(+d) && d.getUTCFullYear() > 1990);
}

const strip = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

const pages = new Map();
async function page(url) {
  if (!pages.has(url)) {
    pages.set(
      url,
      fetch(url, { headers: { 'User-Agent': 'DressRight-regulation-drift-check' } }).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
        return strip(await r.text());
      }),
    );
  }
  return pages.get(url);
}

let drift = 0;
let failed = 0;
for (const pub of manifest.publications) {
  const ours = new Date(pub.change?.date ?? pub.date);
  try {
    const text = await page(pub.apdIndexUrl);
    // Match the exact number, not e.g. "AR 670-10".
    const re = new RegExp(pub.apdNumber.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '(?![\\d-])', 'gi');
    const hits = [...text.matchAll(re)];
    if (!hits.length) throw new Error(`"${pub.apdNumber}" not found on ${pub.apdIndexUrl}`);
    // Only look at this publication's own row: stop at the next publication number.
    const rowOf = (h) => {
      const rest = text.slice(h.index + h[0].length, h.index + h[0].length + 600);
      const next = rest.search(/\b(?:AR|DA PAM|DA Pam|PAM)\s+\d+-\d/);
      return next === -1 ? rest : rest.slice(0, next);
    };
    const dates = hits.flatMap((h) => datesIn(rowOf(h)));
    if (!dates.length) throw new Error(`no date found next to "${pub.apdNumber}"`);
    const latest = new Date(Math.max(...dates));
    const iso = latest.toISOString().slice(0, 10);
    if (latest > ours) {
      drift++;
      console.log(`DRIFT  ${pub.apdNumber}: APD shows ${iso}; our data is based on ${ours.toISOString().slice(0, 10)}`);
    } else {
      console.log(`OK     ${pub.apdNumber}: APD ${iso}`);
    }
  } catch (e) {
    failed++;
    console.log(`ERROR  ${pub.apdNumber}: ${e.message}`);
  }
}

if (drift) {
  console.log('\nA publication has been updated. Review the new version, update the rule data, bump publications.json, and add a CHANGES entry.');
  process.exit(1);
}
if (failed) process.exit(2);
