const express = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');
const cors = require('cors');
const client = require('prom-client');
const morgan = require('morgan');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const PORT = process.env.PORT || 3000;
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
const pool = new Pool({
    connectionString: process.env.DB_URL || 'postgresql://iut_user:iut_password@postgres:5432/iut_cafeteria'
});

// Metrics
const register = new client.Registry();
const stockDeductions = new client.Counter({ name: 'stock_deductions_total', help: 'Total stock deductions' });
register.registerMetric(stockDeductions);

// Init DB
async function initDB() {
    try {
        const client = await pool.connect();
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

        // Seed some initial item: 'iftar_box'
        await client.query(`
      INSERT INTO items (id, stock, version)
      VALUES ('iftar_box', 100, 1)
      ON CONFLICT (id) DO NOTHING;
    `);

        // update cache
        await redis.set('stock:iftar_box', 100);
        client.release();
    } catch (err) {
        console.error(err);
    }
}
initDB();

app.post('/deduct', async (req, res) => {
    const { itemId, quantity, orderId } = req.body;
    if (!itemId || !quantity || !orderId) return res.status(400).send('Missing fields');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Idempotency check
        const checkOrder = await client.query('SELECT order_id FROM processed_orders WHERE order_id = $1 FOR UPDATE', [orderId]);
        if (checkOrder.rows.length > 0) {
            await client.query('COMMIT');
            return res.status(200).json({ status: 'Already processed' });
        }

        // Attempt to read current item
        const itemRes = await client.query('SELECT stock, version FROM items WHERE id = $1', [itemId]);
        if (itemRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Item not found' });
        }

        const item = itemRes.rows[0];
        if (item.stock < quantity) {
            await client.query('ROLLBACK');
            await redis.set(`stock:${itemId}`, 0);
            return res.status(400).json({ error: 'Out of stock' });
        }

        // Optimistic Locking: SQL Update where version matches
        const qty_int = parseInt(quantity);
        const updatedRes = await client.query(
            'UPDATE items SET stock = stock - $1, version = version + 1 WHERE id = $2 AND version = $3 RETURNING stock',
            [qty_int, itemId, item.version]
        );

        if (updatedRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Concurrency conflict, try again' });
        }

        // Mark as processed
        await client.query('INSERT INTO processed_orders (order_id) VALUES ($1)', [orderId]);
        await client.query('COMMIT');

        const remainingStock = updatedRes.rows[0].stock;
        await redis.set(`stock:${itemId}`, remainingStock);
        stockDeductions.inc();

        res.json({ orderId, status: 'Success', remainingStock });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
});

app.post('/chaos', (req, res) => { res.send('Dying'); setTimeout(() => process.exit(1), 500); });

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        await redis.ping();
        res.status(200).send('OK');
    } catch (e) {
        res.status(503).send('Service Unavailable');
    }
});

app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

if (require.main === module) {
    app.listen(PORT, () => console.log(`Stock Service running on port ${PORT}`));
}
module.exports = { app, pool, redis };

