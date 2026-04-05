// backend/server.js

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Statische frontend bestanden
app.use(express.static(path.join(__dirname, '../frontend/public')));

// ── API ROUTES ────────────────────────────────────────────────────────────────
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
