// PM2 Ecosystem Config — for VPS / cPanel Node.js deployment
module.exports = {
  apps: [
    {
      name:          'couponvault-server',
      script:        './dist/index.js',
      instances:     1,          // increase to 'max' on a multi-core VPS
      exec_mode:     'fork',
      watch:         false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'development',
        PORT:     3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT:     3000,
      },
      // Log paths — relative to project root
      out_file:      './logs/out.log',
      error_file:    './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs:    true,
    },
  ],
};
