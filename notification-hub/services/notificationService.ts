import { Server, Socket } from 'socket.io';
import { BufferedNotification } from '../types';

export class NotificationService {
    private io: Server;
    private metrics: any;
    private userSockets: Record<string, string>;
    private notificationBuffer: Record<string, BufferedNotification[]>;

    constructor(io: Server, metrics: any) {
        this.io = io;
        this.metrics = metrics;
        this.userSockets = {};
        this.notificationBuffer = {};
    }

    handleConnection(socket: Socket) {
        const studentId = socket.handshake.query.studentId as string;
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

    private replayBuffer(studentId: string, socketId: string) {
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

    notify(studentId: string, orderId: string, status: string): boolean {
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

    private bufferNotification(studentId: string, orderId: string, status: string) {
        if (!this.notificationBuffer[studentId]) this.notificationBuffer[studentId] = [];
        this.notificationBuffer[studentId].push({ orderId, status, timestamp: Date.now() });

        // Limit buffer size
        if (this.notificationBuffer[studentId].length > 10) {
            this.notificationBuffer[studentId].shift();
        }
    }
}

export default NotificationService;
