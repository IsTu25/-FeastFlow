const client = require('prom-client');

const register = new client.Registry();
const notificationsSent = new client.Counter({ name: 'notifications_sent_total', help: 'Total notifications sent' });
register.registerMetric(notificationsSent);

module.exports = {
    register,
    notificationsSent
};
