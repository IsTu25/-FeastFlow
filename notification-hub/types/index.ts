export interface NotificationPayload {
    orderId: string;
    studentId: string;
    status: string;
}

export interface BufferedNotification {
    orderId: string;
    status: string;
    timestamp: number;
}
