const express = require('express');
const { Queue, Worker } = require('bullmq');
const axios = require('axios');
const Redis = require('ioredis');
const cors = require('cors');
const client = require('prom-client');
const morgan = require('morgan');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const NOTIFICATION_HUB_URL = process.env.NOTIFICATION_HUB_URL || 'http://notification-hub:3000';

// Metrics
const register = new client.Registry();
const ordersProcessedTotal = new client.Counter({ name: 'kitchen_processed_total', help: 'Total kitchen orders processed' });
register.registerMetric(ordersProcessedTotal);

// Worker to process background prep in 3-7 seconds
const worker = new Worker('kitchen', async job => {
    const { orderId, studentId } = job.data;
    const prepTime = Math.floor(Math.random() * 4000) + 3000; // 3 to 7 seconds

    // PUSH Confirmed status immediately upon starting work
    try {
        await axios.post(`${NOTIFICATION_HUB_URL}/notify`, { orderId, studentId, status: 'In Kitchen' }).catch(e => console.error(e.message));
    } catch (err) { }

    await new Promise(resolve => setTimeout(resolve, prepTime));

    // PUSH Ready status when done
    try {
        await axios.post(`${NOTIFICATION_HUB_URL}/notify`, { orderId, studentId, status: 'Ready' });
    } catch (e) { console.error("Could not notify", e.message); }

    ordersProcessedTotal.inc();
}, { connection });

app.post('/chaos', (req, res) => { res.send('Dying'); setTimeout(() => process.exit(1), 500); });

app.get('/health', async (req, res) => {
    try {
        await connection.ping();
        res.status(200).send('OK');
    } catch (e) {
        res.status(503).send('Service Unavailable');
    }
});

app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

if (require.main === module) {
    app.listen(PORT, () => console.log(`Kitchen Queue running on port ${PORT}`));
}
module.exports = app;
