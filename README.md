# DressRight

A 3D uniform builder for the Army Green Service Uniform (AGSU) and Army Blue Service Uniform (ASU) coats, built on AR 670-1 and
DA PAM 670-1. Every placement and rule cites its source and says how well it has been checked.

> DressRight is not an official Army product. The official publications on armypubs.army.mil and your chain of command always win.

## What it does

- **3D coat builder.** AGSU or ASU, male or female coat, any rank E-2 through GEN. Insignia are placed by the layout engine using
  the regulation's measurements, in inches. You can rotate, zoom, and click any item to see its placement rule and citation.
- **Unit crests and patches.** Design a DUI, SSI or SSI-MOHC (combat patch), or upload your unit's actual artwork. Uploads stay in your browser.
- **Ribbons.** Sorted automatically by order of precedence (or by hand, and the app flags misordering), with oak leaf clusters, knots,
  stars, numerals and V/C/R devices. Rack rows follow the regulation: highest precedence uppermost, partial row on top.
- **Badges and tabs.** Combat/special-skill groups, the one-group-1-or-2-badge-above-the-ribbons limit, the three-on-the-pocket-flap limit,
  the one-foreign-badge limit, and skill tabs (cloth on the AGSU sleeve, metal replicas on the ASU).
- **Compliance check.** Live findings (error / warning / info), each with what to do and the citation.
- **"Can I wear…?"** Plain-language answers to the lesser-known questions, personalized to your component and duty status. Example: a
  Guard Soldier's Governor's Twenty is wearable on Title 32 / State Active Duty, but not on Title 10 orders.
- **What changed.** A log of regulation changes that commonly trip up Soldiers who learned from an older version (for example,
  SSI-FWTS was renamed SSI-MOHC in 2021).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # rules engine tests
npm run build
```

## How the regulation data is organized

```
src/regs/
  publications.json   which versions of AR 670-1 / DA PAM 670-1 / AR 600-8-22 the data is written against
  sources.ts          typed access to the above, plus interim Army Directives
  citations.ts        shared citations with a verification level
  catalog/            ranks, branches, ribbons (precedence order), badges (with groups), unit awards
  layout.ts           Build -> placed items (inches), each with its rule text and citations
  validate.ts         Build -> findings; one small pure function per rule
  knowledge.ts        "Can I wear…?" articles, with optional personalized verdicts
  changes.ts          "What changed" log
src/three/            procedural 3D coat and canvas textures
src/ui/               panels
```

### Verification levels

Every citation carries one of these:

| Level | Meaning |
| --- | --- |
| `verified` | Checked against the current official PDF. |
| `secondary` | Taken from a source quoting the regulation; still needs a primary-source check. |
| `unverified` | Written from knowledge of the regulation; paragraph and wording must be confirmed. |

The UI shows these levels next to every rule, and the top banner stays amber until every publication has a `lastReviewed` date.

**Current status:** no rule has yet been checked line-by-line against the official PDFs. The ruleset is a first draft and needs a
primary-source review before Soldiers rely on it (see below).

## Keeping it current

Uniform policy changes often (revisions, changes, Army Directives, ALARACTs). Two mechanisms guard against stale rules:

1. **`npm run check-pubs` / the `Regulation watch` workflow** (weekly) fetch the armypubs.army.mil index pages and fail when a listed
   publication is newer than `publications.json`. The checker exits 2 (not 0) if APD can't be reached or parsed, so a broken check is
   never mistaken for "up to date".
2. **Process.** When a publication changes:
   1. Read the new version and the summary of change.
   2. Update the affected rules in `layout.ts`, `validate.ts`, `knowledge.ts` and the catalogs, and adjust citations and verification levels.
   3. Bump the entry in `publications.json` (and `rulesetAsOf`).
   4. Add an entry to `changes.ts` explaining "before vs. now" in Soldier terms.
   5. `npm test`.

### Primary-source review checklist (open work)

- [ ] Confirm paragraph numbers and wording for every `unverified` / `secondary` citation against the official AR 670-1 and DA PAM 670-1.
- [ ] Confirm AGSU and ASU measurements (unit awards, RDI, name plate, ID badges, foreign badges, tab spacing, officer DUI on the AGSU loop).
- [ ] Confirm the full order of precedence and device rules against AR 600-8-22.
- [ ] Confirm the APD index page format the drift checker parses (it was tested against mock pages only).
- [ ] Set `lastReviewed` in `publications.json` once done.

## Roadmap ideas

- More ribbons (other-service, foreign and campaign awards), full-size and miniature medals for the ASU.
- Head-to-toe view: trousers or slacks, headgear (beret, garrison cap, service cap), footwear.
- Class B shirt and mess dress.
- Import from an ERB/ORB to pre-fill awards and badges.
- Printable measurement sheet for setting up the real coat.
