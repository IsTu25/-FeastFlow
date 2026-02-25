const express = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');
const cors = require('cors');
const morgan = require('morgan');
const crypto = require('crypto');

const metrics = require('./utils/metrics');
const UserRepository = require('./repositories/userRepository');
const AuthService = require('./services/authService');
const AuthController = require('./controllers/authController');
const getAuthRoutes = require('./routes/authRoutes');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const PORT = process.env.PORT || 3000;
const pool = new Pool({
  connectionString: process.env.DB_URL || 'postgresql://iut_user:iut_password@postgres:5432/iut_cafeteria'
});
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

// Dependency Injection
const userRepository = new UserRepository(pool);
const authService = new AuthService(userRepository, redis, metrics);
const authController = new AuthController(authService);

// Initialize DB
const initialHash = crypto.createHash('sha256').update('password').digest('hex');
userRepository.initializeDatabase(initialHash).catch(console.error);

// Response Time Middleware
app.use((req, res, next) => {
  const end = metrics.responseTime.startTimer();
  res.on('finish', () => end());
  next();
});

// Routes
app.use('/', getAuthRoutes(authController));

app.post('/chaos', (req, res) => { res.send('Dying'); setTimeout(() => process.exit(1), 500); });

app.get('/health', (req, res) => {
  pool.query('SELECT 1')
    .then(() => redis.ping())
    .then(() => res.status(200).send('OK'))
    .catch(() => res.status(503).send('Service Unavailable'));
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Identity Provider running on port ${PORT}`));
}
module.exports = app;
