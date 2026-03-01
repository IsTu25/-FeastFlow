import { Request, Response } from 'express';
import { OrderService } from '../services/orderService';

export class OrderController {
    private orderService: OrderService;

    constructor(orderService: OrderService) {
        this.orderService = orderService;
        this.createOrder = this.createOrder.bind(this);
        this.replayOrder = this.replayOrder.bind(this);
        this.getEvents = this.getEvents.bind(this);
        this.replayByTime = this.replayByTime.bind(this);
    }

    async createOrder(req: Request, res: Response): Promise<void> {
        const itemId = req.body.itemId || req.body.item;
        const quantity = req.body.quantity || 1;
        const idempotencyKey = req.body.idempotencyKey as string | undefined;
        const studentId = String((req as any).user?.studentId || 'anonymous');

        if (!itemId) {
            res.status(400).json({ error: 'itemId or item is required' });
            return;
        }

        try {
            const result = await this.orderService.placeOrder(itemId, quantity, idempotencyKey, studentId);
            res.status(200).json(result);
        } catch (error: any) {
            console.error('Order Controller Error:', error.message);
            res.status(error.status || 500).json({ error: error.message });
        }
    }

    async replayOrder(req: Request, res: Response): Promise<void> {
        const orderId = String(req.params.orderId);
        try {
            const result = await this.orderService.replayEvents(orderId);
            if (!result) {
                res.status(404).json({ error: 'Order events not found' });
                return;
            }
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ error: 'Failed to retrieve order history' });
        }
    }

    async getEvents(req: Request, res: Response): Promise<void> {
        const orderId = String(req.params.orderId);
        try {
            const events = await this.orderService.getOrderHistory(orderId);
            res.json({ orderId, events });
        } catch (error: any) {
            res.status(500).json({ error: 'Failed to retrieve events' });
        }
    }

    async replayByTime(req: Request, res: Response): Promise<void> {
        const { startTime, endTime } = req.query;
        if (!startTime || !endTime) {
            res.status(400).json({ error: 'startTime and endTime are required' });
            return;
        }

        try {
            const events = await this.orderService.replayByTime(
                new Date(startTime as string),
                new Date(endTime as string)
            );
            res.json({ events });
        } catch (error: any) {
            res.status(500).json({ error: 'Failed to replay events' });
        }
    }
}

export default OrderController;
