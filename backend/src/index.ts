import express from 'express';
import productRoutes from './modules/products/product.routes';

const app = express();

app.use(express.json());

// Module routing
app.use('/api/products', productRoutes);

export default app;