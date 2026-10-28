const { safeString } = require('./shared');

const PORTAL_URL = 'https://vesporpro.com.br/compras';
const LOGIN_URL = 'https://vesporpro.com.br/login';
const RESULT_MARKER_ID = 'vespor-results-ready';

function formatBrl(value) {
    const amount = Number(value || 0);
    if (!(amount > 0)) {
        return '';
    }

    return `R$ ${amount.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

async function getFreshApiToken(loginCredential, password) {
    try {
        const res = await fetch('https://vesporpro.com.br/b2b/api/v1/usuario/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Origin': 'https://vesporpro.com.br',
                'Referer': 'https://vesporpro.com.br/login',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            },
            body: JSON.stringify({
                login: loginCredential || 'centroautomotivo0058@hotmail.com',
                senha: password || 'Re539597@',
                turnstileToken: ''
            })
        });
        const data = await res.json();
        if (data?.token) {
            return data;
        }
    } catch (_) {}
    return null;
}

module.exports = {
    key: 'vespor',
    matches: (supplierName) =>
        supplierName.includes('vespor') ||
        supplierName.includes('vesporpro'),
    authenticatedUrl: PORTAL_URL,
    navigateToAuthenticatedAfterLogin: true,

    directSearch: async ({ supplier, query }) => {
        try {
            const loginData = await getFreshApiToken(supplier?.loginCredential, supplier?.password);
            if (!loginData?.token) {
                console.error('[vespor] Falha ao autenticar na API do Vespor Pro');
                return null;
            }

            const token = loginData.token;
            const user = loginData.usuario || {};
            const codfilial = user.codfilial || '52';
            const codfilori = user.codfilori || '52';
            const codcliente = user.codcliente || '014198';
            const codclienteloja = user.codclienteloja || '01';

            const searchRes = await fetch('https://vesporpro.com.br/b2b/api/v1/produto/pesquisa', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                    Origin: 'https://vesporpro.com.br',
                    Referer: 'https://vesporpro.com.br/compras',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                },
                body: JSON.stringify({
                    codfilial,
                    codfilori,
                    codcliente,
                    codclienteloja,
                    pesquisa: query,
                    itenspagina: 50,
                    pagina: 1,
                    codcondpag: '',
                    marcas: [],
                    categorias: [],
                }),
            });

            if (!searchRes.ok) {
                if (searchRes.status === 404) {
                    return [];
                }
                return null;
            }

            const searchData = await searchRes.json();
            const rawProducts = Array.isArray(searchData?.produtos) ? searchData.produtos : [];

            const results = rawProducts.map((item) => {
                const precoPromocao = Number(item.vlr_x3 || 0);
                const precoTabela = Number(item.vlr_lc || 0);
                const valorFinal = precoPromocao > 0 ? precoPromocao : precoTabela;

                const stockNum = Number(item.estoque || 0) + Number(item.estoque_filiais || 0);
                const estoqueTxt = stockNum > 0
                    ? `${stockNum} un (${item.mensagemEstoque || 'Em estoque'})`
                    : (item.mensagemEstoque || 'Indisponível');

                const codigo = item.codproduto || item.codprodutofraga || item.codproduto_origem || '';
                const nome = item.descproduto || item.descricaofraga || '';
                const marca = item.descfornecedor || '';
                const aplicacao = item.aplicacao || '';

                return {
                    provider: supplier.name,
                    nome: `${nome} ${marca} ${codigo}`.trim(),
                    preco: formatBrl(valorFinal),
                    codigo,
                    marca,
                    aplicacao,
                    estoque: stockNum,
                    estoqueTexto: estoqueTxt,
                    link: codigo ? `https://vesporpro.com.br/produto/${encodeURIComponent(codigo)}` : 'https://vesporpro.com.br/compras',
                    imagem: item.url_imagem || item.url_thumbnail || '',
                };
            }).filter((item) => safeString(item.nome) && safeString(item.preco));

            if (query && results.length > 0) {
                const cleanQ = String(query).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                results.sort((a, b) => {
                    const aCode = String(a.codigo || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                    const bCode = String(b.codigo || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                    const aExact = aCode === cleanQ;
                    const bExact = bCode === cleanQ;
                    if (aExact && !bExact) return -1;
                    if (!aExact && bExact) return 1;
                    const aIncludes = aCode.includes(cleanQ) || cleanQ.includes(aCode);
                    const bIncludes = bCode.includes(cleanQ) || cleanQ.includes(bCode);
                    if (aIncludes && !bIncludes) return -1;
                    if (!aIncludes && bIncludes) return 1;
                    return 0;
                });
            }

            return results;
        } catch (err) {
            console.error('[vespor] directSearch error:', err.message);
            return null;
        }
    },
    userSelector: [
        'input#username',
        'input[name="username"]',
        'input[type="email"]',
        'input[type="text"]',
    ],
    passSelector: [
        'input#passwordlbl',
        'input[name="password"]',
        'input[type="password"]',
    ],
    submitSelector: [
        'button:has-text("Entrar")',
        'button[type="submit"]',
    ],
    loginSuccessSelector: [
        `#${RESULT_MARKER_ID}`,
        'text="CARRINHO"',
        'text="CENTRO AUTOMOTIVO"',
        'text="Produtos"',
        'input[placeholder*="pesquis" i]',
        'input[placeholder*="buscar" i]',
        '.navbar',
    ],
    searchSelector: [`#${RESULT_MARKER_ID}`],
    itemContainerSelector: [`#${RESULT_MARKER_ID}[data-count]`],
    emptyResultSelector: [`#${RESULT_MARKER_ID}[data-empty="true"]`],
    preferStrategySelectors: true,
    waitForResultsOnly: true,

    preparePage: async ({ page, supplier, context }) => {
        const loginData = await getFreshApiToken(supplier.loginCredential, supplier.password);
        if (loginData?.token) {
            await context.addCookies([
                {
                    name: 'authToken',
                    value: loginData.token,
                    domain: 'vesporpro.com.br',
                    path: '/'
                }
            ]);

            await context.addInitScript(({ token, data }) => {
                localStorage.setItem('authToken', token);
                localStorage.setItem('dadosLogin', JSON.stringify(data));
            }, { token: loginData.token, data: loginData });

            supplier._freshVesporLogin = loginData;
        }
    },

    performSearch: async ({ page, query, supplier }) => {
        let freshData = supplier._freshVesporLogin;
        if (!freshData?.token) {
            freshData = await getFreshApiToken(supplier.loginCredential, supplier.password);
        }

        const result = await page.evaluate(async ({ query, resultMarkerId, initialLoginData, supplierLogin, supplierPass }) => {
            const cleanupMarker = () => {
                const previous = document.getElementById(resultMarkerId);
                if (previous) {
                    previous.remove();
                }
            };

            const setMarker = (dataset = {}) => {
                cleanupMarker();
                const marker = document.createElement('div');
                marker.id = resultMarkerId;
                marker.hidden = true;

                for (const [key, value] of Object.entries(dataset)) {
                    if (value !== undefined && value !== null && value !== '') {
                        marker.dataset[key] = String(value);
                    }
                }

                document.body.appendChild(marker);
                return marker;
            };

            try {
                let token = initialLoginData?.token || localStorage.getItem('authToken');
                let dadosLogin = initialLoginData;
                if (!dadosLogin) {
                    try {
                        dadosLogin = JSON.parse(localStorage.getItem('dadosLogin') || '{}');
                    } catch (_) {}
                }

                let user = dadosLogin?.usuario || {};

                if (!token || !user.codfilial) {
                    const loginRes = await fetch('/b2b/api/v1/usuario/login', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Origin': 'https://vesporpro.com.br',
                            'Referer': 'https://vesporpro.com.br/login'
                        },
                        body: JSON.stringify({
                            login: supplierLogin || 'centroautomotivo0058@hotmail.com',
                            senha: supplierPass || 'Re539597@',
                            turnstileToken: '',
                        }),
                    });

                    const resData = await loginRes.json();
                    if (resData?.token) {
                        token = resData.token;
                        user = resData.usuario || {};
                        localStorage.setItem('authToken', token);
                        localStorage.setItem('dadosLogin', JSON.stringify(resData));
                    }
                }

                if (!token) {
                    setMarker({ error: 'missing-token' });
                    return { error: 'missing-token' };
                }

                const codfilial = user.codfilial || '52';
                const codfilori = user.codfilori || '52';
                const codcliente = user.codcliente || '014198';
                const codclienteloja = user.codclienteloja || '01';

                const searchRes = await fetch('/b2b/api/v1/produto/pesquisa', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        codfilial,
                        codfilori,
                        codcliente,
                        codclienteloja,
                        pesquisa: query,
                        itenspagina: 50,
                        pagina: 1,
                        codcondpag: '',
                        marcas: [],
                        categorias: [],
                    }),
                });

                const searchData = await searchRes.json();
                const items = Array.isArray(searchData?.produtos) ? searchData.produtos : [];
                window.__vesporApiResults = items;
                window.__vesporApiLastQuery = query;

                setMarker({
                    count: items.length,
                    empty: items.length ? '' : 'true',
                    status: searchRes.status,
                });

                return { count: items.length };
            } catch (err) {
                setMarker({ error: 'fetch-failed', message: err.message });
                return { error: 'fetch-failed', message: err.message };
            }
        }, {
            query,
            resultMarkerId: RESULT_MARKER_ID,
            initialLoginData: freshData,
            supplierLogin: supplier?.loginCredential || '',
            supplierPass: supplier?.password || '',
        });

        if (result?.error === 'missing-token') {
            throw new Error('Sessão expirada ou não autenticada no portal Vespor Pro.');
        }
    },

    extractItems: async ({ page, supplier }) => {
        const products = await page.evaluate(() => {
            const results = Array.isArray(window.__vesporApiResults) ? window.__vesporApiResults : [];

            return results.map((item) => {
                const precoPromocao = Number(item.vlr_x3 || 0);
                const precoTabela = Number(item.vlr_lc || 0);
                const valorFinal = precoPromocao > 0 ? precoPromocao : precoTabela;

                const stockNum = Number(item.estoque || 0) + Number(item.estoque_filiais || 0);
                const estoqueTxt = stockNum > 0
                    ? `${stockNum} un (${item.mensagemEstoque || 'Em estoque'})`
                    : (item.mensagemEstoque || 'Indisponível');

                const codigo = item.codproduto || item.codprodutofraga || item.codproduto_origem || '';
                const nome = item.descproduto || item.descricaofraga || '';
                const marca = item.descfornecedor || '';
                const aplicacao = item.aplicacao || '';

                return {
                    nome,
                    precoNumero: valorFinal,
                    codigo,
                    marca,
                    aplicacao,
                    estoque: stockNum,
                    estoqueTexto: estoqueTxt,
                    link: codigo ? `https://vesporpro.com.br/produto/${encodeURIComponent(codigo)}` : 'https://vesporpro.com.br/compras',
                };
            });
        });

        return products.map((item) => ({
            provider: supplier.name,
            nome: item.nome,
            preco: formatBrl(item.precoNumero),
            codigo: item.codigo,
            marca: item.marca,
            aplicacao: item.aplicacao,
            estoque: item.estoque,
            estoqueTexto: item.estoqueTexto,
            link: item.link || PORTAL_URL,
        })).filter((item) => safeString(item.nome) && safeString(item.preco));
    },

    resetSearchState: async ({ page }) => {
        await page.evaluate(({ resultMarkerId }) => {
            const marker = document.getElementById(resultMarkerId);
            if (marker) {
                marker.remove();
            }
            window.__vesporApiResults = [];
            window.__vesporApiLastQuery = '';
        }, { resultMarkerId: RESULT_MARKER_ID }).catch(() => {});
    },

    baseUrl: PORTAL_URL,
};
