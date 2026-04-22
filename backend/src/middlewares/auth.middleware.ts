import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
    user?: {
        userId: string;
        role: string;
    };
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).json({ message: 'Nenhum token fornecido' });
        return;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2) {
        res.status(401).json({ message: 'Token erro' });
        return;
    }

    const [scheme, token] = parts;
    if (!/^Bearer$/i.test(scheme)) {
        res.status(401).json({ message: 'Token mal formatado' });
        return;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        req.user = decoded as { userId: string; role: string };
        next();
    } catch (err) {
        res.status(401).json({ message: 'Token inválido' });
    }
};
