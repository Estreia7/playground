const path = require('path');
const root = __dirname;

module.exports = {
  apps: [
    {
      name: 'playground',
      cwd: root,
      script: path.join(root, 'node_modules/next/dist/bin/next'),
      args: 'start',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
    },
    {
      name: 'airbnb-scrapper-backend',
      cwd: path.join(root, 'backend'),
      script: path.join(root, 'backend/index.js'),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '60s',
      kill_timeout: 30000,
      max_memory_restart: '800M',
      node_args: '--max-old-space-size=1024',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
