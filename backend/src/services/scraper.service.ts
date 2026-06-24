        return {
            provider: supplier.name,
            product: productName,
            price: '---',
            error: `Erro do Bot: Nenhum agente local online para ${supplier.name}.`,
            link: supplier.url,
            available: false,
            debug: null,
        };
    }

    return runSupplierSearch(supplier, productName);
}

async function executeSupplierSearchWithGuards(supplier: any, productName: string) {
    const cacheEnabled = isResultCacheEnabled();
    const cacheTtlMs = cacheEnabled ? parseNonNegativeInt(process.env.SCRAPER_CACHE_TTL_MS, 0) : 0;
    const timeoutMs = parsePositiveInt(process.env.SCRAPER_SUPPLIER_TIMEOUT_MS, 165_000);
    const cacheKey = getSupplierCacheKey(supplier, productName);
    const cached = cacheEnabled ? supplierSearchCache.get(cacheKey) : null;

    if (cached && cached.expiresAt > Date.now()) {
        return clonePayload(cached.value);
    }

    if (cached) {
        supplierSearchCache.delete(cacheKey);
    } else if (!cacheEnabled && supplierSearchCache.size > 0) {
        supplierSearchCache.clear();
    }

    let result;
    try {
        result = await withTimeout(
            executeSupplierSearch(supplier, productName),
            timeoutMs,
            `${supplier.name} (${productName})`
        );
    } catch (error: any) {
        return {
            provider: supplier.name,
            product: productName,
            price: '---',
            error: `Erro do Bot: ${error?.message || 'Fornecedor excedeu o tempo limite.'}`,
            link: supplier.url,
            available: false,
            debug: null,
        };
    }

    if (isCacheableSearchResult(result) && cacheTtlMs > 0) {
        pruneSearchCache();
        supplierSearchCache.set(cacheKey, {
            expiresAt: Date.now() + cacheTtlMs,
            value: clonePayload(result),
        });
    }

    return result;
}

function normalizeSearchResultPayload(result: any, supplier: any, productName: string) {
    if (Array.isArray(result)) {
        const normalizedItems = normalizeSupplierResults(result, supplier, productName);
        return normalizedItems.length <= 1
            ? (normalizedItems[0] || buildNoOfferResult(supplier, productName))
            : normalizedItems;
    }

    return result;
}

export class ScraperService {
    static async searchSupplierProduct(supplierId: string, productName: string) {
        const supplier = await prisma.supplier.findUnique({
            where: { id: supplierId },
        });

        if (!supplier) {
            throw new Error('Fornecedor não encontrado.');
        }

        if ((supplier as any).websiteSearchEnabled === false) {
            return {
                provider: supplier.name,
                product: productName,
                price: '---',
                available: false,
                stockText: 'Busca por site/agente local desativada para este fornecedor.',
                link: supplier.url,
            };
        }

        const result = await executeSupplierSearchWithGuards(supplier, productName);
        const normalized = normalizeSearchResultPayload(result, supplier, productName);
        return Array.isArray(normalized) ? normalized[0] || null : normalized;
    }

    static async searchMultipleProducts(
        productNames: string[],
        progressRoom?: string,
        progressContext: Record<string, any> = {},
        onProgress?: (payload: { supplier: string; productName: string; result: any }) => void,
        shouldCancel?: () => boolean
    ) {
        const suppliers = (await prisma.supplier.findMany()).filter((supplier: any) => supplier.websiteSearchEnabled !== false);
        const concurrency = Math.max(1, Number.parseInt(process.env.SCRAPER_CONCURRENCY || '3', 10) || 3);
        const resultsByProduct: Record<string, any[]> = {};

        for (const productName of productNames) {
            if (shouldCancel?.()) break;
            console.log(`Buscando em todos os fornecedores para: ${productName}`);

            const productResults: any[] = [];
            for (let index = 0; index < suppliers.length; index += concurrency) {
                if (shouldCancel?.()) break;
                const currentBatch = suppliers.slice(index, index + concurrency);
                const batchResults = await Promise.all(currentBatch.map(async (supplier) => {
                    if (shouldCancel?.()) {
                        return {
                            provider: supplier.name,
                            product: productName,
                            price: '---',
                            error: 'Orçamento cancelado pelo usuário.',
                            link: supplier.url,
                            available: false,
                            debug: null,
                        };
                    }
                    const result = await executeSupplierSearchWithGuards(supplier, productName);
                    const normalizedPayload = normalizeSearchResultPayload(result, supplier, productName);
                    const normalizedResults = (Array.isArray(normalizedPayload) ? normalizedPayload : [normalizedPayload])
                        .filter((entry) => entry && typeof entry === 'object');

                    for (const entry of normalizedResults) {
                        const progressPayload = {
                            supplier: entry.provider || supplier.name,
                            productName,
                            result: entry,
                        };
                        onProgress?.(progressPayload);
                        if (progressRoom) {
                            io.to(progressRoom).emit('quote_progress', {
                                ...progressPayload,
                                ...progressContext,
                            });
                        }
                    }
                    return normalizedResults;
                }));
                productResults.push(...batchResults.flat());
            }

            resultsByProduct[productName] = productResults;
        }

        return resultsByProduct;
    }
}
