import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ScraperService } from '../services/scraper.service';

const prisma = new PrismaClient();

const parseBoolean = (value: unknown, defaultValue = false) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    return value === true || value === 'true';
};

const sanitizeSupplierPayload = (data: any) => {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...payload } = data || {};
    const websiteSearchEnabled = parseBoolean(payload.websiteSearchEnabled, true);
    const whatsappEnabled = parseBoolean(payload.whatsappEnabled, false);
    const whatsappPhone = String(payload.whatsappPhone || '').trim();
    const url = String(payload.url || '').trim();

    if (websiteSearchEnabled && !url) {
        throw new Error('Informe a URL principal ou desative a busca por site/agente local.');
    }

    if (whatsappEnabled && !whatsappPhone) {
        throw new Error('Informe o WhatsApp do fornecedor.');
    }

    return {
        ...payload,
        url,
        websiteSearchEnabled,
        whatsappEnabled,
        whatsappPhone: whatsappPhone || null,
        whatsappMessageTemplate: String(payload.whatsappMessageTemplate || '').trim() || null,
        needsLogin: parseBoolean(payload.needsLogin, false),
    };
};

export const getSuppliers = async (req: Request, res: Response): Promise<void> => {
    try {
        const suppliers = await prisma.supplier.findMany({
            orderBy: { name: 'asc' }
        });
        res.json(suppliers);
    } catch (err) {
        res.status(500).json({ message: 'Erro ao buscar fornecedores' });
    }
};

export const createSupplier = async (req: Request, res: Response): Promise<void> => {
    try {
        const data = sanitizeSupplierPayload(req.body);
        
        // Em um cenário real, poderíamos criptografar a senha do fornecedor aqui
        const supplier = await prisma.supplier.create({
            data
        });
        
        res.status(201).json(supplier);
    } catch (err) {
        console.error('Create Supplier Error:', err);
        res.status(500).json({ message: err instanceof Error ? err.message : 'Erro ao criar fornecedor' });
    }
};

export const updateSupplier = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const data = req.body;
        
        // Remove ID from data if present to avoid prisma error
        const { id: _, ...updateData } = data;
        const sanitizedData = sanitizeSupplierPayload(updateData);

        const supplier = await prisma.supplier.update({
            where: { id },
            data: sanitizedData
        });
        
        res.json(supplier);
    } catch (err) {
        console.error('Update Supplier Error:', err);
        res.status(500).json({ message: err instanceof Error ? err.message : 'Erro ao atualizar fornecedor' });
    }
};

export const deleteSupplier = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        await prisma.supplier.delete({ where: { id } });
        res.json({ message: 'Fornecedor removido' });
    } catch (err) {
        res.status(500).json({ message: 'Erro ao remover fornecedor' });
    }
};

export const testSupplier = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const product = String(req.body?.product || '').trim();

        if (!product) {
            res.status(400).json({ message: 'Informe um produto para testar.' });
            return;
        }

        const result = await ScraperService.searchSupplierProduct(id, product);
        res.json(result);
    } catch (err) {
        console.error('Test Supplier Error:', err);
        res.status(500).json({
            message: err instanceof Error ? err.message : 'Erro ao testar fornecedor',
        });
    }
};
