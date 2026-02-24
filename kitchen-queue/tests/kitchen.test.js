const request = require('supertest');

jest.mock('bullmq', () => {
    return {
        Queue: jest.fn().mockImplementation(() => ({
            add: jest.fn().mockResolvedValue(true)
        })),
        Worker: jest.fn()
    };
});

jest.mock('axios', () => ({
    post: jest.fn().mockResolvedValue({ data: { success: true } })
}));

jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => ({
        ping: jest.fn().mockResolvedValue('PONG')
    }));
});

const app = require('../index');

describe('Kitchen Queue Post Process Tests', () => {
    it('should add order to queue successfully', async () => {
        const res = await request(app)
            .post('/process')
            .send({ orderId: 'ord-1234', itemId: 'iftar_box', quantity: 1, studentId: 'user123' });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('Order accepted to Kitchen');
    });

    it('should reject missing orderId', async () => {
        const res = await request(app)
            .post('/process')
            .send({ itemId: 'iftar_box' });

        expect(res.statusCode).toBe(400);
        expect(res.text).toBe('Missing orderId');
    });
});
