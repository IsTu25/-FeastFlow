const express = require('express');
const Redis = require('ioredis');
const cors = require('cors');
const morgan = require('morgan');
const { Queue } = require('bullmq');

const metrics = require('./utils/metrics');
const OrderService = require('./services/orderService');
const OrderController = require('./controllers/orderController');
const getOrderRoutes = require('./routes/orderRoutes');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const PORT = process.env.PORT || 3000;
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379', { maxRetriesPerRequest: null });
const kitchenQueue = new Queue('kitchen', { connection: redis });

// Dependency Injection
const orderService = new OrderService(redis, kitchenQueue, metrics);
const orderController = new OrderController(orderService);

// Middleware: Response Time Tracking
app.use((req, res, next) => {
    const end = metrics.responseTime.startTimer();
    res.on('finish', () => end());
    next();
});

// Routes
app.use('/order', getOrderRoutes(orderController));

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
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
});

if (require.main === module) {
    app.listen(PORT, () => console.log(`Order Gateway running on port ${PORT}`));
}
module.exports = app;
