class NotificationController {
    constructor(notificationService) {
        this.notificationService = notificationService;
    }

    notify(req, res) {
        const { orderId, studentId, status } = req.body;
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

module.exports = NotificationController;
