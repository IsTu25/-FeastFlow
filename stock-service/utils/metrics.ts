import client from 'prom-client';

const register = new client.Registry();

// Standard Metrics for all services
export const requestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['service', 'method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5]
});

register.registerMetric(requestDuration);

export const stockDeductions = new client.Counter({
    name: 'stock_deductions_total',
    help: 'Total number of successful stock deductions'
});
register.registerMetric(stockDeductions);

export const cacheHits = new client.Counter({
    name: 'cache_hits_total',
    help: 'Total number of cache hits'
});
register.registerMetric(cacheHits);

export const cacheMisses = new client.Counter({
    name: 'cache_misses_total',
    help: 'Total number of cache misses'
});
register.registerMetric(cacheMisses);

export const inventoryHealth = new client.Gauge({
    name: 'inventory_health_percent',
    help: 'Percentage of items in stock'
});
register.registerMetric(inventoryHealth);

export const cacheHitRate = new client.Gauge({
    name: 'cache_hit_rate_percent',
    help: 'Percentage of requests served from cache'
});
register.registerMetric(cacheHitRate);

export default {
    register,
    requestDuration,
    stockDeductions,
    inventoryHealth,
    cacheHits,
    cacheMisses,
    cacheHitRate
};
