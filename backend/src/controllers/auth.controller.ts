import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../middlewares/auth.middleware';

const prisma = new PrismaClient();

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({ where: { email } });
        console.log(`[LOGIN DEBUG] Email: ${email}, User found: ${!!user}`);

        if (!user) {
            res.status(401).json({ message: 'Credenciais inválidas' });
            return;
        }

        const isValid = await bcrypt.compare(password, user.password);
        console.log(`[LOGIN DEBUG] Password provided: ${password}, Is Valid: ${isValid}`);
        
        if (!isValid) {
            res.status(401).json({ message: 'Credenciais inválidas' });
            return;
        }

        const token = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET || 'secret',
            { expiresIn: '365d' }
        );

        res.json({
            user: { id: user.id, name: user.name, email: user.email, role: user.role },
            token
        });
    } catch (err) {
        res.status(500).json({ message: 'Erro no servidor' });
    }
};

export const me = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Não autorizado' });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });

        if (!user) {
            res.status(404).json({ message: 'Usuário não encontrado' });
            return;
        }

        res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
    } catch (err) {
        res.status(500).json({ message: 'Erro no servidor' });
    }
};
