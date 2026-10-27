import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const defaultSuppliers = [
    {
        name: 'DPK',
        url: 'https://www.dpk.com.br',
        type: 'Distribuidor',
        needsLogin: true,
        loginUrl: 'https://www.dpk.com.br/#/login',
        loginUserSelector: 'input[type="email"], input[formcontrolname="userPrincipalName"]',
        loginPassSelector: 'input[type="password"], input[formcontrolname="password"]',
        loginSubmitSelector: 'button:has-text("Entrar")',
        loginCredential: 'atendimento@centroautomotivo0058.com',
        password: 'Re539597@',
        searchUrl: 'https://www.dpk.com.br/#/busca-produto?termo={query}',
        searchBarSelector: 'input[formcontrolname="searchTerm"], input[placeholder*="código ou descrição" i]',
        searchBtnSelector: 'button:has-text("Buscar")',
        itemContainerSelector: 'div.cardsAlinhamento > mat-card.produto-card, mat-card.produto-card',
        productNameSelector: 'h2.mat-h4, h2',
        priceSelector: 'span.cor-preco',
        websiteSearchEnabled: true,
        sessionSlug: 'dpk',
    },
    {
        name: 'Auto Norte (KKI)',
        url: 'https://kki.autonorte.com.br',
        type: 'Distribuidor',
        needsLogin: true,
        loginUrl: 'https://kki.autonorte.com.br/login',
        loginUserSelector: 'input[type="email"], input[placeholder*="email" i]',
        loginPassSelector: 'input[type="password"]',
        loginSubmitSelector: 'button[type="submit"]',
        loginCredential: 'atendimento@centroautomotivo0058.com',
        password: '71401',
        searchUrl: 'https://kki.autonorte.com.br/compras',
        searchBarSelector: 'input[placeholder*="pesquisar" i], input[type="search"]',
        searchBtnSelector: 'button[type="submit"]',
        itemContainerSelector: 'div[class*="jay046"], div.produto',
        productNameSelector: 'p[class*="rhqd7b"], h3, strong',
        priceSelector: 'button, span.preco',
        websiteSearchEnabled: true,
        sessionSlug: 'auto-norte-kki',
    },
    {
        name: 'Real Moto Peças (RMP)',
        url: 'https://www.rmp.com.br',
        type: 'Distribuidor',
        needsLogin: true,
        loginUrl: 'https://www.rmp.com.br/customer/account/login/',
        loginUserSelector: 'input[name="login[username]"], input[type="email"]',
        loginPassSelector: 'input[name="login[password]"], input[type="password"]',
        loginSubmitSelector: 'button[type="submit"].login',
        loginCredential: 'centroautomotivo0058@hotmail.com',
        password: 'Ren@n0058@',
        searchUrl: 'https://www.rmp.com.br/catalogsearch/result/?q={query}',
        searchBarSelector: '#search-cod-fab-input, #minisearch-input-top-search',
        searchBtnSelector: 'button.btn-search-fab-cod, button[type="submit"]',
        itemContainerSelector: 'li.item.product.product-item, .product-item',
        productNameSelector: '.product-item-name a, .product-name',
        priceSelector: '.price-box .price, .price',
        websiteSearchEnabled: true,
        sessionSlug: 'real-moto-pecas-rmp',
    },
    {
        name: 'Comdip',
        url: 'https://portalcomdip.com.br/comdip/compras',
        type: 'Distribuidor',
        needsLogin: true,
        loginUrl: 'https://portalcomdip.com.br/comdip/login',
        loginUserSelector: 'input[placeholder*="cnpj" i], #Cnpj, #Login',
        loginPassSelector: 'input[placeholder*="senha" i], #pass, input[type="password"]',
        loginSubmitSelector: 'button:has-text("Entrar"), button[type="submit"]',
        loginCredential: '33.299.637/0001-80',
        password: 'Re539597@',
        searchUrl: 'https://portalcomdip.com.br/comdip/compras/pesquisa/termo-busca/{query}/1',
        searchBarSelector: 'input[type="search"], .search-input',
        searchBtnSelector: 'button[type="submit"]',
        itemContainerSelector: '[class*="produto"], [class*="item"], article',
        productNameSelector: 'h2, h3, h4, a, strong',
        priceSelector: '.price, .valor',
        websiteSearchEnabled: true,
        sessionSlug: 'comdip',
    },
    {
        name: 'Sky Peças',
        url: 'https://cliente.skypecas.com.br',
        type: 'Distribuidor',
        needsLogin: true,
        loginUrl: 'https://cliente.skypecas.com.br/login',
        loginUserSelector: 'input[name="login"], input[placeholder*="usuario" i], input[type="text"]',
        loginPassSelector: 'input[type="password"]',
        loginSubmitSelector: 'button[type="submit"]',
        loginCredential: 'renan0058',
        password: 'rE539597@',
        loginExtraValue: '33.299.637/0001-80',
        searchUrl: 'https://cliente.skypecas.com.br/produtos',
        searchBarSelector: '#btnBuscar, input[placeholder*="codigo" i]',
        searchBtnSelector: '#btnBuscar, button[type="submit"]',
        websiteSearchEnabled: true,
        sessionSlug: 'sky-pecas',
    },
    {
        name: 'Furacão Auto Peças',
        url: 'https://vendas.furacao.com.br/vendas/sav/produtos',
        type: 'Distribuidor',
        needsLogin: true,
        loginUrl: 'https://vendas.furacao.com.br/vendas/sav/login',
        loginUserSelector: 'input#username',
        loginPassSelector: 'input#password',
        loginSubmitSelector: 'button.btn-primary',
        loginExtraSelector: 'select#f',
        loginExtraValue: '1',
        loginCredential: '125435',
        password: 'Re539597@',
        searchUrl: 'https://vendas.furacao.com.br/vendas/sav/produtos',
        searchBarSelector: 'input#gsearch',
        searchBtnSelector: '',
        itemContainerSelector: 'div.prod-container, .product-box',
        productNameSelector: 'div.prod-descricao, .product-title',
        priceSelector: 'div.prod-preco, .product-price',
        websiteSearchEnabled: true,
        sessionSlug: 'furacao-auto-pecas',
    },
    {
        name: 'Kaizen Auto Peças',
        url: 'https://portal.kaizenautopecas.com.br/principal',
        type: 'Distribuidor',
        needsLogin: true,
        loginUrl: 'https://portal.kaizenautopecas.com.br',
        loginUserSelector: 'input[placeholder*="cnpj" i], input[placeholder*="cpf" i]',
        loginPassSelector: 'input[type="password"]',
        loginSubmitSelector: 'button:has-text("Entrar")',
        loginCredential: '33.299.637/0001-80',
        password: 'Re539597@',
        searchUrl: 'https://portal.kaizenautopecas.com.br/principal',
        websiteSearchEnabled: true,
        sessionSlug: 'kaizen-auto-pecas',
    },
    {
        name: 'Rolemar Master',
        url: 'https://rolemarmaster.com',
        type: 'Distribuidor',
        needsLogin: true,
        loginUrl: 'https://rolemarmaster.com/login?origin=%2F',
        loginUserSelector: 'input#usuario',
        loginPassSelector: 'input#senha',
        loginSubmitSelector: 'button:has-text("Entrar")',
        loginCredential: '33299637000180',
        password: 'Re539597@',
        searchUrl: '',
        searchBarSelector: '#header-form-search input',
        itemContainerSelector: '.product-info, .ant-spin-container',
        websiteSearchEnabled: true,
        sessionSlug: 'rolemar-master',
    },
    {
        name: 'Vespor Pro',
        url: 'https://vesporpro.com.br',
        type: 'Distribuidor',
        needsLogin: true,
        loginUrl: 'https://vesporpro.com.br/login',
        loginUserSelector: 'input#username',
        loginPassSelector: 'input#passwordlbl',
        loginSubmitSelector: 'button:has-text("Entrar")',
        loginCredential: 'centroautomotivo0058@hotmail.com',
        password: 'Re539597@',
        searchUrl: 'https://vesporpro.com.br/compras',
        websiteSearchEnabled: true,
        sessionSlug: 'vespor-pro',
    },
];

export async function bootstrapSuppliers() {
    try {
        const sessionsDir = path.resolve(__dirname, '../../../scraping/sessions');

        for (const item of defaultSuppliers) {
            const { sessionSlug, ...supplierData } = item;
            let sessionJson: string | null = null;

            if (sessionSlug) {
                const sessionFile = path.join(sessionsDir, `${sessionSlug}.json`);
                if (fs.existsSync(sessionFile)) {
                    try {
                        sessionJson = fs.readFileSync(sessionFile, 'utf8');
                    } catch (_) {}
                }
            }

            const existing = await prisma.supplier.findFirst({
                where: {
                    OR: [
                        { name: { contains: item.name } },
                        { url: { contains: item.url } }
                    ]
                }
            });

            if (existing) {
                // Update credentials and session if missing or needs update
                const updateData: any = {
                    loginCredential: existing.loginCredential || supplierData.loginCredential,
                    password: existing.password || supplierData.password,
                    searchUrl: supplierData.searchUrl,
                    websiteSearchEnabled: true,
                };
                if (sessionJson && (!existing.sessionData || existing.sessionData.length < 50)) {
                    updateData.sessionData = sessionJson;
                }
                if (supplierData.loginExtraValue && !existing.loginExtraValue) {
                    updateData.loginExtraValue = supplierData.loginExtraValue;
                }

                await prisma.supplier.update({
                    where: { id: existing.id },
                    data: updateData,
                });
            } else {
                await prisma.supplier.create({
                    data: {
                        ...supplierData,
                        sessionData: sessionJson,
                    },
                });
                console.log(`[Bootstrap] Fornecedor criado: ${item.name}`);
            }
        }
        console.log('[Bootstrap] Fornecedores verificados e sincronizados com sucesso.');
    } catch (error: any) {
        console.error('[Bootstrap Error] Falha ao sincronizar fornecedores:', error.message);
    }
}
