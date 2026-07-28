// backend/services/notificaties.js
// Notificatie-templates en verzendlogica

const { stuurMail } = require('./mail');

function baseHtml(inhoud) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#1a1a2e;max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#f0f4fa;border-radius:16px;padding:24px">
      <h2 style="margin:0 0 4px;font-size:20px">📦 Magazijn</h2>
      <div style="height:1px;background:#d0d8e8;margin:16px 0"></div>
      ${inhoud}
    </div>
    <p style="font-size:11px;color:#9090b0;margin-top:16px;text-align:center">Magazijn systeem — log in om details te bekijken.</p>
  </body></html>`;
}

async function stuurNieuweLijstNotif(picklijst) {
  const aan = process.env.NOTIF_ADMIN_EMAIL;
  if (!aan) return;
  await stuurMail({
    aan,
    onderwerp: `Nieuwe picklijst aangemaakt — ${picklijst.gebruiker_naam}`,
    html: baseHtml(`
      <p>Er is een nieuwe picklijst aangemaakt.</p>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#5a5a7a;width:120px">Medewerker</td><td style="font-weight:700">${esc(picklijst.gebruiker_naam)}</td></tr>
        ${picklijst.klant ? `<tr><td style="padding:6px 0;color:#5a5a7a">Klant</td><td style="font-weight:700">${esc(picklijst.klant)}</td></tr>` : ''}
        <tr><td style="padding:6px 0;color:#5a5a7a">Aangemaakt</td><td>${new Date(picklijst.aangemaakt).toLocaleString('nl-NL')}</td></tr>
      </table>
    `),
  });
}

async function stuurAfgerondNotif(picklijst) {
  const aan = process.env.NOTIF_ADMIN_EMAIL;
  if (!aan) return;
  await stuurMail({
    aan,
    onderwerp: `Picklijst afgerond — ${picklijst.klant || picklijst.gebruiker_naam}`,
    html: baseHtml(`
      <p>Een picklijst is afgerond en klaar voor verwerking.</p>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#5a5a7a;width:120px">Medewerker</td><td style="font-weight:700">${esc(picklijst.gebruiker_naam)}</td></tr>
        ${picklijst.klant ? `<tr><td style="padding:6px 0;color:#5a5a7a">Klant</td><td style="font-weight:700">${esc(picklijst.klant)}</td></tr>` : ''}
        ${picklijst.projectnummer ? `<tr><td style="padding:6px 0;color:#5a5a7a">Projectnummer</td><td style="font-weight:700">${esc(picklijst.projectnummer)}</td></tr>` : ''}
        <tr><td style="padding:6px 0;color:#5a5a7a">Afgerond op</td><td>${new Date(picklijst.gesloten_op).toLocaleString('nl-NL')}</td></tr>
      </table>
    `),
  });
}

async function stuurHerinneringNotif(picklijst, gebruikerEmail, dagenOpen) {
  if (!gebruikerEmail) return;
  await stuurMail({
    aan: gebruikerEmail,
    onderwerp: `Herinnering: picklijst staat al ${dagenOpen} dagen open`,
    html: baseHtml(`
      <p>Je hebt een picklijst die al <strong>${dagenOpen} dagen</strong> open staat.</p>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        ${picklijst.klant ? `<tr><td style="padding:6px 0;color:#5a5a7a;width:120px">Klant</td><td style="font-weight:700">${esc(picklijst.klant)}</td></tr>` : ''}
        <tr><td style="padding:6px 0;color:#5a5a7a">Status</td><td>${esc(picklijst.status)}</td></tr>
        <tr><td style="padding:6px 0;color:#5a5a7a">Aangemaakt</td><td>${new Date(picklijst.aangemaakt).toLocaleString('nl-NL')}</td></tr>
      </table>
      <p style="margin-top:16px;font-size:13px;color:#5a5a7a">Log in op het Magazijn systeem om de lijst te verwerken of te annuleren.</p>
    `),
  });
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

module.exports = { stuurNieuweLijstNotif, stuurAfgerondNotif, stuurHerinneringNotif };
