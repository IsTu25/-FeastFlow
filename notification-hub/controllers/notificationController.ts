import { Request, Response } from 'express';
import { NotificationService } from '../services/notificationService';
import { NotificationPayload } from '../types';

export class NotificationController {
    private notificationService: NotificationService;

    constructor(notificationService: NotificationService) {
        this.notificationService = notificationService;
    }

    notify(req: Request, res: Response) {
        const { orderId, studentId, status } = req.body as NotificationPayload;
        if (!studentId || !status) {
            return res.status(400).send('Missing args');
        }

        const handled = this.notificationService.notify(studentId, orderId, status);

        res.status(200).json({
            success: true,
            buffered: !handled
        });
    }
}

export default NotificationController;
