const { Pool } = require('pg');

// Auto-scaling pool configuration based on DB_POOL_SIZE env var
// Railway can set this per tier: Hobby=20, Starter=50, Pro=100
const POOL_MAX = parseInt(process.env.DB_POOL_SIZE) || 20;
const SCALE_ALERT_THRESHOLD = parseInt(process.env.SCALE_ALERT_USER_THRESHOLD) || 500;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Test connection on startup
pool.on('connect', () => {
  console.log('Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error:', err);
});

// Track pool health metrics
const poolMetrics = {
  totalQueries: 0,
  slowQueries: 0,       // queries > 500ms
  errors: 0,
  lastChecked: null,
  userCount: 0,
  scaleAlertSent: false
};

// Helper: run a query and return all rows (with metrics tracking)
async function query(text, params) {
  poolMetrics.totalQueries++;
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 500) {
      poolMetrics.slowQueries++;
      console.warn(`[SLOW QUERY] ${duration}ms: ${text.substring(0, 80)}...`);
    }
    return result;
  } catch (err) {
    poolMetrics.errors++;
    throw err;
  }
}

// Helper: get a single row
async function getOne(text, params) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

// Helper: get all rows
async function getAll(text, params) {
  const result = await query(text, params);
  return result.rows;
}

// Get pool health snapshot for the /api/admin/metrics endpoint
function getPoolHealth() {
  return {
    pool: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
      max: POOL_MAX,
      utilization: Math.round((pool.totalCount / POOL_MAX) * 100) + '%'
    },
    queries: {
      total: poolMetrics.totalQueries,
      slow: poolMetrics.slowQueries,
      errors: poolMetrics.errors
    },
    scaling: {
      userThreshold: SCALE_ALERT_THRESHOLD,
      currentUsers: poolMetrics.userCount,
      alertSent: poolMetrics.scaleAlertSent
    }
  };
}

// Check if we're approaching the scale threshold
// Called periodically by the metrics monitor
async function checkScaleThreshold() {
  try {
    const result = await pool.query('SELECT COUNT(*) as count FROM users');
    const userCount = parseInt(result.rows[0].count);
    poolMetrics.userCount = userCount;
    poolMetrics.lastChecked = new Date().toISOString();

    // Pool utilization check
    const poolUtilization = pool.totalCount / POOL_MAX;

    if (userCount >= SCALE_ALERT_THRESHOLD && !poolMetrics.scaleAlertSent) {
      console.warn('==========================================================');
      console.warn(`[SCALE ALERT] User count (${userCount}) hit threshold (${SCALE_ALERT_THRESHOLD})`);
      console.warn('[SCALE ALERT] Action needed: Upgrade Railway database tier');
      console.warn('[SCALE ALERT] 1. Go to Railway dashboard → PostgreSQL service');
      console.warn('[SCALE ALERT] 2. Upgrade to Starter ($7/mo) or Pro ($20/mo)');
      console.warn('[SCALE ALERT] 3. Set DB_POOL_SIZE=50 in env vars');
      console.warn('==========================================================');
      poolMetrics.scaleAlertSent = true;
    }

    if (poolUtilization > 0.8) {
      console.warn(`[POOL WARNING] Connection pool at ${Math.round(poolUtilization * 100)}% capacity (${pool.totalCount}/${POOL_MAX})`);
    }

    return { userCount, poolUtilization, needsUpgrade: userCount >= SCALE_ALERT_THRESHOLD };
  } catch (err) {
    console.error('Scale threshold check failed:', err.message);
    return null;
  }
}

module.exports = { pool, query, getOne, getAll, getPoolHealth, checkScaleThreshold, poolMetrics, SCALE_ALERT_THRESHOLD };
