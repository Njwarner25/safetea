const SENDGRID_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@getsafetea.app';
const FROM_NAME = 'SafeTea';

/**
 * Send an email via SendGrid v3 API (no SDK needed — just fetch)
 */
async function sendEmail({ to, subject, html, text }) {
  if (!SENDGRID_KEY) {
    console.log('[Email] SendGrid not configured. Would send to:', to, 'Subject:', subject);
    return { success: false, reason: 'not_configured' };
  }

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + SENDGRID_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: subject,
        content: [
          ...(text ? [{ type: 'text/plain', value: text }] : []),
          { type: 'text/html', value: html }
        ]
      })
    });

    if (res.status >= 200 && res.status < 300) {
      console.log('[Email] Sent to', to, ':', subject);
      return { success: true };
    } else {
      const err = await res.text();
      console.error('[Email] SendGrid error:', res.status, err);
      return { success: false, reason: err };
    }
  } catch (err) {
    console.error('[Email] Send failed:', err.message);
    return { success: false, reason: err.message };
  }
}

// ─── Email wrapper with SafeTea branding ───
function wrapHtml(content) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#1A1A2E;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <span style="font-size:24px;font-weight:800;color:#E8A0B5;">SafeTea</span>
    </div>
    <div style="background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:32px 28px;color:#F0D0C0;font-size:15px;line-height:1.6;">
      ${content}
    </div>
    <div style="text-align:center;margin-top:24px;color:#666;font-size:12px;">
      <p style="margin:0;">&copy; 2026 SafeTea. All rights reserved.</p>
      <p style="margin:8px 0 0;">Date smarter. Stay safer.</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Pre-built email templates ───

function sendWelcomeEmail(to, displayName) {
  return sendEmail({
    to,
    subject: 'Welcome to SafeTea! 🍵',
    html: wrapHtml(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">Welcome to SafeTea, ${displayName || 'there'}!</h2>
      <p>You've joined a private, women-first community where you can share, verify, and protect each other in the dating world.</p>

      <div style="background:rgba(232,160,181,0.08);border:1px solid rgba(232,160,181,0.15);border-radius:12px;padding:20px;margin:20px 0;">
        <h3 style="color:#E8A0B5;font-size:16px;margin:0 0 16px;">How SafeTea Keeps You Safe</h3>
        <table cellpadding="0" cellspacing="0" style="width:100%;border:0;">
          <tr>
            <td style="padding:0 12px 14px 0;vertical-align:top;width:30px;">
              <div style="width:30px;height:30px;background:rgba(232,160,181,0.15);border-radius:8px;text-align:center;line-height:30px;color:#E8A0B5;font-weight:700;font-size:13px;">1</div>
            </td>
            <td style="padding:0 0 14px 0;vertical-align:top;">
              <strong style="color:#fff;font-size:14px;">Check Out Before Your Date</strong>
              <p style="color:#8080A0;font-size:13px;margin:4px 0 0;line-height:1.4;">Enter who, where, and when. Add trusted contacts who get an SMS.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 12px 14px 0;vertical-align:top;width:30px;">
              <div style="width:30px;height:30px;background:rgba(91,160,208,0.12);border-radius:8px;text-align:center;line-height:30px;color:#5BA0D0;font-weight:700;font-size:13px;">2</div>
            </td>
            <td style="padding:0 0 14px 0;vertical-align:top;">
              <strong style="color:#fff;font-size:14px;">Trusted Contacts Get an SMS</strong>
              <p style="color:#8080A0;font-size:13px;margin:4px 0 0;line-height:1.4;">They receive date info and a live tracking link — no app needed.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 12px 14px 0;vertical-align:top;width:30px;">
              <div style="width:30px;height:30px;background:rgba(180,140,210,0.12);border-radius:8px;text-align:center;line-height:30px;color:#B48CD2;font-weight:700;font-size:13px;">3</div>
            </td>
            <td style="padding:0 0 14px 0;vertical-align:top;">
              <strong style="color:#fff;font-size:14px;">Live Tracking Page</strong>
              <p style="color:#8080A0;font-size:13px;margin:4px 0 0;line-height:1.4;">Contacts can check your status — whether you're on the date and if overdue.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 12px 0 0;vertical-align:top;width:30px;">
              <div style="width:30px;height:30px;background:rgba(76,175,80,0.12);border-radius:8px;text-align:center;line-height:30px;color:#4CAF50;font-weight:700;font-size:13px;">4</div>
            </td>
            <td style="padding:0;vertical-align:top;">
              <strong style="color:#fff;font-size:14px;">Check In When Safe</strong>
              <p style="color:#8080A0;font-size:13px;margin:4px 0 0;line-height:1.4;">Tap "Check In" and all your contacts get a confirmation text.</p>
            </td>
          </tr>
        </table>
      </div>

      <p><strong style="color:#E8A0B5;">Your SafeTea Tools:</strong></p>
      <ul style="padding-left:20px;margin:12px 0;">
        <li><strong>Date Check-In</strong> — Share your location with trusted contacts</li>
        <li><strong>Photo Verification</strong> — AI-powered catfish detection</li>
        <li><strong>Red Flag Scanner</strong> — Analyze conversations for red flags</li>
        <li><strong>SOS Record & Protect</strong> — Emergency recording and alerts</li>
        <li><strong>Name Watch</strong> — Monitor names and get alerts when mentioned</li>
      </ul>
      <div style="text-align:center;margin:24px 0;">
        <a href="https://getsafetea.app/dashboard" style="display:inline-block;background:linear-gradient(135deg,#E8A0B5,#D4768E);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">Open SafeTea</a>
      </div>
      <p style="color:#8080A0;font-size:13px;">Stay safe out there. We've got your back.</p>
    `)
  });
}

function sendNameWatchMatchEmail(to, displayName, watchedName, postSnippet, city) {
  return sendEmail({
    to,
    subject: `🔔 Name Watch Alert: "${watchedName}" was mentioned`,
    html: wrapHtml(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">Name Watch Alert</h2>
      <p>Hey ${displayName || 'there'}, someone in <strong style="color:#E8A0B5;">${city || 'your city'}</strong> just posted about a name you're watching:</p>
      <div style="background:#1A1A2E;border-radius:10px;padding:16px;margin:16px 0;border-left:3px solid #E8A0B5;">
        <div style="color:#E8A0B5;font-size:13px;font-weight:600;margin-bottom:8px;">Watched name: "${watchedName}"</div>
        <div style="color:#ccc;font-size:14px;line-height:1.5;">${postSnippet || 'A new post mentions this name.'}</div>
      </div>
      <div style="text-align:center;margin:24px 0;">
        <a href="https://getsafetea.app/dashboard.html" style="display:inline-block;background:linear-gradient(135deg,#E8A0B5,#D4768E);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">View Post</a>
      </div>
      <p style="color:#8080A0;font-size:12px;">You're receiving this because you have "${watchedName}" on your Name Watch list.</p>
    `)
  });
}

function sendRemovalStatusEmail(to, displayName, status, photoContext) {
  const isApproved = status === 'approved';
  return sendEmail({
    to,
    subject: isApproved ? '⚠️ Photo Removal Notice — SafeTea' : 'Photo Removal Request Update — SafeTea',
    html: wrapHtml(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">${isApproved ? 'Photo Removed' : 'Removal Request Update'}</h2>
      ${isApproved
        ? `<p>Hey ${displayName || 'there'}, a photo ${photoContext ? 'related to "' + photoContext + '"' : 'you uploaded'} has been removed following a verified removal request.</p>
           <div style="background:rgba(231,76,60,0.1);border:1px solid rgba(231,76,60,0.2);border-radius:10px;padding:16px;margin:16px 0;">
             <p style="color:#e74c3c;font-weight:600;margin:0 0 8px;">⚠️ A strike has been added to your account.</p>
             <p style="color:#ccc;font-size:13px;margin:0;">Repeated violations may result in suspension. Please review our <a href="https://getsafetea.app/terms.html" style="color:#E8A0B5;">Terms of Service</a>.</p>
           </div>`
        : `<p>Hey ${displayName || 'there'}, a photo removal request ${photoContext ? 'for "' + photoContext + '"' : ''} has been <strong>denied</strong> after review.</p>
           <p style="color:#8080A0;">No action was taken on your account.</p>`
      }
    `)
  });
}

function sendStrikeBanEmail(to, displayName, strikeCount, isBanned) {
  return sendEmail({
    to,
    subject: isBanned ? '🚫 Account Suspended — SafeTea' : `⚠️ Account Warning (Strike ${strikeCount}) — SafeTea`,
    html: wrapHtml(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">${isBanned ? 'Account Suspended' : 'Account Warning'}</h2>
      ${isBanned
        ? `<p>Hey ${displayName || 'there'}, your SafeTea account has been suspended due to repeated violations of our community guidelines.</p>
           <p>If you believe this was a mistake, contact <a href="mailto:support@getsafetea.app" style="color:#E8A0B5;">support@getsafetea.app</a>.</p>`
        : `<p>Hey ${displayName || 'there'}, your account has received strike <strong style="color:#e74c3c;">#${strikeCount}</strong>.</p>
           <div style="background:rgba(241,196,15,0.1);border:1px solid rgba(241,196,15,0.2);border-radius:10px;padding:16px;margin:16px 0;">
             <p style="color:#f1c40f;font-weight:600;margin:0 0 8px;">⚠️ ${3 - strikeCount} strike(s) remaining before suspension.</p>
             <p style="color:#ccc;font-size:13px;margin:0;">Please review our community guidelines to avoid further action.</p>
           </div>`
      }
    `)
  });
}

function sendDateCheckInReminderEmail(to, displayName, dateName, venue) {
  return sendEmail({
    to,
    subject: `🔔 Check-in reminder: Are you safe? — SafeTea`,
    html: wrapHtml(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">Time to Check In!</h2>
      <p>Hey ${displayName || 'there'}, you checked out for a date${dateName ? ' with <strong>' + dateName + '</strong>' : ''}${venue ? ' at <strong>' + venue + '</strong>' : ''} and haven't checked in yet.</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="https://getsafetea.app/dashboard.html" style="display:inline-block;background:linear-gradient(135deg,#2ecc71,#27ae60);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">✅ I'm Safe — Check In</a>
      </div>
      <p style="color:#8080A0;font-size:13px;">If you're unable to check in, your emergency contacts may be notified.</p>
    `)
  });
}

function sendCityUnlockEmail(to, cityName, signupCount) {
  return sendEmail({
    to,
    subject: `🎉 ${cityName} is now live on SafeTea!`,
    html: wrapHtml(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">Your City is Live!</h2>
      <p>Great news! <strong style="color:#E8A0B5;">${cityName}</strong> has officially launched on SafeTea.</p>
      <p>Thanks to you and <strong>${signupCount}</strong> other people who requested it, ${cityName} is now an active SafeTea community.</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="https://getsafetea.app/login.html" style="display:inline-block;background:linear-gradient(135deg,#E8A0B5,#D4768E);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">Join ${cityName} Now</a>
      </div>
      <p style="color:#8080A0;font-size:13px;">You're receiving this because you signed up for the ${cityName} waitlist.</p>
    `)
  });
}

function sendWeeklyModReportEmail(to, reportText, weekLabel) {
  var escapedReport = (reportText || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  return sendEmail({
    to,
    subject: 'Weekly Moderation Report — ' + (weekLabel || 'SafeTea'),
    html: wrapHtml(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">Weekly Moderation Report</h2>
      <p style="color:#8080A0;font-size:13px;margin-bottom:16px;">${weekLabel || ''}</p>
      <div style="background:#1A1A2E;border-radius:10px;padding:20px;margin:16px 0;font-family:'Courier New',Courier,monospace;font-size:13px;line-height:1.8;color:#C8C8E0;white-space:pre-wrap;word-break:break-word;">
        ${escapedReport}
      </div>
      <div style="text-align:center;margin:24px 0;">
        <a href="https://getsafetea.app/admin.html" style="display:inline-block;background:linear-gradient(135deg,#E8A0B5,#D4768E);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">Open Admin Dashboard</a>
      </div>
      <p style="color:#8080A0;font-size:12px;">This report was auto-generated by SafeTea's moderation system.</p>
    `)
  });
}

function sendVerificationRequestEmail(to, displayName, reason) {
  return sendEmail({
    to,
    subject: 'Action Required: Verification Requested — SafeTea',
    html: wrapHtml(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">Verification Requested</h2>
      <p>Hey ${displayName || 'there'}, a SafeTea admin has requested that you complete additional verification on your account.</p>
      <div style="background:#1A1A2E;border-radius:10px;padding:16px;margin:16px 0;border-left:3px solid #E8A0B5;">
        <div style="color:#E8A0B5;font-size:13px;font-weight:600;margin-bottom:8px;">Reason</div>
        <div style="color:#ccc;font-size:14px;line-height:1.5;">${(reason || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      </div>
      <p>Please complete the verification steps to maintain your access to SafeTea features.</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="https://getsafetea.app/verify.html" style="display:inline-block;background:linear-gradient(135deg,#E8A0B5,#D4768E);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">Complete Verification</a>
      </div>
      <p style="color:#8080A0;font-size:12px;">If you believe this was sent in error, contact support@getsafetea.app.</p>
    `)
  });
}

module.exports = {
  sendEmail,
  wrapHtml,
  sendWelcomeEmail,
  sendNameWatchMatchEmail,
  sendRemovalStatusEmail,
  sendStrikeBanEmail,
  sendDateCheckInReminderEmail,
  sendCityUnlockEmail,
  sendWeeklyModReportEmail,
  sendVerificationRequestEmail
};
