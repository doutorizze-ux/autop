import { Router } from 'express';
import { getSuppliers, createSupplier, deleteSupplier } from '../controllers/supplier.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/', getSuppliers);
router.post('/', createSupplier);
router.delete('/:id', deleteSupplier);

export default router;
