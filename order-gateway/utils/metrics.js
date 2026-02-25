const client = require('prom-client');

const register = new client.Registry();
const orderCounter = new client.Counter({ name: 'orders_total', help: 'Total orders processed' });
const orderFailures = new client.Counter({ name: 'order_failures_total', help: 'Total order failures', labelNames: ['reason'] });
const responseTime = new client.Histogram({ name: 'gateway_response_time_seconds', help: 'Gateway response time', buckets: [0.1, 0.5, 1, 2, 5] });

register.registerMetric(orderCounter);
register.registerMetric(orderFailures);
register.registerMetric(responseTime);

module.exports = {
    register,
    orderCounter,
    orderFailures,
    responseTime
};
