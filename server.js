// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./database'); // promise pool

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/students');
const teamRoutes = require('./routes/teams');
const bracketRoutes = require('./routes/brackets');

const app = express();
const PORT = process.env.PORT || 5000;

/**
 * CORS
 *
 * - Allow requests without origin (curl, mobile, server-to-server).
 * - Allow specific origins from env or known hosting providers.
 * - For safety, keep a whitelist and fallback to rejecting unknown origins.
 */
const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://localhost:5000',
  process.env.FRONTEND_URL, // e.g. https://your-app.vercel.app
].filter(Boolean)); // remove falsy entries

const corsOptions = {
  origin: (origin, callback) => {
    // allow requests with no origin (e.g. curl, server-to-server)
    if (!origin) return callback(null, true);

    // allow exact matches from the whitelist
    if (allowedOrigins.has(origin)) return callback(null, true);

    // allow common host patterns (vercel/netlify/onrender)
    // be careful with broad matches in production — use explicit domains when possible
    if (origin.includes('vercel.app') || origin.includes('netlify.app') || origin.includes('onrender.com')) {
      return callback(null, true);
    }

    // otherwise reject
    return callback(new Error(`CORS policy: origin not allowed - ${origin}`));
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

/**
 * Temporary debug route — returns current database name.
 * REMOVE this route after you finish debugging.
 */
app.get('/api/debug-db', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT DATABASE() AS db');
    res.json(rows[0] || { db: null });
  } catch (err) {
    console.error('Debug DB error:', err);
    res.status(500).json({ error: err.message || 'Failed to get database' });
  }
});

/**
 * API routes
 */
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/brackets', bracketRoutes);

/**
 * Simple test route
 */
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working!' });
});

/**
 * Error handling middleware
 * - Logs the full stack on the server.
 * - Returns a JSON message (do not leak sensitive info in production).
 */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && (err.stack || err));
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : (err.message || 'Something went wrong');
  res.status(status).json({ error: message });
});

/**
 * Start server
 */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
