// backend/server.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuten
  max: 20,                   // max 20 pogingen per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Te veel inlogpogingen, probeer het over 15 minuten opnieuw.' },
});

// Statische frontend bestanden
app.use(express.static(path.join(__dirname, '../frontend/public')));

// ── API ROUTES ────────────────────────────────────────────────────────────────
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/artikelen',   require('./routes/artikelen'));
app.use('/api/picklijsten', require('./routes/picklijsten'));
app.use('/api/gebruikers',  require('./routes/gebruikers'));

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// SPA fallback — alle niet-API routes gaan naar index.html
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
  }
});

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Magazijn server draait op http://localhost:${PORT}`);
  console.log(`   API:      http://localhost:${PORT}/api`);
  console.log(`   Frontend: http://localhost:${PORT}\n`);
});
