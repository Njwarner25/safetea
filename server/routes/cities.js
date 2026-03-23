const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getOne, getAll, query } = require('../db/database');
const { authenticate, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Configurable threshold for city activation
const ACTIVATION_THRESHOLD = process.env.CITY_ACTIVATION_THRESHOLD || 200;

// GET /api/cities - Get city leaderboard
router.get('/', async (req, res) => {
  try {
    const cities = await getAll('SELECT * FROM city_votes ORDER BY vote_count DESC');
    const totalVotes = await getOne('SELECT SUM(vote_count) as total FROM city_votes');

    res.json({
      cities,
      totalVotes: parseInt(totalVotes.total) || 0,
      threshold: parseInt(ACTIVATION_THRESHOLD)
    });
  } catch (err) {
    console.error('Get cities error:', err);
    res.status(500).json({ error: 'Failed to load cities' });
  }
});

// GET /api/cities/active - Get active (unlocked) cities
router.get('/active', async (req, res) => {
  try {
    const activeCities = await getAll('SELECT * FROM city_votes WHERE is_active = true ORDER BY vote_count DESC');

    res.json({
      activeCities,
      count: activeCities.length
    });
  } catch (err) {
    console.error('Get active cities error:', err);
    res.status(500).json({ error: 'Failed to load active cities' });
  }
});

// POST /api/cities/vote - Vote for a city
router.post('/vote', authenticate, async (req, res) => {
  const { city_name, state } = req.body;

  if (!city_name) {
    return res.status(400).json({ error: 'City name is required' });
  }

  try {
    // Find or create city
    let city = await getOne('SELECT * FROM city_votes WHERE LOWER(city_name) = LOWER($1)', [city_name]);

    if (!city) {
      const id = uuidv4();
      await query('INSERT INTO city_votes (id, city_name, state, vote_count, is_active) VALUES ($1, $2, $3, 1, false)', [id, city_name, state || '']);
      city = await getOne('SELECT * FROM city_votes WHERE id = $1', [id]);
    } else {
      // Check if user already voted
      const existingVote = await getOne(
        'SELECT * FROM user_city_votes WHERE user_id = $1 AND city_vote_id = $2',
        [req.user.id, city.id]
      );

      if (existingVote) {
        return res.status(409).json({ error: 'You have already voted for this city' });
      }

      await query('UPDATE city_votes SET vote_count = vote_count + 1 WHERE id = $1', [city.id]);
      city = await getOne('SELECT * FROM city_votes WHERE id = $1', [city.id]);
    }

    // Check if city hit activation threshold and auto-activate
    const threshold = parseInt(ACTIVATION_THRESHOLD);
    if (city.vote_count >= threshold && !city.is_active) {
      await query('UPDATE city_votes SET is_active = true WHERE id = $1', [city.id]);
      city = await getOne('SELECT * FROM city_votes WHERE id = $1', [city.id]);
      console.log(`[CITY UNLOCKED] ${city.city_name}, ${city.state} reached ${city.vote_count} votes and is now active!`);
    }

    // Record user vote
    await query(
      'INSERT INTO user_city_votes (user_id, city_vote_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.id, city.id]
    );

    res.json({
      city,
      message: city.is_active ? 'Vote recorded!' : 'Vote recorded!',
      unlocked: city.is_active && city.vote_count >= threshold,
      unlockedAt: city.is_active ? threshold : null
    });
  } catch (err) {
    console.error('Vote error:', err);
    res.status(500).json({ error: 'Failed to record vote' });
  }
});

module.exports = router;
