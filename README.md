# 📦 Magazijn — Installatie & Deployment Handleiding

## Overzicht

Volledige magazijn-beheerapplicatie met:
- **Frontend** — PWA (Progressive Web App), werkt op telefoon zonder app-installatie
- **Backend** — Node.js + Express REST API
- **Database** — SQLite (bestandsgebaseerd, geen losse DB server nodig)
- **Auth** — JWT tokens, rollen: `medewerker` en `admin`

---

## Vereisten

- Linux VPS (Ubuntu 20.04+ aanbevolen)
- Node.js 18+ (`node -v`)
- npm 9+ (`npm -v`)
- Nginx (voor reverse proxy)
- PM2 (voor process management)

---

## 1. Installatie op VPS

### 1.1 Bestanden uploaden

```bash
# Kopieer de projectmap naar de server
scp -r ./magazijn gebruiker@jouw-vps-ip:/opt/magazijn

# Of via Git (als je een repo hebt):
# git clone https://github.com/jouw-repo/magazijn.git /opt/magazijn
```

### 1.2 Node.js installeren (als nog niet aanwezig)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # moet 20.x tonen
```

### 1.3 Dependencies installeren

```bash
cd /opt/magazijn
npm install
```

### 1.4 Omgevingsvariabelen instellen

```bash
cp .env.example .env
nano .env
```

Pas minimaal aan:
```
JWT_SECRET=maak-dit-een-lange-willekeurige-string-van-32-tekens
PORT=3000
NODE_ENV=production
CORS_ORIGIN=https://jouwdomein.nl
```

Genereer een veilige `JWT_SECRET`:
```bash
openssl rand -base64 32
```

> ⚠️ De server weigert te starten als `JWT_SECRET` niet is ingesteld.

### 1.5 Database aanmaken en vullen

```bash
# Database structuur aanmaken
node scripts/setup-db.js

# Demo-data toevoegen (medewerkers + artikelen)
node scripts/seed.js
```

De database wordt opgeslagen in `backend/data/magazijn.db`.

---

## 2. PM2 (process manager)

### Installeren

```bash
sudo npm install -g pm2
```

### Starten

```bash
cd /opt/magazijn
pm2 start ecosystem.config.js --env production
pm2 save                          # autostart bij herstart server
pm2 startup                       # volg de instructie die PM2 geeft
```

### Handige PM2 commando's

```bash
pm2 status                        # overzicht processen
pm2 logs magazijn                 # live logs bekijken
pm2 restart magazijn              # herstart app
pm2 stop magazijn                 # stop app
```

---

## 3. Nginx instellen

### Installeren

```bash
sudo apt install nginx -y
```

### Configuratie kopiëren

```bash
sudo cp /opt/magazijn/nginx.conf /etc/nginx/sites-available/magazijn
sudo ln -s /etc/nginx/sites-available/magazijn /etc/nginx/sites-enabled/
```

### Domeinnaam aanpassen

```bash
sudo nano /etc/nginx/sites-available/magazijn
# Verander 'jouwdomein.nl' naar jouw eigen domeinnaam
```

### Activeren

```bash
sudo nginx -t                     # configuratie testen
sudo systemctl reload nginx
sudo systemctl enable nginx
```

---

## 4. SSL certificaat (HTTPS) — sterk aanbevolen!

De camera/QR-scanner werkt **alleen** over HTTPS in de browser.

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d jouwdomein.nl -d www.jouwdomein.nl
```

Certbot past de nginx config automatisch aan. Daarna:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Certificaten worden automatisch vernieuwd via een cron-job.

---

## 5. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

## 6. Eerste login testen

Open in browser: `https://jouwdomein.nl`

| Gebruiker         | E-mail                  | Wachtwoord | Rol         |
|-------------------|-------------------------|------------|-------------|
| Admin             | admin@magazijn.nl       | admin123   | admin       |
| Jan de Vries      | jan@magazijn.nl         | jan123     | medewerker  |
| Sarah Meijer      | sarah@magazijn.nl       | sarah123   | medewerker  |
| Tom Bakker        | tom@magazijn.nl         | tom123     | medewerker  |

> ⚠️ **Verander wachtwoorden na eerste login via de API of seed aanpassen!**

---

## 7. Microsoft SSO instellen (optioneel)

Microsoft login werkt naast het bestaande wachtwoord-systeem. Volg deze stappen.

### 7.1 Azure App Registration aanmaken

1. Ga naar [portal.azure.com](https://portal.azure.com) → **Azure Active Directory** → **App registrations** → **New registration**
2. Vul in:
   - **Name**: Magazijn App
   - **Supported account types**: Accounts in this organizational directory only
   - **Redirect URI**: Web → `https://jouwdomein.nl/api/auth/microsoft/callback`
3. Klik **Register**

### 7.2 Credentials en IDs kopiëren

Op de **Overview** pagina van de App Registration:
- Kopieer **Application (client) ID** → `AZURE_CLIENT_ID`
- Kopieer **Directory (tenant) ID** → `AZURE_TENANT_ID`

> ⚠️ Gebruik altijd het **kopieer-icoontje** — de GUID moet exact 36 tekens zijn (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).

Ga naar **Certificates & secrets** → **Client secrets** → **New client secret**:
- Kies een vervaldatum → **Add**
- Kopieer de **Value** meteen → `AZURE_CLIENT_SECRET` (alleen zichtbaar direct na aanmaken)

### 7.3 API permissions instellen

Ga naar **API permissions** → **Add a permission** → **Microsoft Graph**:

| Type | Permission | Gebruik |
|------|-----------|---------|
| Delegated | `User.Read` | Inloggen via SSO |
| Application | `Mail.Send` | E-mail versturen vanuit mailbox |

Klik daarna op **Grant admin consent for [organisatie]** (vereist Global Admin rechten).

### 7.4 Groep toewijzen in Enterprise Application

Standaard kan iedereen in de tenant inloggen. Beperk dit tot een specifieke groep:

1. Ga naar **Azure Active Directory** → **Enterprise applications** → zoek op "Magazijn App"
2. Ga naar **Properties** → zet **Assignment required** op **Yes** → **Save**
3. Ga naar **Users and groups** → **Add user/group** → voeg de gewenste groep toe met rol **User**

Alleen leden van deze groep kunnen nu inloggen via Microsoft.

### 7.5 `.env` aanvullen

```bash
nano /opt/magazijn/.env
```

Voeg toe:
```
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_SECRET=...
AZURE_REDIRECT_URI=https://jouwdomein.nl/api/auth/microsoft/callback

MAIL_FROM=magazijn@jouwdomein.nl
NOTIF_ADMIN_EMAIL=admin@jouwdomein.nl
NOTIF_LIJST_MAX_DAGEN=3
```

```bash
pm2 restart magazijn
```

### 7.6 Gebruikers koppelen

Gebruikers moeten **eerst aangemaakt worden in de admin UI** met hetzelfde e-mailadres als hun M365-account. Bij de eerste Microsoft-login wordt het account automatisch gekoppeld.

Per gebruiker is in de admin UI instelbaar welke inlogmethode is toegestaan:
- **Beide** — Microsoft SSO én wachtwoord (standaard)
- **Alleen Microsoft** — wachtwoord-login geblokkeerd
- **Alleen lokaal** — Microsoft-login geblokkeerd (gebruik dit voor het backdoor admin-account)

---

## 8. PWA installeren op telefoon

1. Open de app in Chrome/Safari op de telefoon
2. Tik op **"Toevoegen aan beginscherm"** (iOS: deelknop → "Zet op beginscherm")
3. De app gedraagt zich als een native app

---

## API Endpoints

### Auth
| Methode | Pad                            | Beschrijving                        |
|---------|--------------------------------|-------------------------------------|
| POST    | /api/auth/login                | Inloggen met wachtwoord             |
| GET     | /api/auth/me                   | Eigen profiel                       |
| GET     | /api/auth/microsoft            | Start Microsoft OAuth login         |
| GET     | /api/auth/microsoft/callback   | OAuth callback (Microsoft)          |

### Artikelen
| Methode | Pad                              | Beschrijving                      |
|---------|----------------------------------|-----------------------------------|
| GET     | /api/artikelen                   | Lijst alle artikelen              |
| GET     | /api/artikelen/categorieen/lijst | Distinct categorieën (datalist)   |
| GET     | /api/artikelen/qr/:code          | Zoek op QR code                   |
| GET     | /api/artikelen/:id/qr-image      | Genereer QR PNG                   |
| GET     | /api/artikelen/export/csv        | CSV download (admin)              |
| POST    | /api/artikelen/import/csv        | CSV upsert op qr_code (admin)     |
| POST    | /api/artikelen                   | Nieuw artikel                     |
| PUT     | /api/artikelen/:id               | Wijzig artikel (admin)            |
| DELETE  | /api/artikelen/:id               | Soft delete (admin)               |

### Picklijsten
| Methode | Pad                                        | Beschrijving                        |
|---------|--------------------------------------------|-------------------------------------|
| GET     | /api/picklijsten                           | Overzicht lijsten                   |
| GET     | /api/picklijsten/:id                       | Detail + regels                     |
| POST    | /api/picklijsten                           | Nieuwe lijst starten                |
| PATCH   | /api/picklijsten/:id                       | Klant / notities bijwerken          |
| DELETE  | /api/picklijsten/:id                       | Hard delete (admin)                 |
| POST    | /api/picklijsten/:id/regels                | Artikel toevoegen                   |
| DELETE  | /api/picklijsten/:id/regels/:rid           | Artikel verwijderen                 |
| POST    | /api/picklijsten/:id/verstuur              | Verstuur lijst                      |
| POST    | /api/picklijsten/:id/retour                | Retour verwerken                    |
| POST    | /api/picklijsten/:id/afronden              | Admin: bevestig + projectnummer     |
| POST    | /api/picklijsten/:id/annuleer              | Medewerker: annuleer actieve lijst  |
| GET     | /api/picklijsten/admin/stats               | Dashboard stats (admin)             |
| GET     | /api/picklijsten/admin/verbruik            | Verbruik per artikel (admin)        |
| GET     | /api/picklijsten/admin/verbruik-per-medewerker | Verbruik per medewerker (admin) |
| GET     | /api/picklijsten/admin/export              | Flat CSV alle regels (admin)        |

### Gebruikers
| Methode | Pad                  | Beschrijving            |
|---------|----------------------|-------------------------|
| GET     | /api/gebruikers      | Lijst (admin)           |
| POST    | /api/gebruikers      | Aanmaken (admin)        |
| PUT     | /api/gebruikers/:id  | Wijzigen (admin)        |
| DELETE  | /api/gebruikers/:id  | Soft delete (admin)     |

### Klanten
| Methode | Pad                        | Beschrijving                        |
|---------|----------------------------|-------------------------------------|
| GET     | /api/klanten               | Lijst (alle ingelogden, autocomplete)|
| POST    | /api/klanten               | Aanmaken (admin)                    |
| PUT     | /api/klanten/:id           | Wijzigen (admin)                    |
| DELETE  | /api/klanten/:id           | Verwijderen (admin)                 |
| GET     | /api/klanten/export/csv    | CSV download (admin)                |
| POST    | /api/klanten/import/csv    | CSV upsert op naam (admin)          |

---

## Projectstructuur

```
magazijn/
├── backend/
│   ├── server.js            # Express server (entrypoint)
│   ├── db.js                # SQLite database verbinding + auto-migrations
│   ├── auth.js              # JWT auth middleware
│   ├── cron.js              # Geplande taken (dagelijkse herinneringsmails)
│   ├── data/
│   │   └── magazijn.db      # SQLite database (aangemaakt door setup)
│   ├── routes/
│   │   ├── auth.js          # Login, /me, Microsoft OAuth
│   │   ├── artikelen.js     # CRUD artikelen + QR generatie + CSV
│   │   ├── picklijsten.js   # Picklijst lifecycle + admin stats
│   │   ├── gebruikers.js    # Gebruikersbeheer (admin)
│   │   └── klanten.js       # Klantenbeheer + CSV import/export
│   └── services/
│       ├── mail.js          # Microsoft Graph mail-verzending
│       └── notificaties.js  # E-mail templates
├── frontend/
│   └── public/
│       ├── index.html       # SPA shell
│       ├── manifest.json    # PWA manifest
│       ├── sw.js            # Service worker (offline)
│       ├── css/
│       │   └── app.css      # iOS 26 Liquid Glass design
│       └── js/
│           ├── app.js           # Hoofdapplicatie logica
│           ├── api.js           # API client (alle fetch calls)
│           ├── scanner.js       # QR camera scanner wrapper
│           └── artikel-grid.js  # Artikel-grid voor snel toevoegen
├── scripts/
│   ├── setup-db.js          # Database aanmaken (run 1x)
│   └── seed.js              # Demo data invoeren
├── nginx.conf               # Nginx reverse proxy config
├── ecosystem.config.js      # PM2 process manager config
├── .env.example             # Omgevingsvariabelen template
└── package.json
```

---

## Updates deployen

```bash
cd /opt/magazijn
# Kopieer nieuwe bestanden via scp of git pull
npm install                  # alleen als package.json gewijzigd
pm2 restart magazijn
```

---

## Database backup

```bash
# Handmatige backup
cp /opt/magazijn/backend/data/magazijn.db /opt/backups/magazijn-$(date +%Y%m%d).db

# Automatische dagelijkse backup via cron
# sudo crontab -e
# 0 2 * * * cp /opt/magazijn/backend/data/magazijn.db /opt/backups/magazijn-$(date +\%Y\%m\%d).db
```

---

## Beveiliging

| Maatregel | Implementatie |
|-----------|---------------|
| Wachtwoorden | bcryptjs (cost 10) — nooit plaintext opgeslagen |
| JWT tokens | Verlopen na 12u, secret verplicht via `JWT_SECRET` |
| SQL injection | Alle queries via prepared statements |
| Brute-force | Max 20 loginpogingen per IP per 15 minuten |
| Security headers | Helmet (XSS, clickjacking, MIME-sniffing) |
| CORS | Beperkt tot `CORS_ORIGIN` uit `.env` |

**Na deployment: verander de wachtwoorden van de seed-accounts** via de admin UI of maak nieuwe gebruikers aan en verwijder de demo-accounts.

---

## Veelgestelde problemen

**App start niet op**
```bash
pm2 logs magazijn --lines 50
# Controleer of setup-db.js is uitgevoerd
node scripts/setup-db.js
```

**Camera werkt niet in browser**
- HTTPS is vereist voor camera-toegang
- Controleer of certbot geconfigureerd is

**"Artikel niet gevonden" bij scannen**
- Controleer of het QR-code formaat overeenkomt (bijv. `ART-001`)
- Voer seed opnieuw uit: `node scripts/seed.js`

**Poort al in gebruik**
```bash
sudo lsof -i :3000
# Pas PORT aan in .env of kill het andere process
```
