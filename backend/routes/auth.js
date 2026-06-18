// backend/routes/auth.js

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const db      = require('../db');
const { signToken, checkPassword, requireAuth } = require('../auth');

// In-memory CSRF state store voor Microsoft OAuth
const pendingStates = new Map();

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

  if (user.auth_methode === 'microsoft') {
    return res.status(403).json({ error: 'Dit account vereist inloggen via Microsoft.' });
  }

  const token = signToken({ id: user.id, naam: user.naam, email: user.email, rol: user.rol });
  res.json({
    token,
    gebruiker: { id: user.id, naam: user.naam, email: user.email, rol: user.rol }
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(
    'SELECT id, naam, email, rol, aangemaakt FROM gebruikers WHERE id = ?'
  ).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Gebruiker niet gevonden' });
  res.json(user);
});

// ── MICROSOFT OAUTH ───────────────────────────────────────────────────────────

// GET /api/auth/microsoft — redirect naar Microsoft login pagina
router.get('/microsoft', (req, res) => {
  if (!process.env.AZURE_TENANT_ID || !process.env.AZURE_CLIENT_ID) {
    return res.status(503).json({ error: 'Microsoft login is niet geconfigureerd.' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now());

  // Opruimen van verlopen states (> 10 minuten)
  for (const [k, v] of pendingStates) {
    if (Date.now() - v > 10 * 60 * 1000) pendingStates.delete(k);
  }

  const params = new URLSearchParams({
    client_id:     process.env.AZURE_CLIENT_ID,
    response_type: 'code',
    redirect_uri:  process.env.AZURE_REDIRECT_URI,
    response_mode: 'query',
    scope:         'openid profile email User.Read',
    state,
  });

  res.redirect(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/authorize?${params}`
  );
});

// GET /api/auth/microsoft/callback — Microsoft stuurt gebruiker hierheen terug
router.get('/microsoft/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect('/?ms_error=' + encodeURIComponent(error));
  }
  if (!state || !pendingStates.has(state)) {
    return res.redirect('/?ms_error=ongeldige_sessie');
  }
  pendingStates.delete(state);

  try {
    // Wissel code in voor access token
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'authorization_code',
          client_id:     process.env.AZURE_CLIENT_ID,
          client_secret: process.env.AZURE_CLIENT_SECRET,
          code,
          redirect_uri:  process.env.AZURE_REDIRECT_URI,
          scope:         'openid profile email User.Read',
        }),
      }
    );
    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      console.error('[ms-auth] Token ophalen mislukt:', tokens);
      return res.redirect('/?ms_error=token_mislukt');
    }

    // Haal gebruikersprofiel op via Graph
    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { 'Authorization': 'Bearer ' + tokens.access_token },
    });
    const profile = await profileRes.json();

    const msId = profile.id;
    const email = (profile.mail || profile.userPrincipalName || '').toLowerCase();

    // Zoek gebruiker op microsoft_id of email
    let user = db.prepare('SELECT * FROM gebruikers WHERE microsoft_id = ? AND actief = 1').get(msId)
            || db.prepare('SELECT * FROM gebruikers WHERE email = ? AND actief = 1').get(email);

    if (!user) {
      return res.redirect('/?ms_error=geen_account');
    }
    if (user.auth_methode === 'local') {
      return res.redirect('/?ms_error=alleen_lokaal');
    }

    // Koppel microsoft_id als dat nog niet gedaan is
    if (!user.microsoft_id) {
      db.prepare('UPDATE gebruikers SET microsoft_id = ? WHERE id = ?').run(msId, user.id);
    }

    const token = signToken({ id: user.id, naam: user.naam, email: user.email, rol: user.rol });
    const userJson = encodeURIComponent(JSON.stringify({
      id: user.id, naam: user.naam, email: user.email, rol: user.rol
    }));

    res.redirect(`/?ms_token=${token}&ms_user=${userJson}`);
  } catch (err) {
    console.error('[ms-auth] Fout:', err);
    res.redirect('/?ms_error=server_fout');
  }
});

module.exports = router;
