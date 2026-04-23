import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ScraperService } from '../services/scraper.service';

const prisma = new PrismaClient();

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
        const data = req.body;
        
        // Em um cenário real, poderíamos criptografar a senha do fornecedor aqui
        const supplier = await prisma.supplier.create({
            data: {
                ...data,
                needsLogin: data.needsLogin === 'true' || data.needsLogin === true
            }
        });
        
        res.status(201).json(supplier);
    } catch (err) {
        console.error('Create Supplier Error:', err);
        res.status(500).json({ message: 'Erro ao criar fornecedor' });
    }
};

export const updateSupplier = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const data = req.body;
        
        // Remove ID from data if present to avoid prisma error
        const { id: _, ...updateData } = data;

        const supplier = await prisma.supplier.update({
            where: { id },
            data: {
                ...updateData,
                needsLogin: updateData.needsLogin === 'true' || updateData.needsLogin === true
            }
        });
        
        res.json(supplier);
    } catch (err) {
        console.error('Update Supplier Error:', err);
        res.status(500).json({ message: 'Erro ao atualizar fornecedor' });
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
