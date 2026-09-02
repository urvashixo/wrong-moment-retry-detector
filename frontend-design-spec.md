# Frontend Design Spec — Wrong Moment Retry Detector

This spec covers **visual design only**: the landing page (currently missing) and a redesign of the dashboard (currently generic). It assumes the backend/data spec already covered elsewhere.

---

## 0. Grounding

**Subject:** a system that reads a customer's own payment-success history, finds their personal "liquidity window," and retries a failed payment there instead of on a fixed schedule.

**Audience:** hackathon judges first (they'll see it for ~90 seconds), then a merchant's ops/finance team second (they'd actually live in the dashboard).

**The page's one job:** in the first five seconds, communicate *"this looks at when your money actually shows up, and retries exactly then"* — not "AI-powered payment recovery platform." Generic fintech-SaaS phrasing is the enemy here; the product's entire pitch is specificity (personal timing), so the design and copy need to be specific too.

**Why the terminal/dot-matrix direction from your references fits, not just looks cool:** the core artifact this product produces is a per-customer *histogram* — a distribution of when payments land. A terminal/data-readout aesthetic isn't decoration here; it's the same visual language as the thing you're actually computing. We're leaning into that instead of dressing a generic SaaS layout in dark mode.

---

## 1. Design Tokens

### Color
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0A0A0A` | Base background, near-black not pure black (matches reference, avoids harsh OLED-black) |
| `--panel` | `#111111` | Panel/card fills, one step up from bg |
| `--line` | `#2A2A2A` | Hairline borders, grid lines, dividers |
| `--text-primary` | `#EDEDED` | Body copy, headings |
| `--text-dim` | `#7A7A7A` | Secondary labels, timestamps, meta text |
| `--heat-1` (hot/high-confidence) | `#E8432C` | Deep red — top of the confidence gradient |
| `--heat-2` | `#F07C2E` | Orange — mid confidence |
| `--heat-3` | `#F5B93B` | Amber |
| `--heat-4` (cool/low-confidence) | `#F8E14A` | Pale yellow — bottom of gradient, low-confidence/fallback states |
| `--success` | `#3ECF8E` | Recovered payment / success outcome only — never decorative |

**Why a 4-stop heat gradient instead of one accent color:** this is not a brand palette, it's a *confidence scale*. Every histogram bar, every confidence badge, every "basis" tag uses this same red→yellow scale to mean the same thing everywhere: hot = high-confidence cluster, cool = thin/fallback data. One accent color would be decoration; this gradient is the product's actual data encoding, reused consistently instead of invented per-component.

### Type
| Role | Face | Notes |
|---|---|---|
| Display / big numbers (hero stat, section numerals) | A pixel/dot-matrix face — **"Departure Mono"** or **"Silkscreen"** (both free) | Used ONLY for numbers that are literally computed values (recovery %, ₹ recovered, confidence score) — never for body copy. This ties back to the reference's LCD-panel numerals and reinforces "this is a live readout, not marketing copy." |
| Headings, labels, body, UI | **"Berkeley Mono"** if licensed, otherwise **"JetBrains Mono"** or **"IBM Plex Mono"** | One monospace family throughout, matching the Yannick Grégoire reference's terminal register. Regular weight for body, Medium for headings — no separate display serif/sans needed. |

Line length: cap body copy at ~70 characters — monospace runs wide, so this matters more than usual.

### Layout concept

Left-aligned, grid-based, hairline-ruled — a terminal readout, not a centered marketing page. Center-aligned hero text is the generic SaaS default; this leans left like a log file or a data panel, because that's the honest register of the product.

```
┌────────────────────────────────────────────┐
│ [ WRONG MOMENT ]                 [ status ]│
│                                              │
│  Your retries fail                          │
│  at the wrong time.                         │
│  Not for the wrong                          │
│  reason.                                    │
│                                              │
│  [ live histogram strip — real animation ]  │
│                                              │
│  ▸ see it find a pattern                    │
└────────────────────────────────────────────┘
┌──────────────┬──────────────┬───────────────┐
│ 01 detect    │ 02 learn     │ 03 retry      │
│ a failure    │ their window │ exactly there │
└──────────────┴──────────────┴───────────────┘
┌────────────────────────────────────────────┐
│  [ naive vs smart — live comparison bars ]  │
└────────────────────────────────────────────┘
```

Brackets `[ ]` are used exactly one way throughout the whole product: **to mark a value that is live/computed**, never as decoration around static labels. `[ 81% ]` is a live confidence score. "How it works" is plain text with no brackets, because it's not a computed value. This one rule is what keeps the terminal motif from becoming template chrome.

---

## 2. Landing Page — Section by Section

### Hero
- Headline (set in the mono display face, left-aligned, four short lines — not one long sentence broken awkwardly):
  > Your retries fail
  > at the wrong time.
  > Not for the wrong
  > reason.
- Subline, dimmer weight: *Most retry logic asks again in 3 days. We ask again the moment your customer's money actually shows up.*
- **Hero visual — this replaces the generic "product screenshot" default:** a live, animated histogram strip built from real (synthetic) data — bars rising and falling across a 31-day axis, one bar briefly flashing `--heat-1` red with a small `[ retry scheduled ]` tag appearing next to it. This is the single motion moment for the whole page (per the one-orchestrated-moment rule) — everything else is static.
- No CTA button copy like "Get Started →". Use: `▸ see it find a pattern` — a single low-key affordance that scrolls to the live demo, phrased as what happens, not a generic verb.

### How it works (the one place numbering is earned — this genuinely is a 3-step sequence)
Three panels, hairline-bordered, no rounded corners, no shadows:
1. **Detect** — a payment fails. We log why (insufficient funds, timeout, decline).
2. **Learn** — we look at this customer's own past successful payments — not everyone else's.
3. **Retry** — we ask again at their predicted best window, not a generic fixed delay.

Keep each panel to 1–2 sentences, plain verbs, no feature-speak.

### Proof section — "naive vs smart"
This is the section that actually earns trust, so give it the most visual weight after the hero.
- Two bar sets side by side, sharing an axis: `fixed-schedule retry` (dim gray bars) vs `personal-window retry` (heat-gradient bars), both run against the *same* batch of failures.
- Below: three live numbers in the dot-matrix face — `Recovered`, `Improvement`, `Cold-start fallbacks handled` — each with a one-line plain-language caption underneath (not a card, not a shadow, just number + hairline rule + caption).
- This section should look like a lab result, not a testimonial carousel. No customer logos, no star ratings — none of that applies here and would look fake.

### "What happens when it doesn't know" (failure-handling as a feature, not a footnote)
A small, deliberately unglamorous panel showing a cold-start customer: 1 data point, confidence `[ 31% ]` rendered in `--heat-4` pale yellow, with copy: *Not enough history yet. We fall back to a safe default instead of guessing.* This section exists because it's the single strongest trust signal the product has — most competing "AI recovery" pitches never admit uncertainty. Give it real space, not a tiny disclaimer.

### Footer
Minimal, matching the reference's terminal footer register: project name, one-line description, contact/repo link, built-for-hackathon note. No newsletter signup, no social proof logos — none of that exists yet and shouldn't be faked.

---

## 3. Dashboard Redesign

The current dashboard's problem: it reads as a generic admin panel (tables, generic stat cards) that could belong to any SaaS product. The fix is to make every screen visually communicate *this is about timing*, not just display numbers.

### Global layout
Left rail: a persistent mini "confidence scale" legend (the 4-stop heat gradient with labels `high confidence` → `fallback`) — always visible, so every color used elsewhere on the dashboard is self-explanatory without a tooltip.

### Screen 1 — Decisions feed (replaces a generic table)
Each retry decision renders as a **single-row terminal-log entry**, not a data-table row:
```
[ cust_014 ]  failed insufficient_funds  →  retry Sep 03 10:15  [ 81% ]  day_of_month_cluster
```
- The confidence number `[ 81% ]` is colored on the heat scale — instantly scannable without reading the percentage.
- Fallback rows are visually distinct: instead of a colored confidence bracket, they show `[ fallback ]` in `--text-dim`, so a judge can spot cold-start handling by scanning the list, without opening a detail view.
- Clicking a row expands inline (no modal) to show the actual histogram behind the decision + the LLM explanation sentence, clearly labeled as generated text (small `[ generated ]` tag) so it's never confused with the computed decision itself. This visually enforces your own architecture rule: the number is computed, the sentence is explained.

### Screen 2 — Per-customer histogram view
This is the screen that should look most like your reference image — a real stacked/heat histogram, 24 or 31 buckets on the x-axis, bar height = success density, color = recency-weighted confidence. Overlay a single vertical marker line for "predicted retry window" so a judge can see the recommendation land visually on the same chart as the evidence, rather than as a separate number elsewhere on the page.

### Screen 3 — Batch comparison (same visual as the landing page's proof section)
Reuse the exact naive-vs-smart component from the landing page here, live-wired to real batch data instead of the marketing snapshot — this consistency (same chart, same meaning, two contexts) is a small but real "build quality" signal: you're not maintaining two different chart implementations for the same concept.

---

## 4. Motion

One orchestrated moment on the landing page (the hero histogram animating in + one bar flashing to show a retry being scheduled). Everywhere else: motion only responds to a person's action — a row expanding on click, a value updating when a new failure is injected during a live demo. No scroll-triggered fade-ins on every section, no hover-lift on every panel.

---

## 5. Accessibility / Quality Floor

- All heat-gradient color coding must be paired with a text label (`[ 81% ]`, `[ fallback ]`) — never color alone, since the red→yellow scale is not colorblind-safe on its own.
- Visible keyboard focus states on every interactive row/button, styled as a bracket outline (`[ ]`) to match the visual language rather than a default browser blue ring.
- Respect `prefers-reduced-motion`: the hero histogram animation should render in its end state immediately, no bar-by-bar reveal, for users with that preference set.
- Contrast: `--text-dim` (#7A7A7A) on `--bg` (#0A0A0A) must be checked against WCAG AA for body-sized text; if it fails, lighten `--text-dim` slightly rather than making meta text illegibly faint for the sake of the aesthetic.
- Mobile: the three-panel "how it works" row and the two-column naive-vs-smart comparison both need to stack cleanly to single-column without losing the shared axis meaning — test this specifically, it's the easiest thing to silently break.

---

## 6. What NOT to do (guardrails against drifting back to generic)

- No rounded-corner cards with soft drop shadows anywhere — this product's visual language is hairline rules and square corners throughout.
- No tracked-out ALL-CAPS eyebrow label placed above every section heading "for structure" — caps are earned only where the terminal register calls for it (e.g. a status readout), not sprinkled as decoration.
- No middle-dot-joined meta strings (`Track 03 · Revenue Recovery · Hackathon 2026`).
- No arrow appended to every button/link by default — reserve `▸` / `→` for the one or two places it's actually doing navigational work (the hero scroll-cue).
- Don't invent customer logos, star ratings, or testimonials — there are none, and faking them undermines the "honest, auditable" positioning the whole product is built on.
