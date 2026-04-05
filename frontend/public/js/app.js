// frontend/public/js/app.js
// Hoofd applicatielogica. Importeert api.js en scanner.js.

import * as API from './api.js';
import { Scanner } from './scanner.js';

// ── STATE ─────────────────────────────────────────────────────────────────────
let activePicklijstId = null;   // huidige werklijst van medewerker
let scanner = null;
let retourListId = null;
let adminFilter = '';

// ── INIT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  registerSW();
  if (API.auth.isLoggedIn()) {
    showApp();
  } else {
    showScreen('login');
  }
  window.addEventListener('auth:logout', () => showScreen('login'));
});

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

// ── SCHERMEN ─────────────────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.add('active');
  document.getElementById('app-nav').style.display = name === 'login' ? 'none' : '';
}

function showApp() {
  // Gebruikersnaam in nav
  const u = API.auth.user;
  document.getElementById('nav-naam').textContent = u?.naam?.split(' ')[0] || 'Gebruiker';
  document.getElementById('nav-avatar').textContent = (u?.naam || 'G').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('nav-admin-tab').style.display = API.auth.isAdmin ? '' : 'none';

  if (API.auth.isAdmin) {
    showScreen('admin');
    initAdmin();
  } else {
    showScreen('main');
    initWorker();
  }
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
  if (active !== 'main') stopScanner();
};

window.doLogout = function() {
  API.auth.clear();
  stopScanner();
  showScreen('login');
};

window.initWorker = initWorker;
window.initAdmin  = initAdmin;

// ══════════════════════════════════════════════════════════════════════════════
// MEDEWERKER
// ══════════════════════════════════════════════════════════════════════════════
function initWorker() {
  workerTab('scan');
}

window.workerTab = function(tab) {
  document.getElementById('wtab-scan').style.display   = tab === 'scan'  ? '' : 'none';
  document.getElementById('wtab-lists').style.display  = tab === 'lists' ? '' : 'none';
  document.querySelectorAll('.seg-btn').forEach((b,i) =>
    b.classList.toggle('active', (i===0 && tab==='scan') || (i===1 && tab==='lists'))
  );
  if (tab === 'lists') { stopScanner(); loadMyLists(); }
  if (tab === 'scan')  { /* scanner start wanneer gebruiker klikt */ }
};

// ── SCANNER ──────────────────────────────────────────────────────────────────
document.getElementById('scan-start-btn')?.addEventListener('click', startScanner);

async function startScanner() {
  const btn = document.getElementById('scan-start-btn');
  btn.style.display = 'none';

  scanner = new Scanner('qr-reader', async (code) => {
    await stopScanner();
    await handleScanResult(code);
  });

  try {
    await scanner.start();
    document.getElementById('scan-line').style.display = 'none'; // echte camera actief
  } catch {
    // Camera niet beschikbaar → toon manual input
    btn.style.display = '';
    showToast('Camera niet beschikbaar, gebruik handmatig invoer', true);
  }
}

async function stopScanner() {
  if (scanner) { await scanner.stop(); scanner = null; }
  document.getElementById('scan-line').style.display = '';
}

// Handmatig code invoer
document.getElementById('manual-qr-btn')?.addEventListener('click', () => {
  document.getElementById('manual-qr-wrap').style.display =
    document.getElementById('manual-qr-wrap').style.display === 'none' ? '' : 'none';
});
document.getElementById('manual-qr-submit')?.addEventListener('click', () => {
  const val = document.getElementById('manual-qr-input').value.trim();
  if (val) handleScanResult(val);
});

async function handleScanResult(code) {
  try {
    const artikel = await API.getArtikelQR(code);
    showScannedArtikel(artikel);
  } catch {
    // Artikel niet in DB — maak automatisch aan op basis van QR-inhoud
    // QR formaat: "ACT1990 UTP CAT6 1,5M Blauw" → eerste woord = code, rest = naam
    const parts = code.trim().split(/\s+/);
    const qr_code = parts[0];
    const naam = parts.length > 1 ? parts.slice(1).join(' ') : code;
    try {
      const nieuw = await API.createArtikel({ naam, qr_code, eenheid: 'stuk' });
      showToast('Nieuw artikel aangemaakt: ' + naam);
      showScannedArtikel(nieuw);
    } catch (err2) {
      showToast('Kan artikel niet aanmaken: ' + err2.message, true);
    }
  }
}

function showScannedArtikel(artikel) {
  document.getElementById('scanned-name').textContent  = artikel.naam;
  document.getElementById('scanned-code').textContent  = artikel.qr_code;
  document.getElementById('unit-tag').textContent      = artikel.eenheid;
  document.getElementById('scanned-result').classList.add('show');
  document.getElementById('scan-placeholder').style.display = 'none';
  document.getElementById('scan-vp').classList.add('scanned');
  document.getElementById('scan-start-btn').style.display = 'none';
  document.getElementById('amt-card').style.opacity    = '1';
  document.getElementById('amt-card').style.pointerEvents = 'auto';
  document.getElementById('qty-input').value = 1;
  document.getElementById('add-btn').disabled = false;
  document.getElementById('add-btn').dataset.artikelId = artikel.id;
  document.getElementById('add-btn').dataset.eenheid   = artikel.eenheid;
}

// Reset scanner viewport
function resetScanVP() {
  document.getElementById('scanned-result').classList.remove('show');
  document.getElementById('scan-placeholder').style.display = '';
  document.getElementById('scan-vp').classList.remove('scanned');
  document.getElementById('scan-start-btn').style.display = '';
  document.getElementById('amt-card').style.opacity = '0.4';
  document.getElementById('amt-card').style.pointerEvents = 'none';
  document.getElementById('add-btn').disabled = true;
  document.getElementById('manual-qr-wrap').style.display = 'none';
  document.getElementById('manual-qr-input').value = '';
}

// Stepper
document.getElementById('qty-minus')?.addEventListener('click', () => {
  const i = document.getElementById('qty-input');
  i.value = Math.max(1, (parseInt(i.value)||1) - 1);
});
document.getElementById('qty-plus')?.addEventListener('click', () => {
  const i = document.getElementById('qty-input');
  i.value = (parseInt(i.value)||1) + 1;
});

// ── PICKLIJST ─────────────────────────────────────────────────────────────────
document.getElementById('add-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('add-btn');
  const artikelId = btn.dataset.artikelId;
  const qty = parseInt(document.getElementById('qty-input').value) || 1;

  btn.disabled = true;

  try {
    // Maak lijst aan als er nog geen actieve is
    if (!activePicklijstId) {
      const lijst = await API.createPicklijst();
      activePicklijstId = lijst.id;
    }

    await API.addRegel(activePicklijstId, { artikel_id: artikelId, meegenomen: qty });
    await renderPicklist();
    resetScanVP();
  } catch (err) {
    showToast(err.message, true);
    btn.disabled = false;
  }
});

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
      <div class="pick-name">${esc(r.artikel_naam)}</div>
      <div class="pick-qty">${r.meegenomen} ${esc(r.eenheid)}</div>
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

document.getElementById('send-btn')?.addEventListener('click', async () => {
  if (!activePicklijstId) return;
  const btn = document.getElementById('send-btn');
  btn.disabled = true;
  try {
    await API.verstuurPicklijst(activePicklijstId);
    activePicklijstId = null;
    await renderPicklist();
    showToast('✓ Picklijst verstuurd');
  } catch (err) {
    showToast(err.message, true);
    btn.disabled = false;
  }
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
    actief:       { cls:'b-blue',   txt:'Actief',           ico:'actief'  },
    wacht_retour: { cls:'b-orange', txt:'Wacht op retour',  ico:'waiting' },
    afgerond:     { cls:'b-green',  txt:'Afgerond',         ico:'done'    },
  };
  const s = sm[l.status] || sm.actief;
  const ico = { actief:'📋', waiting:'⏳', done:'✅' };
  const click = l.status === 'wacht_retour' ? `openRetour('${l.id}')` : '';
  return `<div class="list-card glass" onclick="${click}" style="${l.status==='wacht_retour'?'':'cursor:default'}">
    <div class="list-icon ${s.ico}">${ico[s.ico]}</div>
    <div class="list-info">
      <div class="list-id">${esc(l.id)}</div>
      <div class="list-name">${formatDatum(l.verstuurd_op || l.aangemaakt)}</div>
      <div class="list-meta">${l.aantal_regels} artikel${l.aantal_regels !== 1 ? 'en' : ''} · ${l.totaal_meegenomen} stuks</div>
    </div>
    <span class="badge ${s.cls}"><span class="badge-dot"></span>${s.txt}</span>
    ${l.status==='wacht_retour' ? '<span style="color:var(--text3);font-size:16px">›</span>' : ''}
  </div>`;
}

// ── RETOUR ────────────────────────────────────────────────────────────────────
window.openRetour = async function(id) {
  retourListId = id;
  const lijst = await API.getPicklijst(id);
  document.getElementById('retour-title').textContent = 'Retour — ' + id;
  document.getElementById('retour-sub').textContent = formatDatum(lijst.verstuurd_op) + ' · ' + lijst.gebruiker_naam;

  document.getElementById('retour-body').innerHTML = lijst.regels.map((r,i) => `
    <div class="retour-item">
      <div class="retour-name">${esc(r.artikel_naam)}</div>
      <div class="retour-row"><div class="r-label">Meegenomen</div><div class="r-mono">${r.meegenomen} ${esc(r.eenheid)}</div></div>
      <div class="retour-row">
        <div class="r-label">Teruggekomen</div>
        <input class="retour-input" id="ri_${i}" data-regel="${r.id}" type="number" value="${r.meegenomen}" min="0" max="${r.meegenomen}"
          oninput="calcV(${i},${r.meegenomen},'${esc(r.eenheid)}')">
        <span style="font-size:12px;color:var(--text3)">${esc(r.eenheid)}</span>
      </div>
      <div class="retour-row"><div class="r-label">Verbruik</div><div id="rv_${i}" class="v-zero">0 ${esc(r.eenheid)}</div></div>
    </div>`).join('');

  lijst.regels.forEach((r,i) => calcV(i, r.meegenomen, r.eenheid));
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

document.getElementById('retour-confirm')?.addEventListener('click', async () => {
  const inputs = document.querySelectorAll('#retour-body .retour-input');
  const regels = Array.from(inputs).map(inp => ({
    id: inp.dataset.regel,
    teruggekomen: Math.max(0, parseInt(inp.value)||0)
  }));

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
  ['lists','verbruik','artikelen','gebruikers'].forEach(t => {
    const el = document.getElementById('atab-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('.aseg').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  if (tab === 'lists')      loadAdminLists();
  if (tab === 'verbruik')   loadVerbruik();
  if (tab === 'artikelen')  loadAdminArtikelen();
  if (tab === 'gebruikers') loadGebruikers();
};

async function loadAdminStats() {
  try {
    const s = await API.getStats();
    document.getElementById('stat-actief').textContent        = s.actief;
    document.getElementById('stat-wacht').textContent         = s.wacht_retour;
    document.getElementById('stat-vandaag').textContent       = s.afgerond_vandaag;
    document.getElementById('stat-verbruik').textContent      = s.totaal_verbruik_week;
  } catch {}
}

async function loadAdminLists() {
  const body = document.getElementById('admin-tbody');
  body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Laden…</td></tr>';
  try {
    const params = {};
    if (adminFilter) params.status = adminFilter;
    const lijsten = await API.getPicklijsten({ ...params, limit: 100 });

    if (!lijsten.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Geen lijsten gevonden</td></tr>';
      return;
    }

    body.innerHTML = lijsten.map(l => {
      const s = statusMeta(l.status);
      return `<tr onclick="toggleExpand('${l.id}')">
        <td class="td-id">${esc(l.id)}</td>
        <td class="td-bold">${esc(l.gebruiker_naam)}</td>
        <td style="font-size:12px;color:var(--text2)">${formatDatum(l.aangemaakt)}</td>
        <td style="font-size:12px;color:var(--text2)">${l.aantal_regels} art.</td>
        <td><span class="badge ${s.cls}"><span class="badge-dot"></span>${s.txt}</span></td>
        <td>${l.status==='wacht_retour'?`<span class="retour-action" onclick="event.stopPropagation();openRetour('${l.id}')">Verwerk ›</span>`:''}</td>
      </tr>
      <tr class="expand-row" id="exp-${l.id}">
        <td colspan="6"><div class="expand-inner">
          <div class="expand-lbl">Regels</div>
          <div class="chips" id="chips-${l.id}"><em style="font-size:12px;color:var(--text3)">Laden…</em></div>
        </div></td>
      </tr>`;
    }).join('');
  } catch (err) { showToast(err.message, true); }
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
        chipsEl.innerHTML = lijst.regels.map(r => `
          <div class="chip">
            <div class="chip-name">${esc(r.artikel_naam)}</div>
            <div class="chip-nums">
              <span>↑ ${r.meegenomen}</span>
              ${r.teruggekomen !== null
                ? `<span>↓ ${r.teruggekomen}</span><span class="chip-v">∑ ${r.verbruik}</span>`
                : '<span style="color:var(--text3)">—</span>'}
            </div>
          </div>`).join('');
      } catch {}
    }
  }
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

async function loadAdminArtikelen() {
  const body = document.getElementById('art-tbody');
  body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text3)">Laden…</td></tr>';
  try {
    const arts = await API.getArtikelen();
    body.innerHTML = arts.map((a,i) => `
      <tr onclick="openArtikelModal('${a.id}')">
        <td><div class="art-cell">
          <div class="art-thumb" style="background:${artBg[i%artBg.length]}">${artIcons[a.categorie] || '📦'}</div>
          <span class="td-bold">${esc(a.naam)}</span>
        </div></td>
        <td class="td-id">${esc(a.qr_code)}</td>
        <td style="color:var(--text2)">${esc(a.eenheid)}</td>
        <td style="color:var(--text2)">${esc(a.categorie||'—')}</td>
        <td><a href="/api/artikelen/${a.id}/qr-image" target="_blank" onclick="event.stopPropagation()" style="font-size:12px;color:var(--blue);font-weight:600;text-decoration:none">QR ↗</a></td>
      </tr>`).join('');
  } catch (err) { showToast(err.message, true); }
}

window.openArtikelModal = async function(id) {
  const art = id === 'new' ? {} : await API.getArtikel(id);
  document.getElementById('art-modal-title').textContent = id === 'new' ? 'Nieuw artikel' : art.naam;
  document.getElementById('art-id').value = id === 'new' ? '' : id;
  document.getElementById('art-qr').value = art.qr_code || '';
  document.getElementById('art-qr').disabled = !!art.id; // niet wijzigen als bestaand
  document.getElementById('art-naam').value = art.naam || '';
  document.getElementById('art-omschrijving').value = art.omschrijving || '';
  document.getElementById('art-eenheid').value = art.eenheid || 'stuk';
  document.getElementById('art-categorie').value = art.categorie || '';
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

// ── ADMIN GEBRUIKERS ──────────────────────────────────────────────────────────
async function loadGebruikers() {
  const body = document.getElementById('geb-tbody');
  body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text3)">Laden…</td></tr>';
  try {
    const users = await API.getGebruikers();
    body.innerHTML = users.map(u => `
      <tr>
        <td class="td-bold">${esc(u.naam)}</td>
        <td style="color:var(--text2);font-size:12px">${esc(u.email)}</td>
        <td><span class="badge ${u.rol==='admin'?'b-purple':'b-blue'}" style="${u.rol==='admin'?'background:rgba(139,92,246,.12);color:#8b5cf6;':''}">${u.rol}</span></td>
        <td><span class="badge ${u.actief?'b-green':'b-orange'}">${u.actief?'Actief':'Inactief'}</span></td>
        <td><button class="retour-action" onclick="openGebruikerModal('${u.id}')">Wijzig ›</button></td>
      </tr>`).join('');
  } catch (err) { showToast(err.message, true); }
}

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
  document.getElementById('geb-modal').classList.add('open');
};

document.getElementById('geb-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('geb-id').value;
  const body = {
    naam: document.getElementById('geb-naam').value,
    email: document.getElementById('geb-email').value,
    rol: document.getElementById('geb-rol').value,
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

// ── HELPERS ───────────────────────────────────────────────────────────────────
function statusMeta(status) {
  return {
    actief:       { cls:'b-blue',   txt:'Actief'          },
    wacht_retour: { cls:'b-orange', txt:'Wacht op retour' },
    afgerond:     { cls:'b-green',  txt:'Afgerond'        },
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
