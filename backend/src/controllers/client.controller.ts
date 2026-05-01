import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getClients = async (req: Request, res: Response): Promise<void> => {
    try {
        const clients = await prisma.client.findMany({
            orderBy: { updatedAt: 'desc' }
        });
        res.json(clients);
    } catch (err) {
        res.status(500).json({ message: 'Erro ao buscar clientes' });
    }
};

export const createClient = async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, phone } = req.body;
        const client = await prisma.client.create({
            data: { name, phone }
        });
        res.status(201).json(client);
    } catch (err: any) {
        if (err.code === 'P2002') {
            res.status(400).json({ message: 'Telefone já cadastrado' });
            return;
        }
        res.status(500).json({ message: 'Erro ao criar cliente' });
    }
};

export const updateClientStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const client = await prisma.client.update({
            where: { id },
            data: { status }
        });
        res.json(client);
    } catch (err) {
        res.status(500).json({ message: 'Erro ao atualizar status' });
    }
};

export const getClientDetails = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const client = await prisma.client.findUnique({
            where: { id }
        });
        if (!client) {
            res.status(404).json({ message: 'Cliente não encontrado' });
            return;
        }
        res.json(client);
    } catch (err) {
        res.status(500).json({ message: 'Erro ao buscar cliente' });
    }
};

export const deleteClient = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        await prisma.client.delete({
            where: { id }
        });
        res.json({ success: true });
    } catch (err: any) {
        if (err.code === 'P2025') {
            res.status(404).json({ message: 'Cliente nao encontrado' });
            return;
        }
        res.status(500).json({ message: 'Erro ao excluir cliente' });
    }
};
