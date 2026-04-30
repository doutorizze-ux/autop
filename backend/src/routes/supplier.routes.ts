import { Router } from 'express';
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier, testSupplier } from '../controllers/supplier.controller';
import {
    clickSupplierSession,
    getSupplierSessionSnapshot,
    pressSupplierSession,
    saveSupplierSession,
    startSupplierSession,
    stopSupplierSession,
    typeSupplierSession,
} from '../controllers/supplier-session.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/', getSuppliers);
router.post('/', createSupplier);
router.post('/:id/test', testSupplier);
router.post('/:id/session/start', startSupplierSession);
router.get('/:id/session/snapshot', getSupplierSessionSnapshot);
router.post('/:id/session/click', clickSupplierSession);
router.post('/:id/session/type', typeSupplierSession);
router.post('/:id/session/press', pressSupplierSession);
router.post('/:id/session/save', saveSupplierSession);
router.post('/:id/session/stop', stopSupplierSession);
router.put('/:id', updateSupplier);
router.delete('/:id', deleteSupplier);

export default router;
