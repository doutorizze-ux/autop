import { Router } from 'express';
import { createUser, deleteUser, listUsers, login, me, updateUser } from '../controllers/auth.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.post('/login', login);
router.get('/me', authMiddleware, me);
router.get('/users', authMiddleware, listUsers);
router.post('/users', authMiddleware, createUser);
router.put('/users/:id', authMiddleware, updateUser);
router.delete('/users/:id', authMiddleware, deleteUser);

export default router;
