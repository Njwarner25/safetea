const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/cities - Get city leaderboard
router.get('/', (req, res) => {
    const cities = db.prepare('SELECT * FROM city_votes ORDER BY vote_count DESC').all();
    const totalVotes = db.prepare('SELECT SUM(vote_count) as total FROM city_votes').get();

             res.json({
                   cities,
                   totalVotes: totalVotes.total || 0,
                   threshold: 200
             });
});

// POST /api/cities/vote - Vote for a city
router.post('/vote', authenticate, (req, res) => {
    const { city_name, state } = req.body;

              if (!city_name) {
                    return res.status(400).json({ error: 'City name is required' });
              }

              try {
                    // Find or create city
      let city = db.prepare('SELECT * FROM city_votes WHERE LOWER(city_name) = LOWER(?)').get(city_name);

      if (!city) {
              const id = uuidv4();
              db.prepare('INSERT INTO city_votes (id, city_name, state, vote_count) VALUES (?, ?, ?, 1)').run(id, city_name, state || '');
              city = db.prepare('SELECT * FROM city_votes WHERE id = ?').get(id);
      } else {
              // Check if user already voted
                      const existingVote = db.prepare('SELECT * FROM user_city_votes WHERE user_id = ? AND city_vote_id = ?').get(req.user.id, city.id);

                      if (existingVote) {
                                return res.status(409).json({ error: 'You have already voted for this city' });
                      }

                      db.prepare('UPDATE city_votes SET vote_count = vote_count + 1 WHERE id = ?').run(city.id);
              city = db.prepare('SELECT * FROM city_votes WHERE id = ?').get(city.id);
      }

      // Record user vote
      db.prepare('INSERT OR IGNORE INTO user_city_votes (user_id, city_vote_id) VALUES (?, ?)').run(req.user.id, city.id);

      res.json({ city, message: 'Vote recorded!' });
              } catch (err) {
                    console.error('Vote error:', err);
                    res.status(500).json({ error: 'Failed to record vote' });
              }
});

module.exports = router;
