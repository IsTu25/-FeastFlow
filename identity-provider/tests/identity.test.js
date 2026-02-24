const request = require('supertest');

jest.mock('pg', () => {
    return {
        Pool: jest.fn(() => ({
            query: jest.fn().mockResolvedValue({ rows: [{ id: 'user123', password_hash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8' }] }),
            connect: jest.fn().mockResolvedValue({
                query: jest.fn().mockResolvedValue({}),
                release: jest.fn()
            })
        }))
    };
});

jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => ({
        incr: jest.fn().mockResolvedValue(1),
        expire: jest.fn(),
        ping: jest.fn()
    }));
});

const app = require('../index');

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
});
