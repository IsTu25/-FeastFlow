import express, { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { OrderController } from '../controllers/orderController';

export function getOrderRoutes(orderController: OrderController): Router {
    const router = express.Router();

    // Replay Endpoint (Requirement 3)
    router.get('/history/:orderId', authenticateToken, (req: Request, res: Response, next: NextFunction) => {
        orderController.replayOrder(req, res).catch(next);
    });

    // Event Sourcing & Replay (Requirement 3)
    router.get('/replay/time', authenticateToken, (req: Request, res: Response, next: NextFunction) => {
        orderController.replayByTime(req, res).catch(next);
    });

    router.get('/events/:orderId', authenticateToken, (req: Request, res: Response, next: NextFunction) => {
        orderController.getEvents(req, res).catch(next);
    });

    router.post('/', authenticateToken, (req: Request, res: Response, next: NextFunction) => {
        orderController.createOrder(req, res).catch(next);
    });

    return router;
}

export default getOrderRoutes;
