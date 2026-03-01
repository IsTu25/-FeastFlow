import { StockRepository } from '../repositories/stockRepository';
import Redis from 'ioredis';
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('stock-service');

export class StockService {
    private stockRepository: StockRepository;
    private redis: Redis;
    private metrics: any;

    constructor(stockRepository: StockRepository, redis: Redis, metrics: any) {
        this.stockRepository = stockRepository;
        this.redis = redis;
        this.metrics = metrics;
    }

    async deductStock(itemId: string, quantity: number, orderId: string) {
        return await tracer.startActiveSpan('deductStock', async (span) => {
            span.setAttributes({ 'order.id': orderId, 'item.id': itemId, quantity });
            try {
                // 0. Cache-first check (Requirement: <2ms rejection for out-of-stock)
                const startCache = Date.now();
                const cachedStock = await this.redis.get(`stock:${itemId}`);
                const cacheDuration = (Date.now() - startCache);
                span.setAttribute('cache.duration_ms', cacheDuration);

                if (cachedStock !== null) {
                    if (this.metrics && this.metrics.cacheHits) {
                        this.metrics.cacheHits.inc();
                    }
                    const stock = parseInt(cachedStock);
                    if (stock < quantity) {
                        span.addEvent('cache-hit-rejection');
                        throw { status: 400, message: 'Out of stock (cached)' };
                    }
                    console.log(`✅ CACHE HIT: ${itemId}`);
                } else {
                    if (this.metrics && this.metrics.cacheMisses) {
                        this.metrics.cacheMisses.inc();
                    }
                    console.log(`❌ CACHE MISS: ${itemId}`);
                }

                const client = await this.stockRepository.getClient();
                try {
                    await client.query('BEGIN');

                    // 1. Idempotency Check
                    const alreadyProcessed = await this.stockRepository.isOrderProcessed(client, orderId);
                    if (alreadyProcessed) {
                        await client.query('COMMIT');
                        span.addEvent('already-processed');
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
                        span.addEvent('out-of-stock');
                        throw { status: 400, message: 'Out of stock' };
                    }

                    // 3. Optimistic Locking Update
                    const updatedItem = await this.stockRepository.updateStock(client, itemId, quantity, item.version);
                    if (!updatedItem) {
                        await client.query('ROLLBACK');
                        span.addEvent('conflict');
                        throw { status: 409, message: 'Concurrency conflict, try again' };
                    }

                    // 4. Record as processed
                    await this.stockRepository.markOrderProcessed(client, orderId);
                    await client.query('COMMIT');

                    // 5. Update Cache instead of deleting (Requirement: 90%+ hit rate)
                    const finalStockCount = updatedItem.stock;
                    await this.redis.setex(`stock:${itemId}`, 300, finalStockCount.toString());
                    console.log(`🔄 Cache updated: ${itemId} = ${finalStockCount}`);

                    if (this.metrics && this.metrics.stockDeductions) {
                        this.metrics.stockDeductions.inc();
                    }

                    span.setStatus({ code: SpanStatusCode.OK });
                    return { status: 'Success', remainingStock: finalStockCount };

                } catch (error: any) {
                    if (client) await client.query('ROLLBACK');
                    span.recordException(error);
                    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
                    throw error;
                } finally {
                    if (client) client.release();
                }
            } finally {
                span.end();
            }
        });
    }

    async restoreStock(itemId: string, quantity: number, orderId: string) {
        return await tracer.startActiveSpan('restoreStock', async (span) => {
            span.setAttributes({ 'order.id': orderId, 'item.id': itemId, quantity });
            const client = await this.stockRepository.getClient();
            try {
                await client.query('BEGIN');

                // 1. Check if we actually processed this order
                const alreadyProcessed = await this.stockRepository.isOrderProcessed(client, orderId);
                if (!alreadyProcessed) {
                    await client.query('COMMIT');
                    return { status: 'Nothing to restore' };
                }

                // 2. Increment stock directly (compensating)
                const res = await client.query(
                    'UPDATE items SET stock = stock + $1, version = version + 1 WHERE id = $2 RETURNING stock',
                    [quantity, itemId]
                );

                // 3. Remove idempotency record
                await client.query('DELETE FROM processed_orders WHERE order_id = $1', [orderId]);

                await client.query('COMMIT');

                // 4. Update Cache (User Fix Part 2)
                if (res.rows[0]) {
                    const newStock = res.rows[0].stock;
                    await this.redis.setex(`stock:${itemId}`, 300, newStock.toString());
                    console.log(`🔄 Cache updated (restore): ${itemId} = ${newStock}`);
                }

                span.setStatus({ code: SpanStatusCode.OK });
                return { status: 'Restored' };
            } catch (error: any) {
                if (client) await client.query('ROLLBACK');
                span.recordException(error);
                span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
                throw error;
            } finally {
                if (client) client.release();
                span.end();
            }
        });
    }
}

export default StockService;
