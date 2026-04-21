/**
 * SafeTea Safety Vault — outbound notifications.
 *
 * Wraps the generic services/email sender with Vault-specific copy. All
 * templates use neutral, trauma-informed language per the Journaling
 * Assistant spec:
 *   - Never name the abuser or the incident
 *   - Never imply why access is being requested
 *   - Always reaffirm the owner controls what happens next
 *
 * Public functions all return the underlying sendEmail result (never throw)
 * so Vault handlers can fire-and-forget without risking a 500.
 */

'use strict';

const email = require('../email');

const APP_URL = (process.env.PUBLIC_APP_URL || 'https://getsafetea.app').replace(/\/$/, '');

function wrap(inner) {
  // Reuses the branded wrapper pattern used by the rest of SafeTea's
  // transactional emails — keeps typography + logo consistent.
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#1A1A2E;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <span style="font-size:24px;font-weight:800;color:#E8A0B5;">SafeTea</span>
    </div>
    <div style="background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:32px 28px;color:#F0D0C0;font-size:15px;line-height:1.6;">
      ${inner}
    </div>
    <div style="text-align:center;margin-top:24px;color:#666;font-size:12px;">
      <p style="margin:0;">SafeTea Safety Vault — a personal record under your control.</p>
      <p style="margin:8px 0 0;">&copy; 2026 SafeTea. All rights reserved.</p>
    </div>
  </div>
</body></html>`;
}

/**
 * Sent when an owner adds a new trusted contact.
 */
function sendContactInvite(contactEmail, ownerDisplayName, inviteToken) {
  const link = `${APP_URL}/vault-request?token=${encodeURIComponent(inviteToken)}`;
  const html = wrap(`
    <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">You've been named a trusted contact</h2>
    <p>${escape(ownerDisplayName || 'A SafeTea member')} added you as a trusted contact for their <strong>Safety Vault</strong>.</p>
    <p>This means: if there is ever a situation where they cannot respond, you may be able to request access to specific parts of what they've documented — so you can help, not because you are owed that information.</p>
    <p><strong>You don't need to do anything right now.</strong> Just keep this email. If the time ever comes when you need to request access, go to the link below.</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${link}" style="background:linear-gradient(135deg,#E8A0B5,#D4768E);color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;display:inline-block;">Open the Vault portal</a>
    </p>
    <p style="color:#8080A0;font-size:13px;">This link is private to you. Do not share it.</p>
  `);
  return email.sendEmail({
    to: contactEmail,
    subject: 'You were named a trusted contact on SafeTea',
    html,
  }).catch(function (e) { console.error('[vault.notifications] invite:', e); return { success: false }; });
}

/**
 * Sent when a contact hits the portal and asks for an OTP.
 */
function sendContactOtp(contactEmail, otpCode) {
  const html = wrap(`
    <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">Your SafeTea Vault verification code</h2>
    <p>Use this code to continue on the Vault portal:</p>
    <div style="text-align:center;margin:24px 0;font-size:32px;letter-spacing:10px;color:#E8A0B5;font-weight:800;font-family:monospace;">${otpCode}</div>
    <p>This code is valid for 10 minutes.</p>
    <p style="color:#8080A0;font-size:13px;">If you did not request this code, you can ignore this email. No action is taken unless the code is entered.</p>
  `);
  return email.sendEmail({
    to: contactEmail,
    subject: `SafeTea Vault code: ${otpCode}`,
    html,
  }).catch(function (e) { console.error('[vault.notifications] otp:', e); return { success: false }; });
}

/**
 * Sent to the owner when a contact submits an access request.
 */
function sendAccessRequestNotice(ownerEmail, ownerDisplayName, contactName, folderTitle, reason, countdownEndsAt) {
  const hrs = Math.max(1, Math.round((new Date(countdownEndsAt).getTime() - Date.now()) / (3600 * 1000)));
  const link = `${APP_URL}/vault`;
  const html = wrap(`
    <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">A trusted contact has requested access</h2>
    <p>Hi ${escape(ownerDisplayName || 'there')},</p>
    <p><strong>${escape(contactName || 'Your trusted contact')}</strong> submitted a request to access a part of your Safety Vault:</p>
    <div style="background:rgba(232,160,181,0.08);border-left:3px solid #E8A0B5;padding:14px 16px;margin:16px 0;border-radius:0 10px 10px 0;">
      <p style="margin:0 0 6px;font-size:13px;color:#8080A0;">Folder</p>
      <p style="margin:0;color:#fff;font-weight:600;">${escape(folderTitle)}</p>
      <p style="margin:14px 0 6px;font-size:13px;color:#8080A0;">Their reason</p>
      <p style="margin:0;color:#F0D0C0;">${escape(reason || '(no reason given)')}</p>
    </div>
    <p>You have <strong>${hrs} hours</strong> to approve, deny, or ignore this. If you ignore it and you previously set this folder to auto-release on timeout, the pre-authorized material will be released automatically at the end of that window.</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${link}" style="background:linear-gradient(135deg,#E8A0B5,#D4768E);color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;display:inline-block;">Open your Vault</a>
    </p>
    <p style="color:#8080A0;font-size:13px;">Only you can approve this. Contacts never see anything you haven't approved.</p>
  `);
  return email.sendEmail({
    to: ownerEmail,
    subject: 'Safety Vault — a trusted contact requested access',
    html,
  }).catch(function (e) { console.error('[vault.notifications] request-notice:', e); return { success: false }; });
}

/**
 * Sent to contact after owner approves (or after auto-release fires).
 */
function sendAccessApproved(contactEmail, contactName, folderTitle, shareUrl) {
  const html = wrap(`
    <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">Access approved</h2>
    <p>${escape(contactName || 'Hi there')},</p>
    <p>Your request to access <strong>${escape(folderTitle)}</strong> has been approved. The link below gives you read-only access. It will expire, and you can only open it from this email.</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${shareUrl}" style="background:linear-gradient(135deg,#E8A0B5,#D4768E);color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;display:inline-block;">Open the shared folder</a>
    </p>
    <p style="color:#8080A0;font-size:13px;">This link is private to you. Treat it accordingly.</p>
  `);
  return email.sendEmail({
    to: contactEmail,
    subject: 'Safety Vault — access approved',
    html,
  }).catch(function (e) { console.error('[vault.notifications] approved:', e); return { success: false }; });
}

/**
 * Sent to contact when the owner denies a request.
 * Copy is neutral — does not reveal owner's reasoning.
 */
function sendAccessDenied(contactEmail, contactName) {
  const html = wrap(`
    <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">Access was not granted</h2>
    <p>${escape(contactName || 'Hi there')},</p>
    <p>The request you submitted through the SafeTea Vault portal was not approved. No further action is needed on your side.</p>
    <p>If you're worried about someone's immediate safety, call 911. If you need to talk to someone trained in safety planning, the National Domestic Violence Hotline is 1-800-799-7233 (24/7, free, confidential).</p>
  `);
  return email.sendEmail({
    to: contactEmail,
    subject: 'Safety Vault — access not granted',
    html,
  }).catch(function (e) { console.error('[vault.notifications] denied:', e); return { success: false }; });
}

function escape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  sendContactInvite,
  sendContactOtp,
  sendAccessRequestNotice,
  sendAccessApproved,
  sendAccessDenied,
};
