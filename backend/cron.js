// backend/cron.js
// Geplande taken: herinnering bij te lange openstaande lijsten

const cron = require('node-cron');
const db   = require('./db');
const { stuurHerinneringNotif } = require('./services/notificaties');

const MAX_DAGEN = parseInt(process.env.NOTIF_LIJST_MAX_DAGEN || '3', 10);

// Dagelijks om 08:00
cron.schedule('0 8 * * *', checkOpenLijsten, { timezone: 'Europe/Amsterdam' });

async function checkOpenLijsten() {
  console.log('[cron] Controleer openstaande picklijsten...');
  try {
    const lijsten = db.prepare(`
      SELECT p.*, g.email AS gebruiker_email, g.naam AS gebruiker_naam
      FROM picklijsten p
      JOIN gebruikers g ON g.id = p.gebruiker_id
      WHERE p.status IN ('actief','wacht_retour')
        AND p.herinnering_gestuurd IS NULL
        AND (julianday('now') - julianday(p.aangemaakt)) >= ?
    `).all(MAX_DAGEN);

    for (const lijst of lijsten) {
      await stuurHerinneringNotif(lijst, lijst.gebruiker_email, MAX_DAGEN);
      db.prepare("UPDATE picklijsten SET herinnering_gestuurd = datetime('now') WHERE id = ?")
        .run(lijst.id);
      console.log(`[cron] Herinnering gestuurd voor lijst ${lijst.id} naar ${lijst.gebruiker_email}`);
    }

    if (lijsten.length === 0) console.log('[cron] Geen openstaande lijsten gevonden.');
  } catch (err) {
    console.error('[cron] Fout:', err.message);
  }
}

module.exports = { checkOpenLijsten };
