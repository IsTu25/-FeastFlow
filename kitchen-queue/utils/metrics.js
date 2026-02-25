const client = require('prom-client');

const register = new client.Registry();
const ordersProcessedTotal = new client.Counter({ name: 'kitchen_processed_total', help: 'Total kitchen orders processed' });
register.registerMetric(ordersProcessedTotal);

module.exports = {
    register,
    ordersProcessedTotal
};
