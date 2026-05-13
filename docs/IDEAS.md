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

### Alessia's voice for delivering results (this is the brand-defining part)

The score number on its own does nothing. Alessia is the wrapper that turns a number into a friend-tier nudge.

**Reference tone the operator wants** (capture verbatim before it evaporates):

> *"You should probably get an Uber — you seem to have had a little too much fun. Let's get you around your friends, and don't fall asleep anywhere unsafe."*

That's the model. Notes on why it works:

- **"A little too much fun"** — empathetic framing, not "you're drunk" or "you're impaired." User doesn't feel judged.
- **"Probably"** — soft suggestion, not command. Preserves user agency, which is core to Alessia's system prompt.
- **"Let's get you around your friends"** — community-rooted protection. Specific action, not generic "be careful."
- **"Don't fall asleep anywhere unsafe"** — concrete protective guidance. Acknowledges what they might actually do next.

**Other tone examples to add to Alessia's response library when this ships:**

- *"Your eyes are reading a bit differently than they did at the start of the night. Want me to call a Lyft? You can stay here, send me your friend's number, and I'll let them know where to find you."*
- *"You did the check — nice. Score's solid. Just remember water and a friend at the door."*
- *"That's a meaningful change from your earlier check. I'm not a doctor, but it's worth slowing down. Want me to share your location with [trusted contact name] so they know where you are?"*
- (Roofie scenario) *"Something's changed quickly. I'm here. Let's get somewhere safe right now — I can pull up a Lyft and ping [trusted contact] at the same time. Just tap when you're ready."*

**Tone rules** (must enforce in the system prompt when this v2 ships):

- Never say "you're drunk", "you're impaired", "you can't drive".
- Always offer a specific next action (Lyft, friend, location share).
- Always preserve user agency — "want me to" not "I'm going to".
- Never lecture about consequences. Lead with care, not warning.
- Match the calmer voice of the existing Alessia system prompt — same character.

### Tether integration — "keep her close tonight"

The eye check shouldn't dead-end at a private nudge. If the user is in an active Tether session (group-safety mode with friends), Alessia should be allowed to **discreetly elevate the user's protection level within the group**.

**Scenario:**

1. User runs the eye check at the bar around 11pm.
2. Score is meaningfully below their baseline.
3. Alessia gives the calm self-nudge ("you should probably get an Uber, let's get you around your friends, don't fall asleep anywhere unsafe").
4. Alessia ALSO asks: *"Want me to give your Tether crew a heads-up so they keep close?"*
5. If the user says yes (or their pre-set preference is "always yes when in Tether"), Alessia broadcasts a soft alert to the rest of the Tether:

   > *"Hey — Sarah did a quick check-in and could use some extra eyes tonight. Try to stay within a couple of paces of her, and if she peels off, ping the group."*

6. Tether mechanics change for that user for the rest of the session:
   - Proximity threshold drops (e.g. 200ft → 50ft) so any straying triggers a faster prompt.
   - Host gets a discreet "Alessia flagged Sarah" indicator on the map.
   - Auto-notify the host if she's been still for more than 10 minutes.
   - Any breach OR a missed Pulse check-in immediately escalates one level higher than normal.

**User-agency rules** (must stay tight here — this is the line between "protective" and "patronizing"):

- The intoxicated user must consent before the group broadcast. Yes/no on the spot, or pre-set preference in Tether settings.
- The broadcast never includes the score, never includes the word "drunk" or "impaired." Always frames as "needs extra eyes," "could use closer company."
- The user can revoke the flag at any time ("I'm good now, drop the alert").
- The flag auto-expires when the Tether session ends or after 4 hours, whichever first.

**Why this lands well:**

- Turns a private moment into a community safety net without shame.
- Plays to Tether's existing strength (group proximity awareness) — doesn't require new mechanics, just a new "elevated protection" mode.
- Friends are already opted into the group session, so the broadcast feels natural, not surveillance.
- For dating-safety use case: if you go out with friends in a Tether AND meet up with a date later, the friends know to watch you closer if you check yourself and aren't 100%.

**Code-side notes when this v2 ships:**

- Add `tether_sessions.member_protection_level` column — values: `normal` / `elevated` / `escalated`.
- `tether_members.alessia_flagged_at` timestamp for the auto-expire logic.
- The broadcast itself goes through the same Twilio/push pipe as existing Tether alerts.
- Host map UI needs a small "Alessia flagged" indicator (single subtle icon on the avatar, not a flashing warning — preserves the user's dignity).

### Status

**Stashed.** Revisit when SafeTea+ MRR > $5k/mo and we have proven funnel conversion.
