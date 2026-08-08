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
        PORT: '3002',
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
      // Mega-host jobs (300 listings) need headroom; the old 800M cap
      // SIGINT'd the process mid-job. Chromium runs as separate processes,
      // so this only measures the node heap.
      max_memory_restart: '1600M',
      node_args: '--max-old-space-size=1536',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
