// frontend/public/js/app.js
// Hoofd applicatielogica. Importeert api.js en scanner.js.

import * as API from './api.js';
import { Scanner } from './scanner.js';

// ── STATE ─────────────────────────────────────────────────────────────────────
let activePicklijstId = null;
let scanner = null;
let retourListId = null;
let adminFilter = '';
let _currentArtikel = null;

// Data-caches voor client-side zoekfilter
let _listsCache = [];
let _artCache   = [];
let _klantenCache = [];
let _gebCache   = [];
let _searchQ = { lists: '', artikelen: '', klanten: '', gebruikers: '' };

window.adminSearch = function(tab, val) {
  _searchQ[tab] = val.toLowerCase();
  if (tab === 'lists')      _renderAdminLists();
  if (tab === 'artikelen')  _renderArtikelen();
  if (tab === 'klanten')    _renderKlanten();
  if (tab === 'gebruikers') _renderGebruikers();
};

// ── THEMA ─────────────────────────────────────────────────────────────────────
function applyTheme() {
  const saved = localStorage.getItem('mz_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = saved === 'dark' || (saved === null && prefersDark);
  document.body.classList.toggle('dark', isDark);
  document.getElementById('dark-toggle')?.classList.toggle('on', isDark);
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isDark ? '#0c1020' : '#dde5f0');
}

window.toggleDarkMode = function() {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem('mz_theme', isDark ? 'dark' : 'light');
  document.getElementById('dark-toggle')?.classList.toggle('on', isDark);
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isDark ? '#0c1020' : '#dde5f0');
};

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!localStorage.getItem('mz_theme')) applyTheme();
});

// ── INIT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  registerSW();
  handleMicrosoftCallback();
  if (API.auth.isLoggedIn()) {
    showApp();
  } else {
    showScreen('login');
  }
  window.addEventListener('auth:logout', () => showScreen('login'));
});

function handleMicrosoftCallback() {
  const params = new URLSearchParams(window.location.search);
  const msToken = params.get('ms_token');
  const msUser  = params.get('ms_user');
  const msError = params.get('ms_error');

  if (msToken && msUser) {
    try {
      API.auth.set(msToken, JSON.parse(decodeURIComponent(msUser)));
    } catch {}
    history.replaceState({}, '', '/');
    return;
  }
  if (msError) {
    const berichten = {
      geen_account:    'Geen account gevonden voor dit Microsoft account. Vraag een admin om je toe te voegen.',
      alleen_lokaal:   'Dit account kan niet inloggen via Microsoft.',
      ongeldige_sessie:'Ongeldige sessie, probeer opnieuw.',
      token_mislukt:   'Microsoft login mislukt, probeer opnieuw.',
      server_fout:     'Er is een serverfout opgetreden bij Microsoft login.',
    };
    const errEl = document.getElementById('login-error');
    if (errEl) {
      errEl.textContent = berichten[msError] || 'Microsoft login mislukt: ' + msError;
      errEl.classList.add('show');
    }
    history.replaceState({}, '', '/');
  }
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  // Luister VOOR registratie zodat de event niet gemist wordt.
  // hadController = false bij eerste installatie → geen reload.
  // hadController = true bij update → reload zodat nieuwe code actief is.
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) location.reload();
    hadController = true;
  });

  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

window.clearAppCache = async function() {
  const keys = await caches.keys();
  await Promise.all(keys.map(k => caches.delete(k)));
  location.reload();
};

// ── SCHERMEN ─────────────────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.add('active');
  document.getElementById('app-nav').style.display = name === 'login' ? 'none' : '';
}

function showApp() {
  const u = API.auth.user;
  const initialen = (u?.naam || 'G').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('nav-naam').textContent  = u?.naam?.split(' ')[0] || 'Gebruiker';
  document.getElementById('nav-avatar').textContent = initialen;
  document.getElementById('menu-naam').textContent  = u?.naam || 'Gebruiker';
  document.getElementById('menu-rol').textContent   = u?.rol || '';
  document.getElementById('nav-admin-tab').style.display = API.auth.isAdmin ? '' : 'none';

  showScreen('main');
  initWorker();
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');
  errEl.classList.remove('show');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const { token, gebruiker } = await API.login(
      document.getElementById('login-email').value,
      document.getElementById('login-pw').value
    );
    API.auth.set(token, gebruiker);
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Inloggen';
  }
});

// ── NAV TABS ─────────────────────────────────────────────────────────────────

window.switchNavTab = function switchNavTab(active) {
  showScreen(active);
  document.getElementById('nav-worker-tab').classList.toggle('active', active === 'main');
  document.getElementById('nav-admin-tab').classList.toggle('active', active === 'admin');
  if (active !== 'main') { stopScanner(); }
  if (active === 'main')  { resetScanVP(); }
};

window.doLogout = function() {
  API.auth.clear();
  stopScanner();
  closeProfileMenu();
  showScreen('login');
};

window.toggleProfileMenu = function() {
  const btn  = document.getElementById('profile-btn');
  const menu = document.getElementById('profile-menu');
  const open = menu.classList.toggle('open');
  btn.classList.toggle('open', open);
};

function closeProfileMenu() {
  document.getElementById('profile-menu')?.classList.remove('open');
  document.getElementById('profile-btn')?.classList.remove('open');
}

document.addEventListener('click', e => {
  if (!document.getElementById('profile-btn')?.contains(e.target) &&
      !document.getElementById('profile-menu')?.contains(e.target)) {
    closeProfileMenu();
  }
});

window.openInstellingen = function() {
  document.getElementById('inst-modal').classList.add('open');
  document.getElementById('dark-toggle')?.classList.toggle('on', document.body.classList.contains('dark'));
};
document.getElementById('inst-modal-close')?.addEventListener('click', () =>
  document.getElementById('inst-modal').classList.remove('open'));
document.getElementById('inst-modal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

window.initWorker = initWorker;
window.initAdmin  = initAdmin;

// ══════════════════════════════════════════════════════════════════════════════
// MEDEWERKER
// ══════════════════════════════════════════════════════════════════════════════
async function initWorker() {
  document.getElementById('klant-input').value = '';
  workerTab('scan');
  try {
    const lijsten = await API.getPicklijsten({ status: 'actief', limit: 1 });
    if (lijsten.length) {
      activePicklijstId = lijsten[0].id;
      if (lijsten[0].klant) document.getElementById('klant-input').value = lijsten[0].klant;
      await renderPicklist();
      showToast('↩ Actieve lijst hervat');
    }
  } catch {}
}

window.workerTab = function(tab) {
  const scanEl  = document.getElementById('wtab-scan');
  const listsEl = document.getElementById('wtab-lists');
  scanEl.style.display  = tab === 'scan'  ? '' : 'none';
  listsEl.style.display = tab === 'lists' ? '' : 'none';
  tabEnter(tab === 'scan' ? scanEl : listsEl);
  document.querySelectorAll('.seg-btn').forEach((b,i) =>
    b.classList.toggle('active', (i===0 && tab==='scan') || (i===1 && tab==='lists'))
  );
  if (tab === 'lists') { stopScanner(); resetScanVP(); loadMyLists(); }
  if (tab === 'scan')  { resetScanVP(); }
};

// ── SCANNER ──────────────────────────────────────────────────────────────────
// scan-start-btn.onclick wordt dynamisch beheerd via resetScanVP / startScanner
document.getElementById('scan-start-btn').onclick = startScanner;

async function startScanner() {
  const btn = document.getElementById('scan-start-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Camera starten…';

  if (scanner) { await stopScanner(); }

  scanner = new Scanner('scan-video', async (code) => {
    await stopScanner();
    btn.disabled = false;
    btn.textContent = '📷 Camera starten';
    await handleScanResult(code);
  });

  try {
    await scanner.start();
    btn.disabled = false;
    btn.textContent = '⏹ Camera stoppen';
    btn.onclick = async () => { await stopScanner(); resetScanVP(); };
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '📷 Camera starten';
    btn.onclick = startScanner;
    scanner = null;
    const msg = err?.name === 'NotAllowedError'
      ? 'Camera-toegang geweigerd. Geef toestemming in je browserinstellingen.'
      : 'Camera niet beschikbaar, gebruik handmatig invoer.';
    showToast(msg, true);
  }
}

async function stopScanner() {
  if (scanner) { await scanner.stop(); scanner = null; }
}

// Handmatig code invoer
document.getElementById('manual-qr-btn')?.addEventListener('click', () => {
  document.getElementById('manual-qr-wrap').style.display =
    document.getElementById('manual-qr-wrap').style.display === 'none' ? '' : 'none';
});
document.getElementById('manual-qr-submit')?.addEventListener('click', () => {
  const val = document.getElementById('manual-qr-input').value.trim();
  if (val) { _clearArtSuggestions(); handleScanResult(val); }
});

// ── ARTIKEL LIVE ZOEKEN ───────────────────────────────────────────────────────
let _artSuggestions = [];
let _suggestTimer = null;

document.getElementById('manual-qr-input')?.addEventListener('input', function() {
  clearTimeout(_suggestTimer);
  const q = this.value.trim();
  if (q.length < 2) { _clearArtSuggestions(); return; }
  _suggestTimer = setTimeout(async () => {
    try {
      const arts = await API.getArtikelen(q);
      _artSuggestions = arts.slice(0, 6);
      _renderArtSuggestions();
    } catch { _clearArtSuggestions(); }
  }, 220);
});

document.addEventListener('click', e => {
  if (!document.getElementById('manual-qr-wrap')?.contains(e.target)) {
    _clearArtSuggestions();
  }
});

function _renderArtSuggestions() {
  const el = document.getElementById('art-suggestions');
  if (!el) return;
  el.innerHTML = _artSuggestions.map((a, i) => `
    <div class="art-suggest-item" onclick="selectArtSuggestie(${i})">
      <div>${esc(a.naam)}</div>
      <div class="art-suggest-sub">${esc(a.qr_code)}${a.categorie ? ' · ' + esc(a.categorie) : ''} · ${esc(a.eenheid)}</div>
    </div>`).join('');
}

function _clearArtSuggestions() {
  _artSuggestions = [];
  const el = document.getElementById('art-suggestions');
  if (el) el.innerHTML = '';
}

window.selectArtSuggestie = function(i) {
  const artikel = _artSuggestions[i];
  if (!artikel) return;
  _clearArtSuggestions();
  document.getElementById('manual-qr-input').value = '';
  document.getElementById('manual-qr-wrap').style.display = 'none';
  showScannedArtikel(artikel);
};

async function handleScanResult(code) {
  try {
    const artikel = await API.getArtikelQR(code);
    showScannedArtikel(artikel);
  } catch {
    // Artikel niet in DB — maak automatisch aan op basis van QR-inhoud
    // QR formaat: "ACT1990 UTP CAT6 1,5M Blauw" → volledige string als qr_code, rest na eerste woord als naam
    const trimmed = code.trim();
    const spaceIdx = trimmed.indexOf(' ');
    const naam = spaceIdx > 0 ? trimmed.slice(spaceIdx + 1) : trimmed;
    try {
      const nieuw = await API.createArtikel({ naam, qr_code: trimmed, eenheid: 'stuk' });
      showToast('Nieuw artikel aangemaakt: ' + naam);
      showScannedArtikel(nieuw);
    } catch (err2) {
      showToast('Kan artikel niet aanmaken: ' + err2.message, true);
    }
  }
}

function showScannedArtikel(artikel) {
  _currentArtikel = artikel;
  const isSN = artikel.eenheid === 'SN';

  document.getElementById('scanned-name').textContent = artikel.naam;
  document.getElementById('scanned-code').textContent = artikel.qr_code;
  document.getElementById('scanned-result').classList.add('show');
  document.getElementById('scan-placeholder').style.display = 'none';
  document.getElementById('scan-vp').classList.add('scanned');
  const startBtn = document.getElementById('scan-start-btn');
  startBtn.textContent = '📷 Opnieuw scannen';
  startBtn.onclick = startScanner;

  document.getElementById('qty-modal-naam').textContent = artikel.naam;
  document.getElementById('qty-modal-code').textContent = artikel.qr_code;
  document.getElementById('qty-modal-unit').textContent = artikel.eenheid;
  document.getElementById('qty-modal-qty-wrap').style.display = isSN ? 'none' : '';
  document.getElementById('qty-modal-sn-wrap').style.display  = isSN ? '' : 'none';
  document.getElementById('qty-modal-input').value = 1;
  document.getElementById('qty-modal-sn').value = '';
  document.getElementById('qty-modal-add').disabled = false;
  document.getElementById('qty-modal').classList.add('open');

  setTimeout(() => {
    if (isSN) document.getElementById('qty-modal-sn').focus();
    else document.getElementById('qty-modal-input').select();
  }, 320);
}

// Reset scanner viewport
function resetScanVP() {
  document.getElementById('qty-modal')?.classList.remove('open');
  document.getElementById('scanned-result').classList.remove('show');
  document.getElementById('scan-placeholder').style.display = '';
  document.getElementById('scan-vp').classList.remove('scanned');
  const btn = document.getElementById('scan-start-btn');
  btn.style.display = '';
  btn.disabled = false;
  btn.textContent = '📷 Camera starten';
  btn.onclick = startScanner;
  document.getElementById('manual-qr-wrap').style.display = 'none';
  document.getElementById('manual-qr-input').value = '';
  _clearArtSuggestions();
  _currentArtikel = null;
}

// Hoeveelheid modal — stepper
document.getElementById('qty-modal-minus')?.addEventListener('click', () => {
  const i = document.getElementById('qty-modal-input');
  i.value = Math.max(1, (parseInt(i.value)||1) - 1);
});
document.getElementById('qty-modal-plus')?.addEventListener('click', () => {
  const i = document.getElementById('qty-modal-input');
  i.value = (parseInt(i.value)||1) + 1;
});

// Hoeveelheid modal — toevoegen
document.getElementById('qty-modal-add')?.addEventListener('click', async () => {
  if (!_currentArtikel) return;
  const btn = document.getElementById('qty-modal-add');
  const isSN = _currentArtikel.eenheid === 'SN';
  const qty = isSN ? 1 : (parseInt(document.getElementById('qty-modal-input').value) || 1);
  const sn  = isSN ? document.getElementById('qty-modal-sn').value.trim() : null;

  if (isSN && !sn) { showToast('Vul een serienummer in', true); return; }

  btn.disabled = true;
  try {
    if (!activePicklijstId) {
      const klant = document.getElementById('klant-input').value.trim();
      const lijst = await API.createPicklijst(klant ? { klant } : {});
      activePicklijstId = lijst.id;
    }
    const regelBody = { artikel_id: _currentArtikel.id, meegenomen: qty };
    if (sn) regelBody.serienummer = sn;
    await API.addRegel(activePicklijstId, regelBody);
    document.getElementById('qty-modal').classList.remove('open');
    await renderPicklist();
    resetScanVP();
  } catch (err) {
    showToast(err.message, true);
    btn.disabled = false;
  }
});

function _closeQtyModal() {
  document.getElementById('qty-modal').classList.remove('open');
  resetScanVP();
}
document.getElementById('qty-modal-cancel')?.addEventListener('click', _closeQtyModal);
document.getElementById('qty-modal-close')?.addEventListener('click', _closeQtyModal);
document.getElementById('qty-modal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) _closeQtyModal();
});

// ── KLANT ────────────────────────────────────────────────────────────────────
document.getElementById('klant-input')?.addEventListener('focus', () => vulKlantenDatalist());

document.getElementById('klant-input')?.addEventListener('blur', async () => {
  if (!activePicklijstId) return;
  const input = document.getElementById('klant-input');
  const getypt = input.value.trim();
  const klant = matchKlantNaam(getypt);
  if (klant !== getypt) input.value = klant;
  try { await API.updatePicklijst(activePicklijstId, { klant: klant || null }); } catch {}
});

// ── PICKLIJST ─────────────────────────────────────────────────────────────────

async function renderPicklist() {
  const c   = document.getElementById('pick-items');
  const cnt = document.getElementById('pick-count');
  const sb  = document.getElementById('send-btn');

  if (!activePicklijstId) {
    c.innerHTML = '<div class="list-empty">Scan een artikel om te beginnen</div>';
    cnt.textContent = '0 artikelen';
    sb.disabled = true;
    return;
  }

  const lijst = await API.getPicklijst(activePicklijstId);
  const regels = lijst.regels || [];

  cnt.textContent = regels.length + ' artikel' + (regels.length !== 1 ? 'en' : '');
  sb.disabled = regels.length === 0;

  if (!regels.length) {
    c.innerHTML = '<div class="list-empty">Scan een artikel om te beginnen</div>';
    return;
  }

  c.innerHTML = regels.map(r => `
    <div class="pick-item">
      <div class="pick-dot"></div>
      <div class="pick-name">${esc(r.artikel_naam)}${r.serienummer ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">SN: ${esc(r.serienummer)}</div>` : ''}</div>
      <div class="pick-qty">${r.eenheid === 'SN' ? esc(r.serienummer||'—') : `${r.meegenomen} ${esc(r.eenheid)}`}</div>
      <button class="pick-del" onclick="deleteRegel('${r.id}')">✕</button>
    </div>`).join('');
}

window.deleteRegel = async function(regelId) {
  if (!activePicklijstId) return;
  try {
    await API.deleteRegel(activePicklijstId, regelId);
    await renderPicklist();
  } catch (err) { showToast(err.message, true); }
};

document.getElementById('send-btn')?.addEventListener('click', () => {
  if (!activePicklijstId) return;
  openVerstuurModal();
});

function openVerstuurModal() {
  const klant = document.getElementById('klant-input').value.trim();
  document.getElementById('verstuur-modal-sub').textContent =
    document.getElementById('pick-count')?.textContent || '';
  document.getElementById('verstuur-klant').value = klant;
  document.getElementById('verstuur-notities').value = '';
  const dl = document.getElementById('verstuur-klant-datalist');
  if (dl) dl.innerHTML = document.getElementById('klant-datalist')?.innerHTML || '';
  document.getElementById('verstuur-modal').classList.add('open');
  setTimeout(() => {
    if (!klant) document.getElementById('verstuur-klant').focus();
    else document.getElementById('verstuur-notities').focus();
  }, 320);
}

document.getElementById('verstuur-modal-confirm')?.addEventListener('click', async () => {
  const klant = document.getElementById('verstuur-klant').value.trim();
  if (!klant) {
    showToast('Vul eerst een klant in', true);
    document.getElementById('verstuur-klant').focus();
    return;
  }
  const notities = document.getElementById('verstuur-notities').value.trim() || null;
  const btn = document.getElementById('verstuur-modal-confirm');
  btn.disabled = true;
  try {
    await API.updatePicklijst(activePicklijstId, { klant, notities });
    document.getElementById('klant-input').value = klant;
    await API.verstuurPicklijst(activePicklijstId);
    document.getElementById('verstuur-modal').classList.remove('open');
    activePicklijstId = null;
    await renderPicklist();
    showToast('✓ Picklijst verstuurd');
  } catch (err) {
    showToast(err.message, true);
    btn.disabled = false;
  }
});

document.getElementById('verstuur-modal-cancel')?.addEventListener('click', () =>
  document.getElementById('verstuur-modal').classList.remove('open'));
document.getElementById('verstuur-modal-close')?.addEventListener('click', () =>
  document.getElementById('verstuur-modal').classList.remove('open'));
document.getElementById('verstuur-modal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

// ── MIJN LIJSTEN ─────────────────────────────────────────────────────────────
async function loadMyLists() {
  const c = document.getElementById('my-lists');
  c.innerHTML = '<div class="list-empty">Laden…</div>';
  try {
    const lijsten = await API.getPicklijsten({ limit: 30 });
    if (!lijsten.length) {
      c.innerHTML = '<div class="list-empty" style="padding:40px">Geen picklijsten gevonden</div>';
      return;
    }
    c.innerHTML = lijsten.map(l => listCardHtml(l)).join('');
  } catch (err) { showToast(err.message, true); }
}

function listCardHtml(l) {
  const sm = {
    actief:           { cls:'b-blue',   txt:'Actief',               ico:'actief'  },
    wacht_retour:     { cls:'b-orange', txt:'Wacht op retour',      ico:'waiting' },
    wacht_verwerking: { cls:'b-purple', txt:'Wacht op verwerking',  ico:'waiting' },
    afgerond:         { cls:'b-green',  txt:'Afgerond',             ico:'done'    },
  };
  const s = sm[l.status] || sm.actief;
  const ico = { actief:'📋', waiting:'⏳', done:'✅' };
  const click = l.status === 'wacht_retour' ? `openRetour('${l.id}')` :
                l.status === 'actief'       ? `resumePicklijst('${l.id}')` : '';
  return `<div class="list-card glass" onclick="${click}" style="${click?'':'cursor:default'}">
    <div class="list-icon ${s.ico}">${ico[s.ico]}</div>
    <div class="list-info">
      <div class="list-id">${esc(l.id)}</div>
      <div class="list-name">${l.klant ? esc(l.klant) : formatDatum(l.verstuurd_op || l.aangemaakt)}</div>
      <div class="list-meta">${l.klant ? formatDatum(l.verstuurd_op || l.aangemaakt) + ' · ' : ''}${l.aantal_regels} artikel${l.aantal_regels !== 1 ? 'en' : ''} · ${l.totaal_meegenomen} stuks</div>
      ${listProgressHtml(l.status)}
    </div>
    <span class="badge ${s.cls}"><span class="badge-dot"></span>${s.txt}</span>
    ${l.status==='wacht_retour' ? '<span style="color:var(--text3);font-size:16px">›</span>' : ''}
    ${l.status==='actief' ? `<button class="pick-del" title="Verwijderen" onclick="event.stopPropagation();verwijderEigenLijst('${l.id}')">✕</button>` : ''}
  </div>`;
}

window.verwijderEigenLijst = async function(id) {
  if (!await confirmDialog('Deze lijst wordt geannuleerd.', { title: 'Lijst annuleren?', okLabel: 'Annuleer lijst' })) return;
  try {
    await API.annuleerPicklijst(id);
    loadMyLists();
    showToast('✓ Lijst geannuleerd');
  } catch (err) { showToast(err.message, true); }
};

window.resumePicklijst = async function(id) {
  activePicklijstId = id;
  workerTab('scan');
  try {
    const lijst = await API.getPicklijst(id);
    if (lijst.klant) document.getElementById('klant-input').value = lijst.klant;
  } catch {}
  await renderPicklist();
};

// ── RETOUR ────────────────────────────────────────────────────────────────────
window.openRetour = async function(id) {
  retourListId = id;
  const lijst = await API.getPicklijst(id);
  document.getElementById('retour-title').textContent = lijst.klant ? `Retour — ${lijst.klant}` : 'Retour verwerken';
  document.getElementById('retour-sub').textContent = formatDatum(lijst.verstuurd_op) + ' · ' + lijst.gebruiker_naam;

  document.getElementById('retour-body').innerHTML = lijst.regels.map((r,i) => {
    const isSN = r.eenheid === 'SN';
    if (isSN) {
      return `<div class="retour-item">
        <div class="retour-name">${esc(r.artikel_naam)}</div>
        <div class="retour-row"><div class="r-label">Serienummer</div><div class="r-mono" style="font-weight:700">${esc(r.serienummer||'—')}</div></div>
        <div class="retour-row">
          <div class="r-label">Teruggekomen</div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="ri_${i}" data-regel="${r.id}" data-sn="1" checked
              style="width:18px;height:18px;cursor:pointer" onchange="calcVSN(${i})">
            <span id="rv_${i}" style="font-size:12px;color:var(--green);font-weight:600">Ja — geen verbruik</span>
          </label>
        </div>
      </div>`;
    }
    return `<div class="retour-item">
      <div class="retour-name">${esc(r.artikel_naam)}</div>
      <div class="retour-row"><div class="r-label">Meegenomen</div><div class="r-mono">${r.meegenomen} ${esc(r.eenheid)}</div></div>
      <div class="retour-row">
        <div class="r-label">Teruggekomen</div>
        <input class="retour-input" id="ri_${i}" data-regel="${r.id}" data-eenheid="${esc(r.eenheid)}" type="number" value="${r.meegenomen}" min="0" max="${r.meegenomen}"
          oninput="calcV(${i},${r.meegenomen},'${esc(r.eenheid)}')">
        <span style="font-size:12px;color:var(--text3)">${esc(r.eenheid)}</span>
      </div>
      <div class="retour-row"><div class="r-label">Verbruik</div><div id="rv_${i}" class="v-zero">0 ${esc(r.eenheid)}</div></div>
    </div>`;
  }).join('');

  lijst.regels.forEach((r,i) => { if (r.eenheid !== 'SN') calcV(i, r.meegenomen, r.eenheid); });
  document.getElementById('retour-modal').classList.add('open');
};

window.calcV = function(i, max, e) {
  const inp = document.getElementById('ri_' + i);
  const out = document.getElementById('rv_' + i);
  if (!inp || !out) return;
  const v = max - Math.min(parseInt(inp.value)||0, max);
  out.textContent = v + ' ' + e;
  out.className = v > 0 ? 'v-pos' : 'v-zero';
};

window.calcVSN = function(i) {
  const inp = document.getElementById('ri_' + i);
  const out = document.getElementById('rv_' + i);
  if (!inp || !out) return;
  out.textContent = inp.checked ? 'Ja — geen verbruik' : 'Nee — verbruikt';
  out.style.color = inp.checked ? 'var(--green)' : 'var(--orange)';
};

window.allesTerug = function() {
  document.querySelectorAll('#retour-body [data-regel]').forEach((inp, i) => {
    if (inp.dataset.sn) {
      inp.checked = true;
      calcVSN(i);
    } else {
      inp.value = inp.max;
      calcV(i, parseInt(inp.max), inp.dataset.eenheid || '');
    }
  });
};

document.getElementById('retour-confirm')?.addEventListener('click', async () => {
  const allInputs = document.querySelectorAll('#retour-body [data-regel]');
  const regels = Array.from(allInputs).map(inp => {
    if (inp.dataset.sn) {
      return { id: inp.dataset.regel, teruggekomen: inp.checked ? 1 : 0 };
    }
    return { id: inp.dataset.regel, teruggekomen: Math.max(0, parseInt(inp.value)||0) };
  });

  const btn = document.getElementById('retour-confirm');
  btn.disabled = true;
  try {
    await API.verwerkRetour(retourListId, regels);
    document.getElementById('retour-modal').classList.remove('open');
    loadMyLists();
    showToast('✓ Retour verwerkt');
  } catch (err) {
    showToast(err.message, true);
    btn.disabled = false;
  }
});

document.getElementById('retour-cancel')?.addEventListener('click', () => {
  document.getElementById('retour-modal').classList.remove('open');
});

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN
// ══════════════════════════════════════════════════════════════════════════════
function initAdmin() {
  adminTab('lists');
  loadAdminStats();
}

window.adminTab = function(tab) {
  ['lists','verbruik','artikelen','klanten','gebruikers'].forEach(t => {
    const el = document.getElementById('atab-' + t);
    if (!el) return;
    el.style.display = t === tab ? '' : 'none';
    if (t === tab) tabEnter(el);
  });
  document.querySelectorAll('.aseg').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  if (tab === 'lists')      loadAdminLists();
  if (tab === 'verbruik')   loadVerbruik();
  if (tab === 'artikelen')  loadAdminArtikelen();
  if (tab === 'klanten')    loadKlanten();
  if (tab === 'gebruikers') loadGebruikers();
};

async function loadAdminStats() {
  try {
    const s = await API.getStats();
    animateCount(document.getElementById('stat-actief'),           s.actief);
    animateCount(document.getElementById('stat-wacht'),            s.wacht_retour);
    animateCount(document.getElementById('stat-vandaag'),          s.afgerond_vandaag);
    animateCount(document.getElementById('stat-wacht-verwerking'), s.wacht_verwerking);
  } catch {}
}

async function loadAdminLists() {
  const body = document.getElementById('admin-tbody');
  body.innerHTML = skeletonRows(5, 7);
  try {
    const params = {};
    if (adminFilter) params.status = adminFilter;
    _listsCache = await API.getPicklijsten({ ...params, limit: 100 });
    _renderAdminLists();
  } catch (err) { showToast(err.message, true); }
}

function _renderAdminLists() {
  const body = document.getElementById('admin-tbody');
  const q = _searchQ.lists;
  const data = q
    ? _listsCache.filter(l =>
        (l.gebruiker_naam||'').toLowerCase().includes(q) ||
        (l.klant||'').toLowerCase().includes(q) ||
        (l.id||'').toLowerCase().includes(q))
    : _listsCache;

  if (!data.length) {
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">Geen lijsten gevonden</td></tr>';
    return;
  }
  body.innerHTML = data.map(l => {
    const s = statusMeta(l.status);
    return `<tr onclick="toggleExpand('${l.id}')">
      <td class="td-id" data-label="">${esc(l.id)}</td>
      <td class="td-bold" data-label="Medewerker">${esc(l.gebruiker_naam)}</td>
      <td data-label="Klant">${l.klant ? `<span style="font-weight:700">${esc(l.klant)}</span>` : '<span style="color:var(--text3)">—</span>'}</td>
      <td data-label="Datum" style="font-size:12px;color:var(--text2)">${formatDatum(l.aangemaakt)}</td>
      <td data-label="Artikelen" style="font-size:12px;color:var(--text2)">${l.aantal_regels} art.</td>
      <td data-label="Status"><span class="badge ${s.cls}"><span class="badge-dot"></span>${s.txt}</span></td>
      <td style="display:flex;gap:8px;align-items:center">
        ${l.status==='wacht_retour'?`<span class="retour-action" onclick="event.stopPropagation();openRetour('${l.id}')">Verwerk ›</span>`:''}
        ${l.status==='wacht_verwerking'?`<span class="retour-action" style="color:var(--purple)" onclick="event.stopPropagation();openAfronden('${l.id}')">Rond af ›</span>`:''}
        ${['actief','wacht_retour'].includes(l.status)?`<span class="retour-action" style="color:var(--orange)" onclick="event.stopPropagation();stuurHerinneringVoorLijst('${l.id}')">Herinnering ›</span>`:''}
        <button class="pick-del" title="Verwijderen" onclick="event.stopPropagation();verwijderPicklijst('${l.id}')">✕</button>
      </td>
    </tr>
    <tr class="expand-row" id="exp-${l.id}">
      <td colspan="7"><div class="expand-inner">
        <div class="expand-lbl">Regels</div>
        <div class="chips" id="chips-${l.id}"><em style="font-size:12px;color:var(--text3)">Laden…</em></div>
      </div></td>
    </tr>`;
  }).join('');
}

window.toggleExpand = async function(id) {
  const row = document.getElementById('exp-' + id);
  const wasOpen = row.classList.contains('open');
  document.querySelectorAll('.expand-row.open').forEach(r => r.classList.remove('open'));
  if (!wasOpen) {
    row.classList.add('open');
    // Lazy load regels
    const chipsEl = document.getElementById('chips-' + id);
    if (chipsEl.querySelector('em')) {
      try {
        const lijst = await API.getPicklijst(id);
        if (lijst.projectnummer) {
          chipsEl.insertAdjacentHTML('beforebegin',
            `<div style="font-size:11px;font-weight:700;color:var(--purple);margin-bottom:6px">Projectnummer: ${esc(lijst.projectnummer)}</div>`);
        }
        chipsEl.innerHTML = lijst.regels.map(r => {
          const isSN = r.eenheid === 'SN';
          const detail = isSN
            ? `<span style="color:var(--text3);font-size:11px">SN: ${esc(r.serienummer||'—')}</span>`
            : `<span>↑ ${r.meegenomen}</span>${r.teruggekomen !== null
                ? `<span>↓ ${r.teruggekomen}</span><span class="chip-v">∑ ${r.verbruik}</span>`
                : '<span style="color:var(--text3)">—</span>'}`;
          return `<div class="chip">
            <div class="chip-name">${esc(r.artikel_naam)}</div>
            <div class="chip-nums">${detail}</div>
          </div>`;
        }).join('');
      } catch {}
    }
  }
};

window.verwijderPicklijst = async function(id) {
  if (!await confirmDialog('Picklijst permanent verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;
  try {
    await API.deletePicklijst(id);
    loadAdminLists();
    loadAdminStats();
    showToast('✓ Picklijst verwijderd');
  } catch (err) { showToast(err.message, true); }
};

window.stuurHerinneringVoorLijst = async function(id) {
  try {
    await API.stuurHerinnering(id);
    showToast('Herinnering verstuurd');
  } catch (err) { showToast(err.message, true); }
};

window.filterAdmin = function(val) {
  adminFilter = val;
  loadAdminLists();
};

async function loadVerbruik() {
  try {
    const [arts, meds] = await Promise.all([API.getVerbruik(), API.getVerbruikPerMed()]);
    const sortedArts = arts.filter(a => a.totaal_verbruik > 0).sort((a,b) => b.totaal_verbruik - a.totaal_verbruik);
    const maxA = sortedArts[0]?.totaal_verbruik || 1;
    document.getElementById('chart-art').innerHTML = sortedArts.slice(0,8).map(a => `
      <div class="bar-row">
        <div class="bar-label">${esc(a.naam)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round(a.totaal_verbruik/maxA*100)}%;background:linear-gradient(90deg,#3a7bd5,#8b5cf6)"></div></div>
        <div class="bar-val">${a.totaal_verbruik}</div>
      </div>`).join('') || '<div style="color:var(--text3);font-size:13px">Nog geen verbruiksdata</div>';

    const maxM = Math.max(...meds.map(m=>m.totaal_verbruik), 1);
    document.getElementById('chart-med').innerHTML = meds.map(m => `
      <div class="bar-row">
        <div class="bar-label">${esc(m.naam.split(' ')[0])}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round(m.totaal_verbruik/maxM*100)}%;background:linear-gradient(90deg,#25a06a,#1ab090)"></div></div>
        <div class="bar-val">${m.totaal_verbruik}</div>
      </div>`).join('') || '<div style="color:var(--text3);font-size:13px">Nog geen data</div>';
  } catch (err) { showToast(err.message, true); }
}

// ── ADMIN ARTIKELEN ───────────────────────────────────────────────────────────
const artIcons = {'Gereedschap':'🔩','Elektra':'🔌','Verbruiksartikelen':'📄','PBM':'⛑️','Bevestigingsmateriaal':'🔧'};
const artBg = ['#f5e8d5','#d5e8f5','#f5f5d5','#d5f5e8','#f5d5e8','#e8d5f5','#d5f0f5'];
let _adminArtMap = {};

async function loadAdminArtikelen() {
  const body = document.getElementById('art-tbody');
  body.innerHTML = skeletonRows(6, 5);
  try {
    const arts = await API.getArtikelen();
    _adminArtMap = {};
    arts.forEach(a => { _adminArtMap[a.id] = a; });
    _artCache = arts;
    _renderArtikelen();
  } catch (err) { showToast(err.message, true); }
}

function _renderArtikelen() {
  const body = document.getElementById('art-tbody');
  const q = _searchQ.artikelen;
  const data = q
    ? _artCache.filter(a =>
        (a.naam||'').toLowerCase().includes(q) ||
        (a.qr_code||'').toLowerCase().includes(q) ||
        (a.categorie||'').toLowerCase().includes(q))
    : _artCache;

  if (!data.length) {
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text3)">Geen artikelen gevonden</td></tr>';
    return;
  }
  body.innerHTML = data.map((a,i) => `
    <tr onclick="openArtikelModal('${a.id}')">
      <td data-label="Naam"><div class="art-cell">
        <div class="art-thumb" style="background:${artBg[i%artBg.length]}">${artIcons[a.categorie] || '📦'}</div>
        <span class="td-bold">${esc(a.naam)}</span>
      </div></td>
      <td data-label="QR" class="td-id">${esc(a.qr_code)}</td>
      <td data-label="Eenheid" style="color:var(--text2)">${esc(a.eenheid)}</td>
      <td data-label="Categorie" style="color:var(--text2)">${esc(a.categorie||'—')}</td>
      <td data-label=""><button class="btn-dymo" title="DYMO label exporteren" onclick="event.stopPropagation();dymoExport('${a.id}')">DYMO</button></td>
    </tr>`).join('');
}

function _dymoCsvRows(artikelen) {
  const header = ['QR_Code', 'Regel1', 'Regel2', 'Regel3', 'Regel4'];
  const rows = artikelen.map(a => {
    const parts = a.naam.split(' - ');
    return [a.qr_code, parts[0]||'', parts[1]||'', parts[2]||'', parts.slice(3).join(' - ')||''];
  });
  return [header, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');
}

function _downloadCsvBlob(csv, filename) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = url;
  el.download = filename;
  document.body.appendChild(el);
  el.click();
  document.body.removeChild(el);
  URL.revokeObjectURL(url);
}

window.dymoExport = function(id) {
  const a = _adminArtMap[id];
  if (!a) return;
  _downloadCsvBlob(_dymoCsvRows([a]), `${a.qr_code}_dymo.csv`);
};

window.dymoExportAll = function() {
  const arts = Object.values(_adminArtMap);
  if (!arts.length) return;
  _downloadCsvBlob(_dymoCsvRows(arts), `alle-artikelen-dymo.csv`);
};

window.verwijderArtikelVanuitModal = async function() {
  const id = document.getElementById('art-id').value;
  const naam = document.getElementById('art-naam').value;
  if (!await confirmDialog(`Artikel "${naam}" permanent verwijderen?`)) return;
  try {
    await API.deleteArtikel(id);
    document.getElementById('art-modal').classList.remove('open');
    loadAdminArtikelen();
    showToast('✓ Artikel verwijderd');
  } catch (err) { showToast(err.message, true); }
};

window.openArtikelModal = async function(id) {
  const [art, cats] = await Promise.all([
    id === 'new' ? Promise.resolve({}) : API.getArtikel(id),
    API.getCategorieen().catch(() => []),
  ]);
  const isNew = id === 'new';
  document.getElementById('cat-datalist').innerHTML =
    cats.map(c => `<option value="${esc(c)}">`).join('');
  document.getElementById('art-modal-title').textContent = isNew ? 'Nieuw artikel' : art.naam;
  document.getElementById('art-id').value = isNew ? '' : id;
  document.getElementById('art-qr').value = art.qr_code || '';
  document.getElementById('art-qr').disabled = !!art.id;
  document.getElementById('art-naam').value = art.naam || '';
  document.getElementById('art-omschrijving').value = art.omschrijving || '';
  document.getElementById('art-eenheid').value = art.eenheid || 'stuk';
  document.getElementById('art-categorie').value = art.categorie || '';
  document.getElementById('art-delete-wrap').style.display = isNew ? 'none' : '';
  document.getElementById('art-modal').classList.add('open');
};

document.getElementById('art-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('art-id').value;
  const body = {
    naam: document.getElementById('art-naam').value,
    omschrijving: document.getElementById('art-omschrijving').value,
    eenheid: document.getElementById('art-eenheid').value,
    categorie: document.getElementById('art-categorie').value,
  };
  const qrVal = document.getElementById('art-qr').value.trim();
  if (!id && qrVal) body.qr_code = qrVal;
  try {
    if (id) await API.updateArtikel(id, body);
    else    await API.createArtikel(body);
    document.getElementById('art-modal').classList.remove('open');
    loadAdminArtikelen();
    showToast('✓ Artikel opgeslagen');
  } catch (err) { showToast(err.message, true); }
});

document.getElementById('art-modal-close')?.addEventListener('click', () =>
  document.getElementById('art-modal').classList.remove('open'));

// ── ADMIN KLANTEN ─────────────────────────────────────────────────────────────

async function loadKlanten() {
  const body = document.getElementById('klant-tbody');
  body.innerHTML = skeletonRows(4, 3);
  try {
    _klantenCache = await API.getKlanten();
    _renderKlanten();
  } catch (err) { showToast(err.message, true); }
}

function _renderKlanten() {
  const body = document.getElementById('klant-tbody');
  const q = _searchQ.klanten;
  const data = q
    ? _klantenCache.filter(k => (k.naam||'').toLowerCase().includes(q) || (k.notities||'').toLowerCase().includes(q))
    : _klantenCache;

  if (!data.length) {
    body.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--text3)">Geen klanten gevonden.</td></tr>';
    return;
  }
  body.innerHTML = data.map(k => `
    <tr>
      <td class="td-bold" data-label="Naam">${esc(k.naam)}</td>
      <td data-label="Notities" style="color:var(--text2);font-size:12px">${k.notities ? esc(k.notities) : '<span style="color:var(--text3)">—</span>'}</td>
      <td style="display:flex;gap:8px;align-items:center">
        <button class="retour-action" style="background:none;border:none;padding:0;margin-left:auto" onclick="openKlantModal('${k.id}')">Wijzig ›</button>
      </td>
    </tr>`).join('');
}

window.openKlantModal = async function(id) {
  const isNew = id === 'new';
  let k = {};
  if (!isNew) {
    const klanten = await API.getKlanten();
    k = klanten.find(x => x.id === id) || {};
  }
  document.getElementById('klant-modal-title').textContent = isNew ? 'Nieuwe klant' : 'Klant wijzigen';
  document.getElementById('klant-id').value = isNew ? '' : id;
  document.getElementById('klant-naam').value = k.naam || '';
  document.getElementById('klant-notities').value = k.notities || '';
  document.getElementById('klant-delete-wrap').style.display = isNew ? 'none' : '';
  document.getElementById('klant-modal').classList.add('open');
};

window.verwijderKlantVanuitModal = async function() {
  const id = document.getElementById('klant-id').value;
  const naam = document.getElementById('klant-naam').value;
  if (!await confirmDialog(`Klant "${naam}" verwijderen?`)) return;
  try {
    await API.deleteKlant(id);
    document.getElementById('klant-modal').classList.remove('open');
    loadKlanten();
    showToast('✓ Klant verwijderd');
  } catch (err) { showToast(err.message, true); }
};

document.getElementById('klant-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('klant-id').value;
  const body = {
    naam: document.getElementById('klant-naam').value.trim(),
    notities: document.getElementById('klant-notities').value.trim() || null,
  };
  try {
    if (id) await API.updateKlant(id, body);
    else    await API.createKlant(body);
    document.getElementById('klant-modal').classList.remove('open');
    loadKlanten();
    vulKlantenDatalist();
    showToast('✓ Klant opgeslagen');
  } catch (err) { showToast(err.message, true); }
});

document.getElementById('klant-modal-close')?.addEventListener('click', () =>
  document.getElementById('klant-modal').classList.remove('open'));

let _klanten = [];

async function vulKlantenDatalist() {
  try {
    _klanten = await API.getKlanten();
    const dl = document.getElementById('klant-datalist');
    if (dl) dl.innerHTML = _klanten.map(k => `<option value="${esc(k.naam)}">`).join('');
  } catch {}
}

function matchKlantNaam(invoer) {
  if (!invoer || !_klanten.length) return invoer;
  const lower = invoer.toLowerCase();
  const exact = _klanten.find(k => k.naam.toLowerCase() === lower);
  if (exact) return exact.naam;
  const deels = _klanten.filter(k => k.naam.toLowerCase().includes(lower));
  return deels.length === 1 ? deels[0].naam : invoer;
}

// ── ADMIN GEBRUIKERS ──────────────────────────────────────────────────────────
let toonInactieveGebruikers = false;

async function loadGebruikers() {
  const body = document.getElementById('geb-tbody');
  body.innerHTML = skeletonRows(4, 4);
  try {
    _gebCache = await API.getGebruikers();
    const toggleBtn = document.getElementById('geb-toon-inactief-btn');
    if (toggleBtn) toggleBtn.textContent = toonInactieveGebruikers ? 'Verberg inactieven' : 'Toon inactieven';
    _renderGebruikers();
  } catch (err) { showToast(err.message, true); }
}

function _renderGebruikers() {
  const body = document.getElementById('geb-tbody');
  const q = _searchQ.gebruikers;
  let data = toonInactieveGebruikers ? _gebCache : _gebCache.filter(u => u.actief);
  if (q) data = data.filter(u =>
    (u.naam||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q));

  if (!data.length) {
    body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text3)">Geen gebruikers gevonden.</td></tr>';
    return;
  }
  body.innerHTML = data.map(u => `
    <tr>
      <td class="td-bold" data-label="Naam">${esc(u.naam)}</td>
      <td data-label="E-mail" style="color:var(--text2);font-size:12px">${esc(u.email)}</td>
      <td data-label="Rol"><span class="badge ${u.rol==='admin'?'b-purple':'b-blue'}" style="${u.rol==='admin'?'background:rgba(139,92,246,.12);color:#8b5cf6;':''}">${u.rol}</span></td>
      <td data-label="Status" style="display:flex;gap:8px;align-items:center">
        <span class="badge ${u.actief?'b-green':'b-orange'}">${u.actief?'Actief':'Inactief'}</span>
        <button class="retour-action" style="background:none;border:none;padding:0;margin-left:auto" onclick="openGebruikerModal('${u.id}')">Wijzig ›</button>
      </td>
    </tr>`).join('');
}

window.toggleInactieveGebruikers = function() {
  toonInactieveGebruikers = !toonInactieveGebruikers;
  const toggleBtn = document.getElementById('geb-toon-inactief-btn');
  if (toggleBtn) toggleBtn.textContent = toonInactieveGebruikers ? 'Verberg inactieven' : 'Toon inactieven';
  _renderGebruikers();
};

window.openGebruikerModal = async function(id) {
  const isNew = id === 'new';
  let u = {};
  if (!isNew) {
    const users = await API.getGebruikers();
    u = users.find(x => x.id === id) || {};
  }
  document.getElementById('geb-modal-title').textContent = isNew ? 'Nieuwe gebruiker' : 'Gebruiker wijzigen';
  document.getElementById('geb-id').value = isNew ? '' : id;
  document.getElementById('geb-naam').value = u.naam || '';
  document.getElementById('geb-email').value = u.email || '';
  document.getElementById('geb-wachtwoord').value = '';
  document.getElementById('geb-wachtwoord').required = isNew;
  document.getElementById('geb-pw-hint').style.display = isNew ? 'none' : '';
  document.getElementById('geb-rol').value = u.rol || 'medewerker';
  document.getElementById('geb-actief').value = u.actief !== undefined ? String(u.actief) : '1';
  document.getElementById('geb-actief-wrap').style.display = isNew ? 'none' : '';
  document.getElementById('geb-auth-methode').value = u.auth_methode || 'beide';
  document.getElementById('geb-delete-wrap').style.display = isNew ? 'none' : '';
  document.getElementById('geb-modal').classList.add('open');
};

window.verwijderGebruikerVanuitModal = async function() {
  const id = document.getElementById('geb-id').value;
  const naam = document.getElementById('geb-naam').value;
  if (!await confirmDialog(`Gebruiker "${naam}" definitief verwijderen?`)) return;
  try {
    await API.deleteGebruiker(id);
    document.getElementById('geb-modal').classList.remove('open');
    loadGebruikers();
    showToast('✓ Gebruiker verwijderd');
  } catch (err) { showToast(err.message, true); }
};

document.getElementById('geb-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('geb-id').value;
  const body = {
    naam: document.getElementById('geb-naam').value,
    email: document.getElementById('geb-email').value,
    rol: document.getElementById('geb-rol').value,
    auth_methode: document.getElementById('geb-auth-methode').value,
  };
  const ww = document.getElementById('geb-wachtwoord').value;
  if (ww) body.wachtwoord = ww;
  if (id) body.actief = document.getElementById('geb-actief').value === '1';
  try {
    if (id) await API.updateGebruiker(id, body);
    else    await API.createGebruiker(body);
    document.getElementById('geb-modal').classList.remove('open');
    loadGebruikers();
    showToast('✓ Gebruiker opgeslagen');
  } catch (err) { showToast(err.message, true); }
});

document.getElementById('geb-modal-close')?.addEventListener('click', () =>
  document.getElementById('geb-modal').classList.remove('open'));

// ── AFRONDEN (admin) ──────────────────────────────────────────────────────────
let afrondListId = null;

window.openAfronden = async function(id) {
  afrondListId = id;
  const lijst = await API.getPicklijst(id);
  document.getElementById('afrond-sub').textContent =
    (lijst.klant ? lijst.klant + ' · ' : '') + formatDatum(lijst.verstuurd_op) + ' · ' + lijst.gebruiker_naam;
  document.getElementById('afrond-info').innerHTML = lijst.regels.map(r =>
    `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(0,0,0,.05)">
      <span style="font-weight:600">${esc(r.artikel_naam)}</span>
      <span>${r.eenheid==='SN' ? `SN: ${esc(r.serienummer||'—')}` : `↑${r.meegenomen} ↓${r.teruggekomen??'?'} ∑${r.verbruik??'?'} ${esc(r.eenheid)}`}</span>
    </div>`
  ).join('');
  document.getElementById('afrond-projectnummer').value = lijst.projectnummer || '';
  document.getElementById('afrond-modal').classList.add('open');
};

document.getElementById('afrond-confirm')?.addEventListener('click', async () => {
  const btn = document.getElementById('afrond-confirm');
  const projectnummer = document.getElementById('afrond-projectnummer').value.trim();
  btn.disabled = true;
  try {
    await API.afrondPicklijst(afrondListId, projectnummer || null);
    document.getElementById('afrond-modal').classList.remove('open');
    loadAdminLists();
    loadAdminStats();
    showToast('✓ Lijst afgerond');
  } catch (err) {
    showToast(err.message, true);
    btn.disabled = false;
  }
});

document.getElementById('afrond-cancel')?.addEventListener('click', () =>
  document.getElementById('afrond-modal').classList.remove('open'));
document.getElementById('afrond-modal-close')?.addEventListener('click', () =>
  document.getElementById('afrond-modal').classList.remove('open'));

// ── IMPORT / EXPORT ───────────────────────────────────────────────────────────
async function downloadCsv(url, filename) {
  try {
    const res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + API.auth.token }
    });
    if (!res.ok) throw new Error('Export mislukt');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (err) { showToast(err.message, true); }
}

window.exportArtikelen = () => downloadCsv(
  API.exportArtikelen(),
  `artikelen-${new Date().toISOString().slice(0,10)}.csv`
);

window.importArtikelen = async function(input) {
  const file = input.files[0];
  if (!file) return;
  const text = await file.text();
  input.value = '';
  try {
    const result = await API.importArtikelen(text);
    loadAdminArtikelen();
    showToast(`✓ Import klaar: ${result.aangemaakt} nieuw, ${result.bijgewerkt} bijgewerkt${result.fouten ? ', ' + result.fouten + ' fout(en)' : ''}`);
  } catch (err) { showToast('Import mislukt: ' + err.message, true); }
};

window.exportKlanten = () => downloadCsv(
  API.exportKlanten(),
  `klanten-${new Date().toISOString().slice(0,10)}.csv`
);

window.importKlanten = async function(input) {
  const file = input.files[0];
  if (!file) return;
  const text = await file.text();
  input.value = '';
  try {
    const result = await API.importKlanten(text);
    loadKlanten();
    vulKlantenDatalist();
    showToast(`✓ Import klaar: ${result.aangemaakt} nieuw, ${result.bijgewerkt} bijgewerkt${result.fouten ? ', ' + result.fouten + ' fout(en)' : ''}`);
  } catch (err) { showToast('Import mislukt: ' + err.message, true); }
};

window.exportPicklijsten = function() {
  const params = {};
  if (adminFilter) params.status = adminFilter;
  downloadCsv(
    API.exportPicklijsten(params),
    `picklijsten-${new Date().toISOString().slice(0,10)}.csv`
  );
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
function animateCount(el, target, duration = 650) {
  if (!el) return;
  if (target === 0) { el.textContent = 0; return; }
  const start = performance.now();
  (function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(eased * target);
    if (p < 1) requestAnimationFrame(tick);
  })(start);
}

function listProgressHtml(status) {
  if (status === 'geannuleerd') return '';
  const steps = ['actief', 'wacht_retour', 'wacht_verwerking', 'afgerond'];
  const cur = steps.indexOf(status);
  return '<div class="list-progress">' +
    steps.map((_, i) =>
      (i > 0 ? `<div class="lp-line ${i <= cur ? 'done' : 'pending'}"></div>` : '') +
      `<div class="lp-step ${i < cur ? 'done' : i === cur ? 'current' : 'pending'}"></div>`
    ).join('') +
  '</div>';
}

function tabEnter(el) {
  if (!el) return;
  el.classList.remove('tab-enter');
  void el.offsetWidth;
  el.classList.add('tab-enter');
}

function skeletonRows(rows, cols) {
  const widths = [75, 55, 45, 35, 25];
  return Array(rows).fill(0).map(() =>
    `<tr class="skel-row">${Array(cols).fill(0).map((_,i) =>
      `<td><div class="skel" style="width:${widths[i % widths.length]}%"></div></td>`
    ).join('')}</tr>`
  ).join('');
}

function confirmDialog(msg, { title = 'Weet je het zeker?', okLabel = 'Verwijderen' } = {}) {
  return new Promise(resolve => {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent   = msg;
    document.getElementById('confirm-ok').textContent    = okLabel;
    const modal = document.getElementById('confirm-modal');
    modal.classList.add('open');
    let settled = false;
    function finish(val) {
      if (settled) return; settled = true;
      modal.classList.remove('open');
      resolve(val);
    }
    document.getElementById('confirm-ok').addEventListener('click', () => finish(true),  { once: true });
    document.getElementById('confirm-cancel').addEventListener('click', () => finish(false), { once: true });
    modal.addEventListener('click', e => { if (e.target === modal) finish(false); }, { once: true });
  });
}

function statusMeta(status) {
  return {
    actief:            { cls:'b-blue',   txt:'Actief'               },
    wacht_retour:      { cls:'b-orange', txt:'Wacht op retour'      },
    wacht_verwerking:  { cls:'b-purple', txt:'Wacht op verwerking'  },
    afgerond:          { cls:'b-green',  txt:'Afgerond'             },
  }[status] || { cls:'b-blue', txt:status };
}

function formatDatum(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('nl', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let toastTimer;
function showToast(msg, error = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (error ? ' error' : '');
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}
