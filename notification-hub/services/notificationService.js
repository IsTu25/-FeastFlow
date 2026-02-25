class NotificationService {
    constructor(io, metrics) {
        this.io = io;
        this.metrics = metrics;
        this.userSockets = {};
        this.notificationBuffer = {}; // studentId -> [{ orderId, status, timestamp }]
    }

    handleConnection(socket) {
        const studentId = socket.handshake.query.studentId;
        if (studentId) {
            this.userSockets[studentId] = socket.id;
            this.replayBuffer(studentId, socket.id);
        }

        socket.on('disconnect', () => {
            if (studentId) {
                delete this.userSockets[studentId];
            }
        });
    }

    replayBuffer(studentId, socketId) {
        if (this.notificationBuffer[studentId]) {
            this.notificationBuffer[studentId].forEach(notif => {
                this.io.to(socketId).emit('orderStatus', {
                    orderId: notif.orderId,
                    status: notif.status
                });
            });
            delete this.notificationBuffer[studentId];
        }
    }

    notify(studentId, orderId, status) {
        const socketId = this.userSockets[studentId];
        if (socketId) {
            this.io.to(socketId).emit('orderStatus', { orderId, status });
            this.metrics.notificationsSent.inc();
            return true;
        } else {
            this.bufferNotification(studentId, orderId, status);
            return false;
        }
    }

    bufferNotification(studentId, orderId, status) {
        if (!this.notificationBuffer[studentId]) this.notificationBuffer[studentId] = [];
        this.notificationBuffer[studentId].push({ orderId, status, timestamp: Date.now() });

        // Limit buffer size
        if (this.notificationBuffer[studentId].length > 10) {
            this.notificationBuffer[studentId].shift();
        }
    }
}

module.exports = NotificationService;
