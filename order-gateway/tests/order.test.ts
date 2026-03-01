import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../index';

jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => ({
        get: jest.fn().mockResolvedValue('0'), // For Out of Stock test
        ping: jest.fn().mockResolvedValue('PONG')
    }));
});
jest.mock('axios');

describe('Order Gateway Validation Tests', () => {
    it('should reject unauthenticated requests with 401', async () => {
        const res = await request(app).post('/order').send({ itemId: 'iftar_box' });
        expect(res.statusCode).toBe(401);
    });

    it('should reject instantly if cache says out of stock', async () => {
        // Fake JWT Token
        const token = jwt.sign({ studentId: '123' }, process.env.JWT_SECRET || 'super_secret_jwt_key');
        const res = await request(app).post('/order')
            .set('Authorization', `Bearer ${token}`)
            .send({ itemId: 'iftar_box' });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('Out of stock (Cache Reject)');
    });
});
