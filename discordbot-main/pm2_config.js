// ecosystem.config.js - Configuración para PM2
module.exports = {
  apps: [{
    name: 'discord-music-bot',
    script: 'index.js',
    instances: 1,
    exec_mode: 'fork',
    
    // Configuración de ambiente
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    
    // Configuración de logs
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Configuración de memoria
    max_memory_restart: '1G',
    
    // Reinicio automático
    restart_delay: 5000,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Configuración de watch (deshabilitado en producción)
    watch: false,
    ignore_watch: ['node_modules', 'logs'],
    
    // Configuración de salud
    health_check_http: false,
    
    // Variables de entorno específicas para producción
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    
    // Variables de entorno para desarrollo
    env_development: {
      NODE_ENV: 'development',
      PORT: 3000,
      DEBUG: 'true'
    },
    
    // Configuración de merge logs
    merge_logs: true,
    
    // Configuración de tiempo
    time: true,
    
    // Configuración de instancias
    autorestart: true,
    
    // Configuración de cron para reinicio programado (opcional)
    // cron_restart: '0 4 * * *', // Reiniciar todos los días a las 4 AM
    
    // Configuración de kill timeout
    kill_timeout: 5000,
    
    // Configuración de wait ready
    wait_ready: true,
    listen_timeout: 8000,
    
    // Script de pre-start (opcional)
    // pre_start: 'npm run build',
    
    // Script de post-start (opcional)
    // post_start: 'echo "Bot started successfully"',
    
    // Configuración de source map
    source_map_support: true,
    
    // Configuración de node args
    node_args: '--max-old-space-size=1024'
  }],
  
  // Configuración de deploy (opcional)
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:youruser/discord-music-bot.git',
      path: '/var/www/discord-music-bot',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};