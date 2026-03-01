-- FeastFlow PostgreSQL Seed Script
-- Runs automatically on first `docker compose up` via postgres init image
CREATE TABLE IF NOT EXISTS students (
    id VARCHAR(50) PRIMARY KEY,
    password_hash VARCHAR(255) NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
    id VARCHAR(50) PRIMARY KEY,
    stock INTEGER NOT NULL DEFAULT 100,
    version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS processed_orders (
    order_id VARCHAR(255) PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW()
);
-- Demo credentials: user123 / password (SHA-256 hash of "password")
INSERT INTO students (id, password_hash)
VALUES (
        'user123',
        '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'
    ) ON CONFLICT DO NOTHING;
INSERT INTO items (id, stock, version)
VALUES ('iftar_box', 10000, 1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS order_events (
    event_id SERIAL PRIMARY KEY,
    order_id VARCHAR(250) NOT NULL,
    service_name VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    payload JSONB,
    timestamp TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_order_events_order_id ON order_events(order_id);