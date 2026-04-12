module.exports = {
  apps: [
    {
      name: 'racing-game-server',
      script: 'server/src/index.js',
      cwd: '/var/www/racing-game',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      // Restart on crash, but not too aggressively
      max_restarts: 10,
      min_uptime: '5s',
      watch: false,
      // Log files
      out_file: '/var/log/racing-game/out.log',
      error_file: '/var/log/racing-game/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}
