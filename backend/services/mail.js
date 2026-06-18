// backend/services/mail.js
// E-mail verzenden via Microsoft Graph API (client credentials)

async function getGraphToken() {
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     process.env.AZURE_CLIENT_ID,
        client_secret: process.env.AZURE_CLIENT_SECRET,
        scope:         'https://graph.microsoft.com/.default',
      }),
    }
  );
  const data = await res.json();
  if (!data.access_token) throw new Error('Graph token ophalen mislukt: ' + JSON.stringify(data));
  return data.access_token;
}

async function stuurMail({ aan, onderwerp, html }) {
  if (!process.env.AZURE_TENANT_ID || !process.env.MAIL_FROM) {
    console.warn('[mail] Azure niet geconfigureerd, mail overgeslagen:', onderwerp);
    return;
  }
  try {
    const token = await getGraphToken();
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(process.env.MAIL_FROM)}/sendMail`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject: onderwerp,
            body: { contentType: 'HTML', content: html },
            toRecipients: [{ emailAddress: { address: aan } }],
          },
        }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error('Mail verzenden mislukt: ' + err);
    }
  } catch (err) {
    console.error('[mail] Fout bij verzenden:', err.message);
  }
}

module.exports = { stuurMail };
