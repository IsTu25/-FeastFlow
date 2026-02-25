class StockController {
    constructor(stockService) {
        this.stockService = stockService;
    }

    async deduct(req, res) {
        const { itemId, quantity, orderId } = req.body;
        if (!itemId || !quantity || !orderId) {
            return res.status(400).send('Missing fields');
        }

        try {
            const result = await this.stockService.deductStock(itemId, quantity, orderId);
            res.json({ orderId, ...result });
        } catch (error) {
            console.error("Deduct error:", error);
            res.status(error.status || 500).json({ error: error.message || 'Internal Server Error' });
        }
    }
}

module.exports = StockController;
