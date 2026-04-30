import { Request, Response } from 'express';
import { SupplierSessionService } from '../services/supplier-session.service';

async function handle(res: Response, action: () => Promise<any>) {
    try {
        res.json(await action());
    } catch (error) {
        console.error('Supplier Session Error:', error);
        res.status(500).json({
            message: error instanceof Error ? error.message : 'Erro na sessao assistida.',
        });
    }
}

export const startSupplierSession = async (req: Request, res: Response) => {
    await handle(res, () => SupplierSessionService.start(req.params.id));
};

export const getSupplierSessionSnapshot = async (req: Request, res: Response) => {
    await handle(res, () => SupplierSessionService.snapshot(req.params.id));
};

export const clickSupplierSession = async (req: Request, res: Response) => {
    const x = Number(req.body?.x);
    const y = Number(req.body?.y);
    await handle(res, () => SupplierSessionService.click(req.params.id, x, y));
};

export const typeSupplierSession = async (req: Request, res: Response) => {
    await handle(res, () => SupplierSessionService.type(req.params.id, String(req.body?.text || '')));
};

export const pressSupplierSession = async (req: Request, res: Response) => {
    await handle(res, () => SupplierSessionService.press(req.params.id, String(req.body?.key || 'Enter')));
};

export const saveSupplierSession = async (req: Request, res: Response) => {
    await handle(res, () => SupplierSessionService.save(req.params.id));
};

export const stopSupplierSession = async (req: Request, res: Response) => {
    await handle(res, () => SupplierSessionService.stop(req.params.id));
};
