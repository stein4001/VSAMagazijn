# Magazijn App — Claude Code Instructies

## Wat is dit project?
Magazijn beheer webapp voor het digitaliseren van materiaaluitgifte en retourverwerking.
Medewerkers scannen QR-codes op artikelen, bouwen een picklijst, versturen die, en verwerken
later het retour. Admins zien alles via een dashboard.

## Stack
- **Backend**: Node.js + Express + better-sqlite3
- **Database**: SQLite (`backend/data/magazijn.db`)
- **Auth**: JWT (bcryptjs + jsonwebtoken)
- **Frontend**: Vanilla JS SPA, PWA (geen framework)
- **Design**: iOS 26 Liquid Glass (glassmorphism, Figtree font)
- **QR scanner**: html5-qrcode via CDN

## Projectstructuur
```
magazijn/
├── backend/
│   ├── server.js              # Express entrypoint, poort 3000
│   ├── db.js                  # SQLite singleton
│   ├── auth.js                # JWT sign/verify + middleware requireAuth/requireAdmin
│   └── routes/
│       ├── auth.js            # POST /api/auth/login, GET /api/auth/me
│       ├── artikelen.js       # CRUD + QR-image generatie
│       ├── picklijsten.js     # Lifecycle + admin stats/verbruik
│       └── gebruikers.js      # Gebruikersbeheer (admin only)
├── frontend/public/
│   ├── index.html             # SPA shell, alle schermen inline
│   ├── manifest.json          # PWA manifest
│   ├── sw.js                  # Service worker (offline cache)
│   ├── css/app.css            # Volledige design system
│   └── js/
│       ├── app.js             # Hoofdlogica, scherm-routing, alle event handlers
│       ├── api.js             # Centrale fetch-wrapper, auth state, alle API calls
│       └── scanner.js         # html5-qrcode wrapper class
├── scripts/
│   ├── setup-db.js            # Eenmalig: database + tabellen aanmaken
│   └── seed.js                # Demo gebruikers + artikelen invoeren
├── ecosystem.config.js        # PM2 configuratie
├── nginx.conf                 # Nginx reverse proxy
├── .env.example               # Omgevingsvariabelen template
└── README.md                  # Deployment handleiding
```

## Opstarten (development)
```bash
npm install
cp .env.example .env           # pas JWT_SECRET aan
node scripts/setup-db.js       # eenmalig
node scripts/seed.js           # eenmalig
npm run dev                    # nodemon, auto-restart bij wijzigingen
# of: npm start                # zonder auto-restart
```
App draait op http://localhost:3000

## Demo accounts (na seed)
| Email                 | Wachtwoord | Rol        |
|-----------------------|------------|------------|
| admin@magazijn.nl     | admin123   | admin      |
| jan@magazijn.nl       | jan123     | medewerker |
| sarah@magazijn.nl     | sarah123   | medewerker |
| tom@magazijn.nl       | tom123     | medewerker |

## Database schema
```sql
gebruikers       (id, naam, email, wachtwoord, rol, actief, aangemaakt)
artikelen        (id, naam, omschrijving, qr_code, eenheid, categorie, min_voorraad, actief, aangemaakt)
picklijsten      (id, gebruiker_id, status, notities, aangemaakt, verstuurd_op, gesloten_op)
                 -- status: actief | wacht_retour | afgerond | geannuleerd
picklijst_regels (id, picklijst_id, artikel_id, meegenomen, teruggekomen, verbruik, aangemaakt, bijgewerkt)
                 -- verbruik = meegenomen - teruggekomen (berekend bij retour)
```

## Picklijst lifecycle
```
aanmaken → [actief] → verstuur → [wacht_retour] → retour verwerken → [afgerond]
```

## API overzicht
```
POST   /api/auth/login
GET    /api/auth/me

GET    /api/artikelen?q=zoekterm
GET    /api/artikelen/qr/:code          ← gebruikt door QR-scanner
GET    /api/artikelen/:id/qr-image      ← PNG download (admin)
POST   /api/artikelen                   ← admin
PUT    /api/artikelen/:id               ← admin
DELETE /api/artikelen/:id               ← admin (soft delete)

GET    /api/picklijsten?status=&gebruiker_id=&limit=&offset=
GET    /api/picklijsten/:id
POST   /api/picklijsten
POST   /api/picklijsten/:id/regels      ← artikel toevoegen
DELETE /api/picklijsten/:id/regels/:rid
POST   /api/picklijsten/:id/verstuur
POST   /api/picklijsten/:id/retour      ← body: { regels: [{id, teruggekomen}] }
GET    /api/picklijsten/admin/stats
GET    /api/picklijsten/admin/verbruik?van=&tot=
GET    /api/picklijsten/admin/verbruik-per-medewerker

GET    /api/gebruikers                  ← admin
POST   /api/gebruikers                  ← admin
PUT    /api/gebruikers/:id              ← admin
DELETE /api/gebruikers/:id              ← admin (soft delete)
```

## Frontend architectuur
- Één HTML-bestand met alle schermen als `<div class="screen">`
- Schermen: `screen-login`, `screen-main` (medewerker), `screen-admin`
- `api.js` exporteert named functions, beheert JWT in localStorage (`mz_token`, `mz_user`)
- `app.js` importeert via ES modules (`type="module"`)
- Auth guard: bij 401 response → `auth:logout` event → terug naar loginscherm
- Scanner: `scanner.js` wraps html5-qrcode, fallback naar handmatig invoer als geen camera

## Design systeem (CSS variabelen)
```css
--blue: #3a7bd5      /* primaire actie kleur */
--green: #25a06a     /* succes, versturen, afgerond */
--orange: #e8762a    /* wacht_retour, verbruik */
--red: #e84a4a       /* verwijderen, fout */
--purple: #8b5cf6    /* admin accenten */
--glass: rgba(255,255,255,0.55)       /* standaard glaskaart */
--glass-strong: rgba(255,255,255,0.72) /* modals, login */
--r-xl: 32px         /* grote kaarten */
--r-lg: 24px         /* lijstkaarten */
--r-md: 18px         /* items */
```
Alle knoppen zijn pill-shaped (border-radius: 50%). Gebruik `glass` class voor kaarten.

## Veelvoorkomende taken

### Nieuw backend endpoint toevoegen
1. Route toevoegen in het juiste bestand onder `backend/routes/`
2. Als het een nieuw routebestand is: registreren in `backend/server.js`
3. API-functie toevoegen in `frontend/public/js/api.js`
4. Aanroepen in `frontend/public/js/app.js`

### Nieuwe database kolom toevoegen
```bash
# SQLite: voeg toe via migration of hermaak de DB
node -e "const db=require('./backend/db'); db.prepare('ALTER TABLE tabel ADD COLUMN naam TEXT').run()"
```

### Database resetten
```bash
rm backend/data/magazijn.db
node scripts/setup-db.js
node scripts/seed.js
```

### Logs bekijken (productie)
```bash
pm2 logs magazijn
pm2 logs magazijn --lines 100
```

## Geplande uitbreidingen (backlog)
- [ ] Push notificaties als lijst te lang open staat (> X uur)
- [ ] CSV/Excel export van verbruiksrapport
- [ ] Voorraadbeheer module (huidige voorraad bijhouden)
- [ ] Meerdere locaties / magazijnen per account
- [ ] Barcode scanner ondersteuning (naast QR)
- [ ] Wachtwoord reset via e-mail
- [ ] Datum-filter op verbruiksrapport in admin UI
- [ ] Bulk QR-codes printen als PDF

## Omgevingsvariabelen
```
PORT=3000
JWT_SECRET=...           # minimaal 32 tekens, willekeurig
NODE_ENV=production      # of development
```

## Deployment (productie, Linux VPS)
Zie README.md voor volledige stap-voor-stap handleiding.
Kort: Nginx reverse proxy → PM2 process manager → Certbot SSL.
Camera/QR vereist HTTPS.
