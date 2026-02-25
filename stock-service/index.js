const express = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');
const cors = require('cors');
const morgan = require('morgan');

const metrics = require('./utils/metrics');
const StockRepository = require('./repositories/stockRepository');
const StockService = require('./services/stockService');
const StockController = require('./controllers/stockController');
const getStockRoutes = require('./routes/stockRoutes');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const PORT = process.env.PORT || 3000;
const pool = new Pool({
    connectionString: process.env.DB_URL || 'postgresql://iut_user:iut_password@postgres:5432/iut_cafeteria'
});
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

// Dependency Injection
const stockRepository = new StockRepository(pool);
const stockService = new StockService(stockRepository, redis, metrics);
const stockController = new StockController(stockService);

// Initialize DB
stockRepository.initializeDatabase()
    .then(() => redis.set('stock:iftar_box', 100)) // Sync cache on start
    .catch(console.error);

// Routes
app.use('/', getStockRoutes(stockController));

app.post('/chaos', (req, res) => { res.send('Dying'); setTimeout(() => process.exit(1), 500); });

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
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
    app.listen(PORT, () => console.log(`Stock Service running on port ${PORT}`));
}
module.exports = { app, pool, redis };
