const { neon } = require('@neondatabase/serverless');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  const sql = neon(process.env.DATABASE_URL);

  try {
    // Verify JWT and get user
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId || decoded.id;

    const { receipt, platform } = req.body;

    if (!receipt) {
      return res.status(400).json({ error: 'Receipt data required' });
    }

    if (platform === 'ios') {
      // Validate with Apple App Store Server API
      const validationResult = await validateAppleReceipt(receipt);

      if (!validationResult.valid) {
        return res.status(400).json({ error: 'Invalid receipt', details: validationResult.error });
      }

      // Determine subscription tier from product ID
      const productId = validationResult.productId;
      let tier = 'free';
      let plan = null;

      // Accept both legacy SafeTea product IDs and the LinkHer product IDs
      // (iOS rebrand to LinkHer per App Store Guideline 4.3).
      const PLUS_PRODUCTS = new Set([
        'app.getsafetea.plus.monthly',
        'app.getsafetea.plus.annual',
        'linkher_plus_monthly',
        'linkher_plus_yearly',
      ]);
      const ANNUAL_PRODUCTS = new Set([
        'app.getsafetea.plus.annual',
        'linkher_plus_yearly',
      ]);
      if (PLUS_PRODUCTS.has(productId)) {
        tier = 'plus';
        plan = ANNUAL_PRODUCTS.has(productId) ? 'annual' : 'monthly';
      }

      // Update user tier in database
      await sql`
        UPDATE users
        SET tier = ${tier},
            subscription_platform = 'apple',
            subscription_product_id = ${productId},
            subscription_expires_at = ${validationResult.expiresAt ? new Date(validationResult.expiresAt) : null},
            updated_at = NOW()
        WHERE id = ${userId}
      `;

      return res.status(200).json({
        success: true,
        tier: tier,
        plan: plan,
        expiresAt: validationResult.expiresAt
      });
    }

    return res.status(400).json({ error: 'Unsupported platform' });
  } catch (err) {
    console.error('IAP verify error:', err);
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(500).json({ error: 'Verification failed' });
  }
};

async function validateAppleReceipt(receiptData) {
  try {
    // Use Apple's App Store Server API v2
    // In production, use the App Store Server API with signed JWTs
    // For now, use the legacy verifyReceipt endpoint

    const verifyUrl = process.env.NODE_ENV === 'production'
      ? 'https://buy.itunes.apple.com/verifyReceipt'
      : 'https://sandbox.itunes.apple.com/verifyReceipt';

    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        'receipt-data': receiptData,
        'password': process.env.APPLE_SHARED_SECRET,
        'exclude-old-transactions': true
      })
    });

    const data = await response.json();

    if (data.status === 0) {
      // Receipt is valid
      const latestReceipt = data.latest_receipt_info;
      if (latestReceipt && latestReceipt.length > 0) {
        const latest = latestReceipt[latestReceipt.length - 1];
        return {
          valid: true,
          productId: latest.product_id,
          expiresAt: parseInt(latest.expires_date_ms),
          originalTransactionId: latest.original_transaction_id
        };
      }
      return { valid: false, error: 'No subscription found in receipt' };
    } else if (data.status === 21007) {
      // Sandbox receipt sent to production — retry with sandbox
      return await validateAppleReceiptSandbox(receiptData);
    } else {
      return { valid: false, error: 'Apple verification failed with status: ' + data.status };
    }
  } catch (err) {
    return { valid: false, error: 'Failed to validate receipt: ' + err.message };
  }
}

async function validateAppleReceiptSandbox(receiptData) {
  try {
    const response = await fetch('https://sandbox.itunes.apple.com/verifyReceipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        'receipt-data': receiptData,
        'password': process.env.APPLE_SHARED_SECRET,
        'exclude-old-transactions': true
      })
    });

    const data = await response.json();
    if (data.status === 0 && data.latest_receipt_info && data.latest_receipt_info.length > 0) {
      const latest = data.latest_receipt_info[data.latest_receipt_info.length - 1];
      return {
        valid: true,
        productId: latest.product_id,
        expiresAt: parseInt(latest.expires_date_ms),
        originalTransactionId: latest.original_transaction_id
      };
    }
    return { valid: false, error: 'Sandbox verification failed' };
  } catch (err) {
    return { valid: false, error: 'Sandbox validation error: ' + err.message };
  }
}