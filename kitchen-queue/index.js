const express = require('express');
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const cors = require('cors');
const morgan = require('morgan');

const metrics = require('./utils/metrics');
const KitchenService = require('./services/kitchenService');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

// Dependency Injection
const kitchenService = new KitchenService(metrics);

// Worker Initializtion
const worker = new Worker('kitchen', async job => {
    await kitchenService.processOrder(job);
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
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
});

if (require.main === module) {
    app.listen(PORT, () => console.log(`Kitchen Queue running on port ${PORT}`));
}
module.exports = app;
