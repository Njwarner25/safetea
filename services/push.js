const { getMany } = require('../api/_utils/db');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send a push notification to all devices registered for a user.
 * Uses the Expo Push API — no SDK required.
 */
async function sendPushNotification(userId, title, body, data) {
  try {
    const tokens = await getMany(
      'SELECT token FROM push_tokens WHERE user_id = $1',
      [userId]
    );

    if (!tokens || tokens.length === 0) return;

    const messages = tokens.map(function(t) {
      return {
        to: t.token,
        sound: 'default',
        title: title,
        body: body,
        data: data || {},
      };
    });

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.error('[Push] Expo API error:', response.status);
    }
  } catch (err) {
    console.error('[Push] Send failed:', err.message);
  }
}

module.exports = { sendPushNotification };
