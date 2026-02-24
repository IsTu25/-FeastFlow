const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const cors = require('cors');
const client = require('prom-client');
const crypto = require('crypto');
const morgan = require('morgan');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key';
const PORT = process.env.PORT || 3000;

// Metrics setup
const register = new client.Registry();
const loginTotal = new client.Counter({ name: 'login_total', help: 'Total login attempts' });
const loginFailures = new client.Counter({ name: 'login_failures_total', help: 'Total login failures' });
const responseTime = new client.Histogram({ name: 'http_response_time_seconds', help: 'HTTP response time', buckets: [0.1, 0.5, 1, 2, 5] });
register.registerMetric(loginTotal);
register.registerMetric(loginFailures);
register.registerMetric(responseTime);

const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
const pool = new Pool({
  connectionString: process.env.DB_URL || 'postgresql://iut_user:iut_password@postgres:5432/iut_cafeteria'
});

// Init DB
async function initDB() {
  try {
    const client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS students (
        id VARCHAR(50) PRIMARY KEY,
        password_hash VARCHAR(255) NOT NULL
      );
    `);

    // Hash a placeholder password 'password'
    const pwdHash = crypto.createHash('sha256').update('password').digest('hex');
    await client.query(`
      INSERT INTO students (id, password_hash) 
      VALUES ('user123', $1) 
      ON CONFLICT (id) DO NOTHING;
    `, [pwdHash]);

    client.release();
    console.log("DB Initialized");
  } catch (err) {
    console.error("DB Error:", err);
  }
}
initDB();

// Middleware for response time
app.use((req, res, next) => {
  const end = responseTime.startTimer();
  res.on('finish', () => end());
  next();
});

// Rate limiting logic
async function checkRateLimit(studentId) {
  const key = `ratelimit:${studentId}`;
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, 60);
  }
  return current <= 3;
}

app.post('/login', async (req, res) => {
  loginTotal.inc();
  const { studentId, password } = req.body;
  if (!studentId || !password) {
    loginFailures.inc();
    return res.status(400).json({ error: 'Missing credentials' });
  }

  const isAllowed = await checkRateLimit(studentId);
  if (!isAllowed) {
    loginFailures.inc();
    return res.status(429).json({ error: 'Too many requests. Max 3 per minute.' });
  }

  try {
    const pwdHash = crypto.createHash('sha256').update(password).digest('hex');
    const result = await pool.query('SELECT * FROM students WHERE id = $1 AND password_hash = $2', [studentId, pwdHash]);

    if (result.rows.length === 0) {
      loginFailures.inc();
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ studentId }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, studentId });
  } catch (err) {
    loginFailures.inc();
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/chaos', (req, res) => { res.send('Dying'); setTimeout(() => process.exit(1), 500); });

app.get('/health', (req, res) => {
  // Check dependencies
  pool.query('SELECT 1')
    .then(() => redis.ping())
    .then(() => res.status(200).send('OK'))
    .catch(() => res.status(503).send('Service Unavailable'));
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Identity Provider running on port ${PORT}`));
}
module.exports = app;

