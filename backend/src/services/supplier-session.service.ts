import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { LocalAgentService } from './local-agent.service';

const prisma = new PrismaClient();
let chromium: any = null;
try {
    chromium = require(path.resolve(__dirname, '../../../scraping/node_modules/playwright')).chromium;
} catch (_) {
    try {
        chromium = require('playwright').chromium;
    } catch (_) {}
}

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

async function getSupplierOrFail(supplierId: string) {
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) {
        throw new Error('Fornecedor nao encontrado.');
    }
    return supplier;
}

function requiresLocalAgent(supplier: any) {
    const identity = `${supplier?.name || ''} ${supplier?.url || ''}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const requireForSearch = ['1', 'true', 'yes', 'on', 'enabled'].includes(
        String(process.env.LOCAL_AGENT_REQUIRE_FOR_SEARCH || '').trim().toLowerCase()
    );

    return identity.includes('dpk') || requireForSearch;
}

function shouldUseLocalAgent(supplier: any) {
    const modeEnabled = String(process.env.LOCAL_AGENT_MODE || '').trim().toLowerCase() === 'enabled';
    return (
        (modeEnabled || requiresLocalAgent(supplier)) &&
        LocalAgentService.hasActiveAgentsForSupplier(supplier)
    );
}

function assertLocalAgentAvailable(supplier: any) {
    if (requiresLocalAgent(supplier) && !LocalAgentService.hasActiveAgentsForSupplier(supplier)) {
        throw new Error(
            `O Login Assistido de ${supplier.name} precisa do Chrome da loja. Conecte um agente local compatível e tente novamente.`
        );
    }
}

export class SupplierSessionService {
    static async start(supplierId: string) {
        const supplier = await getSupplierOrFail(supplierId);

        if (shouldUseLocalAgent(supplier)) {
            return LocalAgentService.dispatchSessionTask(supplier, 'start') as Promise<any>;
        }

        assertLocalAgentAvailable(supplier);

        await closeExisting(supplierId);

        const profilePath = getSupplierProfilePath(supplier.name);
        ensureDirectory(profilePath);

        const browserOptions = {
            headless: process.env.LOGIN_ASSIST_HEADLESS === 'false' ? false : true,
            viewport: { width: 1280, height: 900 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            locale: 'pt-BR',
            timezoneId: 'America/Sao_Paulo',
            ignoreHTTPSErrors: true,
            ignoreDefaultArgs: ['--enable-automation'],
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1280,900',
            ],
        };

        let context;
        try {
            context = await chromium.launchPersistentContext(profilePath, {
                ...browserOptions,
                channel: 'chrome',
            });
        } catch (error) {
            console.error(`[Login Assistido] Chrome real indisponivel, usando Chromium: ${error instanceof Error ? error.message : error}`);
            context = await chromium.launchPersistentContext(profilePath, browserOptions);
        }

        const page = context.pages()[0] || await context.newPage();
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Upgrade-Insecure-Requests': '1',
        }).catch(() => {});
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            // @ts-ignore
            window.chrome = { runtime: {} };
        }).catch(() => {});
        await page.goto(supplier.loginUrl || supplier.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
        sessions.set(supplierId, { supplierId, context, page, profilePath });

        return this.snapshot(supplierId);
    }

    static async snapshot(supplierId: string) {
        const supplier = await getSupplierOrFail(supplierId);
        if (shouldUseLocalAgent(supplier)) {
            return LocalAgentService.dispatchSessionTask(supplier, 'snapshot') as Promise<any>;
        }

        assertLocalAgentAvailable(supplier);

        const session = sessions.get(supplierId);
        if (!session) {
            throw new Error('Sessao assistida nao iniciada.');
        }

        const image = await session.page.screenshot({ type: 'jpeg', quality: 40, fullPage: false });
        return {
            image: `data:image/jpeg;base64,${image.toString('base64')}`,
            url: session.page.url(),
            title: await session.page.title().catch(() => ''),
        };
    }

    static async click(supplierId: string, x: number, y: number) {
        const supplier = await getSupplierOrFail(supplierId);
        if (shouldUseLocalAgent(supplier)) {
            return LocalAgentService.dispatchSessionTask(supplier, 'click', { x, y }) as Promise<any>;
        }

        assertLocalAgentAvailable(supplier);

        const session = sessions.get(supplierId);
        if (!session) {
            throw new Error('Sessao assistida nao iniciada.');
        }

        await session.page.mouse.click(x, y);
        await session.page.waitForTimeout(700);
        return this.snapshot(supplierId);
    }

    static async type(supplierId: string, text: string) {
        const supplier = await getSupplierOrFail(supplierId);
        if (shouldUseLocalAgent(supplier)) {
            return LocalAgentService.dispatchSessionTask(supplier, 'type', { text }) as Promise<any>;
        }

        assertLocalAgentAvailable(supplier);

        const session = sessions.get(supplierId);
        if (!session) {
            throw new Error('Sessao assistida nao iniciada.');
        }

        await session.page.keyboard.type(text, { delay: 25 });
        await session.page.waitForTimeout(300);
        return this.snapshot(supplierId);
    }

    static async press(supplierId: string, key: string) {
        const supplier = await getSupplierOrFail(supplierId);
        if (shouldUseLocalAgent(supplier)) {
            return LocalAgentService.dispatchSessionTask(supplier, 'press', { key }) as Promise<any>;
        }

        assertLocalAgentAvailable(supplier);

        const session = sessions.get(supplierId);
        if (!session) {
            throw new Error('Sessao assistida nao iniciada.');
        }

        await session.page.keyboard.press(key);
        await session.page.waitForTimeout(700);
        return this.snapshot(supplierId);
    }

    static async save(supplierId: string, directPayload?: { token?: string; uf?: string }) {
        const supplier = await getSupplierOrFail(supplierId);

        if (directPayload?.token) {
            let token = directPayload.token.trim();
            let uf = (directPayload.uf || 'GO').trim();
            const lsItems: Array<{ name: string; value: string }> = [];

            if (token.startsWith('{')) {
                try {
                    const parsed = JSON.parse(token);
                    const flattened = { ...(parsed.local || {}), ...(parsed.session || {}), ...parsed };
                    delete flattened.local;
                    delete flattened.session;

                    for (const [key, val] of Object.entries(flattened)) {
                        const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
                        lsItems.push({ name: key, value: strVal });
                        if (/token/i.test(key) && strVal.length > 20) {
                            token = strVal.replace(/^["']|["']$/g, '');
                        }
                        if (/uf/i.test(key) && strVal.length <= 4) {
                            uf = strVal.replace(/^["']|["']$/g, '');
                        }
                    }
                } catch (_) {}
            }

            if (!lsItems.some(i => i.name === 'token')) {
                lsItems.push({ name: 'token', value: token });
            }
            if (!lsItems.some(i => i.name === 'uf')) {
                lsItems.push({ name: 'uf', value: uf });
            }

            const storageState = {
                cookies: [],
                origins: [
                    {
                        origin: 'https://portal.kaizenautopecas.com.br',
                        localStorage: lsItems,
                    },
                ],
            };

            await (prisma.supplier as any).update({
                where: { id: supplierId },
                data: { sessionData: JSON.stringify(storageState) },
            });

            const fileName = String(supplier.name || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
            const sessionDir = path.resolve(__dirname, '../../../scraping/sessions');
            ensureDirectory(sessionDir);
            const sessionPath = path.join(sessionDir, `${fileName}.json`);
            fs.writeFileSync(sessionPath, JSON.stringify(storageState, null, 2));
            console.log(`[Login Assistido] Token direto salvo em: ${sessionPath}`);

            return { saved: true, direct: true };
        }

        if (shouldUseLocalAgent(supplier)) {
            const result = await LocalAgentService.dispatchSessionTask(supplier, 'save') as any;
            await (prisma.supplier as any).update({
                where: { id: supplierId },
                data: {
                    sessionData: result?.storageState ? JSON.stringify(result.storageState) : supplier.sessionData,
                },
            });

            return {
                saved: true,
                profilePath: result?.profilePath || null,
                url: result?.url || supplier.loginUrl || supplier.url,
                mode: 'local-agent',
            };
        }

        assertLocalAgentAvailable(supplier);

        const session = sessions.get(supplierId);
        if (!session) {
            throw new Error('Sessao assistida nao iniciada.');
        }

        const storageState = await session.context.storageState();
        await (prisma.supplier as any).update({
            where: { id: supplierId },
            data: {
                sessionData: JSON.stringify(storageState),
            },
        });

        try {
            const fileName = String(supplier.name || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
            const sessionDir = path.resolve(__dirname, '../../../scraping/sessions');
            ensureDirectory(sessionDir);
            const sessionPath = path.join(sessionDir, `${fileName}.json`);
            fs.writeFileSync(sessionPath, JSON.stringify(storageState, null, 2));
            console.log(`[Login Assistido] Sessao salva em arquivo: ${sessionPath}`);
        } catch (e: any) {
            console.warn(`[Login Assistido] Nao foi possivel salvar arquivo de sessao: ${e.message}`);
        }

        return {
            saved: true,
            profilePath: session.profilePath,
            url: session.page.url(),
        };
    }

    static async stop(supplierId: string) {
        const supplier = await getSupplierOrFail(supplierId);
        if (shouldUseLocalAgent(supplier)) {
            return LocalAgentService.dispatchSessionTask(supplier, 'stop') as Promise<any>;
        }

        if (requiresLocalAgent(supplier)) {
            return { stopped: true, mode: 'local-agent-offline' };
        }

        await closeExisting(supplierId);
        return { stopped: true };
    }
}
