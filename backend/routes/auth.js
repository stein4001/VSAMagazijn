// backend/routes/auth.js

const express = require('express');
const router = express.Router();
const db = require('../db');
const { signToken, checkPassword, requireAuth } = require('../auth');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, wachtwoord } = req.body;
  if (!email || !wachtwoord) {
    return res.status(400).json({ error: 'Email en wachtwoord zijn verplicht' });
  }

  const user = db.prepare(
    'SELECT * FROM gebruikers WHERE email = ? AND actief = 1'
  ).get(email.toLowerCase().trim());

  if (!user || !checkPassword(wachtwoord, user.wachtwoord)) {
    return res.status(401).json({ error: 'Onjuiste inloggegevens' });
  }

  const token = signToken({ id: user.id, naam: user.naam, email: user.email, rol: user.rol });

  res.json({
    token,
    gebruiker: { id: user.id, naam: user.naam, email: user.email, rol: user.rol }
  });
});

// GET /api/auth/me  — haal eigen profiel op
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(
    'SELECT id, naam, email, rol, aangemaakt FROM gebruikers WHERE id = ?'
  ).get(req.user.id);

  if (!user) return res.status(404).json({ error: 'Gebruiker niet gevonden' });
  res.json(user);
});

module.exports = router;
