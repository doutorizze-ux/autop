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

function shouldUseLocalAgent() {
    return process.env.LOCAL_AGENT_MODE !== 'disabled' && LocalAgentService.hasActiveAgents();
}

function isLocalAgentModeEnabled() {
    return process.env.LOCAL_AGENT_MODE !== 'disabled';
}

export class SupplierSessionService {
    static async start(supplierId: string) {
        const supplier = await getSupplierOrFail(supplierId);

        if (shouldUseLocalAgent()) {
            return LocalAgentService.dispatchSessionTask(supplier, 'start') as Promise<any>;
        }

        if (isLocalAgentModeEnabled()) {
            throw new Error('Nao foi possivel iniciar o Login Assistido no servidor porque nao ha agente local online para este fornecedor. Inicie o agente da loja e tente novamente.');
        }

        await closeExisting(supplierId);

        const profilePath = getSupplierProfilePath(supplier.name);
        ensureDirectory(profilePath);

        const browserOptions = {
            headless: process.env.LOGIN_ASSIST_HEADLESS === 'true',
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
        await page.goto(supplier.loginUrl || supplier.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
        sessions.set(supplierId, { supplierId, context, page, profilePath });

        return this.snapshot(supplierId);
    }

    static async snapshot(supplierId: string) {
        if (shouldUseLocalAgent()) {
            const supplier = await getSupplierOrFail(supplierId);
            return LocalAgentService.dispatchSessionTask(supplier, 'snapshot') as Promise<any>;
        }

        if (isLocalAgentModeEnabled()) {
            throw new Error('Nao foi possivel consultar a sessao no servidor porque nao ha agente local online.');
        }

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
        if (shouldUseLocalAgent()) {
            const supplier = await getSupplierOrFail(supplierId);
            return LocalAgentService.dispatchSessionTask(supplier, 'click', { x, y }) as Promise<any>;
        }

        if (isLocalAgentModeEnabled()) {
            throw new Error('Nao foi possivel clicar na sessao no servidor porque nao ha agente local online.');
        }

        const session = sessions.get(supplierId);
        if (!session) {
            throw new Error('Sessao assistida nao iniciada.');
        }

        await session.page.mouse.click(x, y);
        await session.page.waitForTimeout(700);
        return this.snapshot(supplierId);
    }

    static async type(supplierId: string, text: string) {
        if (shouldUseLocalAgent()) {
            const supplier = await getSupplierOrFail(supplierId);
            return LocalAgentService.dispatchSessionTask(supplier, 'type', { text }) as Promise<any>;
        }

        if (isLocalAgentModeEnabled()) {
            throw new Error('Nao foi possivel digitar na sessao no servidor porque nao ha agente local online.');
        }

        const session = sessions.get(supplierId);
        if (!session) {
            throw new Error('Sessao assistida nao iniciada.');
        }

        await session.page.keyboard.type(text, { delay: 25 });
        await session.page.waitForTimeout(300);
        return this.snapshot(supplierId);
    }

    static async press(supplierId: string, key: string) {
        if (shouldUseLocalAgent()) {
            const supplier = await getSupplierOrFail(supplierId);
            return LocalAgentService.dispatchSessionTask(supplier, 'press', { key }) as Promise<any>;
        }

        if (isLocalAgentModeEnabled()) {
            throw new Error('Nao foi possivel enviar a tecla na sessao no servidor porque nao ha agente local online.');
        }

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

        if (shouldUseLocalAgent()) {
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

        if (isLocalAgentModeEnabled()) {
            throw new Error('Nao foi possivel salvar a sessao no servidor porque nao ha agente local online.');
        }

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
        if (shouldUseLocalAgent()) {
            const supplier = await getSupplierOrFail(supplierId);
            return LocalAgentService.dispatchSessionTask(supplier, 'stop') as Promise<any>;
        }

        if (isLocalAgentModeEnabled()) {
            return { stopped: true, mode: 'local-agent-offline' };
        }

        await closeExisting(supplierId);
        return { stopped: true };
    }
}
