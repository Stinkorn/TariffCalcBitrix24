module.exports = {
  apps: [
    {
      name: 'tariffcalc-api',
      cwd: __dirname,
      script: 'npm',
      args: 'run start:prod',
      env: {
        NODE_ENV: 'production'
      },
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      time: true
    }
  ]
};
