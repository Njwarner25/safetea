const { getMany, getOne, run } = require('../_utils/db');
const { authenticate, cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
          if (req.method === 'GET') {
                  const cities = await getMany(
                            'SELECT * FROM city_votes ORDER BY votes DESC LIMIT 20'
                          );
                  return res.status(200).json({ cities });
          }

      if (req.method === 'POST') {
              const user = await authenticate(req);
              if (!user) return res.status(401).json({ error: 'Not authenticated' });

            const { city_id } = req.body;
              if (!city_id) return res.status(400).json({ error: 'city_id is required' });

            const existing = await getOne(
                      'SELECT id FROM user_city_votes WHERE user_id = $1 AND city_vote_id = $2',
                      [user.id, city_id]
                    );
              if (existing) {
                        return res.status(409).json({ error: 'You have already voted for this city' });
              }

            await run(
                      'INSERT INTO user_city_votes (user_id, city_vote_id) VALUES ($1, $2)',
                      [user.id, city_id]
                    );
              await run(
                        'UPDATE city_votes SET votes = votes + 1 WHERE id = $1',
                        [city_id]
                      );

            return res.status(200).json({ message: 'Vote recorded' });
      }

      return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
          console.error('Cities error:', error);
          return res.status(500).json({ error: 'Internal server error' });
    }
};
