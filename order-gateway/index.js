const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const cors = require('cors');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const client = require('prom-client');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key';
const PORT = process.env.PORT || 3000;
const STOCK_SERVICE_URL = process.env.STOCK_SERVICE_URL || 'http://stock-service:3000';
const KITCHEN_QUEUE_URL = process.env.KITCHEN_QUEUE_URL || 'http://kitchen-queue:3000';

const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379', { maxRetriesPerRequest: null });
const { Queue } = require('bullmq');
const kitchenQueue = new Queue('kitchen', { connection: redis });

// Metrics
const register = new client.Registry();
const orderCounter = new client.Counter({ name: 'orders_total', help: 'Total orders processed' });
const orderFailures = new client.Counter({ name: 'order_failures_total', help: 'Total order failures', labelNames: ['reason'] });
const responseTime = new client.Histogram({ name: 'gateway_response_time_seconds', help: 'Gateway response time', buckets: [0.1, 0.5, 1, 2, 5] });

register.registerMetric(orderCounter);
register.registerMetric(orderFailures);
register.registerMetric(responseTime);

app.use((req, res, next) => {
    const end = responseTime.startTimer();
    res.on('finish', () => end());
    next();
});

// Middleware: Validate Token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

app.post('/order', authenticateToken, async (req, res) => {
    const { itemId, quantity = 1, idempotencyKey } = req.body;
    const orderId = idempotencyKey || uuidv4();

    // 1. High-Speed Cache Stock Check
    try {
        const cacheStock = await redis.get(`stock:${itemId}`);
        if (cacheStock !== null && parseInt(cacheStock, 10) <= 0) {
            orderFailures.labels('out_of_stock_cache').inc();
            return res.status(400).json({ error: 'Out of stock (Cache Reject)' });
        }
    } catch (e) {
        console.warn("Cache check failed, proceeding to stock service", e.message);
    }

    try {
        // 2. Transact with Stock Service
        const stockResponse = await axios.post(`${STOCK_SERVICE_URL}/deduct`, {
            itemId,
            quantity,
            orderId, // Used as idempotency key in Stock Service
        });

        if (stockResponse.status !== 200) {
            throw new Error('Stock deduction failed');
        }

        // 3. Push to Kitchen Queue (Real Asynchronous Event)
        // This ensures the system survives if the Kitchen Service is down.
        await kitchenQueue.add('cook', {
            orderId,
            itemId,
            quantity,
            studentId: req.user.studentId
        });

        orderCounter.inc();

        res.json({
            message: 'Order accepted and queued',
            orderId,
            status: 'Processing',
            details: 'Order has been placed in the kitchen queue asynchronously.'
        });

    } catch (error) {
        orderFailures.labels('service_failure').inc();
        console.error("Order processing failed:", error.message);
        const status = error.response ? error.response.status : 500;
        res.status(status).json({ error: 'Failed to process order', details: error.message });
    }
});

app.post('/chaos', (req, res) => { res.send('Dying'); setTimeout(() => process.exit(1), 500); });

app.get('/health', async (req, res) => {
    try {
        await redis.ping();
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
    app.listen(PORT, () => console.log(`Order Gateway running on port ${PORT}`));
}
module.exports = app;
