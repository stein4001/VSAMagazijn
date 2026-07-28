// backend/services/mail.js
// E-mail verzenden via Microsoft Graph API (MIME multipart/alternative)

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

function b64(str) {
  const encoded = Buffer.from(str, 'utf-8').toString('base64');
  return encoded.match(/.{1,76}/g).join('\r\n');
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function stuurMail({ aan, onderwerp, html, tekst }) {
  if (!process.env.AZURE_TENANT_ID || !process.env.MAIL_FROM) {
    console.warn('[mail] Azure niet geconfigureerd, mail overgeslagen:', onderwerp);
    return;
  }
  try {
    const token = await getGraphToken();
    const boundary = 'mz_' + Date.now();
    const plainTekst = tekst || stripHtml(html);

    const mime = [
      'MIME-Version: 1.0',
      `To: ${aan}`,
      `From: ${process.env.MAIL_FROM}`,
      `Subject: ${onderwerp}`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(plainTekst),
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(html),
      '',
      `--${boundary}--`,
    ].join('\r\n');

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(process.env.MAIL_FROM)}/sendMail`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'text/plain',
        },
        body: Buffer.from(mime, 'utf-8').toString('base64'),
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
