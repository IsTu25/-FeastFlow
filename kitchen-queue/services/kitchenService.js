const axios = require('axios');

const NOTIFICATION_HUB_URL = process.env.NOTIFICATION_HUB_URL || 'http://notification-hub:3000';

class KitchenService {
    constructor(metrics) {
        this.metrics = metrics;
    }

    async processOrder(job) {
        const { orderId, studentId } = job.data;
        const prepTime = Math.floor(Math.random() * 4000) + 3000; // 3 to 7 seconds

        // 1. Notify that work has started
        try {
            await axios.post(`${NOTIFICATION_HUB_URL}/notify`, {
                orderId,
                studentId,
                status: 'In Kitchen'
            }).catch(e => console.error("Start notify failed:", e.message));
        } catch (err) { }

        // 2. Simulate cooking
        await new Promise(resolve => setTimeout(resolve, prepTime));

        // 3. Notify that work is done
        try {
            await axios.post(`${NOTIFICATION_HUB_URL}/notify`, {
                orderId,
                studentId,
                status: 'Ready'
            });
        } catch (e) {
            console.error("End notify failed:", e.message);
        }

        this.metrics.ordersProcessedTotal.inc();
    }
}

module.exports = KitchenService;
