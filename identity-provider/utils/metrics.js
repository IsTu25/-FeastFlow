const client = require('prom-client');

const register = new client.Registry();
const loginTotal = new client.Counter({ name: 'login_total', help: 'Total login attempts' });
const loginFailures = new client.Counter({ name: 'login_failures_total', help: 'Total login failures' });
const responseTime = new client.Histogram({ name: 'http_response_time_seconds', help: 'HTTP response time', buckets: [0.1, 0.5, 1, 2, 5] });

register.registerMetric(loginTotal);
register.registerMetric(loginFailures);
register.registerMetric(responseTime);

module.exports = {
    register,
    loginTotal,
    loginFailures,
    responseTime
};
