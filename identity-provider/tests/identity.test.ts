import request from 'supertest';
import app from '../index';

jest.mock('pg', () => {
    return {
        Pool: jest.fn(() => ({
            query: jest.fn().mockResolvedValue({
                rows: [{
                    studentId: 'user123',
                    passwordHash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
                    role: 'student'
                }]
            }),
            connect: jest.fn().mockResolvedValue({
                query: jest.fn().mockResolvedValue({}),
                release: jest.fn()
            })
        }))
    };
});

jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => ({
        set: jest.fn().mockResolvedValue('OK'),
        get: jest.fn().mockResolvedValue(null),
        ping: jest.fn().mockResolvedValue('PONG'),
        on: jest.fn(),
        call: jest.fn().mockResolvedValue(1), // Mock result for redis commands
    }));
});

describe('Identity Provider Tests', () => {
    it('should login successfully and return token', async () => {
        const res = await request(app)
            .post('/login')
            .send({ studentId: 'user123', password: 'password' });

        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body.studentId).toBe('user123');
    });

    it('should reject missing credentials', async () => {
        const res = await request(app)
            .post('/login')
            .send({ password: 'password' }); // Missing studentId

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('Missing credentials');
    });

    it('should rate limit after 3 attempts', async () => {
        // Attempt 1
        await request(app).post('/login').send({ studentId: 'ratelimit', password: 'wrong' });
        // Attempt 2
        await request(app).post('/login').send({ studentId: 'ratelimit', password: 'wrong' });
        // Attempt 3
        await request(app).post('/login').send({ studentId: 'ratelimit', password: 'wrong' });

        // Attempt 4 should be rated limited
        const res = await request(app)
            .post('/login')
            .send({ studentId: 'ratelimit', password: 'wrong' });

        expect(res.statusCode).toBe(429);
        expect(res.body.error).toBe('Too many login attempts');
    });
});
