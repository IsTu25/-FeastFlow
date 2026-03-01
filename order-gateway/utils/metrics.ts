import client from 'prom-client';

export const register = new client.Registry();

// Business Metrics (Requirement 5)
export const orderCounter = new client.Counter({
    name: 'orders_total',
    help: 'Total orders processed',
    labelNames: ['status']
});

export const orderFailures = new client.Counter({
    name: 'order_failures_total',
    help: 'Detailed order failures',
    labelNames: ['reason']
});

// Bulkhead Capacity Monitoring (Requirement 4)
export const bulkheadActive = new client.Gauge({
    name: 'gateway_bulkhead_active_requests',
    help: 'Number of active concurrent requests in the bulkhead',
    labelNames: ['service']
});

// SLO Tracking: P50/P95/P99 latency buckets (Requirement 5)
export const responseTime = new client.Histogram({
    name: 'gateway_response_time_seconds',
    help: 'Gateway response time in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5]
});

// --- NEW BUSINESS KPIs ---
export const orderSuccessRate = new client.Gauge({
    name: 'order_success_rate_percentage',
    help: 'Current order success rate as a percentage'
});

export const inventoryAccuracy = new client.Gauge({
    name: 'inventory_accuracy_percentage',
    help: 'Inventory accuracy vs actual stock'
});

export const kitchenEfficiency = new client.Gauge({
    name: 'kitchen_efficiency_per_minute',
    help: 'Orders processed per minute by the kitchen'
});

export const cacheHitRate = new client.Gauge({
    name: 'cache_hit_rate_percentage',
    help: 'Percentage of Redis keyspace hits'
});

// SLO Tracking: P99 Latency per internal service
export const serviceLatency = new client.Histogram({
    name: 'internal_service_latency_seconds',
    help: 'Internal microservice latency tracked by gateway',
    labelNames: ['service', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2]
});

export const cacheHits = new client.Counter({
    name: 'cache_hits_total',
    help: 'Total number of Redis cache hits'
});

export const cacheMisses = new client.Counter({
    name: 'cache_misses_total',
    help: 'Total number of Redis cache misses'
});

// Circuit Breaker State Monitoring
export const circuitBreakerState = new client.Gauge({
    name: 'circuit_breaker_state',
    help: 'State of the circuit breaker (0=closed, 1=open, 2=half-open)',
    labelNames: ['service']
});

register.registerMetric(orderCounter);
register.registerMetric(orderFailures);
register.registerMetric(bulkheadActive);
register.registerMetric(responseTime);
register.registerMetric(orderSuccessRate);
register.registerMetric(inventoryAccuracy);
register.registerMetric(kitchenEfficiency);
register.registerMetric(cacheHitRate);
register.registerMetric(serviceLatency);
register.registerMetric(circuitBreakerState);
register.registerMetric(cacheHits);
register.registerMetric(cacheMisses);

export default {
    register,
    orderCounter,
    orderFailures,
    bulkheadActive,
    responseTime,
    orderSuccessRate,
    inventoryAccuracy,
    kitchenEfficiency,
    cacheHitRate,
    serviceLatency,
    circuitBreakerState,
    cacheHits,
    cacheMisses
};
