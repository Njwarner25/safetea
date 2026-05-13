# SafeTea — Idea Stash

A capture-it-before-it's-forgotten list. Not a roadmap. Not a commitment to build any of this. Just the place where good "what if" ideas live so they don't evaporate.

---

## Nystagmus / Impairment Eye-Check (v2 feature candidate)

**One-line pitch:** A quick eye-tracking check inside SafeTea+ that lets a user spot likely impairment in themselves or in someone they're about to make a safety decision with (get in their car, leave with them, accept a drink they handed you).

### Why this fits the brand

- **Defensible bundle.** Life360 can't ship this (wrong audience). Bumble can't ship this (legal risk for a dating app). Gaize won't (B2B-only, locked to law enforcement / employers). SafeTea is already the dating-safety brand — the eye check belongs here.
- **Real safety value, not a gimmick.** Sudden onset of nystagmus where there was none earlier is a strong indicator of GHB / Rohypnol exposure. Self-check before "am I OK to drive home" is a real use case.
- **Strong PR / TikTok hook.** "Test your date's eyes for impairment before getting in their car" — viral potential is concrete.
- **Ties into the existing toolkit.** Vault stores test results as evidence. Alessia interprets the score in context. SafeLink auto-triggers if a self-check score drops sharply mid-session.

### Existing players (gap analysis)

| | Audience | Available to | Gap for SafeTea |
|---|---|---|---|
| **Gaize** | Law enforcement, fleet operators | B2B only (won't sell consumer) | Refuses consumer market — they own that gap |
| **Druid** | Cannabis dispensaries, employers | B2B, cognitive/motor (not ocular) | No nystagmus angle |
| **Medical VNG apps** | ENT clinics, vertigo patients | Clinic-only, FDA-cleared | Wrong use case (illness, not impairment) |
| **Academic prototypes** | Research only | Not productized | None at scale |

**Consumer-facing nystagmus screening in a dating-safety app is unoccupied.**

### Technical feasibility

- **iPhone** — TrueDepth camera (Face ID hardware on every iPhone X+) tracks eye position with sub-mm precision via `ARFaceTrackingConfiguration`. Apple `Vision` framework detects gaze direction with ~1° accuracy.
- **Android** — Camera2 API at 60 fps captures enough eye-movement detail on flagship phones (Pixel 6+, Galaxy S22+). MediaPipe Face Mesh exposes gaze data.
- **The hard part** — distinguishing actual nystagmus jerks from normal saccades + camera shake. Requires an ML model trained on labeled video. Medical datasets exist but most are licensed; would likely need to collect our own corpus.
- **Realistic build** — 4–8 weeks to a 75%-accuracy prototype using existing CV libs + a small custom model. Months more to reach the 90%+ that we'd trust to ship.

### Product framing (legal-safe)

**Do NOT call it a sobriety test.** Cannot legally market it that way without FDA clearance, and will get pulled the moment a state attorney general notices.

**Do say:**
- "Quick eye check — see how your eyes are moving right now"
- "Compare results over the night so you can spot changes"
- "Not a medical or sobriety test. Use the result as one data point — never as the basis for a driving or legal decision."

**Don't show a green/red 'drunk/sober' verdict.** Show a movement score with context: "Your eyes are tracking smoothly. Earlier tonight the score was 92; right now it's 67." Let the user draw their own conclusion. That framing dodges most of the FDA + tort liability exposure.

### Guardrails

- Hard EULA acceptance before first use, clearly stating it's not a medical or sobriety test.
- Auto-disable for users under 21 (drinking-age + minor liability).
- **Never** automatically disable a car ignition.
- **Never** automatically cancel a ride.
- **Never** auto-suggest "you're safe to drive."
- Suggestions framed as user-decision-supporting, never user-decision-replacing.
- Optional: lock results behind a 5-second delay to prevent split-second misuse.

### Use cases in the SafeTea workflow

1. **End-of-night self-check.** User is leaving a bar. Runs the check. Score is below their baseline. Alessia surfaces: "You may want a Lyft tonight. Want me to call one for you?"
2. **Date safety.** User is about to leave with a date. Asks the date to do the check casually ("here, try this — see how steady your eyes are"). Both scores saved in Vault. If something goes wrong later, it's evidence the date was visibly impaired.
3. **Roofie detection.** User runs a check on arrival at the bar — baseline saved. Hour later, runs it again unprompted. If score has collapsed without proportional alcohol intake, Alessia triggers a "your eyes have changed a lot — let's get you out" flow: SafeLink to trusted contact + Lyft auto-call.
4. **Group accountability.** "Tether" session friends can each take baseline checks at the start of the night. App passively prompts re-checks. Group dashboard shows if anyone's score crashes.

### Pricing implications

- Don't bundle into the $7.99 SafeTea+ tier. Use it to justify a higher tier.
- **SafeTea Pro at $14.99/mo** — includes the eye check + everything in SafeTea+. Roughly doubles ARPU on the slice of users who upgrade.
- Or one-shot: $1.99 per check after the first 3/month on SafeTea+. Adds revenue without forcing upsell.

### When to build

**Not at launch.** First, validate the existing v1 funnel converts at >2.5% to SafeTea+. Get to 1,000 paying subscribers. THEN ship this as the headline v2 feature. The PR moment of v2 launch will be worth more than rolling it into v1 quietly.

### Open questions before committing

- Does the FDA actually care if we frame it as "wellness" instead of "diagnostic"? Need a real lawyer's read, not Reddit's.
- What's the false-positive rate on someone who's just tired but sober? Tired-eye nystagmus is a real thing; we'd be telling sober people they're impaired.
- Can we get hands on a labeled dataset, or do we need to collect one? (Collection is doable through volunteer paid studies — ~$5–10k for an initial corpus.)
- What's the liability exposure if a user passes the check, drives, and crashes? EULA + framing minimize but don't eliminate.

### Status

**Stashed.** Revisit when SafeTea+ MRR > $5k/mo and we have proven funnel conversion.
