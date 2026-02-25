const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const Redis = require('ioredis');
const cors = require('cors');
const morgan = require('morgan');

const metrics = require('./utils/metrics');
const NotificationService = require('./services/notificationService');
const NotificationController = require('./controllers/notificationController');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

// Dependency Injection
const notificationService = new NotificationService(io, metrics);
const notificationController = new NotificationController(notificationService);

// Socket Handlers
io.on('connection', (socket) => notificationService.handleConnection(socket));

// Routes
app.post('/notify', (req, res) => notificationController.notify(req, res));

app.post('/chaos', (req, res) => { res.send('Dying'); setTimeout(() => process.exit(1), 500); });

app.get('/health', async (req, res) => {
    try {
        await redis.ping();
        res.status(200).send('OK');
    } catch (e) {
        res.status(503).send('Service Unavailable');
    }
});

app.get('/metrics', async (req, res) => {
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
});

if (require.main === module) {
    server.listen(PORT, () => console.log(`Notification Hub running on port ${PORT}`));
}
module.exports = app;
