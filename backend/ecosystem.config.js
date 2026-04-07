/**
 * PM2 Ecosystem Configuration
 * For process management and cluster mode
 */

module.exports = {
  apps: [{
    name: 'abhikaro-backend',
    script: './server.js',
    // IMPORTANT for Socket.IO (polling/WebView):
    // - In cluster mode without sticky sessions, Engine.IO polling can hit different workers
    //   and cause "Session ID unknown", breaking realtime delivery/restaurant notifications.
    // Default to a single instance (fork mode). If you want multi-instance, you MUST enable
    // sticky sessions at the proxy/load balancer (or use a proper cluster/sticky setup).
    instances: process.env.PM2_INSTANCES || 1,
    exec_mode: process.env.PM2_EXEC_MODE || 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 5000,
    },
    // Auto-restart configuration
    autorestart: true,
    watch: false, // Disable watch in production
    max_memory_restart: '1G', // Restart if memory exceeds 1GB
    
    // Logging
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Advanced PM2 features
    min_uptime: '10s', // Minimum uptime before considering app stable
    max_restarts: 10, // Max restarts in 1 minute
    restart_delay: 4000, // Delay between restarts
    
    // Graceful shutdown
    kill_timeout: 5000, // Time to wait for graceful shutdown
    listen_timeout: 10000, // Time to wait for app to listen
    
    // Instance vars (available in process.env)
    instance_var: 'INSTANCE_ID',
  }]
};
