// backend/auth.js

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const SECRET = process.env.JWT_SECRET || 'magazijn-secret-change-in-production';
const EXPIRES = '12h';

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

// Middleware: vereist geldig JWT token
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Niet ingelogd' });
  }
  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch {
    return res.status(401).json({ error: 'Token ongeldig of verlopen' });
  }
}

// Middleware: vereist admin rol
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.rol !== 'admin') {
      return res.status(403).json({ error: 'Geen toegang' });
    }
    next();
  });
}

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function checkPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

module.exports = { signToken, verifyToken, requireAuth, requireAdmin, hashPassword, checkPassword };
