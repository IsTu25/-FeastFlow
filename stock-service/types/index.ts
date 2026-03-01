export interface StockItem {
    id: string;
    stock: number;
    version: number;
}

export interface DeductRequest {
    itemId: string;
    quantity: number;
    orderId: string;
}
