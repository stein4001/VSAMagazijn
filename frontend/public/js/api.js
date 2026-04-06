// frontend/public/js/api.js
// Centrale API-client. Alle fetch-calls gaan via deze module.

const API_BASE = '/api';

let _token = localStorage.getItem('mz_token');
let _user  = JSON.parse(localStorage.getItem('mz_user') || 'null');

export const auth = {
  get token() { return _token; },
  get user()  { return _user; },
  get isAdmin() { return _user?.rol === 'admin'; },

  set(token, user) {
    _token = token; _user = user;
    localStorage.setItem('mz_token', token);
    localStorage.setItem('mz_user', JSON.stringify(user));
  },
  clear() {
    _token = null; _user = null;
    localStorage.removeItem('mz_token');
    localStorage.removeItem('mz_user');
  },
  isLoggedIn() { return !!_token; },
};

async function req(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (_token) opts.headers['Authorization'] = 'Bearer ' + _token;
  if (body)   opts.body = JSON.stringify(body);

  const res = await fetch(API_BASE + path, opts);
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    auth.clear();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new Error('Sessie verlopen, log opnieuw in');
  }
  if (!res.ok) throw new Error(data.error || `Fout ${res.status}`);
  return data;
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
export const login = (email, wachtwoord) => req('POST', '/auth/login', { email, wachtwoord });

// ── ARTIKELEN ─────────────────────────────────────────────────────────────────
export const getArtikelen    = (q)    => req('GET', `/artikelen${q ? '?q=' + encodeURIComponent(q) : ''}`);
export const getCategorieen  = ()     => req('GET', '/artikelen/categorieen/lijst');
export const getArtikelQR  = (code) => req('GET', `/artikelen/qr/${encodeURIComponent(code)}`);
export const getArtikel    = (id)   => req('GET', `/artikelen/${id}`);
export const createArtikel = (body) => req('POST', '/artikelen', body);
export const updateArtikel = (id, body) => req('PUT', `/artikelen/${id}`, body);
export const deleteArtikel = (id)   => req('DELETE', `/artikelen/${id}`);

// ── PICKLIJSTEN ───────────────────────────────────────────────────────────────
export const getPicklijsten   = (params = {}) => {
  const q = new URLSearchParams(params).toString();
  return req('GET', '/picklijsten' + (q ? '?' + q : ''));
};
export const getPicklijst     = (id)          => req('GET',    `/picklijsten/${id}`);
export const createPicklijst  = (body = {})   => req('POST',   '/picklijsten', body);
export const addRegel         = (id, body)    => req('POST',   `/picklijsten/${id}/regels`, body);
export const deleteRegel      = (id, rId)     => req('DELETE', `/picklijsten/${id}/regels/${rId}`);
export const updatePicklijst   = (id, body)   => req('PATCH',  `/picklijsten/${id}`, body);
export const verstuurPicklijst = (id)         => req('POST',   `/picklijsten/${id}/verstuur`);
export const verwerkRetour    = (id, regels)  => req('POST',   `/picklijsten/${id}/retour`, { regels });
export const deletePicklijst   = (id)          => req('DELETE', `/picklijsten/${id}`);
export const annuleerPicklijst = (id)          => req('POST',   `/picklijsten/${id}/annuleer`);
export const afrondPicklijst   = (id, projectnummer) => req('POST', `/picklijsten/${id}/afronden`, { projectnummer });

// ── ADMIN ─────────────────────────────────────────────────────────────────────
export const getStats            = () => req('GET', '/picklijsten/admin/stats');
export const getVerbruik         = (params = {}) => {
  const q = new URLSearchParams(params).toString();
  return req('GET', '/picklijsten/admin/verbruik' + (q ? '?' + q : ''));
};
export const getVerbruikPerMed   = () => req('GET', '/picklijsten/admin/verbruik-per-medewerker');
export const getGebruikers       = () => req('GET', '/gebruikers');
export const createGebruiker     = (body) => req('POST', '/gebruikers', body);
export const updateGebruiker     = (id, body) => req('PUT', `/gebruikers/${id}`, body);
export const deleteGebruiker     = (id)   => req('DELETE', `/gebruikers/${id}`);
