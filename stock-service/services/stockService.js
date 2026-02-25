class StockService {
    constructor(stockRepository, redis, metrics) {
        this.stockRepository = stockRepository;
        this.redis = redis;
        this.metrics = metrics;
    }

    async deductStock(itemId, quantity, orderId) {
        const client = await this.stockRepository.getClient();
        try {
            await client.query('BEGIN');

            // 1. Idempotency Check
            const alreadyProcessed = await this.stockRepository.isOrderProcessed(client, orderId);
            if (alreadyProcessed) {
                await client.query('COMMIT');
                return { status: 'Already processed' };
            }

            // 2. Fetch current state
            const item = await this.stockRepository.findItemById(client, itemId);
            if (!item) {
                await client.query('ROLLBACK');
                throw { status: 404, message: 'Item not found' };
            }

            if (item.stock < quantity) {
                await client.query('ROLLBACK');
                await this.redis.set(`stock:${itemId}`, 0);
                throw { status: 400, message: 'Out of stock' };
            }

            // 3. Optimistic Locking Update
            const updatedItem = await this.stockRepository.updateStock(client, itemId, quantity, item.version);
            if (!updatedItem) {
                await client.query('ROLLBACK');
                throw { status: 409, message: 'Concurrency conflict, try again' };
            }

            // 4. Record as processed
            await this.stockRepository.markOrderProcessed(client, orderId);
            await client.query('COMMIT');

            // 5. Update Cache
            await this.redis.set(`stock:${itemId}`, updatedItem.stock);

            if (this.metrics && this.metrics.stockDeductions) {
                this.metrics.stockDeductions.inc();
            }

            return { status: 'Success', remainingStock: updatedItem.stock };

        } catch (error) {
            if (client) await client.query('ROLLBACK');
            throw error;
        } finally {
            if (client) client.release();
        }
    }
}

module.exports = StockService;
