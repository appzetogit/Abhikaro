import express from 'express';
import fcmRoutes from './routes/fcmRoutes.js';

const router = express.Router();
router.use('/', fcmRoutes);

export default router;
