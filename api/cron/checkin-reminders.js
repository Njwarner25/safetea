const { getMany, run } = require('../_utils/db');
const { sendDateCheckInReminderEmail } = require('../../services/email');

module.exports = async function handler(req, res) {
  // Only allow GET (Vercel cron) or POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Find checkouts that are overdue (past estimated_return or 3+ hours since scheduled_time)
    // and haven't been reminded yet
    const overdue = await getMany(
      `SELECT dc.id, dc.user_id, dc.date_name, dc.venue_name, dc.scheduled_time, dc.estimated_return,
              u.email, u.display_name
       FROM date_checkouts dc
       JOIN users u ON u.id = dc.user_id
       WHERE dc.status = 'checked_out'
         AND dc.reminder_sent IS NOT TRUE
         AND (
           (dc.estimated_return IS NOT NULL AND dc.estimated_return < NOW() - INTERVAL '15 minutes')
           OR
           (dc.estimated_return IS NULL AND dc.scheduled_time < NOW() - INTERVAL '3 hours')
         )
       LIMIT 50`
    );

    let sent = 0;
    for (const checkout of overdue) {
      if (checkout.email) {
        try {
          await sendDateCheckInReminderEmail(
            checkout.email,
            checkout.display_name,
            checkout.date_name,
            checkout.venue_name
          );
          await run(
            'UPDATE date_checkouts SET reminder_sent = true WHERE id = $1',
            [checkout.id]
          );
          sent++;
        } catch (err) {
          console.error(`[CheckinReminder] Failed for checkout ${checkout.id}:`, err.message);
        }
      }
    }

    return res.status(200).json({
      success: true,
      overdueFound: overdue.length,
      remindersSent: sent,
    });
  } catch (err) {
    console.error('[CheckinReminder] Cron error:', err);
    return res.status(500).json({ error: 'Cron failed', details: err.message });
  }
};
