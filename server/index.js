require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const userRoutes = require('./routes/users');
const alertRoutes = require('./routes/alerts');
const cityRoutes = require('./routes/cities');
const messageRoutes = require('./routes/messages');
const referralRoutes = require('./routes/referrals');
const namewatchRoutes = require('./routes/namewatch');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));

// CORS — allow mobile app, web frontend, and localhost
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  process.env.APP_URL || 'https://getsafetea.app',
  'https://getsafetea.app',
  'http://localhost:8081',  // Expo dev
  'http://localhost:19006'  // Expo web
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(null, false);
  },
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/cities', cityRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/namewatch', namewatchRoutes);
app.use('/api/admin', adminRoutes);

// Health check (enhanced with pool metrics)
const { getPoolHealth, checkScaleThreshold } = require('./db/database');
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// Run scale threshold check every 10 minutes
setInterval(() => {
  checkScaleThreshold().then(result => {
    if (result && result.needsUpgrade) {
      console.log(`[MONITOR] Scale check: ${result.userCount} users, pool at ${Math.round(result.poolUtilization * 100)}%`);
    }
  });
}, 10 * 60 * 1000);

// Initial check on startup (after 30 seconds to let DB connect)
setTimeout(() => checkScaleThreshold(), 30000);

// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`SafeTea server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
