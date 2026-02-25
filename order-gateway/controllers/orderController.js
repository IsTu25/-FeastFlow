class OrderController {
    constructor(orderService) {
        this.orderService = orderService;
    }

    async createOrder(req, res) {
        const { itemId, quantity = 1, idempotencyKey } = req.body;
        const studentId = req.user.studentId;

        try {
            const result = await this.orderService.placeOrder(itemId, quantity, idempotencyKey, studentId);
            res.json({
                message: 'Order accepted and queued',
                ...result
            });
        } catch (error) {
            res.status(error.status || 500).json({
                error: error.message || 'Failed to process order',
                details: error.details
            });
        }
    }
}

module.exports = OrderController;
