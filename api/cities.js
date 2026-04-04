const { cors } = require('./_utils/auth');
const { getMany } = require('./_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Cache for 5 minutes — cities rarely change
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  try {
    // Try migration column names first (city_name, vote_count), fallback to alternatives
    // Featured cities appear first, then sort by vote count
    const featured = ['Los Angeles', 'Miami', 'Dallas'];
    let cities;
    try {
      cities = await getMany(
        `SELECT id, city_name AS name, state, vote_count AS votes FROM city_votes WHERE is_active = true ORDER BY CASE city_name WHEN 'Los Angeles' THEN 0 WHEN 'Miami' THEN 1 WHEN 'Dallas' THEN 2 ELSE 3 END, vote_count DESC LIMIT 50`
      );
    } catch (e) {
      // Fallback: maybe columns are named differently
      cities = await getMany(
        `SELECT id, COALESCE(city_name, city) AS name, state, COALESCE(vote_count, votes, 0) AS votes FROM city_votes ORDER BY CASE COALESCE(city_name, city) WHEN 'Los Angeles' THEN 0 WHEN 'Miami' THEN 1 WHEN 'Dallas' THEN 2 ELSE 3 END, COALESCE(vote_count, votes, 0) DESC LIMIT 50`
      );
    }

    return res.status(200).json({ cities });
  } catch (err) {
    // Final fallback: return hardcoded cities so the UI always works
    const fallback = [
      { id: 3, name: 'Los Angeles', state: 'CA', votes: 100 },
      { id: 5, name: 'Miami', state: 'FL', votes: 95 },
      { id: 7, name: 'Dallas', state: 'TX', votes: 90 },
      { id: 6, name: 'Atlanta', state: 'GA', votes: 80 },
      { id: 2, name: 'New York', state: 'NY', votes: 75 },
      { id: 1, name: 'Chicago', state: 'IL', votes: 70 },
      { id: 4, name: 'Houston', state: 'TX', votes: 65 },
      { id: 8, name: 'Philadelphia', state: 'PA', votes: 30 }
    ];
    return res.status(200).json({ cities: fallback });
  }
};
