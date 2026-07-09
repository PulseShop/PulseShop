import request from 'supertest';
import app from '../../index';
import { supabase } from '../../db/supabase';

// 1. Only mock the top-level property here to avoid hoisting crashes
jest.mock('../../db/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

describe('Product Controller - GET /api/products', () => {
  let mockQuery: { eq: jest.Mock; then: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    // 2. Initialize the chainable Thenable safely inside the execution block
    mockQuery = {
      eq: jest.fn().mockReturnThis(),
      then: jest.fn(),
    };

    // 3. Attach the chain to the top-level mock
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue(mockQuery),
      }),
    });
  });

  it('fetches products with default limit', async () => {
    const mockData = [{ id: '1', name: 'Test Item', price: 100 }];
    
    // 4. Resolve the mock promise successfully
    mockQuery.then.mockImplementation((resolve: (val: any) => void) => 
      resolve({ data: mockData, error: null })
    );

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockData);
    expect(supabase.from).toHaveBeenCalledWith('products');
  });

  it('filters by shopId if provided', async () => {
    const mockData = [{ id: '2', shop_id: 'shop_123' }];
    
    mockQuery.then.mockImplementation((resolve: (val: any) => void) => 
      resolve({ data: mockData, error: null })
    );

    const res = await request(app).get('/api/products?shopId=shop_123');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockData);
    expect(mockQuery.eq).toHaveBeenCalledWith('shop_id', 'shop_123');
  });

  it('rejects limits outside the 1-100 bounds', async () => {
    const resLow = await request(app).get('/api/products?limit=-1');
    expect(resLow.status).toBe(400);

    const resHigh = await request(app).get('/api/products?limit=150');
    expect(resHigh.status).toBe(400);
  });

  it('handles database errors gracefully', async () => {
    // 5. Resolve the mock promise with an error
    mockQuery.then.mockImplementation((resolve: (val: any) => void) => 
      resolve({ data: null, error: new Error('DB connection dropped') })
    );

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal Server Error' });
  });
});