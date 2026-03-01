import { startTracing } from './utils/tracing';
startTracing();

import express, { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import cors from 'cors';
import morgan from 'morgan';
import { Queue, QueueEvents } from 'bullmq';

import metrics from './utils/metrics';
import OrderService from './services/orderService';
import OrderController from './controllers/orderController';
import getOrderRoutes from './routes/orderRoutes';
import { Pool } from 'pg';
import { EventStoreService } from './services/eventStoreService';

const pool = new Pool({
    connectionString: process.env.DB_URL || 'postgresql://iut_user:iut_password@postgres:5432/iut_cafeteria',
    max: 200,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const PORT = process.env.PORT || 3000;
const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
export const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
export const kitchenQueue = new Queue('kitchen', { connection: redis });

// Dependency Injection
const eventStore = new EventStoreService(pool);
const orderService = new OrderService(redis, kitchenQueue, metrics, pool, eventStore);
const orderController = new OrderController(orderService);

// Finalize Saga Listener (Requirement 2)
const queueEvents = new QueueEvents('kitchen', { connection: redis });
queueEvents.on('completed', async ({ jobId }) => {
    console.log(`[QUEUE-EVENT] Job ${jobId} completed. Finalizing saga...`);
    try {
        const job = await kitchenQueue.getJob(jobId);
        if (job && job.data) {
            const { orderId, studentId } = job.data;
            await orderService.finalizeOrder(orderId, studentId);
            console.log(`[SAGA] Order ${orderId} finalized via QueueEvent`);
        } else {
            console.warn(`[SAGA] Could not find job data for jobId: ${jobId}. Searching by ID prefix...`);
            // Fallback: If job is removed from BullMQ, we might have lost the data
            // But we can try to find it in the event store if we had the orderId
        }
    } catch (e: any) {
        console.error("[SAGA] Completion listener error:", e.message);
    }
});

// Middleware: Response Time Tracking (SLO Tracking)
app.use((req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime();
    res.on('finish', () => {
        const diff = process.hrtime(start);
        const duration = diff[0] + diff[1] / 1e9;
        metrics.responseTime.labels(req.method, req.path, res.statusCode.toString()).observe(duration);
    });
    next();
});

// Routes
app.use('/', getOrderRoutes(orderController));

// Health & Metrics
app.get('/health', async (req: Request, res: Response) => {
    try {
        await redis.ping();
        res.status(200).send('OK');
    } catch (e: any) {
        res.status(503).send('Service Unavailable');
    }
});

app.get('/metrics', async (req: Request, res: Response) => {
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: `Path ${req.url} not found` });
});

if (require.main === module) {
    app.listen(PORT, () => console.log(`Order Gateway running on port ${PORT}`));
}
export default app;
