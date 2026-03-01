import { Request, Response } from 'express';
import { StockService } from '../services/stockService';
import { DeductRequest } from '../types';

export class StockController {
    private stockService: StockService;

    constructor(stockService: StockService) {
        this.stockService = stockService;
    }

    async deduct(req: Request, res: Response) {
        const { itemId, quantity, orderId } = req.body as DeductRequest;
        if (!itemId || !quantity || !orderId) {
            return res.status(400).send('Missing fields');
        }

        try {
            const result = await this.stockService.deductStock(itemId, quantity, orderId);
            res.json({ orderId, ...result });
        } catch (error: any) {
            console.error("Deduct error:", error);
            res.status(error.status || 500).json({ error: error.message || 'Internal Server Error' });
        }
    }

    async restore(req: Request, res: Response) {
        const { itemId, quantity, orderId } = req.body as DeductRequest;
        if (!itemId || !quantity || !orderId) {
            return res.status(400).send('Missing fields');
        }

        try {
            const result = await this.stockService.restoreStock(itemId, quantity, orderId);
            res.json({ orderId, ...result });
        } catch (error: any) {
            console.error("Restore error:", error);
            res.status(error.status || 500).json({ error: error.message || 'Internal Server Error' });
        }
    }
}

export default StockController;
