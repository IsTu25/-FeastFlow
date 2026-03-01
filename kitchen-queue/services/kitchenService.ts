import axios from 'axios';
import { Job } from 'bullmq';
import { KitchenJob } from '../types';
import { trace, SpanStatusCode, context, propagation } from '@opentelemetry/api';

const NOTIFICATION_HUB_URL = process.env.NOTIFICATION_HUB_URL || 'http://notification-hub:3000';
const tracer = trace.getTracer('kitchen-queue');

export class KitchenService {
    private metrics: any;

    constructor(metrics: any) {
        this.metrics = metrics;
    }

    async processOrder(job: Job<KitchenJob>) {
        // Extract Trace Context for distributed tracing
        const parentContext = propagation.extract(context.active(), job.data._traceContext || {});

        return await context.with(parentContext, async () => {
            return await tracer.startActiveSpan('processOrder', async (span) => {
                const { orderId, studentId } = job.data;
                span.setAttributes({ 'order.id': orderId, 'student.id': studentId, 'job.id': job.id });

                if (global.chaosDelayMs > 0) {
                    span.addEvent('chaos-delay-start', { delay: global.chaosDelayMs });
                    console.log('[CHAOS] Injecting delay:', global.chaosDelayMs, 'ms');
                    await new Promise(r => setTimeout(r, global.chaosDelayMs));
                    span.addEvent('chaos-delay-end');
                }

                const prepTime = Math.floor(Math.random() * 4000) + 3000; // 3 to 7 seconds
                span.setAttribute('prep_time_ms', prepTime);

                // 1. Notify that work has started
                try {
                    span.addEvent('notify-start');
                    await axios.post(`${NOTIFICATION_HUB_URL}/notify`, {
                        orderId,
                        studentId,
                        status: 'IN_KITCHEN'
                    }).catch(e => {
                        span.recordException(e);
                        console.error("Start notify failed:", e.message);
                    });
                } catch (err) { }

                // 2. Simulate cooking
                span.addEvent('cooking-start');
                await new Promise(resolve => setTimeout(resolve, prepTime));
                span.addEvent('cooking-end');

                // 3. Notify that work is done
                try {
                    span.addEvent('notify-completed');
                    console.log(`[KITCHEN] Order ${orderId} completed for ${studentId}`);
                    await axios.post(`${NOTIFICATION_HUB_URL}/notify`, {
                        orderId,
                        studentId,
                        status: 'COMPLETED'
                    });
                } catch (e: any) {
                    span.recordException(e);
                    console.error("End notify failed:", e.message);
                }

                this.metrics.ordersProcessedTotal.inc();
                span.setStatus({ code: SpanStatusCode.OK });
                span.end();
            });
        });
    }
}

export default KitchenService;
