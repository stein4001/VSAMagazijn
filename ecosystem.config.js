// ecosystem.config.js
// PM2 proces manager configuratie
// Gebruik: pm2 start ecosystem.config.js

module.exports = {
  apps: [{
    name: 'magazijn',
    script: 'backend/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'development',
      PORT: 3000,
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    error_file: 'logs/err.log',
    out_file:   'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
