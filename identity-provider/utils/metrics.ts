import client from 'prom-client';

const register = new client.Registry();

// Business Metrics for Identity Provider
export const loginTotal = new client.Counter({
    name: 'login_total',
    help: 'Total login attempts',
    labelNames: ['status']
});

// Standard Metrics for all services
export const requestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['service', 'method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5]
});

export const rateLimitHits = new client.Counter({
    name: 'rate_limit_hits_total',
    help: 'Total rate limit rejections',
    labelNames: ['endpoint', 'student_id']
});

register.registerMetric(loginTotal);
register.registerMetric(requestDuration);
register.registerMetric(rateLimitHits);

export default {
    register,
    loginTotal,
    requestDuration,
    rateLimitHits
};
