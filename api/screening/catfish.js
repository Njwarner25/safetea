const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne, getMany } = require('../_utils/db');
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
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Auth is optional for testing, required in production
    const user = await authenticate(req);

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

    // Step 2: Reverse image search (if API key available)
    const reverseResults = await reverseImageSearch(imageUrl);

    // Step 2b: GPT-4o Vision analysis (identifies celebrities, fake photos, AI-generated images)
    let aiVisionResult = null;
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (OPENAI_KEY && imageData) {
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
                { type: 'image_url', image_url: { url: imageData, detail: 'high' } }
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

    // Step 3: Compute catfish score
    const result = computeCatfishScore(imageAnalysis, reverseResults, imageUrl);

    // Step 3b: Merge AI vision results into score
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
        note: aiVisionResult
          ? 'AI vision analysis completed.' + (reverseResults ? ' Reverse image search also completed.' : '')
          : !reverseResults
            ? 'Configure OPENAI_API_KEY for AI celebrity detection, or SERPAPI_KEY for reverse image search.'
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
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};
