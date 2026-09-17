// PM2 process config for PYC SmartSMS production deploys.
// Usage (from the project root on the VPS):  pm2 start ecosystem.config.cjs
// Notes:
// - `npm run build` copies .env into .next/standalone/ — the standalone server
//   loads it from there. After ANY .env change: npm run build && pm2 restart.
// - The automation scheduler starts automatically with the app (instrumentation).
const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'pyc-smartsms',
      cwd: __dirname,
      script: 'node',
      args: path.join('.next', 'standalone', 'server.js'),
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        HOSTNAME: '0.0.0.0',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '700M',
      time: true,
    },
  ],
};
