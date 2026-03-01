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

export const notificationsSent = new client.Counter({
    name: 'notifications_sent_total',
    help: 'Total number of notifications sent'
});
register.registerMetric(notificationsSent);

export default {
    register,
    requestDuration,
    notificationsSent
};
