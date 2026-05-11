const { safeString } = require('./shared');

const PORTAL_URL = 'https://portal.kaizenautopecas.com.br/';
const PORTAL_HOME_URL = 'https://portal.kaizenautopecas.com.br/principal';
const SEARCH_API_URL = 'https://services.kaizenautopecas.com.br/searchcode';
const RESULT_MARKER_ID = 'kaizen-results-ready';

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

module.exports = {
    key: 'kaizen',
    matches: (supplierName) => supplierName.includes('kaizen') || supplierName.includes('portal.kaizenautopecas.com.br'),
    authenticatedUrl: PORTAL_HOME_URL,
    navigateToAuthenticatedAfterLogin: true,
    userSelector: [
        'input[placeholder*="cnpj" i]',
        'input[placeholder*="cpf" i]',
        'input[type="text"]',
    ],
    passSelector: [
        'input[type="password"]',
        'input[placeholder*="senha" i]',
    ],
    submitSelector: [
        'button:has-text("Entrar")',
        'button[type="submit"]',
    ],
    loginSuccessSelector: [
        'button:has-text("Veiculo")',
        'button:has-text("Veículo")',
        'button:has-text("Codigo")',
        'button:has-text("Código")',
        'input[placeholder*="codigo da peca" i]',
        'input[placeholder*="código da peça" i]',
        `#${RESULT_MARKER_ID}`,
    ],
    searchSelector: [`#${RESULT_MARKER_ID}`],
    itemContainerSelector: [`#${RESULT_MARKER_ID}[data-count]`],
    emptyResultSelector: [`#${RESULT_MARKER_ID}[data-empty="true"]`],
    preferStrategySelectors: true,
    waitForResultsOnly: true,
    fillLogin: async ({ page, supplier, fillVisibleLocator, dismissTransientUi }) => {
        await dismissTransientUi();

        const loginValue = supplier.loginCredential || supplier.loginExtraValue || '';
        if (!loginValue) {
            throw new Error('Fornecedor sem CNPJ/login configurado.');
        }

        const userInput = page.locator('input[placeholder*="cnpj" i], input[placeholder*="cpf" i], input[type="text"]').first();
        await userInput.waitFor({ state: 'visible', timeout: 15000 });
        await fillVisibleLocator(userInput, loginValue);

        const passwordInput = page.locator('input[type="password"], input[placeholder*="senha" i]').first();
        await passwordInput.waitFor({ state: 'visible', timeout: 15000 });
        await fillVisibleLocator(passwordInput, supplier.password || '');

        const submitButton = page.locator('button:has-text("Entrar"), button[type="submit"]').first();
        await page.waitForTimeout(1200);
        const buttonDisabled = await submitButton.isDisabled().catch(() => false);
        const hasTurnstileField = await page.locator('input[name="cf-turnstile-response"]').count().catch(() => 0);

        if (buttonDisabled) {
            throw new Error('Sessao do Kaizen expirou e o portal exige desafio de seguranca. Use o Login Assistido no portal e salve a sessao novamente.');
        }
    },
    performSearch: async ({ page, query }) => {
        const result = await page.evaluate(async ({ query, searchApiUrl, resultMarkerId }) => {
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

            const decodeJwtPayload = (token) => {
                try {
                    const [, payload] = String(token || '').split('.');
                    if (!payload) return null;

                    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
                    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
                    return JSON.parse(atob(padded));
                } catch (_) {
                    return null;
                }
            };

            const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
            if (!token) {
                setMarker({ error: 'missing-token' });
                return { error: 'missing-token' };
            }

            const decoded = decodeJwtPayload(token) || {};
            const payload = {
                pesquisa: query,
                cd_loja: String(
                    decoded.userCDLoja
                    || decoded.userCDLojaAtual
                    || decoded.userCDLojaOrigem
                    || ''
                ).trim(),
                siglaUF: String(localStorage.getItem('uf') || decoded.userUf || decoded.uf || '').trim(),
                pageSize: 50,
                pageIndex: 0,
                codcli: String(decoded.userCODCLI || decoded.userCodcli || decoded.codcli || '').trim(),
            };

            const response = await fetch(searchApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Custom-Header': 'axios',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });

            const rawText = await response.text();
            let responseBody = {};

            try {
                responseBody = rawText ? JSON.parse(rawText) : {};
            } catch (_) {
                responseBody = { rawText };
            }

            if (!response.ok) {
                setMarker({
                    error: response.status === 401 ? 'invalid-token' : 'request-failed',
                    status: response.status,
                });

                return {
                    error: response.status === 401 ? 'invalid-token' : 'request-failed',
                    status: response.status,
                    message: responseBody?.message || rawText,
                };
            }

            const items = Array.isArray(responseBody?.formatProducts) ? responseBody.formatProducts : [];
            window.__kaizenApiResults = items;
            window.__kaizenApiLastQuery = query;
            setMarker({
                count: items.length,
                empty: items.length ? '' : 'true',
                status: response.status,
            });

            return {
                count: items.length,
            };
        }, {
            query,
            searchApiUrl: SEARCH_API_URL,
            resultMarkerId: RESULT_MARKER_ID,
        });

        if (result?.error === 'missing-token' || result?.error === 'invalid-token') {
            throw new Error('Sessao expirada ou login bloqueado. Refaça o Login Assistido deste fornecedor.');
        }

        if (result?.error) {
            throw new Error(safeString(result.message) || 'Falha ao consultar o portal Kaizen.');
        }
    },
    extractItems: async ({ page, supplier }) => {
        const products = await page.evaluate(() => {
            const results = Array.isArray(window.__kaizenApiResults) ? window.__kaizenApiResults : [];

            const totalStock = (stocks) => {
                if (!Array.isArray(stocks)) return 0;
                return stocks.reduce((sum, item) => sum + (Number(item?.quantidadeEstoque || 0) || 0), 0);
            };

            return results.map((item) => {
                const backendData = item?.backendData || {};
                const saleValue = (Number(backendData.valorPrecoVenda || 0) || 0) + (Number(backendData.valorSTVenda || 0) || 0);
                const promoValue = (Number(backendData.valorPrecoPromocao || 0) || 0) + (Number(backendData.valorSTPromocao || 0) || 0);
                const promoMinimum = Number(backendData.minimoPromocao || 0) || 0;
                const hasImmediatePromo = promoValue > 0 && promoValue < saleValue && promoMinimum <= 1;
                const priceValue = hasImmediatePromo ? promoValue : saleValue;
                const stocks = Array.isArray(backendData.estoquesLoja) ? backendData.estoquesLoja : [];

                return {
                    nome: item?.descricao || item?.nome || '',
                    precoNumero: priceValue,
                    codigo: item?.cd_prod || item?.codigo || '',
                    marca: item?.marca || '',
                    aplicacao: item?.observa || item?.observa2 || '',
                    estoque: totalStock(stocks),
                    estoqueTexto: backendData.mensagemStock || '',
                    link: item?.cd_prod ? `https://portal.kaizenautopecas.com.br/produto/${encodeURIComponent(item.cd_prod)}` : PORTAL_HOME_URL,
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
            link: item.link || PORTAL_HOME_URL,
        })).filter((item) => safeString(item.nome) && safeString(item.preco));
    },
    resetSearchState: async ({ page }) => {
        await page.evaluate(({ resultMarkerId }) => {
            const marker = document.getElementById(resultMarkerId);
            if (marker) {
                marker.remove();
            }

            window.__kaizenApiResults = [];
            window.__kaizenApiLastQuery = '';
        }, { resultMarkerId: RESULT_MARKER_ID }).catch(() => {});
    },
    baseUrl: PORTAL_URL,
};
