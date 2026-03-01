import request from 'supertest';
import { pool, redis, app } from '../index';

jest.mock('pg', () => {
    const mClient = {
        query: jest.fn(),
        release: jest.fn()
    };
    return {
        Pool: jest.fn(() => ({
            connect: jest.fn().mockResolvedValue(mClient),
            query: jest.fn(),
            end: jest.fn().mockResolvedValue(undefined)
        }))
    };
});

jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => ({
        set: jest.fn(),
        get: jest.fn(),
        ping: jest.fn(),
        on: jest.fn(),
        quit: jest.fn()
    }));
});

describe('Stock Service Deduction Logic Tests', () => {
    afterAll(async () => {
        await pool.end();
        await redis.quit();
    });

    it('should deduct stock successfully', async () => {
        const mClient = await pool.connect();

        (mClient.query as jest.Mock).mockImplementation((q: string) => {
            if (q.includes('SELECT order_id FROM processed_orders')) return Promise.resolve({ rows: [] });
            if (q.includes('SELECT id, stock, version FROM items')) return Promise.resolve({ rows: [{ id: 'iftar_box', stock: 10, version: 1 }] });
            if (q.includes('UPDATE items SET stock')) return Promise.resolve({ rows: [{ stock: 9 }] });
            return Promise.resolve({ rows: [] });
        });

        const res = await request(app).post('/deduct').send({ itemId: 'iftar_box', quantity: 1, orderId: 'test1' });
        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('Success');
        expect(res.body.remainingStock).toBe(9);
    });

    it('should reject if out of stock', async () => {
        const mClient = await pool.connect();

        (mClient.query as jest.Mock).mockImplementation((q: string) => {
            if (q.includes('SELECT order_id FROM processed_orders')) return Promise.resolve({ rows: [] });
            if (q.includes('SELECT id, stock, version FROM items')) return Promise.resolve({ rows: [{ id: 'iftar_box', stock: 0, version: 1 }] });
            return Promise.resolve({ rows: [] });
        });

        const res = await request(app).post('/deduct').send({ itemId: 'iftar_box', quantity: 1, orderId: 'test2' });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('Out of stock');
    });
});
