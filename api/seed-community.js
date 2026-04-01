const { sql } = require('@vercel/postgres');
const { getOne, getMany, run } = require('./_utils/db');

/**
 * Seed community feeds with realistic content.
 * POST /api/seed-community?secret=MIGRATE_SECRET
 *
 * Creates seed accounts per city and populates posts, replies, and likes
 * with backdated timestamps spread over 2-3 weeks.
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.headers['x-migrate-secret'] || req.query.secret;
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const results = { accounts_created: 0, posts_created: 0, replies_created: 0, likes_created: 0, errors: [] };

  try {
    // ─── SEED DATA ───
    const SEED_DATA = {
      'Chicago': {
        accounts: [
          { name: 'ChiTownQueen', color: '#E8A0B5' },
          { name: 'LakeshoreLady', color: '#A0C4E8' },
          { name: 'WickerParkWoman', color: '#C4E8A0' },
          { name: 'SouthLoopSis', color: '#E8C4A0' },
          { name: 'LoganSquareLove', color: '#C4A0E8' },
          { name: 'RavenswoodRose', color: '#A0E8C4' },
          { name: 'WestLoopWine', color: '#E8A0C4' },
          { name: 'LincolnParkLass', color: '#A0E8E8' }
        ],
        posts: [
          { author: 'ChiTownQueen', category: 'tea-talk', title: 'Lincoln Park warning — guy on Hinge', body: 'Ladies in Lincoln Park be careful with a guy named Marcus on Hinge. Tall, works in finance supposedly. We went on 3 dates and he was perfect. Then I found his whole Instagram with his GIRLFRIEND tagged in every other photo. When I confronted him he said they were "on a break." Sir, she posted you two at brunch YESTERDAY. Block and delete. 🚮' },
          { author: 'LakeshoreLady', category: 'tea-talk', title: 'Lakeview personal trainer red flag', body: 'Has anyone else matched with a guy in Lakeview who says he\'s a personal trainer? Goes by Mike or Michael. He asked me to come to his apartment for a "home cooked dinner" as a first date. When I said I\'d prefer a restaurant he got super aggressive and said I was "high maintenance." Unmatched immediately but wanted to put this out there.' },
          { author: 'WickerParkWoman', category: 'tea-talk', title: 'Love bombing in Wicker Park', body: 'Warning about a Bumble guy in Wicker Park area. Name starts with J. Very charming at first, lots of compliments, wanted to talk 24/7. Classic love bombing. By date 3 he was already talking about moving in together and got angry when I said I wanted to take things slow. Trust your gut ladies. When it feels too fast, it IS too fast.' },
          { author: 'SouthLoopSis', category: 'tea-talk', title: 'He Venmo requested me after dinner 😂', body: 'Just want to vent. Went on what I thought was a great date in the South Loop. Dinner, walked along the lake, really nice conversation. Then he texted me later asking me to Venmo him half the dinner bill because "equality." The bill was $47. Sir you suggested the restaurant. I can\'t. 😂' },
          { author: 'LoganSquareLove', category: 'tea-talk', title: 'PSA: "Separated" means MARRIED', body: 'PSA: If a man tells you he\'s "separated" and can\'t show you the divorce papers, he is MARRIED. Learned this the hard way with someone from the Logan Square area. His wife actually messaged me on Facebook. I felt terrible. Always verify ladies.' },
          { author: 'RavenswoodRose', category: 'good-guys', title: 'A genuinely good Hinge date', body: 'Shoutout to a guy I met on Hinge last month in Ravenswood. Won\'t say his name for his privacy but he planned our entire first date — picked a restaurant near my place so I wouldn\'t have to travel far, walked me to my car after, and texted me when he got home to make sure I got in safe too. We\'re still talking and he\'s been consistent the entire time. They do exist. 💚' },
          { author: 'ChiTownQueen', category: 'good-guys', title: 'Bumble guy looked like his photos!', body: 'Met someone on Bumble. He showed up looking EXACTLY like his photos (why is this so rare??). He was honest that he\'d been on a few other dates recently and wanted to be transparent. We ended up not being a match but honestly I respected him so much for just being real. Good guys are out there.' },
          { author: 'WestLoopWine', category: 'good-guys', title: 'Positive update — 5 dates in', body: 'Just want to give a positive update. The guy I posted about being nervous about 2 weeks ago? We\'ve been on 5 dates now and he has been nothing but respectful. He always asks before even holding my hand. Never pressures me about going to his place. Checks in after every date. I was scared to trust again after my last situationship but this one feels different. Rooting for this one 🤞' }
        ]
      },
      'Dallas': {
        accounts: [
          { name: 'DallasDarling', color: '#E8A0B5' },
          { name: 'DeepEllumDiva', color: '#A0C4E8' },
          { name: 'PlanoProtector', color: '#C4E8A0' },
          { name: 'FriscoFemme', color: '#E8C4A0' },
          { name: 'UptownAngel', color: '#C4A0E8' },
          { name: 'HighlandParkHer', color: '#A0E8C4' },
          { name: 'BishopArtsBabe', color: '#E8A0C4' }
        ],
        posts: [
          { author: 'DallasDarling', category: 'tea-talk', title: 'Uptown Tinder guy — rotating roster', body: 'Girls in Uptown PLEASE be careful with a guy on Tinder who says he works in real estate. Goes by Chris or Christopher. He took me on what I thought was an amazing first date then ghosted for 2 weeks. When he came back he acted like nothing happened. Found out through a friend he does this to multiple women at the same time. Rotating roster. Next. 🗑️' },
          { author: 'DeepEllumDiva', category: 'tea-talk', title: 'Asked to borrow money after 2 dates', body: 'This is embarrassing but I want to warn others. Met a guy from Deep Ellum who seemed great. After 2 dates he asked to borrow $200 for "car trouble." I said no and suddenly he couldn\'t make our next date. And the next one. And the next. Ladies if he\'s asking for money before you\'re even official, RUN.' },
          { author: 'PlanoProtector', category: 'tea-talk', title: 'Different ages on different apps', body: 'Anyone dealt with a guy in the Plano/Frisco area who\'s on both Hinge and Bumble with different ages listed? He told me he was 32 on Hinge and my friend matched with him on Bumble where he says 28. What else is he lying about? Hard pass.' },
          { author: 'FriscoFemme', category: 'good-guys', title: 'He drove me to the vet on date 1', body: 'Okay I have to share this because it literally never happens. Went on a first date in Frisco, halfway through dinner I got a call that my dog was sick at the boarder. I was so upset and apologized and said I had to go. This man not only understood, he DROVE ME to the vet because I was too shaken up to drive. Stayed in the waiting room for an hour. Didn\'t even try anything. Just said "your dog needs you right now." I\'m not crying you\'re crying 😭' },
          { author: 'UptownAngel', category: 'good-guys', title: 'Almost deleted all apps — glad I didn\'t', body: 'Quick appreciation post. After a string of awful dates I almost deleted all my apps. Gave it one more shot and matched with someone who has been nothing but honest and kind. He told me on date 1 exactly what he was looking for. No games. We\'re 2 months in now and I\'m so glad I didn\'t give up. Keep going queens.' }
        ]
      },
      'Houston': {
        accounts: [
          { name: 'HTownHoney', color: '#E8A0B5' },
          { name: 'MontroseMaven', color: '#A0C4E8' },
          { name: 'SugarLandSis', color: '#C4E8A0' },
          { name: 'GalleriaGirl', color: '#E8C4A0' },
          { name: 'KatyQueen', color: '#C4A0E8' },
          { name: 'HeightsHunny', color: '#A0E8C4' },
          { name: 'RiceVillageRose', color: '#E8A0C4' }
        ],
        posts: [
          { author: 'HTownHoney', category: 'tea-talk', title: 'Heights area — forgot wallet TWICE', body: 'Heights area ladies watch out. There\'s a guy on Hinge, late 20s, beard, says he\'s an engineer. We went out twice and both times he "forgot his wallet." Fool me once shame on you. Fool me twice I\'m posting on SafeTea. 💅' },
          { author: 'MontroseMaven', category: 'tea-talk', title: 'Entire date about his ex', body: 'Not sure if this counts but I want to put it out there. Matched with someone in Montrose who seemed amazing over text. Met up and he spent the ENTIRE date talking about his ex. Like the entire 2 hours. When I tried to change the subject he circled right back. He\'s not dangerous just emotionally unavailable and wasting your time. You\'ve been warned 😅' },
          { author: 'SugarLandSis', category: 'tea-talk', title: 'Tried to get me to leave the restaurant', body: 'Serious warning. A guy from the Sugar Land area on Bumble tried to get me to leave the restaurant and go to a "party" at his friend\'s house on our FIRST date. When I said no he got visibly irritated and said I was boring. Something felt really off about the whole thing. Always trust your instincts and never leave a public place on a first date.' },
          { author: 'GalleriaGirl', category: 'good-guys', title: 'Drove 45 min to bring me soup', body: 'I have to brag for a second. This man drove 45 minutes across Houston in rush hour traffic to bring me soup when I was sick. We\'ve only been dating for 3 weeks. He didn\'t even come inside, just dropped it at my door and texted "feel better, no need to entertain me when you\'re not feeling well." The bar is on the floor and he still managed to clear it by a mile. 🥹' },
          { author: 'KatyQueen', category: 'good-guys', title: 'He noticed I was uncomfortable', body: 'Positive post because we need more of these. Went on a date with a guy who noticed I was uncomfortable when a group of loud guys sat next to us at the bar. Without me saying anything he asked if I wanted to move to a quieter table. Small thing but it told me everything I needed to know about his awareness. Still seeing him. 💛' }
        ]
      },
      'Atlanta': {
        accounts: [
          { name: 'PeachtreePrincess', color: '#E8A0B5' },
          { name: 'MidtownMiss', color: '#A0C4E8' },
          { name: 'DecaturDoll', color: '#C4E8A0' },
          { name: 'GrantParkGem', color: '#E8C4A0' },
          { name: 'ATLBabe404', color: '#C4A0E8' },
          { name: 'BuckheadBeauty', color: '#A0E8C4' },
          { name: 'EastATLAngel', color: '#E8A0C4' }
        ],
        posts: [
          { author: 'PeachtreePrincess', category: 'tea-talk', title: 'Buckhead "entrepreneur" lives with his mama', body: 'Buckhead ladies I need you to hear me. There is a man on Tinder who tells every woman he matches with that he\'s an "entrepreneur" and "investor." He is neither. He lives with his mama and drives her car. He will try to impress you with fancy restaurant pics that are all from 2019. The streets are TALKING. 🫖' },
          { author: 'MidtownMiss', category: 'tea-talk', title: 'Same pickup lines to me AND my roommate', body: 'Has anyone in Midtown matched with a guy named D on Hinge? Tall, dreads, says he models? He\'s been messaging my roommate AND me at the same time. Same pickup lines copy and pasted. When we confronted him he said "I didn\'t know y\'all knew each other." Boy BYE. 👋' },
          { author: 'DecaturDoll', category: 'tea-talk', title: 'Showed up at the same coffee shop twice', body: 'I don\'t usually post but this one scared me. Met a guy from the Decatur area for coffee. Everything was fine until I said I wasn\'t interested in a second date. He showed up at the same coffee shop the next day "by coincidence." And the day after that. I changed my routine and haven\'t seen him since but please be careful sharing your regular spots too early.' },
          { author: 'GrantParkGem', category: 'good-guys', title: 'Gave me his jacket in the rain', body: 'Let me tell y\'all about this man. Third date, we went for a walk in Grant Park. It started raining out of nowhere. This man took off his jacket and held it over me while we ran to the car. Got completely soaked. Didn\'t complain once. Just laughed and said "well that was an adventure." I\'m KEEPING him. 😍' },
          { author: 'ATLBabe404', category: 'good-guys', title: 'Handled rejection like a grown man', body: 'Appreciation post for a guy who handled rejection like a grown man. We went on two dates, great conversation, but the chemistry just wasn\'t there for me. When I told him honestly, he said "I appreciate you being upfront instead of ghosting. I hope you find what you\'re looking for." No guilt trip, no attitude. THAT is a good guy. More of this please.' }
        ]
      },
      'Miami': {
        accounts: [
          { name: 'MiamiMami305', color: '#E8A0B5' },
          { name: 'CoconutGroveChick', color: '#A0C4E8' },
          { name: 'WynwoodWarrior', color: '#C4E8A0' },
          { name: 'SoBeQueen', color: '#E8C4A0' },
          { name: 'BrickellBabe', color: '#C4A0E8' },
          { name: 'CoralGablesGirl', color: '#A0E8C4' },
          { name: 'DoralDarling', color: '#E8A0C4' }
        ],
        posts: [
          { author: 'MiamiMami305', category: 'tea-talk', title: 'Brickell crypto bro — balcony faces NORTH', body: 'Brickell girls this one\'s for you. Guy on Hinge, works in "crypto" or "consulting" or whatever they\'re calling unemployment these days. Takes you to a nice dinner then asks you to come back to his place to "watch the sunset from his balcony." His balcony faces NORTH. There is no sunset sir. Just vibes and lies. 🌅🚩' },
          { author: 'CoconutGroveChick', category: 'tea-talk', title: 'He brought his FRIEND to our date', body: 'Warning about someone in the Coconut Grove area. Met on Bumble, seemed super sweet, planned a nice date. Showed up and he had brought his FRIEND. Said his friend "just wanted to meet me too." Absolutely not. I left immediately. Trust your instincts.' },
          { author: 'WynwoodWarrior', category: 'tea-talk', title: 'Different photos on every app', body: 'Be careful with a guy in Wynwood who\'s very active on multiple apps. Uses different photos on each one. Some are clearly years old. When I called him out he said the apps "compress the photos and make them look different." That\'s not how photos work. Bye. 📸🗑️' },
          { author: 'SoBeQueen', category: 'good-guys', title: 'Walks me to my car every time', body: 'Posting a W because we need more positivity in here. Met someone on Hinge and we\'ve been on 6 dates over the past month. Every single time he walks me to my car, waits until I\'m inside with the doors locked, and watches me drive away before he leaves. He says his mom raised him right. Shoutout to his mom. 💚' },
          { author: 'BrickellBabe', category: 'good-guys', title: 'He asked what makes me feel safe', body: 'Green flag alert 🟢 This man asked me on our second date what makes me feel safe. Not in a weird way, genuinely wanted to know how to make sure I was comfortable. We talked about boundaries and he\'s respected every single one. Girls it\'s possible to find someone who actually listens.' }
        ]
      },
      'Los Angeles': {
        accounts: [
          { name: 'SilverLakeSiren', color: '#E8A0B5' },
          { name: 'WeHoWarning', color: '#A0C4E8' },
          { name: 'SantaMonicaSafe', color: '#C4E8A0' },
          { name: 'EchoParkElla', color: '#E8C4A0' },
          { name: 'BurbankBella', color: '#C4A0E8' },
          { name: 'DTLA_Diva', color: '#A0E8C4' },
          { name: 'VeniceVibes', color: '#E8A0C4' }
        ],
        posts: [
          { author: 'SilverLakeSiren', category: 'tea-talk', title: 'Silver Lake "producer" with 12 SoundCloud followers', body: 'Silver Lake area heads up. There\'s a guy on the apps who says he\'s a "producer." He is not. He has a SoundCloud with 12 followers. He will try to get you to come to his "studio" (bedroom) to "listen to his tracks." Classic. Save yourselves. 🎵🚩' },
          { author: 'WeHoWarning', category: 'tea-talk', title: 'Found a SECOND phone in his car', body: 'I need to get this off my chest. Dated a guy from WeHo for 2 months. Everything was incredible. Then I found a second phone in his car. A SECOND PHONE. He said it was his "work phone." It was not his work phone. It was his other-women phone. I cannot make this up.' },
          { author: 'SantaMonicaSafe', category: 'tea-talk', title: '14 messages in 2 hours because I didn\'t reply', body: 'Has anyone had issues with men on dating apps in the Santa Monica area getting aggressive when you don\'t respond fast enough? I had a guy send me 14 messages in 2 hours because I didn\'t reply during my work meeting. Then called me "stuck up" and "not that pretty anyway." These are the red flags ladies. If he can\'t handle a 2-hour response gap imagine him in a relationship.' },
          { author: 'EchoParkElla', category: 'good-guys', title: '"I\'ll always walk you to your car"', body: 'I\'m actually emotional writing this. After years of terrible dating experiences I met someone who is genuinely kind. On our second date I mentioned I was nervous about walking to my car alone at night. Without skipping a beat he said "I\'ll always walk you to your car. That\'s not even a question." And he has. Every single time. It shouldn\'t be this rare but here we are. 🥺' },
          { author: 'BurbankBella', category: 'good-guys', title: 'Spilled wine on my dress — pure class', body: 'Good guy sighting! Went on a date and I accidentally spilled wine on my dress. I was mortified. This man didn\'t even flinch. He laughed it off, gave me his jacket to cover the stain, and said "now we have a great story." No judgment, no awkwardness. Pure class.' }
        ]
      },
      'Philadelphia': {
        accounts: [
          { name: 'RittenhouseRose', color: '#E8A0B5' },
          { name: 'FishTownFemme', color: '#A0C4E8' },
          { name: 'ManayunkMaven', color: '#C4E8A0' },
          { name: 'OldCityOpal', color: '#E8C4A0' },
          { name: 'SouthPhillySis', color: '#C4A0E8' },
          { name: 'NoLibsNikki', color: '#A0E8C4' },
          { name: 'UniversityCityU', color: '#E8A0C4' }
        ],
        posts: [
          { author: 'RittenhouseRose', category: 'tea-talk', title: 'Rittenhouse Square "finance bro" warning', body: 'Ladies in Rittenhouse be careful with a guy on Hinge who claims he works in finance on Market Street. Very smooth talker, always picks expensive restaurants then "accidentally" leaves his card in the car. Three different girls from my friend group have been through the same thing with him. He is running a whole operation. Block on sight. 💳🚩' },
          { author: 'FishTownFemme', category: 'tea-talk', title: 'Showed me pics of his ex the whole date', body: 'Fishtown area warning. Went on what was supposed to be a chill date at a coffee shop. This man pulled out his phone and showed me pictures of his ex for 20 minutes straight. Talking about how much he misses her. Sir this is a DATE. I am not your therapist. I wished him well and left. Emotionally unavailable doesn\'t even begin to cover it. 😩' },
          { author: 'ManayunkMaven', category: 'tea-talk', title: 'Lied about his height AND his age', body: 'Has anyone matched with a guy near Manayunk who\'s on both Hinge and Bumble? He\'s listed as 6\'0 on one and 5\'9 on the other. Age is different on each app too. When I asked about it he said "those apps auto-fill wrong." No they don\'t. If the first thing you do is lie about the basics, I cannot trust anything else. Unmatched.' },
          { author: 'OldCityOpal', category: 'good-guys', title: 'Walked me home even though it was out of his way', body: 'Giving a shoutout to a genuinely good man I met on Bumble. After our date in Old City he walked me all the way home even though his car was parked in the opposite direction. When I said he didn\'t have to he said "I\'d rather know you got home safe than save myself 15 minutes." We\'re 4 dates in and he has been nothing but consistent. They DO exist. 💚' },
          { author: 'SouthPhillySis', category: 'good-guys', title: 'He remembered the little things', body: 'Appreciation post. This guy remembered that I mentioned I was nervous about a work presentation — on our second date. Texted me the morning of to wish me luck. After the presentation he asked how it went. Nobody has ever paid that much attention to what I say. It\'s the little things. Don\'t settle for someone who doesn\'t listen. 🥺' },
          { author: 'NoLibsNikki', category: 'tea-talk', title: 'Followed me on Instagram after I said no', body: 'Northern Liberties area — went on one date with a guy who seemed nice. Decided there wasn\'t a spark and politely told him. He then found and followed me on Instagram, Twitter, AND LinkedIn. When I blocked him he made a new account. Had to make everything private. Please be careful about how much personal info you share early on. 😤' },
          { author: 'UniversityCityU', category: 'good-guys', title: 'He asked for consent before every step', body: 'Green flag alert from University City area. This man asked "is it okay if I hold your hand?" on our third date. Asked before he kissed me. Asked before putting his arm around me. Some people might think that\'s too much but after dating men who just assumed, this felt like HEAVEN. Consent is the bare minimum but he made it feel special. Keeping this one. 💛' }
        ]
      },
      'New York': {
        accounts: [
          { name: 'BrooklynBaddie', color: '#E8A0B5' },
          { name: 'UESQueen', color: '#A0C4E8' },
          { name: 'AstoriaAngel', color: '#C4E8A0' },
          { name: 'HellsKitchenHoney', color: '#E8C4A0' },
          { name: 'ParkSlopePeach', color: '#C4A0E8' },
          { name: 'HarlemHoney', color: '#A0E8C4' },
          { name: 'LESLady', color: '#E8A0C4' }
        ],
        posts: [
          { author: 'BrooklynBaddie', category: 'tea-talk', title: 'Williamsburg "creative director" scam', body: 'Williamsburg ladies PLEASE. There\'s a guy on all the apps who says he\'s a "creative director." He freelances occasionally. He will suggest the most expensive cocktail bar then conveniently leave his card at home. THREE of my friends have independently matched with him and had the same experience. He\'s running a scam at this point. 🍸🚩' },
          { author: 'UESQueen', category: 'tea-talk', title: 'Wanted apartment key after 9 days', body: 'Warning about a man on the Upper East Side who moves FAST. First date he\'s talking about introducing you to his parents. Second date he wants a key to your apartment. Third date he\'s suggesting you move in. It\'s been 9 days total. When I pumped the brakes he called me "emotionally unavailable." No sir, I\'m emotionally STABLE. There\'s a difference.' },
          { author: 'AstoriaAngel', category: 'tea-talk', title: 'A girl in every borough', body: 'Has anyone in Queens dealt with a Hinge guy who has a different girl in every borough? My friend in Astoria, my coworker in Bushwick, and apparently someone in the East Village all matched with the same man. Same lines, same date spots, same "you\'re not like other girls" speech. We compared notes and the timelines OVERLAP. He\'s juggling all of us simultaneously. Done.' },
          { author: 'HellsKitchenHoney', category: 'good-guys', title: 'Walked 15 blocks in the rain for my scarf', body: 'New York dating culture is rough so when you find a good one you CELEBRATE. This man walked 15 blocks in the rain to bring me my scarf I left at the restaurant. Could have just told me next time. Could have mailed it. No. He walked it over the same night because "you might need it tomorrow morning." I\'m in my feels. 🥹' },
          { author: 'ParkSlopePeach', category: 'good-guys', title: 'Healing is possible — good men exist', body: 'Appreciation post. After a really scary experience with someone I met online last year, I was terrified to try again. Gave it one more shot and matched with someone who has been incredibly patient. I told him about what happened and instead of running he said "we\'ll go at whatever pace makes you feel safe." Three months in and he\'s kept that promise every day. Healing is possible. Good men are out there. Don\'t let the bad ones win. 💛' }
        ]
      }
    };

    // ─── REPLY TEMPLATES ───
    const TEA_REPLIES = [
      "Thank you for posting this!! I literally just matched with someone matching this description",
      "Ugh I'm so sorry this happened to you. The streets need to know 🫖",
      "Adding to this — I think I dated the same guy last year. Same energy.",
      "This is why I love this app. We gotta look out for each other",
      "Girl I went through the SAME thing. You dodged a bullet 🙏",
      "Block him on everything and don't look back. You deserve so much better"
    ];

    const GOOD_REPLIES = [
      "Okay this actually made me smile. There IS hope 😭",
      "We love to see it!! Keep us updated!",
      "His mom raised him RIGHT",
      "This gives me hope honestly. Happy for you ❤️",
      "The bar is in hell but at least someone is finding it 😂💚",
      "This is the content I need. Happy for you queen"
    ];

    const INFO_REPLIES = [
      "What app was he on?",
      "What area of the city? I think I might know who this is 👀",
      "How long ago was this? I might have matched with the same person",
      "Was this recent? Asking for a friend who's dating in that area"
    ];

    // ─── PROCESS EACH CITY ───
    for (const [cityName, cityData] of Object.entries(SEED_DATA)) {
      // Find city in DB
      const city = await getOne('SELECT id FROM cities WHERE name = $1', [cityName]);
      if (!city) {
        results.errors.push({ city: cityName, error: 'City not found in DB' });
        continue;
      }

      // Create seed accounts
      const accountMap = {}; // name -> user_id
      for (const acct of cityData.accounts) {
        const email = acct.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '@seed.safetea.local';
        // Check if already exists
        let user = await getOne('SELECT id FROM users WHERE email = $1', [email]);
        if (!user) {
          user = await getOne(
            `INSERT INTO users (email, password_hash, display_name, city, avatar_initial, avatar_color, avatar_type, is_verified, identity_verified, age_verified, gender_verified)
             VALUES ($1, $2, $3, $4, $5, $6, 'initial', true, true, true, true) RETURNING id`,
            [email, 'seed-account-no-login', acct.name, cityName, acct.name[0].toUpperCase(), acct.color]
          );
          results.accounts_created++;
        }
        accountMap[acct.name] = user.id;
      }

      // Create posts with staggered timestamps (spread over 18 days ending 2 days ago)
      const now = Date.now();
      const postIds = [];
      for (let i = 0; i < cityData.posts.length; i++) {
        const post = cityData.posts[i];
        const userId = accountMap[post.author];
        if (!userId) continue;

        // Spread posts: oldest = 18 days ago, newest = 2 days ago
        const daysAgo = 18 - Math.floor((i / cityData.posts.length) * 16);
        const hoursOffset = Math.floor(Math.random() * 14) + 7; // 7am-9pm
        const minutesOffset = Math.floor(Math.random() * 60);
        const postDate = new Date(now - (daysAgo * 86400000) + (hoursOffset * 3600000) + (minutesOffset * 60000));

        // Check if post already exists (by title + user)
        const existing = await getOne(
          'SELECT id FROM posts WHERE user_id = $1 AND title = $2',
          [userId, post.title]
        );
        if (existing) {
          postIds.push({ id: existing.id, category: post.category });
          continue;
        }

        const newPost = await getOne(
          `INSERT INTO posts (user_id, title, body, category, city, feed, created_at)
           VALUES ($1, $2, $3, $4, $5, 'community', $6) RETURNING id`,
          [userId, post.title, post.body, post.category, cityName, postDate.toISOString()]
        );
        postIds.push({ id: newPost.id, category: post.category });
        results.posts_created++;
      }

      // Add likes: 2-5 random likes from other seed accounts per post
      const userIds = Object.values(accountMap);
      for (const postInfo of postIds) {
        const numLikes = 2 + Math.floor(Math.random() * 4); // 2-5
        const shuffled = userIds.slice().sort(() => Math.random() - 0.5);
        for (let j = 0; j < Math.min(numLikes, shuffled.length); j++) {
          try {
            await run(
              'INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT (post_id, user_id) DO NOTHING',
              [postInfo.id, shuffled[j]]
            );
            results.likes_created++;
          } catch(e) {}
        }
      }

      // Add replies to ~50% of posts
      for (let k = 0; k < postIds.length; k++) {
        if (Math.random() > 0.6) continue; // ~60% get replies
        const postInfo = postIds[k];
        const numReplies = 1 + Math.floor(Math.random() * 2); // 1-2

        for (let r = 0; r < numReplies; r++) {
          // Pick a random user that's not the post author
          const replyUserId = userIds[Math.floor(Math.random() * userIds.length)];
          const pool = postInfo.category === 'tea-talk'
            ? [...TEA_REPLIES, ...INFO_REPLIES]
            : GOOD_REPLIES;
          const replyText = pool[Math.floor(Math.random() * pool.length)];

          // Check for duplicate
          const existingReply = await getOne(
            'SELECT id FROM replies WHERE post_id = $1 AND user_id = $2 AND body = $3',
            [postInfo.id, replyUserId, replyText]
          );
          if (existingReply) continue;

          try {
            await run(
              'INSERT INTO replies (post_id, user_id, body, content, created_at) VALUES ($1, $2, $3, $3, $4)',
              [postInfo.id, replyUserId, replyText, new Date(now - Math.floor(Math.random() * 7 * 86400000)).toISOString()]
            );
            // Update reply count
            await run('UPDATE posts SET reply_count = reply_count + 1 WHERE id = $1', [postInfo.id]);
            results.replies_created++;
          } catch(e) {}
        }
      }

      // Update city post count
      const postCount = await getOne('SELECT COUNT(*) as count FROM posts WHERE city = $1', [cityName]);
      await run('UPDATE cities SET post_count = $1 WHERE id = $2', [parseInt(postCount.count), city.id]);
    }

    return res.status(200).json({
      success: true,
      message: 'Community feeds seeded successfully',
      ...results
    });
  } catch (error) {
    console.error('Seed community error:', error);
    return res.status(500).json({ error: 'Seeding failed', details: error.message, partial_results: results });
  }
};
