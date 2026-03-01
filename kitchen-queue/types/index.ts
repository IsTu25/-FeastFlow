export interface KitchenJob {
    orderId: string;
    itemId: string;
    quantity: number;
    studentId: string;
    _traceContext?: any;
}

declare global {
    var chaosDelayMs: number;
}
