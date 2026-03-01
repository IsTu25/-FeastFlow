import express, { Router } from 'express';
import { StockController } from '../controllers/stockController';

export default function getStockRoutes(stockController: StockController): Router {
    const router = express.Router();

    router.post('/deduct', (req, res) => stockController.deduct(req, res));
    router.post('/restore', (req, res) => stockController.restore(req, res));

    return router;
}
