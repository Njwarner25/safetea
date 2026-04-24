/**
 * POST /api/migrate-area-alerts
 *
 * Creates the two new per-user tables used by the Area Alerts
 * upgrade. The underlying crime data already lives in the existing
 * `crime_alerts` table populated by services/crimeDataFetcher.js
 * (cron-refreshed every 6h for 9 cities). We do NOT duplicate that
 * schema.
 *
 *   user_alert_preferences — per-user toggles + sensitivity + safe zones
 *   user_alert_history     — delivered-alert audit + cooldown source of truth
 *
 * Auth: x-migrate-secret: MIGRATE_SECRET
 * Idempotent.
 */

'use strict';

const { sql } = require('@vercel/postgres');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.headers['x-migrate-secret'] || req.query.secret;
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const done = [];
  try {
    await sql`CREATE TABLE IF NOT EXISTS user_alert_preferences (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      area_alerts_enabled BOOLEAN DEFAULT TRUE,
      crime_trend_alerts_enabled BOOLEAN DEFAULT TRUE,
      parking_alerts_enabled BOOLEAN DEFAULT TRUE,
      transit_alerts_enabled BOOLEAN DEFAULT TRUE,
      sensitivity TEXT DEFAULT 'standard' CHECK(sensitivity IN ('low','standard','high')),
      safe_zones JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;
    done.push('user_alert_preferences');

    await sql`CREATE TABLE IF NOT EXISTS user_alert_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      alert_type TEXT NOT NULL,
      alert_level TEXT NOT NULL,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      title TEXT,
      message TEXT,
      delivered_at TIMESTAMPTZ DEFAULT NOW(),
      opened_at TIMESTAMPTZ,
      action_taken TEXT,
      dismissed BOOLEAN DEFAULT FALSE
    )`;
    done.push('user_alert_history');

    await sql`CREATE INDEX IF NOT EXISTS idx_user_alert_history_user ON user_alert_history(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_user_alert_history_delivered ON user_alert_history(delivered_at DESC)`;
    done.push('user_alert_history indexes');

    return res.status(200).json({ success: true, applied: done });
  } catch (err) {
    return res.status(500).json({ error: err && err.message, applied_before_failure: done });
  }
};
