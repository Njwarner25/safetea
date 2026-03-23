const { getOne, query } = require('../db/database');

/**
 * Middleware to check if an authenticated user is suspended
 * - If suspended and suspension is expired, auto-lift the suspension
 * - If suspended and still active, return 403 with suspension details
 * - If not suspended, continue to next handler
 *
 * Must be used AFTER the authenticate middleware
 */
async function checkSuspension(req, res, next) {
  // Only check if user is authenticated
  if (!req.user) {
    return next();
  }

  try {
    const userId = req.user.id;

    // Get suspension status
    const user = await getOne(
      `SELECT is_suspended, suspension_end FROM users WHERE id = $1`,
      [userId]
    );

    if (!user) {
      return next();
    }

    // If not suspended, continue
    if (!user.is_suspended) {
      return next();
    }

    // Check if suspension has expired
    if (user.suspension_end) {
      const suspensionEnd = new Date(user.suspension_end);
      const now = new Date();

      if (suspensionEnd <= now) {
        // Suspension expired, auto-lift it
        await query(
          `UPDATE users SET is_suspended = false, suspension_end = NULL WHERE id = $1`,
          [userId]
        );

        // Update req.user
        req.user.is_suspended = false;
        req.user.suspension_end = null;

        // Continue to next handler since suspension is lifted
        return next();
      }

      // Suspension is still active
      return res.status(403).json({
        error: 'Account suspended',
        suspension_end: suspensionEnd,
        can_appeal: true,
        appeal_url: '/api/appeals'
      });
    }

    // Suspended but no end date (shouldn't happen, but treat as permanent)
    return res.status(403).json({
      error: 'Account suspended',
      suspension_end: null,
      can_appeal: true,
      appeal_url: '/api/appeals'
    });
  } catch (err) {
    console.error('Suspension check error:', err);
    // Don't block the request if there's a database error
    next();
  }
}

module.exports = checkSuspension;
