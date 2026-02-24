const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const Redis = require('ioredis');
const cors = require('cors');
const client = require('prom-client');
const morgan = require('morgan');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

// Metrics
const register = new client.Registry();
const notificationsSent = new client.Counter({ name: 'notifications_sent_total', help: 'Total notifications sent' });
register.registerMetric(notificationsSent);

// Manage user socket mapping and missed notification buffer
const userSockets = {};
const notificationBuffer = {}; // studentId -> [{ orderId, status, timestamp }]

io.on('connection', (socket) => {
    const studentId = socket.handshake.query.studentId;
    if (studentId) {
        userSockets[studentId] = socket.id;

        // Replay missed notifications
        if (notificationBuffer[studentId]) {
            notificationBuffer[studentId].forEach(notif => {
                io.to(socket.id).emit('orderStatus', { orderId: notif.orderId, status: notif.status });
            });
            delete notificationBuffer[studentId];
        }
    }

    socket.on('disconnect', () => {
        if (studentId) {
            delete userSockets[studentId];
        }
    });
});

app.post('/notify', (req, res) => {
    const { orderId, studentId, status } = req.body;
    if (!studentId || !status) return res.status(400).send('Missing args');

    const socketId = userSockets[studentId];
    if (socketId) {
        io.to(socketId).emit('orderStatus', { orderId, status });
        notificationsSent.inc();
    } else {
        console.warn(`Student ${studentId} not connected for notification ${status}. Buffering...`);
        if (!notificationBuffer[studentId]) notificationBuffer[studentId] = [];
        notificationBuffer[studentId].push({ orderId, status, timestamp: Date.now() });
        // Optional: limit buffer size per student
        if (notificationBuffer[studentId].length > 10) notificationBuffer[studentId].shift();
    }

    res.status(200).json({ success: true });
});

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
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

if (require.main === module) {
    server.listen(PORT, () => console.log(`Notification Hub running on port ${PORT}`));
}
module.exports = app;
