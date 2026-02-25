const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key';

class AuthService {
    constructor(userRepository, redis, metrics) {
        this.userRepository = userRepository;
        this.redis = redis;
        this.metrics = metrics;
    }

    async login(studentId, password) {
        this.metrics.loginTotal.inc();

        const isAllowed = await this.checkRateLimit(studentId);
        if (!isAllowed) {
            this.metrics.loginFailures.inc();
            throw { status: 429, message: 'Too many requests. Max 3 per minute.' };
        }

        const pwdHash = this.hashPassword(password);
        const user = await this.userRepository.findUserByIdAndPassword(studentId, pwdHash);

        if (!user) {
            this.metrics.loginFailures.inc();
            throw { status: 401, message: 'Invalid credentials' };
        }

        const token = jwt.sign({ studentId }, JWT_SECRET, { expiresIn: '1h' });
        return { token, studentId };
    }

    async checkRateLimit(studentId) {
        const key = `ratelimit:${studentId}`;
        const current = await this.redis.incr(key);
        if (current === 1) {
            await this.redis.expire(key, 60);
        }
        return current <= 3;
    }

    hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }
}

module.exports = AuthService;
