import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { AuthController } from '../controllers/authController';

import { rateLimitHits } from '../utils/metrics';

export default function getAuthRoutes(authController: AuthController, redis: Redis): Router {
    const router = express.Router();

    const isTest = process.env.NODE_ENV === 'test';

    const loginLimiter = rateLimit({
        store: isTest ? undefined : new RedisStore({
            // @ts-expect-error - ioredis is compatible but types might be slightly off
            sendCommand: (...args: string[]) => {
                const [command, ...params] = args;
                return redis.call(command, ...params);
            },
            prefix: 'rate-limit:login:',
        }),
        windowMs: 60 * 1000, // 1 minute
        max: 3, // 3 attempts
        keyGenerator: (req) => req.body.studentId || req.ip,
        handler: (req, res) => {
            rateLimitHits.inc({ endpoint: '/login', student_id: req.body.studentId || 'unknown' });
            res.status(429).json({
                error: 'Too many login attempts',
                message: 'Please try again after 60 seconds',
                retryAfter: 60
            });
        },
        standardHeaders: true,
        legacyHeaders: false,
    });

    router.post('/login', loginLimiter, (req, res) => authController.login(req, res));

    return router;
}
