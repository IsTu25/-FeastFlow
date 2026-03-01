import { startTracing } from './utils/tracing';
startTracing();

import express, { Request, Response } from 'express';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import cors from 'cors';
import morgan from 'morgan';

import metrics from './utils/metrics';
import KitchenService from './services/kitchenService';
import './types'; // To load global type declaration

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(morgan('dev'));

// SLO Tracking Middleware
app.use((req, res, next) => {
    const start = process.hrtime();
    res.on('finish', () => {
        const diff = process.hrtime(start);
        const duration = diff[0] + diff[1] / 1e9;
        metrics.requestDuration.labels('kitchen-queue', req.method, req.path, res.statusCode.toString()).observe(duration);
    });
    next();
});

const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

// --- Chaos Engineering State ---
global.chaosDelayMs = 0;

// Dependency Injection
const kitchenService = new KitchenService(metrics);

// Worker
const worker = new Worker('kitchen', async job => {
    await kitchenService.processOrder(job);
}, {
    connection,
    concurrency: 10
});

worker.on('failed', (job, err) => {
    if (job) {
        console.error(`[DLQ] Job ${job.id} for order ${job.data.orderId} failed after ${job.attemptsMade} attempts:`, err.message);
        // Here you could also push to a persistent "Dead Letter" collection in DB or a different Redis list
    }
});

// --- Chaos Endpoints ---
app.post('/chaos', (req: Request, res: Response) => {
    global.chaosDelayMs = req.body.delay || 0;
    metrics.chaosDelay.set(global.chaosDelayMs);
    res.json({ mode: global.chaosDelayMs > 0 ? 'SLOW' : 'NORMAL', delayMs: global.chaosDelayMs });
});

// Persistent metric reporting
setInterval(() => {
    metrics.chaosDelay.set(global.chaosDelayMs);
}, 5000);

app.get('/chaos', (req: Request, res: Response) => {
    res.json({ mode: global.chaosDelayMs > 0 ? 'SLOW' : 'NORMAL', delayMs: global.chaosDelayMs });
});

// --- Original Chaos "Kill" endpoint renamed to /kill ---
app.post('/kill', (req: Request, res: Response) => {
    res.send('Dying');
    setTimeout(() => process.exit(1), 500);
});

app.get('/health', async (req: Request, res: Response) => {
    try {
        await connection.ping();
        res.status(200).json({
            status: 'OK',
            chaos: global.chaosDelayMs > 0 ? 'SLOW' : 'NORMAL',
            chaosDelayMs: global.chaosDelayMs
        });
    } catch (e) {
        res.status(503).send('Service Unavailable');
    }
});

app.get('/metrics', async (req: Request, res: Response) => {
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
});

if (require.main === module) {
    app.listen(PORT, () => console.log(`Kitchen Queue running on port ${PORT}`));
}
export default app;
