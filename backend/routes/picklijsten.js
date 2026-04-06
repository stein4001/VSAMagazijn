// backend/routes/picklijsten.js

const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

// ── helpers ──────────────────────────────────────────────────────────────────

function getPicklijstMetRegels(id) {
  const lijst = db.prepare(`
    SELECT p.*, g.naam as gebruiker_naam, g.email as gebruiker_email
    FROM picklijsten p
    JOIN gebruikers g ON g.id = p.gebruiker_id
    WHERE p.id = ?
  `).get(id);

  if (!lijst) return null;

  lijst.regels = db.prepare(`
    SELECT r.*, a.naam as artikel_naam, a.eenheid, a.qr_code, a.categorie
    FROM picklijst_regels r
    JOIN artikelen a ON a.id = r.artikel_id
    WHERE r.picklijst_id = ?
    ORDER BY r.aangemaakt
  `).all(id);

  return lijst;
}

// ── MEDEWERKER ENDPOINTS ──────────────────────────────────────────────────────

// GET /api/picklijsten — eigen lijsten (medewerker) of alle (admin)
router.get('/', requireAuth, (req, res) => {
  const { status, gebruiker_id, limit = 50, offset = 0 } = req.query;
  const isAdmin = req.user.rol === 'admin';

  let sql = `
    SELECT p.*, g.naam as gebruiker_naam,
      COUNT(r.id) as aantal_regels,
      COALESCE(SUM(r.meegenomen), 0) as totaal_meegenomen,
      COALESCE(SUM(r.verbruik), 0) as totaal_verbruik
    FROM picklijsten p
    JOIN gebruikers g ON g.id = p.gebruiker_id
    LEFT JOIN picklijst_regels r ON r.picklijst_id = p.id
    WHERE 1=1
  `;
  const params = [];

  // Medewerker ziet alleen eigen lijsten
  if (!isAdmin) {
    sql += ' AND p.gebruiker_id = ?';
    params.push(req.user.id);
  } else if (gebruiker_id) {
    sql += ' AND p.gebruiker_id = ?';
    params.push(gebruiker_id);
  }

  if (status) {
    sql += ' AND p.status = ?';
    params.push(status);
  }

  sql += ' GROUP BY p.id ORDER BY p.aangemaakt DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  res.json(db.prepare(sql).all(...params));
});

// GET /api/picklijsten/:id
router.get('/:id', requireAuth, (req, res) => {
  const lijst = getPicklijstMetRegels(req.params.id);
  if (!lijst) return res.status(404).json({ error: 'Lijst niet gevonden' });

  // Medewerker mag alleen eigen lijst zien
  if (req.user.rol !== 'admin' && lijst.gebruiker_id !== req.user.id) {
    return res.status(403).json({ error: 'Geen toegang' });
  }
  res.json(lijst);
});

// POST /api/picklijsten — start nieuwe picklijst
router.post('/', requireAuth, (req, res) => {
  const { notities, klant } = req.body;
  const id = uuid();

  db.prepare(`
    INSERT INTO picklijsten (id, gebruiker_id, status, klant, notities)
    VALUES (?, ?, 'actief', ?, ?)
  `).run(id, req.user.id, klant || null, notities || null);

  res.status(201).json(getPicklijstMetRegels(id));
});

// POST /api/picklijsten/:id/regels — voeg artikel toe aan lijst
router.post('/:id/regels', requireAuth, (req, res) => {
  const lijst = db.prepare('SELECT * FROM picklijsten WHERE id = ?').get(req.params.id);
  if (!lijst) return res.status(404).json({ error: 'Lijst niet gevonden' });
  if (lijst.gebruiker_id !== req.user.id && req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Geen toegang' });
  }
  if (lijst.status !== 'actief') {
    return res.status(400).json({ error: 'Lijst is niet meer bewerkbaar' });
  }

  const { artikel_id, meegenomen, serienummer } = req.body;
  if (!artikel_id || !meegenomen || meegenomen < 1) {
    return res.status(400).json({ error: 'artikel_id en meegenomen (>0) zijn verplicht' });
  }

  const artikel = db.prepare('SELECT * FROM artikelen WHERE id = ? AND actief = 1').get(artikel_id);
  if (!artikel) return res.status(404).json({ error: 'Artikel niet gevonden' });

  // SN-artikelen: altijd nieuwe regel (elk serienummer is uniek)
  // Overige artikelen: optellen als artikel al in lijst zit
  if (!serienummer) {
    const bestaand = db.prepare(
      'SELECT * FROM picklijst_regels WHERE picklijst_id = ? AND artikel_id = ?'
    ).get(req.params.id, artikel_id);

    if (bestaand) {
      db.prepare(
        "UPDATE picklijst_regels SET meegenomen = meegenomen + ?, bijgewerkt = datetime('now') WHERE id = ?"
      ).run(meegenomen, bestaand.id);
      return res.status(201).json(getPicklijstMetRegels(req.params.id));
    }
  }

  db.prepare(`
    INSERT INTO picklijst_regels (id, picklijst_id, artikel_id, meegenomen, serienummer)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuid(), req.params.id, artikel_id, meegenomen, serienummer || null);

  res.status(201).json(getPicklijstMetRegels(req.params.id));
});

// DELETE /api/picklijsten/:id/regels/:regelId — verwijder regel
router.delete('/:id/regels/:regelId', requireAuth, (req, res) => {
  const lijst = db.prepare('SELECT * FROM picklijsten WHERE id = ?').get(req.params.id);
  if (!lijst) return res.status(404).json({ error: 'Lijst niet gevonden' });
  if (lijst.gebruiker_id !== req.user.id && req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Geen toegang' });
  }
  if (lijst.status !== 'actief') {
    return res.status(400).json({ error: 'Lijst is niet meer bewerkbaar' });
  }

  db.prepare('DELETE FROM picklijst_regels WHERE id = ? AND picklijst_id = ?')
    .run(req.params.regelId, req.params.id);
  res.json({ ok: true });
});

// PATCH /api/picklijsten/:id — klant/notities updaten
router.patch('/:id', requireAuth, (req, res) => {
  const lijst = db.prepare('SELECT * FROM picklijsten WHERE id = ?').get(req.params.id);
  if (!lijst) return res.status(404).json({ error: 'Lijst niet gevonden' });
  if (lijst.gebruiker_id !== req.user.id && req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Geen toegang' });
  }
  if (lijst.status !== 'actief') {
    return res.status(400).json({ error: 'Lijst is niet meer bewerkbaar' });
  }
  const { klant, projectnummer } = req.body;
  db.prepare("UPDATE picklijsten SET klant = ?, projectnummer = ? WHERE id = ?")
    .run(klant ?? lijst.klant, projectnummer !== undefined ? projectnummer : lijst.projectnummer, req.params.id);
  res.json(getPicklijstMetRegels(req.params.id));
});

// POST /api/picklijsten/:id/verstuur — verstuur lijst (actief → wacht_retour)
router.post('/:id/verstuur', requireAuth, (req, res) => {
  const lijst = db.prepare('SELECT * FROM picklijsten WHERE id = ?').get(req.params.id);
  if (!lijst) return res.status(404).json({ error: 'Lijst niet gevonden' });
  if (lijst.gebruiker_id !== req.user.id && req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Geen toegang' });
  }
  if (lijst.status !== 'actief') {
    return res.status(400).json({ error: `Lijst heeft status '${lijst.status}'` });
  }

  const aantalRegels = db.prepare(
    'SELECT COUNT(*) as n FROM picklijst_regels WHERE picklijst_id = ?'
  ).get(req.params.id).n;

  if (aantalRegels === 0) {
    return res.status(400).json({ error: 'Lijst bevat geen artikelen' });
  }

  db.prepare(`
    UPDATE picklijsten SET status = 'wacht_retour', verstuurd_op = datetime('now') WHERE id = ?
  `).run(req.params.id);

  res.json(getPicklijstMetRegels(req.params.id));
});

// POST /api/picklijsten/:id/retour — verwerk retour (wacht_retour → afgerond)
router.post('/:id/retour', requireAuth, (req, res) => {
  const lijst = db.prepare('SELECT * FROM picklijsten WHERE id = ?').get(req.params.id);
  if (!lijst) return res.status(404).json({ error: 'Lijst niet gevonden' });
  if (lijst.gebruiker_id !== req.user.id && req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Geen toegang' });
  }
  if (lijst.status !== 'wacht_retour') {
    return res.status(400).json({ error: 'Lijst wacht niet op retour' });
  }

  // req.body.regels = [{ id, teruggekomen }]
  const { regels } = req.body;
  if (!Array.isArray(regels) || regels.length === 0) {
    return res.status(400).json({ error: 'Regels zijn verplicht' });
  }

  const updateRegel = db.prepare(`
    UPDATE picklijst_regels
    SET teruggekomen = ?,
        verbruik     = meegenomen - ?,
        bijgewerkt   = datetime('now')
    WHERE id = ? AND picklijst_id = ?
  `);

  const updateAll = db.transaction((regels) => {
    for (const r of regels) {
      const terug = Math.max(0, Number(r.teruggekomen) || 0);
      updateRegel.run(terug, terug, r.id, req.params.id);
    }
    db.prepare(`
      UPDATE picklijsten SET status = 'wacht_verwerking', gesloten_op = datetime('now') WHERE id = ?
    `).run(req.params.id);
  });

  updateAll(regels);
  res.json(getPicklijstMetRegels(req.params.id));
});

// POST /api/picklijsten/:id/afronden — admin bevestigt + projectnummer (wacht_verwerking → afgerond)
router.post('/:id/afronden', requireAdmin, (req, res) => {
  const lijst = db.prepare('SELECT * FROM picklijsten WHERE id = ?').get(req.params.id);
  if (!lijst) return res.status(404).json({ error: 'Lijst niet gevonden' });
  if (lijst.status !== 'wacht_verwerking') {
    return res.status(400).json({ error: 'Lijst wacht niet op verwerking' });
  }
  const { projectnummer } = req.body;
  db.prepare(`
    UPDATE picklijsten SET status = 'afgerond', projectnummer = ? WHERE id = ?
  `).run(projectnummer || null, req.params.id);
  res.json(getPicklijstMetRegels(req.params.id));
});

// POST /api/picklijsten/:id/annuleer — medewerker annuleert eigen actieve lijst
router.post('/:id/annuleer', requireAuth, (req, res) => {
  const lijst = db.prepare('SELECT * FROM picklijsten WHERE id = ?').get(req.params.id);
  if (!lijst) return res.status(404).json({ error: 'Lijst niet gevonden' });
  if (lijst.gebruiker_id !== req.user.id && req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Geen toegang' });
  }
  if (lijst.status !== 'actief') {
    return res.status(400).json({ error: 'Alleen actieve lijsten kunnen geannuleerd worden' });
  }
  db.prepare("UPDATE picklijsten SET status = 'geannuleerd' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// DELETE /api/picklijsten/:id — verwijder picklijst (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  const lijst = db.prepare('SELECT * FROM picklijsten WHERE id = ?').get(req.params.id);
  if (!lijst) return res.status(404).json({ error: 'Lijst niet gevonden' });
  db.prepare('DELETE FROM picklijsten WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── ADMIN ENDPOINTS ───────────────────────────────────────────────────────────

// GET /api/picklijsten/admin/stats — dashboard statistieken
router.get('/admin/stats', requireAdmin, (req, res) => {
  const stats = {
    actief:           db.prepare("SELECT COUNT(*) as n FROM picklijsten WHERE status='actief'").get().n,
    wacht_retour:     db.prepare("SELECT COUNT(*) as n FROM picklijsten WHERE status='wacht_retour'").get().n,
    wacht_verwerking: db.prepare("SELECT COUNT(*) as n FROM picklijsten WHERE status='wacht_verwerking'").get().n,
    afgerond_vandaag: db.prepare(
      "SELECT COUNT(*) as n FROM picklijsten WHERE status='afgerond' AND date(gesloten_op)=date('now')"
    ).get().n,
    afgerond_week: db.prepare(
      "SELECT COUNT(*) as n FROM picklijsten WHERE status='afgerond' AND gesloten_op >= date('now','-7 days')"
    ).get().n,
    totaal_verbruik_week: db.prepare(
      "SELECT COALESCE(SUM(r.verbruik),0) as n FROM picklijst_regels r JOIN picklijsten p ON p.id=r.picklijst_id WHERE p.gesloten_op >= date('now','-7 days')"
    ).get().n,
  };
  res.json(stats);
});

// GET /api/picklijsten/admin/verbruik — verbruik per artikel
router.get('/admin/verbruik', requireAdmin, (req, res) => {
  const { van, tot } = req.query;
  let sql = `
    SELECT a.id, a.naam, a.eenheid, a.categorie,
      COALESCE(SUM(r.meegenomen),0) as totaal_meegenomen,
      COALESCE(SUM(r.verbruik),0)   as totaal_verbruik,
      COUNT(DISTINCT p.id)           as aantal_lijsten
    FROM artikelen a
    LEFT JOIN picklijst_regels r ON r.artikel_id = a.id
    LEFT JOIN picklijsten p ON p.id = r.picklijst_id AND p.status = 'afgerond'
  `;
  const params = [];
  if (van) { sql += (params.length ? ' AND' : ' WHERE') + ' p.gesloten_op >= ?'; params.push(van); }
  if (tot) { sql += (params.length ? ' AND' : ' WHERE') + ' p.gesloten_op <= ?'; params.push(tot + ' 23:59:59'); }
  sql += ' GROUP BY a.id ORDER BY totaal_verbruik DESC';

  res.json(db.prepare(sql).all(...params));
});

// GET /api/picklijsten/admin/verbruik-per-medewerker
router.get('/admin/verbruik-per-medewerker', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT g.id, g.naam,
      COUNT(DISTINCT p.id) as aantal_lijsten,
      COALESCE(SUM(r.verbruik),0) as totaal_verbruik
    FROM gebruikers g
    LEFT JOIN picklijsten p ON p.gebruiker_id = g.id AND p.status = 'afgerond'
    LEFT JOIN picklijst_regels r ON r.picklijst_id = p.id
    WHERE g.rol = 'medewerker' AND g.actief = 1
    GROUP BY g.id
    ORDER BY totaal_verbruik DESC
  `).all();
  res.json(rows);
});

module.exports = router;
