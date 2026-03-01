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

export const ordersProcessedTotal = new client.Counter({
    name: 'kitchen_orders_processed_total',
    help: 'Total orders processed by the kitchen'
});

export const chaosDelay = new client.Gauge({
    name: 'kitchen_chaos_delay_ms',
    help: 'Current chaos delay injected in kitchen'
});

register.registerMetric(ordersProcessedTotal);
register.registerMetric(chaosDelay);

export default {
    register,
    requestDuration,
    ordersProcessedTotal,
    chaosDelay
};
