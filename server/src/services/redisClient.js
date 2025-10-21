const Redis = require('ioredis');
const env = require('../config/env');
const logger = require('../utils/logger');

let client = null;

function getRedisClient() {
  if (client) return client;
  client = new Redis(env.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });
  client.on('error', (err) => logger.error('Redis connection error', { error: err.message }));
  return client;
}

module.exports = { getRedisClient };
