const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne, getMany } = require('../_utils/db');
const { checkRateLimit, getClientIP } = require('../../services/rateLimit');
const https = require('https');

// --- Image analysis helpers ---

function fetchImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : require('http');
    client.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchImage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > 5 * 1024 * 1024) { // 5MB limit
          res.destroy();
          reject(new Error('Image too large (max 5MB)'));
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function analyzeImageBuffer(buffer) {
  const analysis = {
    sizeBytes: buffer.length,
    isJpeg: buffer[0] === 0xFF && buffer[1] === 0xD8,
    isPng: buffer[0] === 0x89 && buffer[1] === 0x50,
    isWebp: buffer.slice(8, 12).toString() === 'WEBP',
    hasExif: false,
    exifFlags: [],
    editingSoftware: null,
    dimensions: null,
  };

  // Check for EXIF data in JPEG
  if (analysis.isJpeg) {
    const exifMarker = buffer.indexOf(Buffer.from([0xFF, 0xE1]));
    if (exifMarker !== -1) {
      analysis.hasExif = true;
      const exifStr = buffer.slice(exifMarker, Math.min(exifMarker + 2000, buffer.length)).toString('latin1');

      // Check for editing software
      const editors = ['Photoshop', 'GIMP', 'Lightroom', 'Snapseed', 'FaceTune', 'FaceApp', 'Pixlr', 'Canva', 'PicsArt'];
      for (const editor of editors) {
        if (exifStr.toLowerCase().includes(editor.toLowerCase())) {
          analysis.editingSoftware = editor;
          analysis.exifFlags.push(`Edited with ${editor}`);
        }
      }

      // Check for camera info (real photos have camera data)
      const cameras = ['Canon', 'Nikon', 'Sony', 'Apple', 'Samsung', 'Google', 'Huawei', 'OnePlus', 'Xiaomi'];
      let hasCamera = false;
      for (const cam of cameras) {
        if (exifStr.includes(cam)) {
          hasCamera = true;
          analysis.exifFlags.push(`Camera: ${cam}`);
        }
      }
      if (!hasCamera) {
        analysis.exifFlags.push('No camera info found - may not be an original photo');
      }

      // Check for GPS data
      if (exifStr.includes('GPS')) {
        analysis.exifFlags.push('Contains GPS location data');
      }
    } else {
      analysis.exifFlags.push('EXIF data stripped - common with downloaded/screenshot images');
    }
  }

  // Check for PNG text chunks (often contain software info)
  if (analysis.isPng) {
    const pngStr = buffer.slice(0, Math.min(2000, buffer.length)).toString('latin1');
    if (pngStr.includes('tEXt') || pngStr.includes('iTXt')) {
      if (pngStr.includes('Screenshot')) {
        analysis.exifFlags.push('Image is a screenshot');
      }
    }
    analysis.exifFlags.push('PNG format - often used for screenshots, not camera photos');
  }

  // Image size heuristics
  if (buffer.length > 2 * 1024 * 1024) {
    analysis.exifFlags.push('Large file size - may be high-quality/professional');
  } else if (buffer.length < 50 * 1024) {
    analysis.exifFlags.push('Very small file - likely compressed/downloaded thumbnail');
  }

  return analysis;
}

// Google Reverse Image Search via SerpAPI
async function reverseImageSearch(imageUrl) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    engine: 'google_reverse_image',
    image_url: imageUrl,
    api_key: apiKey,
  });

  return new Promise((resolve) => {
    https.get(`https://serpapi.com/search.json?${params}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// Bing Visual Search as free fallback for reverse image search
async function bingReverseImageSearch(imageBuffer) {
  const apiKey = process.env.BING_SEARCH_KEY;
  if (!apiKey) return null;

  try {
    const boundary = '----FormBoundary' + Date.now();
    const mimeType = (imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) ? 'image/jpeg' : 'image/png';
    const bodyParts = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="image"; filename="photo.jpg"\r\n`,
      `Content-Type: ${mimeType}\r\n\r\n`,
    ];
    const bodyStart = Buffer.from(bodyParts.join(''));
    const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`);
    const requestBody = Buffer.concat([bodyStart, imageBuffer, bodyEnd]);

    const res = await fetch('https://api.bing.microsoft.com/v7.0/images/visualsearch', {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: requestBody,
    });

    if (!res.ok) return null;
    const data = await res.json();

    // Extract relevant results
    const tags = data.tags || [];
    const results = { inline_images: [], organic_results: [], knowledge_graph: null };

    for (const tag of tags) {
      if (tag.displayName && tag.displayName !== '') {
        // If Bing identifies an entity
        results.knowledge_graph = { title: tag.displayName, description: '' };
      }
      for (const action of (tag.actions || [])) {
        if (action.actionType === 'PagesIncluding' && action.data && action.data.value) {
          for (const page of action.data.value) {
            results.organic_results.push({ title: page.name || '', link: page.hostPageUrl || '' });
          }
        }
        if (action.actionType === 'VisualSearch' && action.data && action.data.value) {
          for (const img of action.data.value) {
            results.inline_images.push({ link: img.contentUrl || '', source: img.hostPageUrl || '' });
          }
        }
      }
    }

    return (results.inline_images.length > 0 || results.organic_results.length > 0 || results.knowledge_graph) ? results : null;
  } catch (e) {
    console.error('[Catfish] Bing Visual Search error:', e.message);
    return null;
  }
}

// Check database for duplicate photo hashes (catches reused photos across profiles)
async function checkDatabaseDuplicates(imageHash, userId) {
  try {
    const dupes = await getMany(
      `SELECT cs.user_id, cs.profile_name, cs.platform, cs.created_at
       FROM catfish_scans cs
       WHERE cs.image_hash = $1 AND ($2::int IS NULL OR cs.user_id != $2)
       ORDER BY cs.created_at DESC LIMIT 5`,
      [imageHash, userId || null]
    );
    return dupes;
  } catch (e) {
    // Table may not exist yet
    return [];
  }
}

// Compute a simple perceptual hash fingerprint
function simpleHash(buffer) {
  let hash = 0;
  const step = Math.max(1, Math.floor(buffer.length / 1000));
  for (let i = 0; i < buffer.length; i += step) {
    hash = ((hash << 5) - hash + buffer[i]) & 0xFFFFFFFF;
  }
  return hash.toString(16);
}

// Score the catfish risk based on all signals
function computeCatfishScore(analysis, reverseResults, imageUrl) {
  let score = 0; // 0-100, higher = more likely catfish
  const flags = [];
  const greenFlags = [];

  // EXIF analysis
  if (analysis.editingSoftware) {
    if (['FaceTune', 'FaceApp'].includes(analysis.editingSoftware)) {
      score += 25;
      flags.push({ label: `Photo edited with ${analysis.editingSoftware}`, severity: 'high', description: 'Face-altering software detected. This is commonly used to create fake profiles.' });
    } else if (['Photoshop', 'GIMP', 'Lightroom'].includes(analysis.editingSoftware)) {
      score += 10;
      flags.push({ label: `Edited in ${analysis.editingSoftware}`, severity: 'medium', description: 'Professional editing software detected. Could be normal for professional photos.' });
    }
  }

  if (!analysis.hasExif && analysis.isJpeg) {
    score += 15;
    flags.push({ label: 'EXIF data stripped', severity: 'medium', description: 'Original photo metadata was removed. This happens when images are downloaded from social media, stock sites, or messaging apps.' });
  }

  if (analysis.sizeBytes < 50 * 1024) {
    score += 10;
    flags.push({ label: 'Low-quality image', severity: 'low', description: 'Image is very small/compressed. May be a thumbnail downloaded from the internet.' });
  }

  if (analysis.isPng) {
    score += 5;
    flags.push({ label: 'PNG format detected', severity: 'low', description: 'PNG is uncommon for phone camera photos. Could be a screenshot or downloaded image.' });
  }

  // Reverse image search results
  if (reverseResults) {
    const inlineImages = reverseResults.inline_images || [];
    const searchResults = reverseResults.organic_results || [];
    const knowledgeGraph = reverseResults.knowledge_graph || null;

    if (knowledgeGraph) {
      score += 40;
      flags.push({
        label: `Identified as: ${knowledgeGraph.title || 'Public Figure'}`,
        severity: 'critical',
        description: `This photo appears to be of ${knowledgeGraph.title || 'a known public figure'}. ${knowledgeGraph.description || ''}`
      });
    }

    if (inlineImages.length > 5) {
      score += 25;
      flags.push({ label: `Photo found ${inlineImages.length}+ times online`, severity: 'high', description: 'This image appears widely across the internet. Very likely not an original photo.' });
    } else if (inlineImages.length > 0) {
      score += 15;
      flags.push({ label: `Photo found ${inlineImages.length} times online`, severity: 'medium', description: 'This image appears on other websites. May not be an original photo.' });
    }

    // Check for stock photo sites
    const stockSites = ['shutterstock', 'getty', 'istockphoto', 'stock', 'pexels', 'unsplash', 'pixabay'];
    const stockMatches = searchResults.filter(r =>
      stockSites.some(s => (r.link || '').toLowerCase().includes(s) || (r.title || '').toLowerCase().includes(s))
    );
    if (stockMatches.length > 0) {
      score += 30;
      flags.push({ label: 'Stock photo detected', severity: 'critical', description: `This image was found on stock photo sites: ${stockMatches.map(m => m.title).join(', ')}` });
    }

    // Check for celebrity/public figure sites
    const celebSites = ['wikipedia', 'imdb', 'celebrity', 'famous', 'tmz', 'people.com', 'instagram.com'];
    const celebMatches = searchResults.filter(r =>
      celebSites.some(s => (r.link || '').toLowerCase().includes(s))
    );
    if (celebMatches.length > 0) {
      score += 35;
      flags.push({ label: 'Celebrity/public figure match', severity: 'critical', description: `Photo matches results from: ${celebMatches.map(m => new URL(m.link).hostname).join(', ')}` });
    }

    if (inlineImages.length === 0 && searchResults.length === 0) {
      greenFlags.push({ label: 'No online matches found', description: 'This image does not appear to be widely available online.' });
    }
  }

  // Green flags
  if (analysis.hasExif && analysis.exifFlags.some(f => f.includes('Camera:'))) {
    score = Math.max(0, score - 10);
    greenFlags.push({ label: 'Original camera data present', description: 'Photo contains camera metadata suggesting it was taken from a real device.' });
  }

  if (analysis.hasExif && analysis.exifFlags.some(f => f.includes('GPS'))) {
    score = Math.max(0, score - 5);
    greenFlags.push({ label: 'GPS data present', description: 'Photo contains location data, suggesting it is an original capture.' });
  }

  // Cap score at 100
  score = Math.min(100, score);

  // Determine risk level
  let riskLevel;
  if (score >= 70) riskLevel = 'high_risk';
  else if (score >= 40) riskLevel = 'medium_risk';
  else if (score >= 20) riskLevel = 'low_risk';
  else riskLevel = 'likely_safe';

  return { score, riskLevel, flags, greenFlags };
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Rate limit: 10 scans per hour per IP
    const ipLimited = await checkRateLimit(getClientIP(req), 'catfish_ip', 10, 3600);
    if (ipLimited) {
      return res.status(429).json({ error: 'Too many scans. Please wait before trying again.' });
    }

    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Sign in to use the Catfish Scanner' });

    // Plus or Pro tier required (admins bypass)
    if (user.role !== 'admin' && (!user.subscription_tier || (user.subscription_tier !== 'plus' && user.subscription_tier !== 'pro'))) {
      return res.status(403).json({ error: 'Catfish Scanner requires a Plus or Pro subscription', upgrade: true });
    }

    const body = await parseBody(req);
    const { imageUrl, imageData, profileName, platform } = body;

    if (!imageUrl && !imageData) {
      return res.status(400).json({ error: 'Upload a photo or provide an image URL' });
    }

    // Step 1: Get image buffer from upload or URL
    let imageBuffer;

    if (imageData) {
      // Base64 data URL from file upload (e.g. "data:image/jpeg;base64,/9j/...")
      try {
        const base64Match = imageData.match(/^data:image\/\w+;base64,(.+)$/);
        if (!base64Match) throw new Error('Invalid image data format');
        imageBuffer = Buffer.from(base64Match[1], 'base64');
        if (imageBuffer.length > 5 * 1024 * 1024) throw new Error('Image too large (max 5MB)');
      } catch (e) {
        return res.status(400).json({ error: `Invalid image upload: ${e.message}` });
      }
    } else {
      // Fetch from URL
      let parsedUrl;
      try {
        parsedUrl = new URL(imageUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          throw new Error('Invalid protocol');
        }
      } catch (e) {
        return res.status(400).json({ error: 'Invalid image URL' });
      }

      try {
        imageBuffer = await fetchImage(imageUrl);
      } catch (e) {
        return res.status(400).json({ error: `Could not fetch image: ${e.message}` });
      }
    }

    const imageAnalysis = analyzeImageBuffer(imageBuffer);
    const imageHash = simpleHash(imageBuffer);

    // Step 2: Reverse image search — try SerpAPI, then Bing, then DB duplicates
    let reverseResults = await reverseImageSearch(imageUrl);
    if (!reverseResults) {
      reverseResults = await bingReverseImageSearch(imageBuffer);
    }

    // Check database for duplicate photo hashes
    const dbDuplicates = await checkDatabaseDuplicates(imageHash, user ? user.id : null);

    // Step 2b: GPT-4o Vision analysis (identifies celebrities, fake photos, AI-generated images)
    let aiVisionResult = null;
    const OPENAI_KEY = process.env.OPENAI_API_KEY;

    // Build image content for AI vision — works with file upload (base64) OR URL
    let aiImageContent = null;
    if (imageData) {
      aiImageContent = { type: 'image_url', image_url: { url: imageData, detail: 'high' } };
    } else if (imageUrl) {
      // Convert fetched image buffer to base64 data URL for GPT-4o
      const mimeType = imageAnalysis.isJpeg ? 'image/jpeg' : imageAnalysis.isPng ? 'image/png' : imageAnalysis.isWebp ? 'image/webp' : 'image/jpeg';
      const base64 = imageBuffer.toString('base64');
      aiImageContent = { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' } };
    }

    if (OPENAI_KEY && aiImageContent) {
      try {
        const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + OPENAI_KEY
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [{
              role: 'system',
              content: `You are a catfish detection AI for a dating safety app. Analyze this profile photo and determine:
1. Is this a celebrity or public figure? If yes, who?
2. Does this look like an AI-generated image?
3. Does this look like a stock photo or professional model shot?
4. Are there signs this is not an authentic personal photo?

Respond in JSON only:
{
  "is_celebrity": true/false,
  "celebrity_name": "name or null",
  "celebrity_confidence": "high/medium/low",
  "is_ai_generated": true/false,
  "is_stock_photo": true/false,
  "is_professional": true/false,
  "assessment": "brief explanation",
  "catfish_likelihood": "high/medium/low/none"
}`
            }, {
              role: 'user',
              content: [
                { type: 'text', text: 'Analyze this dating profile photo for catfishing.' + (profileName ? ' The profile claims to be "' + profileName + '".' : '') },
                aiImageContent
              ]
            }],
            max_tokens: 500,
            temperature: 0.2
          })
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const content = aiData.choices?.[0]?.message?.content || '';
          try {
            aiVisionResult = JSON.parse(content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
          } catch (e) {
            console.error('[Catfish] AI vision parse error:', content.substring(0, 100));
          }
        }
      } catch (e) {
        console.error('[Catfish] AI vision failed:', e.message);
      }
    }

    // Step 2c: Free fallback — web search for profile name (works without any API keys)
    if (!aiVisionResult && !reverseResults && profileName && profileName.trim().length > 1) {
      try {
        const searchName = profileName.trim();
        const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(searchName)}&format=json&no_html=1&skip_disambig=1`;
        const ddgRes = await fetch(ddgUrl);
        const ddgData = await ddgRes.json();

        // Check if DuckDuckGo identifies them as a known entity (celebrity, public figure)
        if (ddgData.AbstractText || ddgData.Heading) {
          const abstract = (ddgData.AbstractText || '').toLowerCase();
          const heading = (ddgData.Heading || '').toLowerCase();
          const combined = heading + ' ' + abstract;

          const celebKeywords = ['actor', 'actress', 'singer', 'musician', 'athlete', 'model',
            'celebrity', 'politician', 'president', 'rapper', 'artist', 'footballer',
            'basketball', 'baseball', 'entertainer', 'television', 'film', 'movie',
            'grammy', 'oscar', 'emmy', 'billboard', 'nba', 'nfl', 'mlb',
            'famous', 'star', 'influencer', 'youtuber', 'tiktok star'];

          const isCeleb = celebKeywords.some(kw => combined.includes(kw));
          const isWikipedia = (ddgData.AbstractSource || '').toLowerCase().includes('wikipedia');
          const hasImage = !!ddgData.Image;

          if (isCeleb || isWikipedia) {
            aiVisionResult = {
              is_celebrity: true,
              celebrity_name: ddgData.Heading || searchName,
              celebrity_confidence: isWikipedia && isCeleb ? 'high' : 'medium',
              is_ai_generated: false,
              is_stock_photo: false,
              is_professional: true,
              assessment: `"${ddgData.Heading || searchName}" is a known public figure. ${(ddgData.AbstractText || '').substring(0, 200)}`,
              catfish_likelihood: 'high'
            };
          }
        }

        // Also do an HTML search for more info
        if (!aiVisionResult) {
          const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchName + ' celebrity OR actor OR singer OR public figure')}`;
          const htmlRes = await fetch(htmlUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
          });
          const html = await htmlRes.text();

          // Check if results strongly suggest a public figure
          const celebSites = ['wikipedia.org', 'imdb.com', 'people.com', 'tmz.com', 'eonline.com',
            'billboard.com', 'espn.com', 'nba.com', 'nfl.com'];
          let celebSiteCount = 0;
          for (const site of celebSites) {
            if (html.includes(site)) celebSiteCount++;
          }

          if (celebSiteCount >= 2) {
            // Extract a snippet about them
            const snippetPattern = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/;
            const snippetMatch = snippetPattern.exec(html);
            const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '';

            aiVisionResult = {
              is_celebrity: true,
              celebrity_name: searchName,
              celebrity_confidence: celebSiteCount >= 3 ? 'high' : 'medium',
              is_ai_generated: false,
              is_stock_photo: false,
              is_professional: true,
              assessment: `"${searchName}" appears to be a well-known public figure (found on ${celebSiteCount} celebrity/news sites). ${snippet.substring(0, 200)}`,
              catfish_likelihood: 'high'
            };
          }
        }
      } catch (e) {
        console.error('[Catfish] Free name search fallback error:', e.message);
      }
    }

    // Step 3: Compute catfish score
    const result = computeCatfishScore(imageAnalysis, reverseResults, imageUrl);

    // Step 3b: Merge database duplicate results
    if (dbDuplicates && dbDuplicates.length > 0) {
      result.score = Math.min(100, result.score + 15 * Math.min(dbDuplicates.length, 3));
      result.flags.push({
        label: `Photo used in ${dbDuplicates.length} other scan(s) on SafeTea`,
        severity: dbDuplicates.length >= 3 ? 'high' : 'medium',
        description: 'This exact photo has been submitted in other catfish scans on SafeTea. ' +
          dbDuplicates.map(d => d.profile_name ? `"${d.profile_name}" on ${d.platform || 'unknown'}` : 'unnamed profile').join(', ')
      });
      // Recalculate risk level
      if (result.score >= 70) result.riskLevel = 'high_risk';
      else if (result.score >= 40) result.riskLevel = 'medium_risk';
      else if (result.score >= 20) result.riskLevel = 'low_risk';
      else result.riskLevel = 'likely_safe';
    }

    // Step 3c: Merge AI vision results into score
    if (aiVisionResult) {
      if (aiVisionResult.is_celebrity) {
        result.score = Math.min(100, result.score + 50);
        result.flags.unshift({
          label: 'Celebrity identified: ' + (aiVisionResult.celebrity_name || 'Public Figure'),
          severity: 'critical',
          description: 'AI vision identified this as ' + (aiVisionResult.celebrity_name || 'a celebrity/public figure') + '. This is almost certainly a fake profile. ' + (aiVisionResult.assessment || '')
        });
      }
      if (aiVisionResult.is_ai_generated) {
        result.score = Math.min(100, result.score + 35);
        result.flags.push({
          label: 'AI-generated image detected',
          severity: 'critical',
          description: 'This image appears to be generated by AI (e.g. Midjourney, DALL-E, Stable Diffusion). ' + (aiVisionResult.assessment || '')
        });
      }
      if (aiVisionResult.is_stock_photo) {
        result.score = Math.min(100, result.score + 25);
        result.flags.push({
          label: 'Stock photo detected',
          severity: 'high',
          description: 'This appears to be a professional stock photo, not a personal photo.'
        });
      }
      if (aiVisionResult.catfish_likelihood === 'none' && !aiVisionResult.is_celebrity && !aiVisionResult.is_ai_generated) {
        result.greenFlags.push({
          label: 'AI assessment: appears authentic',
          description: aiVisionResult.assessment || 'Photo appears to be a genuine personal photo.'
        });
      }

      // Recalculate risk level
      if (result.score >= 70) result.riskLevel = 'high_risk';
      else if (result.score >= 40) result.riskLevel = 'medium_risk';
      else if (result.score >= 20) result.riskLevel = 'low_risk';
      else result.riskLevel = 'likely_safe';
    }

    // Step 4: Build response
    const response = {
      success: true,
      scan: {
        id: 'catfish-' + Date.now(),
        imageUrl,
        profileName: profileName || 'Unknown',
        platform: platform || 'Unknown',
        scannedAt: new Date().toISOString(),
        imageHash,
        catfishScore: result.score,
        riskLevel: result.riskLevel,
        riskLabel: {
          high_risk: '🚨 High Risk - Likely Catfish',
          medium_risk: '⚠️ Medium Risk - Suspicious',
          low_risk: '🔶 Low Risk - Minor Concerns',
          likely_safe: '✅ Likely Safe',
        }[result.riskLevel],
        redFlags: result.flags,
        greenFlags: result.greenFlags,
        imageAnalysis: {
          format: imageAnalysis.isJpeg ? 'JPEG' : imageAnalysis.isPng ? 'PNG' : imageAnalysis.isWebp ? 'WebP' : 'Unknown',
          sizeKB: Math.round(imageAnalysis.sizeBytes / 1024),
          hasExif: imageAnalysis.hasExif,
          editingSoftware: imageAnalysis.editingSoftware,
          exifNotes: imageAnalysis.exifFlags,
        },
        aiVision: aiVisionResult || null,
        reverseSearchAvailable: !!reverseResults,
        aiVisionAvailable: !!aiVisionResult,
        dbDuplicatesFound: dbDuplicates ? dbDuplicates.length : 0,
        note: aiVisionResult
          ? 'AI vision analysis completed.' + (reverseResults ? ' Reverse image search also completed.' : '')
          : !reverseResults
            ? 'Image metadata and database duplicate analysis completed.' + (dbDuplicates && dbDuplicates.length > 0 ? ' Duplicate photos found in SafeTea database.' : '') + ' Configure OPENAI_API_KEY or BING_SEARCH_KEY for enhanced detection.'
            : 'Reverse image search completed.',
      },
    };

    // Step 5: Log the scan if user is authenticated
    if (user) {
      try {
        await run(
          `INSERT INTO catfish_scans (user_id, image_url, image_hash, profile_name, platform, catfish_score, risk_level, flags_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [user.id, imageUrl, imageHash, profileName || null, platform || null, result.score, result.riskLevel, JSON.stringify(result.flags)]
        );
      } catch (e) {
        // Table may not exist yet - non-fatal
      }
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error('Catfish scan error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
