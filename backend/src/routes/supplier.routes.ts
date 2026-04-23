import { Router } from 'express';
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier, testSupplier } from '../controllers/supplier.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/', getSuppliers);
router.post('/', createSupplier);
router.post('/:id/test', testSupplier);
router.put('/:id', updateSupplier);
router.delete('/:id', deleteSupplier);

export default router;
