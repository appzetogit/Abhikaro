# Redis Setup Guide for Abhikaro Backend

## Overview
Redis is used for:
- **Caching**: Reduce database load by 60-70%
- **Rate Limiting**: Protect API from abuse
- **Session Storage**: Store user sessions (optional)
- **Queue System**: Bull queues for async job processing
- **Socket.IO Adapter**: Enable horizontal scaling for real-time features

---

## Step 1: Install Redis on Hostinger VPS

### For Ubuntu/Debian:
```bash
# Update package list
sudo apt update

# Install Redis
sudo apt install redis-server -y

# Start Redis service
sudo systemctl start redis-server

# Enable Redis to start on boot
sudo systemctl enable redis-server

# Check Redis status
sudo systemctl status redis-server
```

### For CentOS/RHEL:
```bash
# Install EPEL repository
sudo yum install epel-release -y

# Install Redis
sudo yum install redis -y

# Start Redis service
sudo systemctl start redis

# Enable Redis to start on boot
sudo systemctl enable redis

# Check Redis status
sudo systemctl status redis
```

---

## Step 2: Configure Redis

### 2.1 Edit Redis Configuration File
```bash
sudo nano /etc/redis/redis.conf
```

### 2.2 Important Configuration Changes:

```conf
# Bind to localhost and your server IP (for security)
bind 127.0.0.1 YOUR_SERVER_IP

# Set a password for security (IMPORTANT!)
requirepass YOUR_STRONG_PASSWORD_HERE

# Set max memory (adjust based on your VPS RAM)
# For 8GB RAM VPS, use 2GB for Redis
maxmemory 2gb
maxmemory-policy allkeys-lru

# Enable persistence (save data to disk)
save 900 1
save 300 10
save 60 10000

# Logging
loglevel notice
logfile /var/log/redis/redis-server.log

# Disable dangerous commands in production
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command CONFIG "CONFIG_9f8d7c6b5a4e3d2f1e0"
```

### 2.3 Save and Restart Redis
```bash
# Restart Redis to apply changes
sudo systemctl restart redis-server

# Verify Redis is running
redis-cli ping
# Should return: PONG
```

---

## Step 3: Secure Redis

### 3.1 Set Redis Password
```bash
# Connect to Redis CLI
redis-cli

# Set password
CONFIG SET requirepass YOUR_STRONG_PASSWORD_HERE

# Test authentication
AUTH YOUR_STRONG_PASSWORD_HERE
ping
# Should return: PONG

# Exit
exit
```

### 3.2 Configure Firewall (if using UFW)
```bash
# Allow Redis only from localhost (if Redis is on same server)
sudo ufw allow from 127.0.0.1 to any port 6379

# If Redis is on different server, allow specific IP
sudo ufw allow from YOUR_APP_SERVER_IP to any port 6379
```

### 3.3 Disable Dangerous Commands
```bash
# Edit redis.conf
sudo nano /etc/redis/redis.conf

# Add these lines:
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command CONFIG "CONFIG_9f8d7c6b5a4e3d2f1e0"
```

---

## Step 4: Update Backend Environment Variables

### 4.1 Edit `.env` file in your backend:
```bash
cd /path/to/your/backend
nano .env
```

### 4.2 Add/Update Redis Configuration:
```env
# Redis Configuration
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=YOUR_STRONG_PASSWORD_HERE
REDIS_DB=0

# Enable Redis (set to true)
REDIS_ENABLED=true
```

### 4.3 Save and Restart Your Backend:
```bash
# If using PM2
pm2 restart abhikaro-backend

# Or if using systemd
sudo systemctl restart your-backend-service
```

---

## Step 5: Verify Redis Connection

### 5.1 Test Redis Connection from Backend:
```bash
# Connect to your backend directory
cd /path/to/your/backend

# Test Redis connection (if you have a test script)
node -e "
const redis = require('redis');
const client = redis.createClient({
  host: '127.0.0.1',
  port: 6379,
  password: 'YOUR_STRONG_PASSWORD_HERE'
});
client.on('connect', () => console.log('✅ Redis Connected!'));
client.on('error', (err) => console.error('❌ Redis Error:', err));
client.connect().then(() => {
  client.set('test', 'value');
  client.get('test').then(val => console.log('Test value:', val));
  client.quit();
});
"
```

### 5.2 Check Backend Logs:
```bash
# Check PM2 logs
pm2 logs abhikaro-backend

# Or check your application logs
tail -f /path/to/your/logs/app.log
```

Look for:
- `✅ Redis Connected!`
- `✅ Redis client initialized successfully`
- `✅ Order Processing Queue initialized.`
- `✅ Notification Queue initialized.`

---

## Step 6: Monitor Redis Performance

### 6.1 Redis CLI Commands:
```bash
# Connect to Redis
redis-cli -a YOUR_STRONG_PASSWORD_HERE

# Check Redis info
INFO stats
INFO memory
INFO clients

# Check number of keys
DBSIZE

# Monitor commands in real-time
MONITOR

# Check slow queries
SLOWLOG GET 10
```

### 6.2 Redis Memory Usage:
```bash
# Check memory usage
redis-cli -a YOUR_STRONG_PASSWORD_HERE INFO memory

# Check key statistics
redis-cli -a YOUR_STRONG_PASSWORD_HERE INFO keyspace
```

---

## Step 7: Redis Persistence (Optional but Recommended)

### 7.1 Enable AOF (Append Only File) for Better Durability:
```bash
# Edit redis.conf
sudo nano /etc/redis/redis.conf

# Enable AOF
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec

# Restart Redis
sudo systemctl restart redis-server
```

---

## Step 8: Redis Backup Strategy

### 8.1 Create Backup Script:
```bash
# Create backup directory
sudo mkdir -p /backup/redis

# Create backup script
sudo nano /usr/local/bin/redis-backup.sh
```

Add this content:
```bash
#!/bin/bash
BACKUP_DIR="/backup/redis"
DATE=$(date +%Y%m%d_%H%M%S)
REDIS_PASSWORD="YOUR_STRONG_PASSWORD_HERE"

# Create backup
redis-cli -a $REDIS_PASSWORD --rdb $BACKUP_DIR/dump_$DATE.rdb

# Keep only last 7 days of backups
find $BACKUP_DIR -name "dump_*.rdb" -mtime +7 -delete

echo "Backup completed: dump_$DATE.rdb"
```

### 8.2 Make Script Executable:
```bash
sudo chmod +x /usr/local/bin/redis-backup.sh
```

### 8.3 Schedule Daily Backups (Cron):
```bash
# Edit crontab
sudo crontab -e

# Add this line (runs daily at 2 AM)
0 2 * * * /usr/local/bin/redis-backup.sh >> /var/log/redis-backup.log 2>&1
```

---

## Step 9: Troubleshooting

### 9.1 Redis Not Starting:
```bash
# Check Redis logs
sudo tail -f /var/log/redis/redis-server.log

# Check Redis status
sudo systemctl status redis-server

# Test Redis configuration
sudo redis-server /etc/redis/redis.conf --test-memory 1
```

### 9.2 Connection Refused:
```bash
# Check if Redis is listening
sudo netstat -tlnp | grep 6379

# Check Redis bind address
redis-cli CONFIG GET bind

# Check firewall
sudo ufw status
```

### 9.3 Authentication Failed:
```bash
# Verify password in redis.conf
sudo grep requirepass /etc/redis/redis.conf

# Test authentication
redis-cli -a YOUR_PASSWORD ping
```

### 9.4 Memory Issues:
```bash
# Check memory usage
redis-cli INFO memory

# Clear cache if needed (use with caution!)
redis-cli FLUSHDB

# Check maxmemory policy
redis-cli CONFIG GET maxmemory-policy
```

---

## Step 10: Production Best Practices

### 10.1 Redis Sentinel (High Availability):
For production with high availability requirements, consider setting up Redis Sentinel or Redis Cluster.

### 10.2 Monitoring Tools:
- **RedisInsight**: GUI tool for monitoring Redis
- **Prometheus + Grafana**: For metrics and dashboards
- **redis-stat**: Real-time Redis monitoring

### 10.3 Performance Tuning:
```conf
# In redis.conf
# Increase TCP backlog
tcp-backlog 511

# Disable THP (Transparent Huge Pages)
# Add to /etc/rc.local:
echo never > /sys/kernel/mm/transparent_hugepage/enabled
```

---

## Step 11: Verify Everything Works

### 11.1 Test Caching:
```bash
# Make API requests to your backend
curl http://your-api/api/restaurant

# Check if data is cached
redis-cli -a YOUR_PASSWORD KEYS "*restaurant*"
```

### 11.2 Test Queues:
```bash
# Check queue status in backend logs
pm2 logs abhikaro-backend | grep "Queue"

# Check queue keys in Redis
redis-cli -a YOUR_PASSWORD KEYS "bull:*"
```

### 11.3 Test Rate Limiting:
```bash
# Make multiple rapid requests
for i in {1..10}; do
  curl http://your-api/api/test
done

# Check rate limit keys
redis-cli -a YOUR_PASSWORD KEYS "ratelimit:*"
```

---

## Quick Reference Commands

```bash
# Start Redis
sudo systemctl start redis-server

# Stop Redis
sudo systemctl stop redis-server

# Restart Redis
sudo systemctl restart redis-server

# Check Redis Status
sudo systemctl status redis-server

# Connect to Redis CLI
redis-cli -a YOUR_PASSWORD

# Check Redis Info
redis-cli -a YOUR_PASSWORD INFO

# Clear All Data (USE WITH CAUTION!)
redis-cli -a YOUR_PASSWORD FLUSHALL

# Monitor Commands
redis-cli -a YOUR_PASSWORD MONITOR

# Check Memory Usage
redis-cli -a YOUR_PASSWORD INFO memory

# List All Keys
redis-cli -a YOUR_PASSWORD KEYS "*"

# Get Key Value
redis-cli -a YOUR_PASSWORD GET "your-key"
```

---

## Security Checklist

- [ ] Redis password is set and strong
- [ ] Redis is bound to specific IPs (not 0.0.0.0)
- [ ] Firewall rules are configured
- [ ] Dangerous commands (FLUSHDB, FLUSHALL) are disabled
- [ ] Redis is not exposed to public internet
- [ ] Regular backups are scheduled
- [ ] Monitoring is set up
- [ ] Max memory is configured
- [ ] Persistence is enabled

---

## Support

If you encounter issues:
1. Check Redis logs: `/var/log/redis/redis-server.log`
2. Check backend logs for Redis connection errors
3. Verify environment variables are correct
4. Test Redis connection manually using `redis-cli`
5. Check firewall and network settings

---

## Next Steps

After Redis is set up:
1. Monitor cache hit rates via `/api/metrics/performance`
2. Check health status via `/api/metrics/health`
3. Optimize cache TTLs based on usage patterns
4. Set up Redis monitoring dashboard
5. Configure Redis Sentinel for high availability (if needed)
