import { startTracing } from './utils/tracing';
startTracing();

import express, { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';
import cors from 'cors';
import morgan from 'morgan';
import crypto from 'crypto';

import metrics from './utils/metrics';
import UserRepository from './repositories/userRepository';
import AuthService from './services/authService';
import AuthController from './controllers/authController';
import getAuthRoutes from './routes/authRoutes';

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const PORT = process.env.PORT || 3000;
const pool = new Pool({
    connectionString: process.env.DB_URL || 'postgresql://iut_user:iut_password@postgres:5432/iut_cafeteria',
    max: 100,
    idleTimeoutMillis: 30000,
});
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

// Dependency Injection
const userRepository = new UserRepository(pool);
const authService = new AuthService(userRepository, redis, metrics);
const authController = new AuthController(authService);

// Initialize DB
const initialHash = crypto.createHash('sha256').update('password').digest('hex');
userRepository.initializeDatabase(initialHash).catch(console.error);

// Response Time Middleware (SLO Tracking)
app.use((req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime();
    res.on('finish', () => {
        const diff = process.hrtime(start);
        const duration = diff[0] + diff[1] / 1e9;
        metrics.requestDuration.labels('identity-provider', req.method, req.path, res.statusCode.toString()).observe(duration);
    });
    next();
});

// Debug Logger
app.use((req, res, next) => {
    console.log(`[DEBUG] ${req.method} ${req.url}`);
    next();
});

// Routes
app.use('/', getAuthRoutes(authController, redis));

// Explicit debug route
app.post('/login-direct', (req, res) => {
    console.log('[DEBUG] Direct login hit');
    authController.login(req, res);
});

app.post('/chaos', (req: Request, res: Response) => {
    res.send('Dying');
    setTimeout(() => process.exit(1), 500);
});

app.get('/health', (req: Request, res: Response) => {
    pool.query('SELECT 1')
        .then(() => redis.ping())
        .then(() => res.status(200).send('OK'))
        .catch(() => res.status(503).send('Service Unavailable'));
});

app.get('/metrics', async (req: Request, res: Response) => {
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
});

if (require.main === module) {
    app.listen(PORT, () => console.log(`Identity Provider running on port ${PORT}`));
}

export default app;
