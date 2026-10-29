const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { PassThrough } = require('node:stream');

// Load compiled modules with isolated dependencies: no database, server, or supplier login.
function loadModule(relativePath, mocks) {
    const filename = path.resolve(__dirname, relativePath);
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    const realRequire = Module.createRequire(filename);
    loaded.require = (id) => Object.hasOwn(mocks, id) ? mocks[id] : realRequire(id);
    loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
    return loaded.exports;
}

const supplierNames = [
    'Auto Norte (KKI)', 'Comdip', 'DPK', 'Furacão Auto Peças',
    'Kaizen Auto Peças', 'Real Moto Peças (RMP)', 'Rolemar Master', 'Sky Peças', 'Vespor Pro',
];
const offer = (provider) => ({
    provider, product: 'Filtro HF81A', code: 'HF81A', price: 122.74, available: true,
});
const socket = { to: () => ({ emit() {} }) };

function controllerFixture(matrix) {
    let saved;
    let rosterQuery;
    const prisma = {
        supplier: {
            findMany: async (args) => {
                if (args?.select?.name) {
                    rosterQuery = args;
                    return supplierNames.map((name) => ({ name }));
                }
                return [];
            },
        },
        user: { findUnique: async () => null },
        client: { findFirst: async () => null, create: async () => ({ id: 'lead' }) },
        quote: {
            create: async ({ data }) => {
                saved = { ...data, id: 'quote-test', createdAt: new Date() };
                return saved;
            },
            findFirst: async () => saved,
        },
    };
    const pdfText = [];
    // A recording document verifies that diagnostics reach the PDF renderer.
    class RecordingPdf {
        constructor() {
            this.page = { width: 842, height: 595, margins: { left: 36, right: 36, bottom: 36 } };
            this.y = 36;
        }
        pipe(res) { this.res = res; return this; }
        text(value) { pdfText.push(String(value)); return this; }
        moveDown() { this.y += 4; return this; }
        end() { this.res.end(); }
    }
    for (const name of ['font', 'fontSize', 'fillColor', 'moveTo', 'lineTo', 'strokeColor', 'lineWidth', 'stroke', 'save', 'restore', 'rect', 'fill', 'addPage']) {
        RecordingPdf.prototype[name] = function () { return this; };
    }
    const controller = loadModule('../dist/controllers/quote.controller.js', {
        '@prisma/client': { PrismaClient: function () { return prisma; } },
        '../services/scraper.service': { ScraperService: { searchMultipleProducts: async () => matrix } },
        '../services/whatsapp.service': { whatsappService: {} },
        '../services/whatsapp-channel.service': { quoteWhatsappChannelKey: 'test' },
        '../services/catalog.service': { CatalogService: { search: () => [] } },
        '../index': { io: socket },
        ...(process.env.QUOTE_TEST_PDF ? {} : { pdfkit: RecordingPdf }),
    });
    return { controller, getSaved: () => saved, getRosterQuery: () => rosterQuery, pdfText };
}

function jsonResponse() {
    return {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
}

async function finishJob(fixture) {
    const req = { body: { productNames: ['HF81A', 'OUTRO'] }, user: { userId: 'user-test' } };
    const response = jsonResponse();
    await fixture.controller.searchQuote(req, response);
    assert.equal(response.statusCode, 202);
    assert.deepEqual(response.body.suppliers, supplierNames);
    assert.deepEqual(fixture.getRosterQuery().where.OR, [
        { websiteSearchEnabled: true },
        { whatsappEnabled: true, whatsappPhone: { not: null } },
    ]);
    for (let count = 0; count < 30 && !fixture.getSaved(); count++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.ok(fixture.getSaved(), 'job must persist its results');
    const jobResponse = jsonResponse();
    await fixture.controller.getQuoteJob({
        params: { jobId: response.body.jobId }, user: req.user,
    }, jobResponse);
    assert.equal(jobResponse.body.status, 'completed');
    return JSON.parse(fixture.getSaved().results);
}

test('9 active suppliers survive 3 offers, missing returns, history and PDF', async () => {
    const timeout = { provider: 'DPK', product: 'HF81A', error: 'DPK excedeu 165s.', price: '---' };
    const fixture = controllerFixture({
        HF81A: [offer(supplierNames[0]), offer('Rolemar Master'), offer('Vespor Pro'), timeout],
    });
    const payload = await finishJob(fixture);
    assert.deepEqual(payload.suppliers, supplierNames);
    assert.equal(payload.matrix.HF81A.length, 9);
    assert.equal(payload.matrix.OUTRO.length, 9);
    assert.equal(payload.matrix.HF81A.find((row) => row.provider === 'DPK').error, timeout.error);
    assert.equal(payload.selectedOffers.HF81A.DPK, null);
    assert.equal(payload.selectedOffers.HF81A['Vespor Pro'].price, 122.74);

    const history = jsonResponse();
    await fixture.controller.getQuoteHistoryById({
        params: { id: 'quote-test' }, user: { userId: 'user-test' },
    }, history);
    assert.deepEqual(history.body.suppliers, supplierNames);

    const response = new PassThrough();
    response.setHeader = () => {};
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    const finished = new Promise((resolve) => response.on('finish', resolve));
    await fixture.controller.exportSavedQuotePDF({
        params: { id: 'quote-test' }, user: { userId: 'user-test' },
    }, response);
    await finished;
    if (process.env.QUOTE_TEST_PDF) {
        fs.writeFileSync(process.env.QUOTE_TEST_PDF, Buffer.concat(chunks));
    } else {
        assert.ok(fixture.pdfText.includes(timeout.error), 'PDF must preserve timeout diagnostics');
        for (const name of supplierNames) assert.ok(fixture.pdfText.includes(name));
    }
});
test('all suppliers without offers still produce a complete quote', async () => {
    const payload = await finishJob(controllerFixture({}));
    assert.equal(payload.suppliers.length, 9);
    for (const query of ['HF81A', 'OUTRO']) {
        assert.equal(payload.matrix[query].length, 9);
        assert.ok(payload.matrix[query].every((row) => row.error && row.available === false));
        assert.ok(Object.values(payload.selectedOffers[query]).every((result) => result === null));
    }
});
test('batch search retains empty, malformed and failed results without searching disabled suppliers', async () => {
    const suppliers = [
        { id: 'offer', name: 'Oferta', websiteSearchEnabled: true },
        { id: 'empty', name: 'Vazio', websiteSearchEnabled: true },
        { id: 'failed', name: 'Falha', websiteSearchEnabled: true },
        { id: 'missing', name: 'Ausente', websiteSearchEnabled: true },
        { id: 'disabled', name: 'Desativado', websiteSearchEnabled: false },
    ];
    const searched = [];
    const enginePath = path.resolve(__dirname, '../../scraping/engine.js');
    const service = loadModule('../dist/services/scraper.service.js', {
        '@prisma/client': { PrismaClient: function () {
            return { supplier: { findMany: async () => suppliers } };
        } },
        '../index': { io: socket },
        './local-agent.service': { LocalAgentService: {} },
        [enginePath]: { scrapeProduct: async (supplier) => {
            searched.push(supplier.id);
            if (supplier.id === 'offer') return [offer(supplier.name)];
            if (supplier.id === 'empty') return [];
            if (supplier.id === 'failed') throw new Error('Sessão expirada');
            return undefined;
        } },
    });
    const progress = [];
    const matrix = await service.ScraperService.searchMultipleProducts(
        ['HF81A'], undefined, {}, (payload) => progress.push(payload),
    );
    assert.equal(matrix.HF81A.length, 4);
    assert.equal(progress.length, 4);
    assert.ok(!searched.includes('disabled'));
    assert.ok(matrix.HF81A.find((row) => row.provider === 'Vazio').error.includes('nao retornou oferta'));
    assert.ok(matrix.HF81A.find((row) => row.provider === 'Falha').error.includes('Sessão expirada'));
    assert.equal(matrix.HF81A.find((row) => row.provider === 'Oferta').price, 122.74);
});

test('DPK can diagnose its REST response from the backend when local routing is not required', async () => {
    const previousMode = process.env.LOCAL_AGENT_MODE;
    const previousRequired = process.env.LOCAL_AGENT_REQUIRE_FOR_SEARCH;
    process.env.LOCAL_AGENT_MODE = 'disabled';
    process.env.LOCAL_AGENT_REQUIRE_FOR_SEARCH = 'false';

    let directSearchCalls = 0;
    try {
        const enginePath = path.resolve(__dirname, '../../scraping/engine.js');
        const service = loadModule('../dist/services/scraper.service.js', {
            '@prisma/client': { PrismaClient: function () {
                return {
                    supplier: {
                        findMany: async () => [{ id: 'dpk', name: 'DPK', url: 'https://www.dpk.com.br', websiteSearchEnabled: true, needsLogin: true }],
                    },
                };
            } },
            '../index': { io: socket },
            './local-agent.service': {
                LocalAgentService: {
                    hasActiveAgentsForSupplier: () => false,
                    dispatchSearchTask: async () => { throw new Error('Unexpected dispatch'); },
                },
            },
            [enginePath]: { scrapeProduct: async () => {
                directSearchCalls += 1;
                return {
                    provider: 'DPK',
                    product: 'HF81A',
                    price: '---',
                    available: false,
                    error: 'API DPK recusada: HTTP 403; x-amz-cf-id=cf-request-456',
                };
            } },
        });
        const matrix = await service.ScraperService.searchMultipleProducts(['HF81A']);
        assert.equal(directSearchCalls, 1);
        assert.equal(matrix.HF81A[0].provider, 'DPK');
        assert.match(matrix.HF81A[0].error, /HTTP 403/);
    } finally {
        if (previousMode === undefined) delete process.env.LOCAL_AGENT_MODE;
        else process.env.LOCAL_AGENT_MODE = previousMode;
        if (previousRequired === undefined) delete process.env.LOCAL_AGENT_REQUIRE_FOR_SEARCH;
        else process.env.LOCAL_AGENT_REQUIRE_FOR_SEARCH = previousRequired;
    }
});

test('LOCAL_AGENT_REQUIRE_FOR_SEARCH fails closed even when agent mode is disabled', async () => {
    const previousMode = process.env.LOCAL_AGENT_MODE;
    const previousRequired = process.env.LOCAL_AGENT_REQUIRE_FOR_SEARCH;
    process.env.LOCAL_AGENT_MODE = 'disabled';
    process.env.LOCAL_AGENT_REQUIRE_FOR_SEARCH = 'true';

    let directSearchCalls = 0;
    try {
        const enginePath = path.resolve(__dirname, '../../scraping/engine.js');
        const service = loadModule('../dist/services/scraper.service.js', {
            '@prisma/client': { PrismaClient: function () {
                return {
                    supplier: {
                        findMany: async () => [{ id: 'comdip', name: 'Comdip', url: 'https://portalcomdip.com.br', websiteSearchEnabled: true, needsLogin: true }],
                    },
                };
            } },
            '../index': { io: socket },
            './local-agent.service': {
                LocalAgentService: {
                    hasActiveAgentsForSupplier: () => false,
                    dispatchSearchTask: async () => { throw new Error('Unexpected dispatch'); },
                },
            },
            [enginePath]: { scrapeProduct: async () => {
                directSearchCalls += 1;
                return [offer('Comdip')];
            } },
        });
        const matrix = await service.ScraperService.searchMultipleProducts(['HF81A']);
        assert.equal(directSearchCalls, 0);
        assert.match(matrix.HF81A[0].error, /LOCAL_AGENT_REQUIRE_FOR_SEARCH está ativo/);
    } finally {
        if (previousMode === undefined) delete process.env.LOCAL_AGENT_MODE;
        else process.env.LOCAL_AGENT_MODE = previousMode;
        if (previousRequired === undefined) delete process.env.LOCAL_AGENT_REQUIRE_FOR_SEARCH;
        else process.env.LOCAL_AGENT_REQUIRE_FOR_SEARCH = previousRequired;
    }
});

test('DPK direct API failures retain CloudFront diagnostics and do not trigger Playwright fallback', async () => {
    let browserLaunches = 0;
    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: false,
        status: 403,
        headers: new Map([
            ['x-amz-cf-id', 'cf-request-123'],
            ['x-cache', 'Error from cloudfront'],
            ['authorization', 'must-not-be-read'],
        ]),
    });

    try {
        const dpkStrategy = loadModule('../../scraping/suppliers/dpk.js', {});
        const enginePath = path.resolve(__dirname, '../../scraping/engine.js');
        const engineModule = loadModule(enginePath, {
            playwright: {
                chromium: {
                    launch: async () => {
                        browserLaunches += 1;
                        throw new Error('Browser fallback must not run');
                    },
                },
            },
            './suppliers': { resolveStrategy: () => dpkStrategy },
            './suppliers/shared': { safeString: (value) => String(value || '').trim(), buildSelectorList: () => [] },
        });

        const result = await engineModule.scrapeProduct({ name: 'DPK', url: 'https://www.dpk.com.br' }, 'W712');
        assert.equal(browserLaunches, 0);
        assert.equal(result.provider, 'DPK');
        assert.match(result.error, /HTTP 403/);
        assert.match(result.error, /x-amz-cf-id=cf-request-123/);
        assert.equal(JSON.stringify(result).includes('authorization'), false);
        assert.equal(JSON.stringify(result).includes('Bearer '), false);
    } finally {
        global.fetch = originalFetch;
    }
});

test('DPK API diagnostics exclude unsafe response headers and credentials', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: false,
        status: 403,
        headers: new Map([
            ['x-amz-cf-id', 'cf-request-456'],
            ['x-cache', 'Error from cloudfront'],
            ['authorization', 'must-not-be-read'],
        ]),
    });

    try {
        const strategy = loadModule('../../scraping/suppliers/dpk.js', {});
        await assert.rejects(
            strategy.directSearch({
                supplier: { name: 'DPK', loginCredential: 'user-value', password: 'secret-value' },
                query: 'W712',
            }),
            (error) => {
                assert.match(error.message, /HTTP 403/);
                assert.match(error.message, /x-amz-cf-id=cf-request-456/);
                assert.match(error.message, /x-cache=Error from cloudfront/);
                assert.equal(error.message.includes('must-not-be-read'), false);
                assert.equal(error.message.includes('secret-value'), false);
                return true;
            }
        );
    } finally {
        global.fetch = originalFetch;
    }
});

test('DPK assisted login uses the store Chrome even when local-agent mode is disabled', async () => {
    const previousMode = process.env.LOCAL_AGENT_MODE;
    const previousRequired = process.env.LOCAL_AGENT_REQUIRE_FOR_SEARCH;
    process.env.LOCAL_AGENT_MODE = 'disabled';
    process.env.LOCAL_AGENT_REQUIRE_FOR_SEARCH = 'false';

    const supplier = { id: 'dpk', name: 'DPK', url: 'https://www.dpk.com.br' };
    const dispatched = [];
    try {
        const service = loadModule('../dist/services/supplier-session.service.js', {
            '@prisma/client': {
                PrismaClient: function () {
                    return { supplier: { findUnique: async () => supplier } };
                },
            },
            './local-agent.service': {
                LocalAgentService: {
                    hasActiveAgentsForSupplier: (candidate) => candidate.id === supplier.id,
                    dispatchSessionTask: async (_candidate, action) => {
                        dispatched.push(action);
                        return { mode: 'local-agent', action };
                    },
                },
            },
        });

        const result = await service.SupplierSessionService.start(supplier.id);
        assert.deepEqual(result, { mode: 'local-agent', action: 'start' });
        assert.deepEqual(dispatched, ['start']);
    } finally {
        if (previousMode === undefined) delete process.env.LOCAL_AGENT_MODE;
        else process.env.LOCAL_AGENT_MODE = previousMode;
        if (previousRequired === undefined) delete process.env.LOCAL_AGENT_REQUIRE_FOR_SEARCH;
        else process.env.LOCAL_AGENT_REQUIRE_FOR_SEARCH = previousRequired;
    }
});

test('DPK assisted login fails clearly instead of opening a CloudFront-blocked server browser', async () => {
    const previousMode = process.env.LOCAL_AGENT_MODE;
    const previousRequired = process.env.LOCAL_AGENT_REQUIRE_FOR_SEARCH;
    process.env.LOCAL_AGENT_MODE = 'disabled';
    process.env.LOCAL_AGENT_REQUIRE_FOR_SEARCH = 'false';

    const supplier = { id: 'dpk-offline', name: 'DPK', url: 'https://www.dpk.com.br' };
    try {
        const service = loadModule('../dist/services/supplier-session.service.js', {
            '@prisma/client': {
                PrismaClient: function () {
                    return { supplier: { findUnique: async () => supplier } };
                },
            },
            './local-agent.service': {
                LocalAgentService: {
                    hasActiveAgentsForSupplier: () => false,
                    dispatchSessionTask: async () => {
                        throw new Error('An offline agent must not receive a task');
                    },
                },
            },
        });

        await assert.rejects(
            service.SupplierSessionService.start(supplier.id),
            /precisa do Chrome da loja/
        );
    } finally {
        if (previousMode === undefined) delete process.env.LOCAL_AGENT_MODE;
        else process.env.LOCAL_AGENT_MODE = previousMode;
        if (previousRequired === undefined) delete process.env.LOCAL_AGENT_REQUIRE_FOR_SEARCH;
        else process.env.LOCAL_AGENT_REQUIRE_FOR_SEARCH = previousRequired;
    }
});
