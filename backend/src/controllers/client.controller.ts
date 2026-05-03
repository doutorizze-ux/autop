import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function isUnresolvedPhone(value: string) {
    const raw = String(value || '');
    const digits = raw.replace(/\D/g, '');
    return raw.endsWith('@lid') || (digits.length >= 14 && !digits.startsWith('55'));
}

function toDisplayPhone(jidOrPhone?: string | null) {
    const digits = String(jidOrPhone || '').replace(/\D/g, '');
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
        return digits.slice(2);
    }
    return digits;
}

function isRealWhatsappJid(jid?: string | null) {
    return String(jid || '').endsWith('@s.whatsapp.net');
}

function normalizeClientForResponse<T extends { phone: string; whatsappJid?: string | null }>(client: T): T {
    if (!isUnresolvedPhone(client.phone)) {
        return client;
    }

    if (isRealWhatsappJid(client.whatsappJid)) {
        return {
            ...client,
            phone: toDisplayPhone(client.whatsappJid),
        };
    }

    return client;
}

function normalizeContactName(value: string) {
    return String(value || '').trim().toLowerCase();
}

export const getClients = async (req: Request, res: Response): Promise<void> => {
    try {
        const clients = await prisma.client.findMany({
            orderBy: { updatedAt: 'desc' },
        });
        const resolvedNames = new Set(
            clients
                .filter(client => !isUnresolvedPhone(client.phone))
                .map(client => normalizeContactName(client.name))
                .filter(Boolean)
        );
        const visibleClients = clients.filter(client => {
            const name = normalizeContactName(client.name);
            return !(name && isUnresolvedPhone(client.phone) && resolvedNames.has(name));
        });
        res.json(visibleClients.map(normalizeClientForResponse));
    } catch (err) {
        res.status(500).json({ message: 'Erro ao buscar clientes' });
    }
};

export const createClient = async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, phone } = req.body;
        const client = await prisma.client.create({
            data: { name, phone },
        });
        res.status(201).json(normalizeClientForResponse(client));
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
            data: { status },
        });
        res.json(normalizeClientForResponse(client));
    } catch (err) {
        res.status(500).json({ message: 'Erro ao atualizar status' });
    }
};

export const updateClient = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { name, phone } = req.body;
        const data: { name?: string; phone?: string } = {};

        if (typeof name === 'string' && name.trim()) {
            data.name = name.trim();
        }

        if (typeof phone === 'string' && phone.trim()) {
            data.phone = phone.replace(/\D/g, '');
        }

        const client = await prisma.client.update({
            where: { id },
            data,
        });
        res.json(normalizeClientForResponse(client));
    } catch (err: any) {
        if (err.code === 'P2002') {
            res.status(400).json({ message: 'Telefone já cadastrado em outro lead' });
            return;
        }
        if (err.code === 'P2025') {
            res.status(404).json({ message: 'Cliente não encontrado' });
            return;
        }
        res.status(500).json({ message: 'Erro ao atualizar cliente' });
    }
};

export const getClientDetails = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const client = await prisma.client.findUnique({
            where: { id },
        });
        if (!client) {
            res.status(404).json({ message: 'Cliente não encontrado' });
            return;
        }
        res.json(normalizeClientForResponse(client));
    } catch (err) {
        res.status(500).json({ message: 'Erro ao buscar cliente' });
    }
};

export const deleteClient = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        await prisma.client.delete({
            where: { id },
        });
        res.json({ success: true });
    } catch (err: any) {
        if (err.code === 'P2025') {
            res.status(404).json({ message: 'Cliente não encontrado' });
            return;
        }
        res.status(500).json({ message: 'Erro ao excluir cliente' });
    }
};
