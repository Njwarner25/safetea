# SafeTea Welcome Email Sequence — Web Signups

**Audience:** New users who signed up via the web (`safetea.app`), most landing on the dashboard for the first time. Mix of AWDTSG-aware women, organic search traffic, and TikTok-driven referrals.

**Sequence goal:** Drive activation. Three behaviors define an activated user:
1. First post or first reply in the community feed
2. First city joined (or city request submitted)
3. First use of a safety tool — SafeTea Check-In ("SafeWalk"), Name Watch save, or Photo Verification

**Voice:** Protective, smart, calm. Treat the user as an adult. Never push.
**From:** "Maya at SafeTea" *(or whichever real teammate signs the founder voice)* — `hello@getsafetea.app`
**Reply-to:** Real human inbox. We answer.
**Sequence cadence:** Day 0, Day 1, Day 3, Day 7, Day 14.
**Send times below are recipient local time** (use Postmark / Customer.io localized send).

---

## Email 1 — Day 0 (immediately after signup)

**Subject (primary):** Welcome to SafeTea — here's where to start
**Subject alt 1:** You're in. Here's how SafeTea actually works.
**Subject alt 2:** Welcome — three things to do first

**Preheader:** No app required. Your city is already here.

**Send time:** Triggered, immediate (within 60 seconds of verified signup).

**Body:**

Hi {{first_name}},

Welcome to SafeTea. You're now part of a women-led community built specifically for dating safety — the privacy-first successor to the AWDTSG groups that kept disappearing.

Three things will help you get the most out of SafeTea this week:

1. **Join your city's feed.** That's where the real conversations are.
2. **Add your dashboard to your home screen** so SafeTea opens like an app. (iPhone: Share → Add to Home Screen. Android: install from Google Play or browser.)
3. **Save one name to Name Watch** — it's the fastest way to feel the value. We'll alert you the moment anyone in your city posts about them.

You don't have to do all three today. Start with whichever feels useful.

Stay safe,
Maya
SafeTea

**CTA button:** Open my dashboard → `https://safetea.app/dashboard`

---

## Email 2 — Day 1

**Subject (primary):** The one feature most members try first
**Subject alt 1:** Try this before your next first date
**Subject alt 2:** Name Watch, in 30 seconds

**Preheader:** Save a name. Get an alert if your city has the tea.

**Send time:** 10:00 AM recipient local time.

**Body:**

Hi {{first_name}},

If you only try one thing in SafeTea this week, make it Name Watch.

Here's how it works: you privately save the first name (or full name, or initials) of someone you're talking to. Whenever a woman in your city posts about that name in the community feed, you get an alert. No one sees your watch list. No one but you knows you saved a name.

It's how members find out, before the first date, whether their match has come up before.

Most members save their first name in under a minute. Want to try it?

Stay safe,
Maya

**CTA button:** Save my first name → `https://safetea.app/name-watch`

---

## Email 3 — Day 3

**Subject (primary):** Have you posted in your city yet?
**Subject alt 1:** The community is only as good as the women in it
**Subject alt 2:** Your story might be exactly what someone needs

**Preheader:** One post — anonymous, moderated, your terms.

**Send time:** 7:00 PM recipient local time (Tuesday or Thursday — higher engagement).

**Body:**

Hi {{first_name}},

The strongest part of SafeTea isn't the tech — it's what women share with each other.

If you've had a dating experience worth flagging — a red flag you spotted, a guy who lied about being single, a profile that turned out to be fake — your post could be the warning another woman needed.

A few things worth knowing:

- You post under a pseudonym. Your real name never appears.
- Posts are moderated before they go live.
- You can delete a post any time, and it's gone.

You don't have to write a novel. A few honest sentences are enough.

Stay safe,
Maya

**CTA button:** Share an experience → `https://safetea.app/post/new`

---

## Email 4 — Day 7

**Subject (primary):** Going on a date this weekend? Try Check-In.
**Subject alt 1:** A safer way to leave the house Friday night
**Subject alt 2:** The trip-share built for first dates

**Preheader:** Tell one person where you'll be. Without telling everyone.

**Send time:** Friday, 4:00 PM recipient local time.

**Body:**

Hi {{first_name}},

Quick one for the weekend.

SafeTea Check-In lets you share a date plan — where you'll be, when you should be home, and one trusted contact — without giving up your live location to a dating app or a social network. If you don't check in safe by your set time, your contact gets notified.

It's the version of "text me when you get home" that actually works, because it doesn't depend on you remembering to text.

Set one up in about 90 seconds and forget about it until Saturday morning.

Stay safe,
Maya

**CTA button:** Set up a Check-In → `https://safetea.app/checkin`

---

## Email 5 — Day 14

**Subject (primary):** Two weeks in — what's working for you?
**Subject alt 1:** A small ask from the SafeTea team
**Subject alt 2:** Reply and tell me one thing

**Preheader:** I read every reply. — Maya

**Send time:** 9:00 AM recipient local time, Wednesday.

**Body:**

Hi {{first_name}},

You've been on SafeTea for two weeks. I'd love to know how it's going.

If you have 30 seconds, hit reply and tell me one thing — a feature you've used, a moment SafeTea was helpful, or something you wish worked differently. I read every reply personally, and the next features we build come from these notes.

If you haven't tried the community feed in your city yet, that's the place where most members say SafeTea finally clicked for them. Worth one scroll.

Either way, thank you for being here.

Stay safe,
Maya

**CTA button:** Open my city feed → `https://safetea.app/feed`

*(Reply-to is a real inbox. Route replies to a triaged "founder voice" queue.)*

---

## Sequence-level notes

- **Suppression:** Pause this sequence if the user already completed the milestone the next email targets. (E.g., if they've already posted, skip Email 3 and slide Email 4 forward.)
- **Voice consistency:** Maya signs all five emails. If we use a different real name, swap globally — never alternate senders inside the sequence.
- **Anti-fearmongering check:** No email mentions assault, attack, or graphic harm. The frame is "smarter dating," not "the world is dangerous."
- **No App Store CTAs.** Email 1 is the only place we mention install paths, and only as an option.
- **Tagline use:** Used once, in Email 1's CTA flow, implicitly. We avoid repeating "Stay connected, stay safe." across every email — it loses meaning when overused.
- **Stat claims:** None used in this sequence. If the team wants social-proof numbers, gate behind `<<VERIFY: …>>` before adding.
