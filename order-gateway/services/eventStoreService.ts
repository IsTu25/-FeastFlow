import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export interface DomainEvent {
    eventId: string;
    aggregateId: string;
    eventType: string;
    data: any;
    status: string;
    service: string;
    timestamp: Date;
}

export class EventStoreService {
    private pool: Pool;

    constructor(pool: Pool) {
        this.pool = pool;
    }

    async publishEvent(aggregateId: string, eventType: string, status: string, data: any = {}): Promise<void> {
        const eventId = uuidv4();
        const service = process.env.SERVICE_NAME || 'unknown';
        const timestamp = new Date();

        await this.pool.query(
            `INSERT INTO order_events (order_id, service_name, event_type, status, payload, timestamp) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [aggregateId, service, eventType, status, JSON.stringify(data), timestamp]
        );
    }

    async getEventsByAggregateId(aggregateId: string): Promise<DomainEvent[]> {
        const result = await this.pool.query(
            'SELECT order_id as aggregate_id, service_name as service, event_type, status, payload as data, timestamp FROM order_events WHERE order_id = $1 ORDER BY timestamp ASC',
            [aggregateId]
        );
        return result.rows.map(row => ({
            ...row,
            eventId: '', // Not in schema yet but we can adapt
        })) as DomainEvent[];
    }

    async replayByTimeRange(startTime: Date, endTime: Date): Promise<DomainEvent[]> {
        const result = await this.pool.query(
            'SELECT order_id as aggregate_id, service_name as service, event_type, status, payload as data, timestamp FROM order_events WHERE timestamp BETWEEN $1 AND $2 ORDER BY timestamp ASC',
            [startTime, endTime]
        );
        return result.rows as DomainEvent[];
    }
}
