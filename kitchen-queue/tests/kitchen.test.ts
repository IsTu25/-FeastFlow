import KitchenService from '../services/kitchenService';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('KitchenService Unit Tests', () => {
    let kitchenService: KitchenService;
    let mockMetrics: any;

    beforeEach(() => {
        mockMetrics = {
            ordersProcessedTotal: { inc: jest.fn() }
        };
        kitchenService = new KitchenService(mockMetrics);
        jest.clearAllMocks();
    });

    it('should process order and send notifications quickly by mocking setTimeout', async () => {
        const job = {
            data: {
                orderId: 'order-123',
                studentId: 'user123',
                itemId: 'burger',
                quantity: 1
            }
        } as any;

        // Mock axios to avoid real network calls
        mockedAxios.post.mockResolvedValue({ status: 200 });

        // Mock setTimeout to execute immediately
        const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => cb());

        await kitchenService.processOrder(job);

        // Verify notifications
        expect(mockedAxios.post).toHaveBeenCalledWith(expect.stringContaining('/notify'), expect.objectContaining({
            orderId: 'order-123',
            status: 'In Kitchen'
        }));

        expect(mockedAxios.post).toHaveBeenCalledWith(expect.stringContaining('/notify'), expect.objectContaining({
            orderId: 'order-123',
            status: 'Ready'
        }));

        expect(mockMetrics.ordersProcessedTotal.inc).toHaveBeenCalled();

        setTimeoutSpy.mockRestore();
    });
});
