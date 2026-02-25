class StockRepository {
    constructor(pool) {
        this.pool = pool;
    }

    async getClient() {
        return await this.pool.connect();
    }

    async findItemById(client, itemId) {
        const res = await client.query('SELECT stock, version FROM items WHERE id = $1', [itemId]);
        return res.rows[0];
    }

    async updateStock(client, itemId, quantity, currentVersion) {
        const res = await client.query(
            'UPDATE items SET stock = stock - $1, version = version + 1 WHERE id = $2 AND version = $3 RETURNING stock',
            [quantity, itemId, currentVersion]
        );
        return res.rows[0];
    }

    async isOrderProcessed(client, orderId) {
        const res = await client.query('SELECT order_id FROM processed_orders WHERE order_id = $1 FOR UPDATE', [orderId]);
        return res.rows.length > 0;
    }

    async markOrderProcessed(client, orderId) {
        await client.query('INSERT INTO processed_orders (order_id) VALUES ($1)', [orderId]);
    }

    async initializeDatabase() {
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
                VALUES ('iftar_box', 100, 1)
                ON CONFLICT (id) DO NOTHING;
            `);
        } finally {
            client.release();
        }
    }
}

module.exports = StockRepository;
