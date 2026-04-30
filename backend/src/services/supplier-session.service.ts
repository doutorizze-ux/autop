import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const { chromium } = require(path.resolve(__dirname, '../../../scraping/node_modules/playwright'));

type AssistSession = {
    supplierId: string;
    context: any;
    page: any;
    profilePath: string;
};

const sessions = new Map<string, AssistSession>();

function ensureDirectory(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function supplierSlug(value: string) {
    return String(value || 'supplier')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'supplier';
}

function profileRoot() {
    return process.env.SCRAPER_PROFILE_ROOT || path.resolve(__dirname, '../../data/browser-profiles');
}

export function getSupplierProfilePath(supplierName: string) {
    return path.join(profileRoot(), supplierSlug(supplierName));
}

async function closeExisting(supplierId: string) {
    const existing = sessions.get(supplierId);
    if (existing) {
        await existing.context.close().catch(() => {});
        sessions.delete(supplierId);
    }
}

export class SupplierSessionService {
    static async start(supplierId: string) {
        const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
        if (!supplier) {
            throw new Error('Fornecedor nao encontrado.');
        }

        await closeExisting(supplierId);

        const profilePath = getSupplierProfilePath(supplier.name);
        ensureDirectory(profilePath);

        const context = await chromium.launchPersistentContext(profilePath, {
            headless: process.env.LOGIN_ASSIST_HEADLESS === 'true',
            viewport: { width: 1280, height: 900 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            locale: 'pt-BR',
            ignoreHTTPSErrors: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1280,900',
            ],
        });

        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        const page = context.pages()[0] || await context.newPage();
        await page.goto(supplier.loginUrl || supplier.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
        sessions.set(supplierId, { supplierId, context, page, profilePath });

        return this.snapshot(supplierId);
    }

    static async snapshot(supplierId: string) {
        const session = sessions.get(supplierId);
        if (!session) {
            throw new Error('Sessao assistida nao iniciada.');
        }

        const image = await session.page.screenshot({ type: 'jpeg', quality: 75, fullPage: false });
        return {
            image: `data:image/jpeg;base64,${image.toString('base64')}`,
            url: session.page.url(),
            title: await session.page.title().catch(() => ''),
        };
    }

    static async click(supplierId: string, x: number, y: number) {
        const session = sessions.get(supplierId);
        if (!session) {
            throw new Error('Sessao assistida nao iniciada.');
        }

        await session.page.mouse.click(x, y);
        await session.page.waitForTimeout(700);
        return this.snapshot(supplierId);
    }

    static async type(supplierId: string, text: string) {
        const session = sessions.get(supplierId);
        if (!session) {
            throw new Error('Sessao assistida nao iniciada.');
        }

        await session.page.keyboard.type(text, { delay: 25 });
        await session.page.waitForTimeout(300);
        return this.snapshot(supplierId);
    }

    static async press(supplierId: string, key: string) {
        const session = sessions.get(supplierId);
        if (!session) {
            throw new Error('Sessao assistida nao iniciada.');
        }

        await session.page.keyboard.press(key);
        await session.page.waitForTimeout(700);
        return this.snapshot(supplierId);
    }

    static async save(supplierId: string) {
        const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
        const session = sessions.get(supplierId);
        if (!supplier || !session) {
            throw new Error('Sessao assistida nao iniciada.');
        }

        const storageState = await session.context.storageState();
        await (prisma.supplier as any).update({
            where: { id: supplierId },
            data: {
                sessionData: JSON.stringify(storageState),
            },
        });

        return {
            saved: true,
            profilePath: session.profilePath,
            url: session.page.url(),
        };
    }

    static async stop(supplierId: string) {
        await closeExisting(supplierId);
        return { stopped: true };
    }
}
