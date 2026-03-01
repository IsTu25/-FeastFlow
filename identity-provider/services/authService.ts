import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Redis from 'ioredis';
import { UserRepository } from '../repositories/userRepository';
import { AuthResponse } from '../types';

const JWT_SECRETS = (process.env.JWT_SECRET || 'super_secret_jwt_key').split(',');
const PRIMARY_SECRET = JWT_SECRETS[0];

export class AuthService {
    private userRepository: UserRepository;
    private redis: Redis;
    private metrics: any;

    constructor(userRepository: UserRepository, redis: Redis, metrics: any) {
        this.userRepository = userRepository;
        this.redis = redis;
        this.metrics = metrics;
    }

    async login(studentId: string, password: string): Promise<AuthResponse | null> {
        const user = await this.userRepository.findByStudentId(studentId);
        if (!user) {
            this.metrics.loginTotal.labels('failure').inc();
            return null;
        }

        const hash = crypto.createHash('sha256').update(password).digest('hex');
        if (hash !== user.passwordHash) {
            this.metrics.loginTotal.labels('failure').inc();
            return null;
        }

        const token = jwt.sign({ studentId: user.studentId, role: user.role || 'student' }, PRIMARY_SECRET, { expiresIn: '1h' });

        // Cache session status in Redis
        await this.redis.set(`session:${studentId}`, 'active', 'EX', 3600);

        this.metrics.loginTotal.labels('success').inc();
        return { token, studentId: user.studentId };
    }
}

export default AuthService;
