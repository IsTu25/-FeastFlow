import { startTracing } from './utils/tracing';
startTracing();

import express, { Request, Response, NextFunction } from 'express';
import { Server } from 'socket.io';
import http from 'http';
import Redis from 'ioredis';
import cors from 'cors';
import morgan from 'morgan';

import metrics from './utils/metrics';
import NotificationService from './services/notificationService';
import NotificationController from './controllers/notificationController';

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// SLO Tracking Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime();
    res.on('finish', () => {
        const diff = process.hrtime(start);
        const duration = diff[0] + diff[1] / 1e9;
        metrics.requestDuration.labels('notification-hub', req.method, req.path, res.statusCode.toString()).observe(duration);
    });
    next();
});

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

// Dependency Injection
const notificationService = new NotificationService(io, metrics);
const notificationController = new NotificationController(notificationService);

// Socket Handlers
io.on('connection', (socket) => notificationService.handleConnection(socket));

// Routes
app.post('/notify', (req: Request, res: Response) => notificationController.notify(req, res));

app.post('/chaos', (req: Request, res: Response) => {
    res.send('Dying');
    setTimeout(() => process.exit(1), 500);
});

app.get('/health', async (req: Request, res: Response) => {
    try {
        await redis.ping();
        res.status(200).send('OK');
    } catch (e) {
        res.status(503).send('Service Unavailable');
    }
});

app.get('/metrics', async (req: Request, res: Response) => {
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
});

if (require.main === module) {
    server.listen(PORT, () => console.log(`Notification Hub running on port ${PORT}`));
}

export default app;
