import { Pool, PoolClient } from 'pg';
import { StockItem } from '../types';

export class StockRepository {
    private pool: Pool;

    constructor(pool: Pool) {
        this.pool = pool;
    }

    async getClient(): Promise<PoolClient> {
        return await this.pool.connect();
    }

    async findItemById(client: PoolClient, itemId: string): Promise<StockItem | undefined> {
        const res = await client.query('SELECT id, stock, version FROM items WHERE id = $1', [itemId]);
        return res.rows[0];
    }

    async getAllItems(): Promise<StockItem[]> {
        const res = await this.pool.query('SELECT id, stock, version FROM items');
        return res.rows;
    }

    async updateStock(client: PoolClient, itemId: string, quantity: number, currentVersion: number): Promise<{ stock: number } | undefined> {
        const res = await client.query(
            'UPDATE items SET stock = stock - $1, version = version + 1 WHERE id = $2 AND version = $3 RETURNING stock',
            [quantity, itemId, currentVersion]
        );
        return res.rows[0];
    }

    async isOrderProcessed(client: PoolClient, orderId: string): Promise<boolean> {
        const res = await client.query('SELECT order_id FROM processed_orders WHERE order_id = $1 FOR UPDATE', [orderId]);
        return res.rows.length > 0;
    }

    async markOrderProcessed(client: PoolClient, orderId: string): Promise<void> {
        await client.query('INSERT INTO processed_orders (order_id) VALUES ($1)', [orderId]);
    }

    async initializeDatabase(): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS items (
                    id VARCHAR(50) PRIMARY KEY,
                    stock INTEGER NOT NULL,
                    version INTEGER NOT NULL
                );
            `);
            await client.query(`
                CREATE TABLE IF NOT EXISTS processed_orders (
                    order_id VARCHAR(50) PRIMARY KEY,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            await client.query(`
                INSERT INTO items (id, stock, version)
                VALUES ('iftar_box', 1000, 1)
                ON CONFLICT (id) DO NOTHING;
            `);
        } finally {
            client.release();
        }
    }
}

export default StockRepository;
