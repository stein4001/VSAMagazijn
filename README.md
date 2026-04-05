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
```

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

## 7. PWA installeren op telefoon

1. Open de app in Chrome/Safari op de telefoon
2. Tik op **"Toevoegen aan beginscherm"** (iOS: deelknop → "Zet op beginscherm")
3. De app gedraagt zich als een native app

---

## API Endpoints

### Auth
| Methode | Pad              | Beschrijving         |
|---------|------------------|----------------------|
| POST    | /api/auth/login  | Inloggen             |
| GET     | /api/auth/me     | Eigen profiel        |

### Artikelen
| Methode | Pad                         | Beschrijving              |
|---------|-----------------------------|---------------------------|
| GET     | /api/artikelen              | Lijst alle artikelen      |
| GET     | /api/artikelen/qr/:code     | Zoek op QR code           |
| GET     | /api/artikelen/:id/qr-image | Genereer QR PNG           |
| POST    | /api/artikelen              | Nieuw artikel (admin)     |
| PUT     | /api/artikelen/:id          | Wijzig artikel (admin)    |

### Picklijsten
| Methode | Pad                              | Beschrijving                  |
|---------|----------------------------------|-------------------------------|
| GET     | /api/picklijsten                 | Overzicht lijsten             |
| POST    | /api/picklijsten                 | Nieuwe lijst starten          |
| POST    | /api/picklijsten/:id/regels      | Artikel toevoegen             |
| DELETE  | /api/picklijsten/:id/regels/:rid | Artikel verwijderen           |
| POST    | /api/picklijsten/:id/verstuur    | Verstuur lijst                |
| POST    | /api/picklijsten/:id/retour      | Retour verwerken              |
| GET     | /api/picklijsten/admin/stats     | Dashboard stats (admin)       |
| GET     | /api/picklijsten/admin/verbruik  | Verbruik per artikel (admin)  |

---

## Projectstructuur

```
magazijn/
├── backend/
│   ├── server.js            # Express server (entrypoint)
│   ├── db.js                # SQLite database verbinding
│   ├── auth.js              # JWT auth middleware
│   ├── data/
│   │   └── magazijn.db      # SQLite database (aangemaakt door setup)
│   └── routes/
│       ├── auth.js          # Login, /me
│       ├── artikelen.js     # CRUD artikelen + QR generatie
│       ├── picklijsten.js   # Picklijst lifecycle + admin stats
│       └── gebruikers.js    # Gebruikersbeheer (admin)
├── frontend/
│   └── public/
│       ├── index.html       # SPA shell
│       ├── manifest.json    # PWA manifest
│       ├── sw.js            # Service worker (offline)
│       ├── css/
│       │   └── app.css      # iOS 26 Liquid Glass design
│       └── js/
│           ├── app.js       # Hoofdapplicatie logica
│           ├── api.js       # API client (alle fetch calls)
│           └── scanner.js   # QR camera scanner wrapper
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
