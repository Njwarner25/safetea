const { run } = require('./db');

/**
 * Wrap a Vercel cron handler so every invocation is logged to cron_runs
 * and unhandled exceptions surface as [CRON_FAILURE] lines in the log.
 *
 * Usage:
 *   async function handler(req, res) { ... }
 *   module.exports = withCronLogging('cleanup-photos', handler);
 */
function withCronLogging(name, handler) {
  return async function wrapped(req, res) {
    const startedAt = new Date();
    const t0 = Date.now();
    let caughtError = null;

    try {
      await handler(req, res);
    } catch (err) {
      caughtError = err;
      console.error('[CRON_FAILURE] ' + name + ':', err && err.message, err && err.stack);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Cron failed', cron: name, details: String(err && err.message || err) });
      }
    }

    const durationMs = Date.now() - t0;
    const httpStatus = res.statusCode || 0;
    let status;
    if (caughtError) status = 'error';
    else if (httpStatus >= 500) status = 'failed';
    else if (httpStatus >= 400) status = 'rejected';
    else status = 'success';

    // Persist the run. Never let logging failures affect the cron's own result.
    try {
      await run(
        `INSERT INTO cron_runs (cron_name, started_at, duration_ms, status, http_status, error_message)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          name,
          startedAt,
          durationMs,
          status,
          httpStatus,
          caughtError ? String(caughtError.message || caughtError).slice(0, 2000) : null
        ]
      );
    } catch (logErr) {
      console.error('[CRON_LOG_INSERT_FAILED] ' + name + ':', logErr && logErr.message);
    }

    if (status !== 'success') {
      console.error('[CRON_FAILURE] ' + name + ' status=' + status + ' http=' + httpStatus + ' duration_ms=' + durationMs);
    }
  };
}

module.exports = { withCronLogging };
