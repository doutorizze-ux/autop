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

function requireAdmin(req: AuthRequest, res: Response) {
    if (req.user?.role !== 'ADMIN') {
        res.status(403).json({ message: 'Acesso negado' });
        return false;
    }

    return true;
}

export const listUsers = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!requireAdmin(req, res)) return;

        const users = await prisma.user.findMany({
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });

        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Erro ao listar usuarios' });
    }
};

export const createUser = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!requireAdmin(req, res)) return;

        const name = String(req.body?.name || '').trim();
        const email = String(req.body?.email || '').trim().toLowerCase();
        const password = String(req.body?.password || '').trim();
        const role = String(req.body?.role || 'FUNCIONARIO').trim() === 'ADMIN' ? 'ADMIN' : 'FUNCIONARIO';

        if (!name || !email || !password) {
            res.status(400).json({ message: 'Nome, e-mail e senha sao obrigatorios.' });
            return;
        }

        if (password.length < 6) {
            res.status(400).json({ message: 'A senha precisa ter pelo menos 6 caracteres.' });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role,
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });

        res.status(201).json(user);
    } catch (err: any) {
        if (err?.code === 'P2002') {
            res.status(409).json({ message: 'Ja existe usuario com este e-mail.' });
            return;
        }

        res.status(500).json({ message: 'Erro ao criar usuario' });
    }
};

export const updateUser = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!requireAdmin(req, res)) return;

        const userId = String(req.params.id || '').trim();
        const name = String(req.body?.name || '').trim();
        const email = String(req.body?.email || '').trim().toLowerCase();
        const password = String(req.body?.password || '').trim();
        const role = String(req.body?.role || 'FUNCIONARIO').trim() === 'ADMIN' ? 'ADMIN' : 'FUNCIONARIO';

        if (!name || !email) {
            res.status(400).json({ message: 'Nome e e-mail sao obrigatorios.' });
            return;
        }

        const updateData: any = { name, email, role };
        if (password) {
            if (password.length < 6) {
                res.status(400).json({ message: 'A senha precisa ter pelo menos 6 caracteres.' });
                return;
            }
            updateData.password = await bcrypt.hash(password, 10);
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });

        res.json(user);
    } catch (err: any) {
        if (err?.code === 'P2002') {
            res.status(409).json({ message: 'Ja existe usuario com este e-mail.' });
            return;
        }

        res.status(500).json({ message: 'Erro ao atualizar usuario' });
    }
};

export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!requireAdmin(req, res)) return;

        const userId = String(req.params.id || '').trim();
        if (userId === req.user?.userId) {
            res.status(400).json({ message: 'Voce nao pode excluir seu proprio usuario.' });
            return;
        }

        await prisma.user.delete({
            where: { id: userId },
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: 'Erro ao excluir usuario' });
    }
};
