# SafeTea iOS Waitlist Nurture Sequence

**Audience:** Users who came to `safetea.app` looking for an iOS app, hit the "Coming to iOS" waitlist block, and dropped their email instead of starting in the browser. They self-identified as iPhone users who *want* a native app.

**The job to be done:** Convert this cohort into active web/PWA users this month — without burning the goodwill we'll need when the iOS app does launch. They have to feel respected, not redirected.

**Tone:** Honest about the iOS timing. Confident about the web product. Never apologetic in a way that undermines the brand. We are not "sorry there's no app" — we built a real product that runs in their browser, and the iOS version is icing.

**From:** "Maya at SafeTea" — `hello@getsafetea.app`
**Reply-to:** Real human inbox.
**Sequence cadence:** Day 0, Day 2, Day 7, Day 14.
**Send times:** Recipient local time.

---

## Message 1 — Day 0 (immediately after waitlist signup)

**Subject (primary):** You're on the SafeTea iOS list — and you can start today
**Subject alt 1:** iOS app: coming. SafeTea: already here.
**Subject alt 2:** While we wait on Apple, here's the shortcut

**Preheader:** Two taps to a SafeTea icon on your iPhone.

**Send time:** Triggered, immediate.

**Body:**

Hi {{first_name}},

You're on the iOS launch list — we'll email you the day the App Store version goes live, and only that day.

In the meantime, you don't have to wait. The full SafeTea experience already runs in Safari, Chrome, and Firefox on iPhone. Open `safetea.app`, tap **Share → Add to Home Screen**, and you'll get a SafeTea icon that looks and behaves like an app — full screen, no browser bar, notifications included.

Same account, same community, same safety tools. The iOS app, when it ships, is the icing — not the cake.

Stay safe,
Maya
SafeTea

**CTA button:** Open SafeTea on my iPhone → `https://safetea.app/onboarding`

---

## Message 2 — Day 2

**Subject (primary):** What you actually get on the SafeTea web app
**Subject alt 1:** Three things our iPhone members use most
**Subject alt 2:** Same product, no App Store

**Preheader:** Name Watch, Check-In, your city's feed — all in your browser.

**Send time:** 7:00 PM recipient local time.

**Body:**

Hi {{first_name}},

Quick rundown of what the web version includes for iPhone users — because "web app" sometimes means "stripped down," and that's not the case here.

- **Your city's feed.** Every post, every alert, in real time.
- **Name Watch.** Save a name, get notified the moment your city posts about it.
- **SafeTea Check-In.** Share a date plan with a trusted contact without giving up live location.
- **Pseudonyms, moderation, identity verification.** All baked in from day one.

It's the same product the Android version is built on, the same product the iOS app will be built on. Worth opening before your next first date.

Stay safe,
Maya

**CTA button:** Try it now → `https://safetea.app/dashboard`

---

## Message 3 — Day 7

**Subject (primary):** Why we built SafeTea for the browser first
**Subject alt 1:** A feature, not a workaround
**Subject alt 2:** When safety lives on someone else's platform

**Preheader:** AWDTSG groups disappeared overnight. SafeTea won't.

**Send time:** Tuesday, 10:00 AM recipient local time.

**Body:**

Hi {{first_name}},

A note on why SafeTea works the way it does.

When AWDTSG groups got deleted by Facebook — sometimes 50,000 members at a time — every safety report inside vanished with them. We built SafeTea to be a real platform, not a tenant on someone else's. That means the web is a first-class home for the community, not a placeholder while we wait for an app store to approve us.

The iOS app is coming. We're excited about it. But the most important promise we can make is that SafeTea will still be here, working, the day after — regardless of what any platform decides.

You can join your city right now in your browser. Most members never even notice the difference.

Stay safe,
Maya

**CTA button:** Join my city → `https://safetea.app/onboarding`

---

## Message 4 — Day 14

**Subject (primary):** Last one from me until the iOS app ships
**Subject alt 1:** Wrapping up — and one offer
**Subject alt 2:** I'll be quiet until launch day

**Preheader:** No more emails until the iOS app is live. Promise.

**Send time:** 9:00 AM recipient local time.

**Body:**

Hi {{first_name}},

This is the last note from me until the iOS app actually goes live — I'm not going to fill your inbox in the meantime.

Two ways to leave this:

1. **Try the web app once.** Open `safetea.app` on your iPhone, add it to your Home Screen, and see what's there. Most members tell us they stop noticing it isn't from the App Store after a few days.
2. **Stay on the list and we'll email you on launch day.** No countdowns, no "X days until iOS" emails. One email, when there's news.

Either way is fine with me. If you have questions about why we built SafeTea this way — or anything else — hit reply. I read everything.

Stay safe,
Maya
SafeTea

**CTA button:** Open SafeTea in my browser → `https://safetea.app/onboarding`

---

## Sequence-level notes

- **Suppression:** If the user creates an account on the web at any point, end the sequence and roll them into the standard welcome sequence (`welcome-email-sequence.md`) starting from whichever email they haven't received. Never run both in parallel.
- **No "we're sorry" framing.** Apologizing for the iOS delay would tell the user that the web app is a consolation prize. It isn't.
- **No fake urgency.** No "iOS launching in X days" countdowns — we don't control App Store review and shouldn't pretend we do.
- **Honesty about Apple.** Message 3 names the Facebook-group failure mode (truthful, on-brand) but never speculates about Apple's process. We do not promise an App Store launch date in any message.
- **Promise-keeping.** Message 4 explicitly promises silence until launch — honor it. Do not send re-engagement emails, drip nurtures, or "still here" pings between Day 14 and the actual iOS launch announcement.
- **Tagline use:** Intentionally not used in this sequence. The cohort is skeptical-by-default; tagline lines read as marketing where this sequence needs to read as a real human writing.
- **No fabricated stats.** If we want to add proof points (e.g., "X% of members are iPhone users on the PWA"), gate behind `<<VERIFY: …>>` and source from production analytics before sending.
