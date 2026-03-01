import { startTracing } from './utils/tracing';
startTracing();

import express from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';
import cors from 'cors';
import morgan from 'morgan';

import metrics from './utils/metrics';
import StockRepository from './repositories/stockRepository';
import StockService from './services/stockService';
import StockController from './controllers/stockController';
import getStockRoutes from './routes/stockRoutes';

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// SLO Tracking Middleware
app.use((req, res, next) => {
    const start = process.hrtime();
    res.on('finish', () => {
        const diff = process.hrtime(start);
        const duration = diff[0] + diff[1] / 1e9;
        metrics.requestDuration.labels('stock-service', req.method, req.path, res.statusCode.toString()).observe(duration);
    });
    next();
});

const PORT = process.env.PORT || 3000;
const pool = new Pool({
    connectionString: process.env.DB_URL || 'postgresql://iut_user:iut_password@postgres:5432/iut_cafeteria',
    max: 100,
    idleTimeoutMillis: 30000,
});
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

// Dependency Injection
const stockRepository = new StockRepository(pool);
const stockService = new StockService(stockRepository, redis, metrics);
const stockController = new StockController(stockService);

// Initialize DB & Cache Warming
stockRepository.initializeDatabase()
    .then(async () => {
        console.log('🔥 Database initialized. Warming stock cache...');
        const items = await stockRepository.getAllItems();
        const pipeline = redis.pipeline();
        for (const item of items) {
            pipeline.set(`stock:${item.id}`, item.stock);
        }
        await pipeline.exec();
        console.log(`✅ Cache warmed with ${items.length} items`);
    })
    .catch(console.error);

// Metric reporting loop (Updates Cache Hit Rate metric from internal counters)
setInterval(async () => {
    try {
        const hitsResult = await metrics.cacheHits.get();
        const missesResult = await metrics.cacheMisses.get();

        const hits = hitsResult.values[0]?.value || 0;
        const misses = missesResult.values[0]?.value || 0;

        const total = hits + misses;
        if (total > 0) {
            const hitRate = (hits / total) * 100;
            metrics.cacheHitRate.set(hitRate);
            console.log(`📊 [STOCK-SERVICE] Cache Hit Rate: ${hitRate.toFixed(2)}% (Hits: ${hits}, Misses: ${misses})`);
        }

        // Inventory health
        const items = await stockRepository.getAllItems();
        const totalStock = items.reduce((acc, i) => acc + i.stock, 0);
        metrics.inventoryHealth.set(totalStock > 0 ? 100 : 0);
    } catch (e) {
        // Silently fail metric update
    }
}, 5000);

// RECURRING CACHE REFRESH (Requirement: Robust 90%+ hit rate)
setInterval(async () => {
    try {
        console.log('🔄 [STOCK-SERVICE] Refreshing cache from Database...');
        const items = await stockRepository.getAllItems();
        const pipeline = redis.pipeline();
        for (const item of items) {
            pipeline.setex(`stock:${item.id}`, 300, item.stock.toString());
        }
        await pipeline.exec();
        console.log(`✅ [STOCK-SERVICE] Cache refreshed with ${items.length} items`);
    } catch (e: any) {
        console.error('❌ [STOCK-SERVICE] Cache refresh failed:', e.message);
    }
}, 60000);

// Routes
app.use('/', getStockRoutes(stockController));

app.post('/chaos', (req, res) => {
    res.send('Dying');
    setTimeout(() => process.exit(1), 500);
});

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

export { app, pool, redis };
