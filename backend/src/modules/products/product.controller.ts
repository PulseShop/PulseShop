import { Request, Response } from 'express';
import { supabase } from '../../db/supabase';

export const getProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const shopId = req.query.shopId as string;
    
    if (limit <= 0 || limit > 100) {
      res.status(400).json({ error: 'Limit must be between 1 and 100' });
      return;
    }

    let query = supabase
      .from('products')
      .select('id, shop_id, name, price, stock')
      .limit(limit);

    if (shopId) {
      query = query.eq('shop_id', shopId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('Product fetch error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};