const request = require('supertest');

jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => ({
        ping: jest.fn().mockResolvedValue('PONG')
    }));
});

jest.mock('socket.io', () => {
    return {
        Server: jest.fn().mockImplementation(() => {
            return {
                on: jest.fn(),
                to: jest.fn().mockReturnValue({ emit: jest.fn() })
            };
        })
    };
});

const app = require('../index');

describe('Notification Hub Endpoints Tests', () => {
    it('should receive notification post correctly', async () => {
        const res = await request(app)
            .post('/notify')
            .send({ orderId: 'ord-1234', studentId: 'user123', status: 'Confirmed' });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('should reject missing args', async () => {
        const res = await request(app)
            .post('/notify')
            .send({ status: 'Confirmed' }); // Missing studentId

        expect(res.statusCode).toBe(400);
        expect(res.text).toBe('Missing args');
    });
});
