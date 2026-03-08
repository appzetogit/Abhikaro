# JMeter Test Plan for Abhi Karo - 50k-1 Lakh Users

## Test Scenarios

### 1. User Registration/Login (10k concurrent users)
- **Endpoint**: `POST /api/auth/register`, `POST /api/auth/login`
- **Concurrent Users**: 10,000
- **Ramp-up Time**: 300 seconds (5 minutes)
- **Duration**: 600 seconds (10 minutes)
- **Expected Response Time**: < 500ms (95th percentile)

### 2. Restaurant Listing (20k concurrent users)
- **Endpoint**: `GET /api/restaurant`
- **Concurrent Users**: 20,000
- **Ramp-up Time**: 600 seconds (10 minutes)
- **Duration**: 900 seconds (15 minutes)
- **Expected Response Time**: < 200ms (95th percentile)
- **Cache Hit Ratio**: > 80%

### 3. Order Creation (5k concurrent orders)
- **Endpoint**: `POST /api/order/create`
- **Concurrent Users**: 5,000
- **Ramp-up Time**: 300 seconds (5 minutes)
- **Duration**: 600 seconds (10 minutes)
- **Expected Response Time**: < 1000ms (95th percentile)

### 4. Order Status Updates (Real-time)
- **Endpoint**: `GET /api/order/:id`
- **Concurrent Users**: 10,000
- **Ramp-up Time**: 300 seconds (5 minutes)
- **Duration**: 600 seconds (10 minutes)
- **Expected Response Time**: < 200ms (95th percentile)

### 5. Delivery Partner Location Updates
- **Endpoint**: `POST /api/delivery/location`
- **Concurrent Users**: 1,000
- **Ramp-up Time**: 60 seconds
- **Duration**: 300 seconds (5 minutes)
- **Frequency**: Every 5 seconds per user
- **Expected Response Time**: < 100ms (95th percentile)

### 6. Hotel QR Order Flow
- **Endpoint**: `POST /api/order/create` (with hotelReference)
- **Concurrent Users**: 2,000
- **Ramp-up Time**: 120 seconds
- **Duration**: 300 seconds (5 minutes)
- **Expected Response Time**: < 800ms (95th percentile)

## Performance Benchmarks

### Target Metrics
- **Total Concurrent Users**: 50,000 - 100,000
- **API Response Time (95th percentile)**: < 200ms
- **Database Query Time**: < 100ms average
- **Cache Hit Ratio**: > 80%
- **Error Rate**: < 0.1%
- **Throughput**: > 10,000 requests/second

### Resource Utilization
- **CPU Usage**: < 80%
- **Memory Usage**: < 80%
- **Database Connections**: < 80% of pool
- **Redis Memory**: < 80% of available

## JMeter Configuration

### Thread Groups
1. **User Registration/Login**: 10,000 threads
2. **Restaurant Browsing**: 20,000 threads
3. **Order Creation**: 5,000 threads
4. **Order Tracking**: 10,000 threads
5. **Delivery Updates**: 1,000 threads
6. **Hotel Orders**: 2,000 threads

### HTTP Request Defaults
- **Server Name**: Your backend server URL
- **Port**: 5000 (or your port)
- **Protocol**: https (or http)

### Listeners
- **View Results Tree**: For debugging (disable in full load test)
- **Summary Report**: Overall statistics
- **Aggregate Report**: Detailed statistics
- **Response Times Over Time**: Performance graph
- **Active Threads Over Time**: Load graph

## Test Execution Steps

1. **Pre-test Setup**:
   - Ensure Redis is running and configured
   - MongoDB Atlas connection is optimized
   - All indexes are created
   - Cache is warmed up

2. **Run Individual Test Scenarios**:
   - Start with lower concurrency (1k users)
   - Gradually increase to target load
   - Monitor metrics at each level

3. **Full Load Test**:
   - Run all scenarios simultaneously
   - Monitor server resources
   - Check database performance
   - Verify cache effectiveness

4. **Post-test Analysis**:
   - Review response times
   - Check error rates
   - Analyze slow queries
   - Verify cache hit ratios

## Monitoring During Tests

### Server Metrics
- CPU usage
- Memory usage
- Network I/O
- Disk I/O

### Application Metrics
- Response times (p50, p95, p99)
- Error rates
- Request throughput
- Queue sizes

### Database Metrics
- Query performance
- Connection pool usage
- Slow query log
- Index usage

### Cache Metrics
- Hit/miss ratio
- Memory usage
- Eviction rate

## Success Criteria

✅ All endpoints respond within target times
✅ Error rate < 0.1%
✅ Cache hit ratio > 80%
✅ No memory leaks
✅ Database queries < 100ms average
✅ System remains stable under load
✅ Graceful degradation if resources exhausted

## Notes

- Run tests during off-peak hours initially
- Monitor server logs for errors
- Use production-like data volumes
- Test with realistic user behavior patterns
- Consider geographic distribution of users
