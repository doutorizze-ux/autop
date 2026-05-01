import { Router } from 'express';
import { getClients, createClient, updateClient, updateClientStatus, getClientDetails, deleteClient } from '../controllers/client.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/', getClients);
router.post('/', createClient);
router.get('/:id', getClientDetails);
router.patch('/:id', updateClient);
router.patch('/:id/status', updateClientStatus);
router.delete('/:id', deleteClient);

export default router;
