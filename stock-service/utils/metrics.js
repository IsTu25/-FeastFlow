const client = require('prom-client');

const register = new client.Registry();
const stockDeductions = new client.Counter({ name: 'stock_deductions_total', help: 'Total stock deductions' });
register.registerMetric(stockDeductions);

module.exports = {
    register,
    stockDeductions
};
