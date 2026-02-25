const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const STOCK_SERVICE_URL = process.env.STOCK_SERVICE_URL || 'http://stock-service:3000';

class OrderService {
    constructor(redis, kitchenQueue, metrics) {
        this.redis = redis;
        this.kitchenQueue = kitchenQueue;
        this.metrics = metrics;
    }

    async placeOrder(itemId, quantity, idempotencyKey, studentId) {
        const orderId = idempotencyKey || uuidv4();

        // 1. High-Speed Cache Stock Check
        try {
            const cacheStock = await this.redis.get(`stock:${itemId}`);
            if (cacheStock !== null && parseInt(cacheStock, 10) <= 0) {
                this.metrics.orderFailures.labels('out_of_stock_cache').inc();
                throw { status: 400, message: 'Out of stock (Cache Reject)' };
            }
        } catch (e) {
            if (e.status) throw e;
            console.warn("Cache check failed, proceeding to stock service", e.message);
        }

        try {
            // 2. Transact with Stock Service
            const stockResponse = await axios.post(`${STOCK_SERVICE_URL}/deduct`, {
                itemId,
                quantity,
                orderId,
            });

            if (stockResponse.status !== 200) {
                throw new Error('Stock deduction failed');
            }

            // 3. Push to Kitchen Queue
            await this.kitchenQueue.add('cook', {
                orderId,
                itemId,
                quantity,
                studentId
            });

            this.metrics.orderCounter.inc();

            return {
                orderId,
                status: 'Processing',
                details: 'Order has been placed in the kitchen queue asynchronously.'
            };

        } catch (error) {
            this.metrics.orderFailures.labels('service_failure').inc();
            console.error("Order processing failed:", error.message);
            const status = error.response ? error.response.status : (error.status || 500);
            const message = error.response ? (error.response.data.error || error.message) : (error.message || 'Failed to process order');
            throw { status, message };
        }
    }
}

module.exports = OrderService;
