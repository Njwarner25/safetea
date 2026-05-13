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

### Why this has viral capability (operator's read, captured for the launch playbook)

**Demo math:**

- A 15-second TikTok of "test your eyes after drinking" has every ingredient social platforms reward: visual anomaly, before/after comparison, mild taboo, group-friendly, immediately reproducible. The eyes-tracking-something-on-screen visual is genuinely interesting to watch.
- Three creator niches overlap on this: dating-safety, women's-safety, harm-reduction. Each has separate audiences that don't see each other's content. Three orthogonal organic distribution channels.
- The Tether broadcast layer ("Sarah needs extra eyes tonight") is its own emotional micro-moment that creators can dramatize — group caring for one of their own. That's the slow-burn second wave of content after the initial test demos.
- Counter-cultural angle: feels protective, not surveilling. Modern audiences are saturated with "safety tech" that's really tracking — this one is the user choosing to know about themselves.

**Pre-launch playbook (do BEFORE you ship the feature, not after):**

1. **Pick a name.** "Eye check" is descriptive but bland. Brand it. Options to brainstorm: "SafetyVision," "ClearCheck," "TheCheck," "GoSafe," "InFocus." A short branded name shows up better in captions and hashtags. The name should be ownable as a hashtag — search availability matters.

2. **Build a waitlist page** at `/the-check.html` (or whatever the name becomes) the moment you commit to building. Lets you start collecting emails 8–12 weeks before launch. Use the existing email-drip system to nurture the list. **A 5,000-email waitlist on launch day beats a perfect launch with nobody knowing.**

3. **Line up 5–10 creators before launch.** Mid-tier (50k–500k followers) in the three verticals above. Pay them properly — $500–2,000 per video, NOT "exposure." Send each one early access two weeks before public launch so their content drops in the first 72 hours of public availability.

4. **Pre-build the demo format.** A single 15-second TikTok template anyone can recreate: phone selfie cam, follow the dot on screen, score result with the Alessia voice line read aloud. Make the template downloadable. The easier it is to replicate, the more replicates you get.

5. **One concrete launch CTA.** Not "download our app." Specifically: *"Test yourself before driving home this weekend. Send this to a friend who's going out."* Friend-tagging is the only viral mechanic that consistently works.

**Why it might not go viral (be honest about this):**

- App Store / Play Store could refuse to approve the feature if the framing slips toward "sobriety test." Always-warm legal review before each marketing asset, not after.
- Most "viral" features don't actually go viral. Most launches are silent. Build assuming you'll need paid distribution to seed it, and treat any organic spread as a bonus.
- The 30-second TikTok attention window means the moment-of-result has to be visually clear. The score number has to LOOK like something — a clean animation, a color, a sound. Not a paragraph of text.
- If a single user records themselves passing the check, then drives, then crashes — the resulting media coverage could be catastrophic. Liability framing must be airtight in EULA AND every piece of marketing.

**The single most important thing to nail:**

The result-reveal moment in the app. The 2-second beat between "test complete" and Alessia's voice-line. That's the screenshot people share. If that's a beautiful, clean, emotionally-clear moment — with Alessia's soft warm voice and a number that looks meaningful — the feature spreads. If that's a janky modal with raw decimal points, it dies.

Invest disproportionately in that 2 seconds.

### The FaceTime-style delivery (this is the killer UX beat)

**Operator's framing:** After the test, Alessia doesn't show up as a chat bubble or a toast. She shows up as a **FaceTime-style incoming call**. Full-screen avatar, call frame, ringtone, "Decline / Answer" buttons. The user "picks up" and Alessia delivers the assessment face-to-face, mixing light humor with a protective core.

**Why this works:**

- Turns a system notification into an emotional event. Notifications are forgettable. Phone calls feel like someone's there.
- The "video call" framing primes the user to listen instead of swipe-away. You don't ignore a friend calling — you ignore a banner.
- Visually unique. Every other safety app uses banners and chat bubbles. Nobody does fake-FaceTime. **The screenshot of Alessia's "incoming call" overlay is the single most shareable image this product could produce.**
- Makes the humor land. A flat text response with a joke reads as snarky. The same line delivered by a warm animated friend on a call reads as care.

**The interaction beat:**

1. User finishes the eye check.
2. 1-second pause. Screen darkens slightly.
3. Alessia's avatar slides in, full-screen, with the call-style frame (blurred background, name + "incoming"). Soft ringtone.
4. User taps "Answer."
5. Alessia speaks her assessment line in her chosen voice (calm / gentle / encouraging / direct — already in the system prompt). Pre-rendered TTS or live ElevenLabs depending on cost.
6. Light-hearted opener → protective pivot → concrete next step. Three beats, ~10 seconds total.
7. End of call shows three buttons: "Call a Lyft," "Tell my Tether crew," "I'm okay — log it." Whichever the user picks fires the corresponding action.
8. Whole call auto-records to Vault as a date-stamped check-in (evidence + memory).

**Sample Alessia voice lines** (light-hearted opener + protective core):

- *"Hey hon — okay, your eyes are doing a little tour without you tonight. I'm not your mom, but seriously, stay with the girls and let's get you a Lyft, yeah?"*
- *"Eyes are saying 'one more shot,' brain is saying 'absolutely not.' Listen to the brain. Where are your friends right now?"*
- *"Babe, those eyes are wobbling like you're about to text your ex. We're going to NOT do that. Hand on phone, friends in sight, Lyft on the way — yes?"*
- *"You did the check, that's the move. Score's a little soft right now. Doesn't mean disaster, does mean stay close to your people. Want me to ping them?"*
- (Roofie suspicion / sudden drop) *"Sweetheart — something changed quick and I don't love it. Let's get out of here. I'm calling you a Lyft and pinging [trusted contact] right now unless you tell me no."*

**Tone rules** (locked):

- Light when the situation is light (mild impairment, friends present).
- Serious when the situation is serious (sharp drop suggesting drug exposure, alone).
- Humor must always pivot to action — never end on a joke.
- Use the user's preferred name + casual endearments matching their `tone` preference (gentle/calm = "hon" / "hey"; direct = no endearment).
- Match Alessia's existing system-prompt rules: never command, always offer; never lecture; preserve agency.

**Build complexity (be honest):**

- The FaceTime visual itself: 1–2 days of UI work. Standard.
- The animated avatar with lip-sync to the audio: **this is the actual work.** Options ranked by build cost:
  1. **Pre-rendered video loops** with TTS-generated audio overlaid. Cheapest (~$500 with HeyGen / D-ID for 10–20 line variants). Looks ~80% as good as full lip-sync.
  2. **Apple Memoji-style 2D rig** with TTS-driven mouth phonemes. Mid-cost. Looks great, fully dynamic.
  3. **Live ElevenLabs voice + 2D rig.** Best feel, most expensive (~$0.30 per call in voice generation + dev cost). Worth it once paid users are >2k/mo.
- Voice generation: ElevenLabs has a "warm female friend" voice that nails this brief. ~$0.30 / 2-min audio at their pro tier. Pre-render the 20 most common assessment lines to cache and cut cost to near-zero.
- Audio playback in app: trivial — Expo `expo-av` already in the project.

**Recommendation: ship v2 with the pre-rendered video loop (option 1) and ElevenLabs-generated audio.** Looks premium, costs almost nothing per call, gets to launch fast. Upgrade to live lip-sync (option 2 or 3) when MRR can support the dev time.

**The recording-to-Vault beat is the second-order viral hook:** users showing their friends "this is what Alessia said to me last night" the next morning. Free word-of-mouth distribution AND emotional connection to the product.

### Status

**Stashed.** Revisit when SafeTea+ MRR > $5k/mo and we have proven funnel conversion. When you do start, the launch playbook above gets pulled into a separate `docs/LAUNCH_PLAYBOOK_v2.md` and gates the build work — no code until the waitlist + creator outreach is at least planned.

---

## Voice-activated Safe Word

A spoken phrase fires SafeLink + trusted-contact alerts hands-free. User picks their own phrase during onboarding — something they'd never accidentally say but could mention naturally in conversation. Examples: *"Alessia, my battery's about to die,"* *"I forgot to feed the dog,"* *"It's getting late, isn't it?"*

**Why it matters:** when someone's actively unsafe they often can't reach for their phone openly. A spoken trigger lets them activate a full SOS while looking like they're complaining about something mundane to the person threatening them.

**Build pieces:** background voice listening (iOS `SFSpeechRecognizer` / Android `SpeechRecognizer`) gated to user-chosen phrase only, fires the same Twilio + push fan-out as the existing Pulse escalate path. Battery cost is the real engineering challenge — needs efficient on-device wake-word detection (Picovoice or Apple's keyword spotter) so you're not running full speech-to-text 24/7.

**Demo angle:** TikTok-friendly. Person at fake bar with friend, says the phrase casually, phone screen shows SafeLink activating silently. Three seconds, no music needed. Perfect.

**Risks:** false triggers on common phrases would burn user trust + Twilio credit. The phrase MUST be unique per user, not a one-size phrase. Also: always-on mic raises App Store privacy review questions. Frame as "wake-word only, no audio leaves the device, no audio recorded" and document the on-device wake-word architecture explicitly in App Privacy.

---

## Duress mode (for coercive-control situations)

For users in abusive relationships where an abuser monitors their phone. App shows a "green / safe" check-in to the abuser, while a hidden parallel check-in goes to trusted contacts and law-enforcement contacts if pre-configured.

Two PIN codes during setup: a "normal" PIN that opens the app cleanly, and a "duress" PIN that opens an app that **looks identical** but secretly:
- Sends a real-time location ping to trusted contacts every 5 minutes
- Disables the abuser's ability to delete the SafeTea account
- Logs every screen tap into Vault as evidence (encrypted, abuser can't see)
- Auto-records a portion of ambient audio if the user holds a specific gesture (volume-down × 3)

**Why it matters:** this is the safety use case that no consumer app currently serves. The market here isn't dating-app safety — it's the 1-in-4 women experiencing domestic abuse. They are the people who need this most and can pay $7.99 for it least, BUT this is the feature that wins partnerships with DV shelters, women's centers, hospitals.

**Risks:** the duress mode must be invisible to the abuser. Any UI hint that "you might have a duress mode" can get the user hurt. Design must be airtight. Probably best built with a domestic-violence advocacy org as a consulting partner.

**Pricing implication:** this is the feature that justifies free-with-grant access. Partner with shelters / advocacy orgs to fund free SafeTea accounts for their clients. B2B-like revenue without B2B sales overhead.

---

## Family Safety Bundle — $14.99 / month, 4 users

A single subscription covers up to 4 users (e.g., a mom + 2 adult daughters + a partner). Each user has their own Vault, Tether sessions, etc., but the billing is unified.

**Why it matters:** the "worried mom" buyer has higher willingness to pay than the individual user. She's paying for peace of mind about her daughters, not for herself. That's a different price elasticity entirely — she'd pay $15 the same way she'd pay $8 because the alternative (worrying about her kid alone in a city) is worth way more.

**Mechanics:** primary subscriber adds family members by phone number. Each gets an invite to install the app. Their Tether sessions can include each other by default ("Mom can see your live location if you start a SafeLink"). Each member opts into what they share.

**ARPU math:** $14.99 / 4 = $3.75/user effective. Lower per-user, but capture rate at the household level is much higher because the decision-maker (mom) is more motivated than the dependent (daughter).

**Build cost:** small. Add `family_subscriptions` table, link `users.family_subscription_id`, gate features on `is_active_in_family || is_active_solo_subscriber`. Stripe webhook handles the family-plan SKU. ~2 days of work.

---

## Panic Typo

A specific typo pattern in ANY text input — say, ten Y's in a row (`yyyyyyyyyy`) — silently triggers a panic alert without showing anything on screen.

**Why it matters:** counter-surveillance for situations where an abuser is reading over the user's shoulder or has remote access to messages. The user can type the trigger in iMessage to a friend, in a Notes app, in the SafeTea community feed, anywhere — and the alert fires without the abuser seeing any UI hint.

**Build:** on iOS, an Accessibility Service listens for the pattern in any active text field. On Android, an `AccessibilityService` accomplishes the same. Both require explicit user opt-in for accessibility permission, which is hard to get but worth it for the at-risk population.

**Combined with Duress Mode**, this becomes a layered counter-surveillance toolkit that nothing else on the market matches.

---

## Safety Streak (engagement gamification)

Daily Alessia check-in earns a streak token. Hit 7 days → unlock a small reward (themed avatar, a discount on the next year of SafeTea+). 30 days → unlock "trusted user" badge.

**Why it matters:** the muscle memory of opening the app every day is the difference between users who panic-install in a moment of fear (and uninstall a month later) and users who treat SafeTea as part of their daily routine (and are still subscribed in year 2).

**Mechanic:** the daily check-in is just opening Alessia and answering a one-tap "how are you" pulse. Takes 5 seconds. The streak counter visible on dashboard. Auto-paused for users who haven't opened the app in 7 days (no shame, just resets).

**Why this isn't gimmicky:** for the safety use case, daily app engagement is itself protective. A user who has the app open daily is a user who will think to use it when something happens. Streak is just the gentle nudge that makes that real.

---

## Status (overall)

Everything in this file is **stashed, not committed**. Capture exists so ideas don't evaporate; build order is determined by the data after launch, not by enthusiasm now.
