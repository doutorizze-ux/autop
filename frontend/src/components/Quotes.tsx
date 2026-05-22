import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../services/api';
import { socket } from '../services/socket';
import { useAuth } from '../context/AuthContext';
import {
    Search,
    Plus,
    Trash2,
    FileText,
    Download,
    Loader2,
    RefreshCw,
    Clock3,
} from 'lucide-react';
import { formatDateTime } from '../utils/date';

type QuoteItemInput = {
    query: string;
    description?: string;
    category?: string;
    categoryLocked?: boolean;
    label?: string;
};

type QuoteResult = {
    provider: string;
    product?: string;
    price?: string | number;
    link?: string;
    error?: string;
    stock?: number;
    stockText?: string;
    code?: string;
    brand?: string;
    application?: string;
    variantKey?: string;
    whatsappStatus?: 'pending' | 'queued' | 'failed';
    whatsappPhone?: string;
    whatsappError?: string;
    whatsappMessageId?: string;
    whatsappJid?: string;
    whatsappManualQuote?: boolean;
    whatsappManualQuoteAt?: string;
    exportSelectedSimilar?: boolean;
};

type QuoteMatrix = Record<string, QuoteResult[]>;

type VariantGroup = {
    key: string;
    title: string;
    application?: string;
    code?: string;
    brands: string[];
    offersCount: number;
    bestPrice: number;
    exactMatch: boolean;
};

type QuoteSearchResponse = {
    jobId?: string;
    status?: 'running' | 'completed' | 'failed' | 'cancelled';
    quoteId?: string;
    createdAt: string;
    completedAt?: string;
    updatedAt?: string;
    items: QuoteItemInput[];
    suppliers: string[];
    matrix: QuoteMatrix;
    error?: string;
};

const apiBase = API_URL;
const getActiveQuoteJobStorageKey = (userId?: string) => `active_quote_job_id:${userId || 'sem-usuario'}`;
const getQuotePrefillStorageKey = (userId?: string) => `quote_prefill_item:${userId || 'sem-usuario'}`;
const quoteCategories = [
    { key: 'pecas-automotivas', label: 'Pecas automotivas' },
    { key: 'pecas-eletricas', label: 'Pecas eletricas' },
    { key: 'concessionarias', label: 'Concessionarias' },
    { key: 'pneu', label: 'Pneu' },
];
const getQuoteCategoryLabel = (key?: string) =>
    quoteCategories.find((category) => category.key === key)?.label || quoteCategories[0].label;

const normalizeCategoryText = (value: string) =>
    String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

const inferQuoteCategory = (query: string, description?: string) => {
    const text = normalizeCategoryText(`${query} ${description || ''}`);

    if (/\bpneu\b|\baro\b|\bmedida\b|\b\d{3}\s*\d{2}\s*r?\d{2}\b/.test(text)) return 'pneu';
    if (/\bsensor\b|\beletric|\beletron|\bbateria\b|\blampada\b|\bfarol\b|\balternador\b|\bmotor de partida\b|\bmodulo\b|\brele\b|\bfusivel\b|\bchicote\b|\bbobina\b|\bvela\b|\bignicao\b|\bsonda\b/.test(text)) return 'pecas-eletricas';
    if (/\bconcessionaria\b|\bgenuin[ao]\b|\boriginal\b|\boem\b/.test(text)) return 'concessionarias';

    return 'pecas-automotivas';
};

type QuotesProps = {
    openHistoryId?: string;
};

const normalizeVariantKey = (value?: string) =>
    String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

const normalizeCodeValue = (value?: string) =>
    String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim();

const parsePriceValue = (value?: string | number) => {
    if (value === undefined || value === null || value === '') return Number.POSITIVE_INFINITY;
    if (typeof value === 'number') return value;

    const normalized = String(value)
        .replace(/\s/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
        .replace(/[^\d.-]/g, '');

    const parsed = Number.parseFloat(normalized);
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};

const formatCurrencyValue = (value?: string | number) => {
    const parsed = parsePriceValue(value);
    if (!Number.isFinite(parsed)) return '---';

    return parsed.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

const hasUsablePrice = (result?: QuoteResult | null) =>
    !!result && !result.error && Number.isFinite(parsePriceValue(result.price));

const hasManualWhatsappQuote = (result?: QuoteResult | null) =>
    !!result?.whatsappStatus && hasUsablePrice(result);

const formatResultPrice = (result?: QuoteResult | null) => {
    if (!result) return '---';
    if (hasUsablePrice(result)) return `R$ ${formatCurrencyValue(result.price)}`;
    if (result.whatsappStatus === 'queued') return 'Aguardando resposta';
    if (result.whatsappStatus === 'pending') return 'Enviando WhatsApp';
    if (result.whatsappStatus === 'failed') return 'Falha no envio';
    return '---';
};

const getMatchType = (result: QuoteResult, normalizedQueryCode: string, hasExactMatch: boolean) => {
    const normalizedResultCode = normalizeCodeValue(result.code);
    if (normalizedResultCode && normalizedResultCode === normalizedQueryCode) {
        return 'exact' as const;
    }
    if (!normalizedResultCode) {
        return hasExactMatch ? ('missing-code' as const) : ('similar' as const);
    }
    return 'similar' as const;
};

const buildResultIdentity = (result: QuoteResult) =>
    [
        normalizeCodeValue(result.provider),
        normalizeVariantKey(result.variantKey || `${result.product || ''} ${result.application || ''}`),
        normalizeCodeValue(result.brand),
        normalizeCodeValue(result.code),
        parsePriceValue(result.price),
    ].join('::');

const buildVariantGroupKey = (result: QuoteResult) =>
    normalizeVariantKey(
        result.variantKey ||
        `${result.product || ''} ${result.application || ''} ${result.code || ''}`
    );

const buildVariantGroupLabel = (group: VariantGroup) => {
    const parts = [
        group.exactMatch ? 'Código exato' : 'Similar',
        group.code || 's/código',
        group.title || 'Peça sem descrição',
        `${group.offersCount} oferta(s)`,
    ];
    return parts.join(' • ');
};

const buildVariantSelectionKey = (query: string, provider: string) => `${query}::${provider}`;

const buildOfferSelectionKey = (query: string, provider: string, variantKey?: string) =>
    `${query}::${provider}::${variantKey || 'all'}`;

const buildSimilarExportKey = (query: string, provider: string, result?: QuoteResult | null) =>
    `${query}::${provider}::${result ? buildResultIdentity(result) : 'sem-resultado'}`;

const isSameQuoteResult = (candidate: QuoteResult, target: QuoteResult) => {
    if (target.whatsappMessageId && candidate.whatsappMessageId === target.whatsappMessageId) {
        return true;
    }

    if (target.whatsappJid && candidate.whatsappJid === target.whatsappJid && candidate.provider === target.provider) {
        return normalizeCodeValue(candidate.code) === normalizeCodeValue(target.code);
    }

    if (target.whatsappStatus || candidate.whatsappStatus) {
        return (
            candidate.provider === target.provider &&
            normalizeCodeValue(candidate.whatsappPhone) === normalizeCodeValue(target.whatsappPhone) &&
            normalizeCodeValue(candidate.code) === normalizeCodeValue(target.code)
        );
    }

    return buildResultIdentity(candidate) === buildResultIdentity(target);
};

const getManualPriceDefaultValue = (result: QuoteResult) => {
    const price = parsePriceValue(result.price);
    return Number.isFinite(price) ? String(price).replace('.', ',') : '';
};

const buildVariantGroups = (results: QuoteResult[], query: string) => {
    const groupMap = new Map<string, VariantGroup>();
    const normalizedQueryCode = normalizeCodeValue(query);

    results.forEach((entry) => {
        const key = buildVariantGroupKey(entry);
        if (!key) return;

        const existing = groupMap.get(key);
        const entryPrice = parsePriceValue(entry.price);
        const entryCode = normalizeCodeValue(entry.code);

        if (!existing) {
            groupMap.set(key, {
                key,
                title: String(entry.product || 'Peça sem descrição'),
                application: entry.application ? String(entry.application) : '',
                code: entry.code ? String(entry.code) : '',
                brands: entry.brand ? [String(entry.brand)] : [],
                offersCount: 1,
                bestPrice: entryPrice,
                exactMatch: !!entryCode && entryCode === normalizedQueryCode,
            });
            return;
        }

        existing.offersCount += 1;
        existing.bestPrice = Math.min(existing.bestPrice, entryPrice);
        if (!existing.code && entry.code) existing.code = String(entry.code);
        if (!existing.application && entry.application) existing.application = String(entry.application);
        if (!existing.title && entry.product) existing.title = String(entry.product);
        if (entry.brand && !existing.brands.includes(String(entry.brand))) {
            existing.brands.push(String(entry.brand));
        }
        if (!!entryCode && entryCode === normalizedQueryCode) {
            existing.exactMatch = true;
        }
    });

    return Array.from(groupMap.values()).sort((a, b) => {
        if (a.exactMatch !== b.exactMatch) return a.exactMatch ? -1 : 1;
        if (a.bestPrice !== b.bestPrice) return a.bestPrice - b.bestPrice;
        return a.title.localeCompare(b.title, 'pt-BR');
    });
};

const sortSupplierResults = (results: QuoteResult[], query: string) => {
    const normalizedQueryCode = normalizeCodeValue(query);
    const hasExactMatch = results.some((entry) => normalizeCodeValue(entry.code) === normalizedQueryCode);

    return [...results].sort((a, b) => {
        if (a.error && !b.error) return 1;
        if (!a.error && b.error) return -1;

        const matchRank = { exact: 0, similar: 1, 'missing-code': 2 } as const;
        const aMatch = getMatchType(a, normalizedQueryCode, hasExactMatch);
        const bMatch = getMatchType(b, normalizedQueryCode, hasExactMatch);
        if (matchRank[aMatch] !== matchRank[bMatch]) {
            return matchRank[aMatch] - matchRank[bMatch];
        }

        const priceA = parsePriceValue(a.price);
        const priceB = parsePriceValue(b.price);
        if (priceA !== priceB) {
            return priceA - priceB;
        }

        const brandCompare = String(a.brand || '').localeCompare(String(b.brand || ''), 'pt-BR');
        if (brandCompare !== 0) return brandCompare;

        return String(a.code || '').localeCompare(String(b.code || ''), 'pt-BR');
    });
};

const getProviderResultsForVariant = (
    results: QuoteResult[],
    provider: string,
    query: string,
    selectedVariantKey?: string
) =>
    sortSupplierResults(
        results.filter(
            (entry) =>
                entry.provider === provider &&
                !entry.error &&
                (!!entry.whatsappStatus || !selectedVariantKey || buildVariantGroupKey(entry) === selectedVariantKey)
        ),
        query
    );

const downloadBlob = (blob: BlobPart, filename: string) => {
    const url = window.URL.createObjectURL(new Blob([blob]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
};

export const Quotes = ({ openHistoryId }: QuotesProps) => {
    const { user } = useAuth();
    const activeQuoteJobStorageKey = getActiveQuoteJobStorageKey(user?.id);
    const quotePrefillStorageKey = getQuotePrefillStorageKey(user?.id);
    const [partList, setPartList] = useState<QuoteItemInput[]>([]);
    const [newPart, setNewPart] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [quoteCategory, setQuoteCategory] = useState(quoteCategories[0].key);
    const [quoteCategoryLocked, setQuoteCategoryLocked] = useState(false);
    const [quoteMatrix, setQuoteMatrix] = useState<QuoteMatrix>({});
    const [suppliers, setSuppliers] = useState<string[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [currentQuoteId, setCurrentQuoteId] = useState('');
    const [currentCreatedAt, setCurrentCreatedAt] = useState('');
    const [activeJobId, setActiveJobId] = useState(() => localStorage.getItem(activeQuoteJobStorageKey) || '');
    const [quoteJobStatus, setQuoteJobStatus] = useState('');
    const [quoteJobError, setQuoteJobError] = useState('');
    const [selectedOfferByQuerySupplier, setSelectedOfferByQuerySupplier] = useState<Record<string, string>>({});
    const [selectedVariantByQuerySupplier, setSelectedVariantByQuerySupplier] = useState<Record<string, string>>({});
    const [includedSimilarInPdf, setIncludedSimilarInPdf] = useState<Record<string, boolean>>({});
    const [activeResultView, setActiveResultView] = useState<'summary' | string>('summary');

    const scrollToResults = () => {
        window.setTimeout(() => {
            document.getElementById('quote-results-panel')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        }, 80);
    };

    useEffect(() => {
        setActiveJobId(localStorage.getItem(activeQuoteJobStorageKey) || '');
    }, [activeQuoteJobStorageKey]);

    useEffect(() => {
        if (quoteCategoryLocked) return;
        setQuoteCategory(inferQuoteCategory(newPart, newDescription));
    }, [newDescription, newPart, quoteCategoryLocked]);

    const applyQuoteJob = async (data: QuoteSearchResponse) => {
        setQuoteJobStatus(data.status || '');
        setQuoteJobError(data.error || '');
        setPartList(
            data.items.map((item) => ({
                query: item.query,
                description: item.description,
                category: item.category,
                label: item.label,
            }))
        );
        setQuoteMatrix(data.matrix || {});
        setSuppliers(data.suppliers || []);
        setSelectedOfferByQuerySupplier({});
        setSelectedVariantByQuerySupplier({});
        setIncludedSimilarInPdf({});

        if (data.jobId) {
            setActiveJobId(data.jobId);
        }

        if (data.status === 'running') {
            setIsSearching(true);
            setCurrentCreatedAt(data.createdAt);
            return;
        }

        setIsSearching(false);
        localStorage.removeItem(activeQuoteJobStorageKey);
        setActiveJobId('');

        if (data.status === 'completed') {
            setCurrentQuoteId(data.quoteId || '');
            setCurrentCreatedAt(data.completedAt || data.createdAt);
            scrollToResults();
        }
    };

    const fetchQuoteJob = async (jobId: string) => {
        const response = await axios.get<QuoteSearchResponse>(`${apiBase}/api/quotes/jobs/${jobId}`);
        await applyQuoteJob(response.data);
    };

    useEffect(() => {
        if (!activeJobId) return;

        localStorage.setItem(activeQuoteJobStorageKey, activeJobId);
        void fetchQuoteJob(activeJobId).catch(() => {
            setIsSearching(false);
            setActiveJobId('');
            localStorage.removeItem(activeQuoteJobStorageKey);
        });

        const interval = window.setInterval(() => {
            void fetchQuoteJob(activeJobId).catch((error) => {
                console.error('Quote Job Poll Error:', error);
            });
        }, 3000);

        return () => window.clearInterval(interval);
    }, [activeJobId, activeQuoteJobStorageKey]);

    useEffect(() => {
        const handleProgress = (data: { supplier: string; productName: string; result: any; jobId?: string }) => {
            if (data.jobId && data.jobId !== activeJobId) {
                return;
            }

            setQuoteMatrix((prev) => {
                const next = { ...prev };
                if (!next[data.productName]) {
                    next[data.productName] = [];
                }
                const identity = [
                    data.supplier,
                    normalizeVariantKey(data.result?.variantKey || `${data.result?.product || ''} ${data.result?.application || ''}`),
                    normalizeVariantKey(data.result?.brand),
                    normalizeVariantKey(data.result?.code),
                ].join('::');
                const exists = next[data.productName].findIndex((r) => {
                    const currentIdentity = [
                        r.provider,
                        normalizeVariantKey(r.variantKey || `${r.product || ''} ${r.application || ''}`),
                        normalizeVariantKey(r.brand),
                        normalizeVariantKey(r.code),
                    ].join('::');
                    return currentIdentity === identity;
                });
                if (exists !== -1) {
                    next[data.productName][exists] = data.result;
                } else {
                    next[data.productName].push(data.result);
                }
                return next;
            });
            setSuppliers((prev) => {
                if (!prev.includes(data.supplier)) {
                    return [...prev, data.supplier];
                }
                return prev;
            });
        };

        socket.on('quote_progress', handleProgress);

        return () => {
            socket.off('quote_progress', handleProgress);
        };
    }, [activeJobId]);

    useEffect(() => {
        const applyPrefill = () => {
            const raw = localStorage.getItem(quotePrefillStorageKey);
            if (!raw) return;

            try {
                const payload = JSON.parse(raw) as QuoteItemInput;
                const query = String(payload.query || '').trim();
                const description = String(payload.description || '').trim();
                const category = String(payload.category || inferQuoteCategory(query, description)).trim();

                if (!query) return;

                setPartList((current) => {
                    const alreadyExists = current.some((item) => item.query.toLowerCase() === query.toLowerCase());
                    if (alreadyExists) return current;

                    return [
                        ...current,
                        {
                            query,
                            description: description || undefined,
                            category: category || undefined,
                            categoryLocked: !!payload.categoryLocked,
                        },
                    ];
                });
            } catch (error) {
                console.error('Quote Prefill Error:', error);
            } finally {
                localStorage.removeItem(quotePrefillStorageKey);
            }
        };

        applyPrefill();
        window.addEventListener('quote-prefill-ready', applyPrefill);
        return () => window.removeEventListener('quote-prefill-ready', applyPrefill);
    }, [quotePrefillStorageKey]);

    const handleAddPart = (event?: React.FormEvent) => {
        if (event) event.preventDefault();

        const query = newPart.trim();
        const description = newDescription.trim();
        const category = quoteCategoryLocked ? quoteCategory : inferQuoteCategory(query, description);

        if (!query) {
            return;
        }

        const alreadyExists = partList.some((item) => item.query.toLowerCase() === query.toLowerCase());
        if (alreadyExists) {
            setNewPart('');
            setNewDescription('');
            return;
        }

        setPartList((current) => [
            ...current,
            {
                query,
                description: description || undefined,
                category,
                categoryLocked: quoteCategoryLocked,
            },
        ]);

        setNewPart('');
        setNewDescription('');
        setQuoteCategoryLocked(false);
        setQuoteCategory(quoteCategories[0].key);
    };

    const handleRemovePart = (index: number) => {
        setPartList((current) => current.filter((_, itemIndex) => itemIndex !== index));
    };

    const handleSearchPrices = async () => {
        if (partList.length === 0) return;

        setIsSearching(true);
        setQuoteMatrix({});
        setSuppliers([]);
        setSelectedOfferByQuerySupplier({});
        setSelectedVariantByQuerySupplier({});
        setIncludedSimilarInPdf({});
        setCurrentQuoteId('');
        setCurrentCreatedAt('');
        setQuoteJobStatus('running');
        setQuoteJobError('');

        try {
            const response = await axios.post<QuoteSearchResponse>(`${apiBase}/api/quotes/search`, {
                items: partList.map((item) => ({
                    query: item.query,
                    description: item.description,
                    category: item.category,
                    categoryLocked: item.categoryLocked,
                }))
            });

            if (response.data.jobId) {
                localStorage.setItem(activeQuoteJobStorageKey, response.data.jobId);
            }
            await applyQuoteJob(response.data);
        } catch (error) {
            console.error('Search Quote Error:', error);
            const message = axios.isAxiosError(error)
                ? error.response?.data?.message
                : '';
            alert(message || 'Erro ao buscar preços. Verifique se os fornecedores estão configurados corretamente.');
            setIsSearching(false);
            setQuoteJobStatus('');
        } finally {
        }
    };

    const handleCancelSearch = async () => {
        if (!activeJobId) return;

        try {
            await axios.post(`${apiBase}/api/quotes/jobs/${activeJobId}/cancel`);
            setIsSearching(false);
            setQuoteJobStatus('cancelled');
            setActiveJobId('');
            localStorage.removeItem(activeQuoteJobStorageKey);
        } catch (error) {
            console.error('Cancel Quote Job Error:', error);
            alert('Não foi possível cancelar este orçamento agora.');
        }
    };

    const persistQuoteSnapshot = async (nextMatrix: QuoteMatrix) => {
        if (!currentQuoteId) return;

        try {
            await axios.put(`${apiBase}/api/quotes/history/${currentQuoteId}`, {
                items: partList.map((item) => ({
                    query: item.query,
                    description: item.description,
                    category: item.category,
                    label: item.label,
                })),
                suppliers,
                matrix: nextMatrix,
            });
        } catch (error) {
            console.error('Persist Manual WhatsApp Quote Error:', error);
        }
    };

    const handleSaveWhatsappManualQuote = (
        event: React.FormEvent<HTMLFormElement>,
        query: string,
        result: QuoteResult
    ) => {
        event.preventDefault();

        const formData = new FormData(event.currentTarget);
        const rawPrice = String(formData.get('price') || '').trim();
        const price = parsePriceValue(rawPrice);

        if (!Number.isFinite(price) || price <= 0) {
            alert('Informe um valor valido para este fornecedor.');
            return;
        }

        const product = String(formData.get('product') || '').trim();
        const brand = String(formData.get('brand') || '').trim();
        const stockText = String(formData.get('stockText') || '').trim();
        const application = String(formData.get('application') || '').trim();

        let nextMatrix: QuoteMatrix = {};
        setQuoteMatrix((current) => {
            nextMatrix = {
                ...current,
                [query]: (current[query] || []).map((entry) =>
                    isSameQuoteResult(entry, result)
                        ? {
                              ...entry,
                              price,
                              product: product || entry.product || `Cotacao WhatsApp: ${query}`,
                              brand: brand || entry.brand || 'WhatsApp',
                              stockText: stockText || 'Valor informado pelo WhatsApp',
                              application: application || entry.application || '',
                              whatsappManualQuote: true,
                              whatsappManualQuoteAt: new Date().toISOString(),
                          }
                        : entry
                ),
            };

            return nextMatrix;
        });

        void persistQuoteSnapshot(nextMatrix);
    };

    const handleExportCurrent = async (type: 'pdf' | 'excel') => {
        try {
            const response = await axios.post(`${apiBase}/api/quotes/export/${type}`, {
                items: partList.map((item) => ({
                    query: item.query,
                    description: item.description,
                })),
                suppliers,
                matrix: quoteMatrix,
                selectedOffers: type === 'pdf' ? pdfSelectedOffersByQuerySupplier : selectedOffersByQuerySupplier,
            }, {
                responseType: 'blob',
            });

            downloadBlob(
                response.data,
                `orcamento-atual-${Date.now()}.${type === 'pdf' ? 'pdf' : 'xlsx'}`
            );
        } catch (error) {
            console.error('Export Current Quote Error:', error);
            alert('Erro ao exportar o arquivo atual.');
        }
    };

    const handleOpenHistory = async (quoteId: string) => {
        try {
            const response = await axios.get<QuoteSearchResponse>(`${apiBase}/api/quotes/history/${quoteId}`);
            setPartList(
                response.data.items.map((item) => ({
                    query: item.query,
                    description: item.description,
                    label: item.label,
                }))
            );
            setQuoteMatrix(response.data.matrix || {});
            setSuppliers(response.data.suppliers || []);
            setSelectedOfferByQuerySupplier({});
            setSelectedVariantByQuerySupplier({});
            setIncludedSimilarInPdf({});
            setCurrentQuoteId(response.data.quoteId || quoteId);
            setCurrentCreatedAt(response.data.createdAt);
            setIsSearching(false);
            setActiveJobId('');
            localStorage.removeItem(activeQuoteJobStorageKey);
            scrollToResults();
        } catch (error) {
            console.error('Open Saved Quote Error:', error);
            alert('Não foi possível abrir essa cotação salva.');
        }
    };

    useEffect(() => {
        if (!openHistoryId) return;
        void handleOpenHistory(openHistoryId);
    }, [openHistoryId]);

    const hasResults = partList.length > 0 && suppliers.length > 0;

    useEffect(() => {
        if (activeResultView === 'summary') return;
        if (!suppliers.includes(activeResultView)) {
            setActiveResultView('summary');
        }
    }, [activeResultView, suppliers]);

    const variantGroupsByQuerySupplier = useMemo(() => {
        const groupsByQuerySupplier: Record<string, VariantGroup[]> = {};

        partList.forEach((item) => {
            const sourceResults = quoteMatrix[item.query] || [];
            const providerNames = Array.from(new Set([...suppliers, ...sourceResults.map((entry) => entry.provider).filter(Boolean)]));

            providerNames.forEach((provider) => {
                const providerResults = sourceResults.filter((entry) => entry.provider === provider && !entry.error && !entry.whatsappStatus);
                groupsByQuerySupplier[buildVariantSelectionKey(item.query, provider)] = buildVariantGroups(providerResults, item.query);
            });
        });

        return groupsByQuerySupplier;
    }, [partList, quoteMatrix, suppliers]);

    const resolvedVariantSelectionByQuerySupplier = useMemo(() => {
        const resolved: Record<string, string> = {};

        partList.forEach((item) => {
            const sourceResults = quoteMatrix[item.query] || [];
            const providerNames = Array.from(new Set([...suppliers, ...sourceResults.map((entry) => entry.provider).filter(Boolean)]));

            providerNames.forEach((provider) => {
                const variantSelectionKey = buildVariantSelectionKey(item.query, provider);
                const variants = variantGroupsByQuerySupplier[variantSelectionKey] || [];
                const preferred = selectedVariantByQuerySupplier[variantSelectionKey];
                const exists = variants.some((group) => group.key === preferred);
                resolved[variantSelectionKey] = exists ? preferred : variants[0]?.key || '';
            });
        });

        return resolved;
    }, [partList, quoteMatrix, selectedVariantByQuerySupplier, suppliers, variantGroupsByQuerySupplier]);

    const selectedOffersByQuerySupplier = useMemo(() => {
        const selections: Record<string, Record<string, QuoteResult | null>> = {};

        partList.forEach((item) => {
            const sourceResults = quoteMatrix[item.query] || [];
            const providerNames = Array.from(new Set([...suppliers, ...sourceResults.map((entry) => entry.provider).filter(Boolean)]));
            const querySelections: Record<string, QuoteResult | null> = {};

            providerNames.forEach((provider) => {
                const selectedVariantKey = resolvedVariantSelectionByQuerySupplier[buildVariantSelectionKey(item.query, provider)];
                const providerResults = getProviderResultsForVariant(
                    sourceResults,
                    provider,
                    item.query,
                    selectedVariantKey
                );

                if (providerResults.length === 0) {
                    querySelections[provider] = null;
                    return;
                }

                const selectionKey = buildOfferSelectionKey(item.query, provider, selectedVariantKey);
                const selectedIdentity = selectedOfferByQuerySupplier[selectionKey];
                const selectedResult =
                    providerResults.find((entry) => buildResultIdentity(entry) === selectedIdentity) || providerResults[0];

                querySelections[provider] = selectedResult;
            });

            selections[item.query] = querySelections;
        });

        return selections;
    }, [partList, quoteMatrix, resolvedVariantSelectionByQuerySupplier, selectedOfferByQuerySupplier, suppliers]);

    const pdfSelectedOffersByQuerySupplier = useMemo(() => {
        const selections: Record<string, Record<string, QuoteResult | null>> = {};

        partList.forEach((item) => {
            const normalizedQueryCode = normalizeCodeValue(item.query);
            const querySelections: Record<string, QuoteResult | null> = {};

            suppliers.forEach((provider) => {
                const selectedResult = selectedOffersByQuerySupplier[item.query]?.[provider] || null;
                if (!selectedResult || selectedResult.error) {
                    querySelections[provider] = null;
                    return;
                }

                if (selectedResult.whatsappStatus) {
                    querySelections[provider] = hasManualWhatsappQuote(selectedResult) ? selectedResult : null;
                    return;
                }

                const isExact = !!normalizeCodeValue(selectedResult.code) && normalizeCodeValue(selectedResult.code) === normalizedQueryCode;
                const includeSimilar = includedSimilarInPdf[buildSimilarExportKey(item.query, provider, selectedResult)];

                querySelections[provider] = isExact || includeSimilar
                    ? {
                          ...selectedResult,
                          exportSelectedSimilar: !isExact && !!includeSimilar,
                      }
                    : null;
            });

            selections[item.query] = querySelections;
        });

        return selections;
    }, [includedSimilarInPdf, partList, selectedOffersByQuerySupplier, suppliers]);

    return (
        <div className="quotes-container">
            <div className="quotes-header">
                <div>
                    <h1 className="page-title">Orçamento Simultâneo</h1>
                    <p className="page-subtitle">
                        Monte uma fila de códigos; cada item é pesquisado em todos os fornecedores antes do próximo começar.
                    </p>
                </div>
            </div>

            <div className="quote-category-selector" aria-label="Tipo de cotacao">
                {quoteCategories.map((category) => (
                    <button
                        key={category.key}
                        type="button"
                        className={quoteCategory === category.key ? 'active' : ''}
                        onClick={() => {
                            setQuoteCategory(category.key);
                            setQuoteCategoryLocked(true);
                        }}
                    >
                        {category.label}
                    </button>
                ))}
            </div>

            <div className="search-box">
                <form onSubmit={handleAddPart} className="add-part-form">
                    <div className="input-group input-group-main">
                        <label htmlFor="quote-query">Código ou nome da peça</label>
                        <div className="input-with-icon">
                            <Search className="search-icon" size={20} />
                            <input
                                id="quote-query"
                                type="text"
                                placeholder="Digite o código ou nome da peça"
                                value={newPart}
                                onChange={(event) => setNewPart(event.target.value)}
                                className="part-input"
                            />
                        </div>
                    </div>

                    <div className="input-group input-group-description">
                        <label htmlFor="quote-description">Descrição opcional para a equipe</label>
                        <input
                            id="quote-description"
                            type="text"
                            placeholder="Ex: Pastilha dianteira Hilux 2022"
                            value={newDescription}
                            onChange={(event) => setNewDescription(event.target.value)}
                            className="part-input secondary-input"
                        />
                    </div>

                    <button type="submit" className="add-btn">
                        <Plus size={18} /> Adicionar
                    </button>
                </form>

                {partList.length > 0 && (
                    <div className="part-list">
                        <div className="part-list-header">
                            <h4>Fila de Cotação ({partList.length} {partList.length === 1 ? 'item' : 'itens'})</h4>
                            {currentCreatedAt && (
                                <span className="quote-meta">
                                    <Clock3 size={14} /> {formatDateTime(currentCreatedAt)}
                                </span>
                            )}
                        </div>

                        <div className="tags-container">
                            {partList.map((item, index) => (
                                <span key={`${item.query}-${index}`} className="part-tag">
                                    <span className="part-tag-content">
                                        <strong>{item.query}</strong>
                                        <small>{getQuoteCategoryLabel(item.category)}</small>
                                        {item.description && <small>{item.description}</small>}
                                    </span>
                                    <button type="button" onClick={() => handleRemovePart(index)}>
                                        <Trash2 size={14} />
                                    </button>
                                </span>
                            ))}
                        </div>

                        <button
                            className="btn-primary start-search-btn"
                            onClick={handleSearchPrices}
                            disabled={isSearching}
                        >
                            {isSearching ? (
                                <>
                                    <Loader2 className="spin" size={20} /> Cotando em andamento...
                                </>
                            ) : (
                                <>
                                    <RefreshCw size={20} /> Iniciar Fila de Orçamentos
                                </>
                            )}
                        </button>
                        {isSearching && (
                            <div className="quote-running-status">
                                <span>
                                    Orçamento em andamento. Pode trocar de menu ou atualizar a página que ele continua.
                                </span>
                                <button type="button" onClick={() => void handleCancelSearch()}>
                                    Parar este orçamento
                                </button>
                            </div>
                        )}
                        {quoteJobStatus === 'cancelled' && (
                            <div className="quote-job-warning">Orçamento cancelado.</div>
                        )}
                        {quoteJobStatus === 'failed' && (
                            <div className="quote-job-warning">{quoteJobError || 'Orçamento falhou.'}</div>
                        )}
                    </div>
                )}
            </div>

            {hasResults && (
                <div className="results-panel" id="quote-results-panel">
                    <div className="results-header">
                        <div>
                            <h3>Resultados por Fornecedor</h3>
                            {currentQuoteId && (
                                <p className="results-caption">
                                    Cotação salva em {formatDateTime(currentCreatedAt)}
                                </p>
                            )}
                        </div>

                        <div className="export-actions">
                            <button className="export-btn excel" onClick={() => handleExportCurrent('excel')}>
                                <Download size={16} /> Exportar Excel
                            </button>
                            <button className="export-btn pdf" onClick={() => handleExportCurrent('pdf')}>
                                <FileText size={16} /> Gerar PDF
                            </button>
                        </div>
                    </div>

                    <div className="results-list">
                        <div className="results-tabs">
                            <button
                                type="button"
                                className={`results-tab ${activeResultView === 'summary' ? 'active' : ''}`}
                                onClick={() => setActiveResultView('summary')}
                            >
                                Resumo geral
                            </button>
                            {suppliers.map((supplier) => (
                                <button
                                    key={supplier}
                                    type="button"
                                    className={`results-tab ${activeResultView === supplier ? 'active' : ''}`}
                                    onClick={() => setActiveResultView(supplier)}
                                >
                                    {supplier}
                                </button>
                            ))}
                        </div>

                        {partList.map((item) => {
                            const rawResults = quoteMatrix[item.query] || [];
                            const normalizedQueryCode = normalizeCodeValue(item.query);
                            const viewProviders =
                                activeResultView === 'summary'
                                    ? suppliers
                                    : suppliers.includes(activeResultView)
                                        ? [activeResultView]
                                        : [];
                            const providerCards = viewProviders
                                .map((provider) => {
                                    const variantSelectionKey = buildVariantSelectionKey(item.query, provider);
                                    const variantGroups = variantGroupsByQuerySupplier[variantSelectionKey] || [];
                                    const selectedVariantKey = resolvedVariantSelectionByQuerySupplier[variantSelectionKey] || '';
                                    const selectedVariant = variantGroups.find((group) => group.key === selectedVariantKey) || null;
                                    const providerResults = getProviderResultsForVariant(
                                        rawResults,
                                        provider,
                                        item.query,
                                        selectedVariantKey
                                    );
                                    const selectionKey = buildOfferSelectionKey(item.query, provider, selectedVariantKey);
                                    const selectedIdentity = selectedOfferByQuerySupplier[selectionKey];
                                    const selectedResult =
                                        providerResults.find((entry) => buildResultIdentity(entry) === selectedIdentity) ||
                                        providerResults[0] ||
                                        null;
                                    const hasExactMatch = providerResults.some(
                                        (entry) => normalizeCodeValue(entry.code) === normalizedQueryCode
                                    );

                                    return {
                                        provider,
                                        providerResults,
                                        selectedResult,
                                        hasExactMatch,
                                        variantSelectionKey,
                                        variantGroups,
                                        selectedVariantKey,
                                        selectedVariant,
                                    };
                                })
                                .filter((card) => activeResultView === 'summary' ? !!card.selectedResult : true);

                            const visibleSelectedResults = providerCards
                                .map((card) => card.selectedResult)
                                .filter((entry): entry is QuoteResult => !!entry);
                            const comparableSelectedResults = visibleSelectedResults.filter(
                                (entry) => !entry.whatsappStatus || hasManualWhatsappQuote(entry)
                            );
                            const bestComparableResults = comparableSelectedResults.length > 0
                                ? comparableSelectedResults
                                : visibleSelectedResults;
                            const hasExactMatch = visibleSelectedResults.some(
                                (entry) =>
                                    (!entry.whatsappStatus || hasManualWhatsappQuote(entry)) &&
                                    normalizeCodeValue(entry.code) === normalizedQueryCode
                            );
                            const bestResult =
                                [...bestComparableResults].sort((a, b) => {
                                    const aExact = normalizeCodeValue(a.code) === normalizedQueryCode;
                                    const bExact = normalizeCodeValue(b.code) === normalizedQueryCode;
                                    if (aExact !== bExact) return aExact ? -1 : 1;
                                    return parsePriceValue(a.price) - parsePriceValue(b.price);
                                })[0] || null;

                            return (
                                <div key={item.query} className="quote-item-card">
                                    <div className="quote-item-header">
                                        <div className="part-cell-main">{item.query}</div>
                                        {bestResult && (
                                            <div className="best-offer-badge">
                                                {bestResult.whatsappStatus
                                                    ? hasManualWhatsappQuote(bestResult)
                                                        ? 'Melhor valor WhatsApp'
                                                        : 'Solicitação WhatsApp'
                                                    : hasExactMatch
                                                        ? 'Melhor oferta exata atual'
                                                        : 'Melhor similar atual'}: {bestResult.provider} • {formatResultPrice(bestResult)}
                                            </div>
                                        )}
                                    </div>

                                    {item.description && <div className="part-cell-description">{item.description}</div>}
                                    <div className="quote-item-helper">
                                        {hasExactMatch
                                            ? 'Mostrando primeiro as ofertas reais do código exato pesquisado.'
                                            : 'Código exato não apareceu. Abaixo estão os similares reais retornados pelos fornecedores.'}
                                    </div>

                                    <div className="supplier-results-grid compact-results-grid">
                                        {providerCards.length > 0 ? (
                                            providerCards.map((card) => {
                                                const supplierResult = card.selectedResult;
                                                if (!supplierResult) {
                                                    return (
                                                        <div
                                                            key={`${item.query}-${card.provider}-empty`}
                                                            className="supplier-view-card compact-supplier-card empty-supplier-card"
                                                        >
                                                            <div className="supplier-view-header compact-supplier-header">
                                                                <strong>{card.provider}</strong>
                                                            </div>
                                                            <div className="supplier-view-error">
                                                                Este fornecedor não retornou oferta real para a peça escolhida.
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                const isBestOffer =
                                                    !!bestResult &&
                                                    supplierResult.provider === bestResult.provider &&
                                                    supplierResult.price === bestResult.price &&
                                                    supplierResult.code === bestResult.code &&
                                                    supplierResult.product === bestResult.product;
                                                const matchType = getMatchType(supplierResult, normalizedQueryCode, card.hasExactMatch);
                                                const isManualWhatsappQuote = hasManualWhatsappQuote(supplierResult);
                                                const matchLabel = isManualWhatsappQuote
                                                    ? 'Valor lancado'
                                                    : supplierResult.whatsappStatus === 'queued'
                                                    ? 'Envio confirmado'
                                                    : supplierResult.whatsappStatus === 'pending'
                                                        ? 'Enviando WhatsApp'
                                                    : supplierResult.whatsappStatus === 'failed'
                                                        ? 'Falha no WhatsApp'
                                                        : matchType === 'exact'
                                                            ? 'Código exato'
                                                            : matchType === 'similar'
                                                                ? 'Similar real'
                                                                : 'Código não informado';
                                                const matchClass = isManualWhatsappQuote ? 'manual-whatsapp' : supplierResult.whatsappStatus || matchType;
                                                const isExactForPdf =
                                                    (!supplierResult.whatsappStatus || isManualWhatsappQuote) &&
                                                    !!normalizeCodeValue(supplierResult.code) &&
                                                    normalizeCodeValue(supplierResult.code) === normalizedQueryCode;
                                                const canIncludeSimilarInPdf =
                                                    !supplierResult.error &&
                                                    !supplierResult.whatsappStatus &&
                                                    !isExactForPdf;
                                                const similarExportKey = buildSimilarExportKey(item.query, card.provider, supplierResult);

                                                return (
                                                    <div
                                                        key={`${item.query}-${card.provider}`}
                                                        className={`supplier-view-card compact-supplier-card ${isBestOffer ? 'best-supplier-card' : ''}`}
                                                    >
                                                        <div className="supplier-card-topline">
                                                            <strong>{card.provider}</strong>
                                                            <span className="supplier-card-price">{formatResultPrice(supplierResult)}</span>
                                                        </div>

                                                        <div className="supplier-card-tags">
                                                            {isBestOffer && (
                                                                <div className="supplier-card-badge">
                                                                    Menor valor real
                                                                </div>
                                                            )}
                                                            {!supplierResult.error && (
                                                                <div className={`supplier-card-match ${matchClass}`}>
                                                                    {matchLabel}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {canIncludeSimilarInPdf && (
                                                            <label className="supplier-pdf-toggle">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!includedSimilarInPdf[similarExportKey]}
                                                                    onChange={(event) =>
                                                                        setIncludedSimilarInPdf((current) => ({
                                                                            ...current,
                                                                            [similarExportKey]: event.target.checked,
                                                                        }))
                                                                    }
                                                                />
                                                                <span>Incluir este similar no PDF</span>
                                                            </label>
                                                        )}

                                                        {card.variantGroups.length > 1 && !supplierResult.whatsappStatus && (
                                                            <div className="supplier-offer-selector">
                                                                <label>Peça escolhida para comparar neste fornecedor</label>
                                                                <select
                                                                    value={card.selectedVariantKey}
                                                                    onChange={(event) =>
                                                                        setSelectedVariantByQuerySupplier((current) => ({
                                                                            ...current,
                                                                            [card.variantSelectionKey]: event.target.value,
                                                                        }))
                                                                    }
                                                                >
                                                                    {card.variantGroups.map((group) => (
                                                                        <option key={group.key} value={group.key}>
                                                                            {buildVariantGroupLabel(group)}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                {card.selectedVariant && (
                                                                    <div className="query-variant-summary supplier-variant-summary">
                                                                        <strong>{card.selectedVariant.title}</strong>
                                                                        {card.selectedVariant.application && <span>{card.selectedVariant.application}</span>}
                                                                        <small>
                                                                            {card.selectedVariant.brands.length > 0
                                                                                ? `Fabricantes: ${card.selectedVariant.brands.join(', ')}`
                                                                                : 'Fabricante não informado'}
                                                                        </small>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {card.providerResults.length > 1 && (
                                                            <div className="supplier-offer-selector">
                                                                <label>Escolha fabricante / similar neste fornecedor</label>
                                                                <select
                                                                    value={buildResultIdentity(supplierResult)}
                                                                    onChange={(event) =>
                                                                        setSelectedOfferByQuerySupplier((current) => ({
                                                                            ...current,
                                                                            [buildOfferSelectionKey(item.query, card.provider, card.selectedVariantKey)]: event.target.value,
                                                                        }))
                                                                    }
                                                                >
                                                                    {card.providerResults.map((option) => {
                                                                        const optionMatch = getMatchType(option, normalizedQueryCode, card.hasExactMatch);
                                                                        const optionLabel =
                                                                            optionMatch === 'exact'
                                                                                ? 'Código exato'
                                                                                : optionMatch === 'similar'
                                                                                    ? 'Similar real'
                                                                                    : 'Código não informado';
                                                                        return (
                                                                            <option key={buildResultIdentity(option)} value={buildResultIdentity(option)}>
                                                                                {`${option.brand || 'Sem fabricante'} • ${option.code || 's/código'} • R$ ${option.price} • ${optionLabel}`}
                                                                            </option>
                                                                        );
                                                                    })}
                                                                </select>
                                                            </div>
                                                        )}

                                                        <div className="supplier-result-card compact-result-body">
                                                            <div className="supplier-result-label">Peça / Aplicação</div>
                                                            <div className="supplier-result-title">
                                                                {supplierResult.product || 'Peça sem descrição clara'}
                                                            </div>
                                                            {supplierResult.whatsappStatus ? (
                                                                <>
                                                                    <div className="supplier-meta-grid">
                                                                        <div className="supplier-result-meta">
                                                                            <strong>Canal:</strong> WhatsApp
                                                                        </div>
                                                                        <div className="supplier-result-meta">
                                                                            <strong>Telefone:</strong> {supplierResult.whatsappPhone || 'Não informado'}
                                                                        </div>
                                                                        <div className="supplier-result-meta">
                                                                            <strong>Status:</strong> {supplierResult.whatsappStatus === 'queued' ? 'Enviado ao servidor do WhatsApp' : supplierResult.whatsappStatus === 'pending' ? 'Enviando' : 'Falha no envio'}
                                                                        </div>
                                                                        <div className="supplier-result-meta">
                                                                            <strong>Retorno:</strong> {supplierResult.stockText || 'Aguardando resposta'}
                                                                        </div>
                                                                        {supplierResult.whatsappMessageId && (
                                                                            <div className="supplier-result-meta">
                                                                                <strong>ID:</strong> {supplierResult.whatsappMessageId}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <form
                                                                        className="whatsapp-manual-quote-form"
                                                                        onSubmit={(event) => handleSaveWhatsappManualQuote(event, item.query, supplierResult)}
                                                                    >
                                                                        <div className="whatsapp-manual-grid">
                                                                            <label>
                                                                                Valor recebido
                                                                                <input
                                                                                    name="price"
                                                                                    type="text"
                                                                                    inputMode="decimal"
                                                                                    placeholder="Ex: 125,90"
                                                                                    defaultValue={getManualPriceDefaultValue(supplierResult)}
                                                                                />
                                                                            </label>
                                                                            <label>
                                                                                Fabricante / marca
                                                                                <input
                                                                                    name="brand"
                                                                                    type="text"
                                                                                    placeholder="Ex: Monroe"
                                                                                    defaultValue={supplierResult.brand && supplierResult.brand !== 'WhatsApp' ? supplierResult.brand : ''}
                                                                                />
                                                                            </label>
                                                                            <label className="whatsapp-manual-wide">
                                                                                Peça retornada
                                                                                <input
                                                                                    name="product"
                                                                                    type="text"
                                                                                    placeholder="Descrição enviada pelo fornecedor"
                                                                                    defaultValue={
                                                                                        supplierResult.whatsappManualQuote
                                                                                            ? supplierResult.product || ''
                                                                                            : ''
                                                                                    }
                                                                                />
                                                                            </label>
                                                                            <label>
                                                                                Estoque / prazo
                                                                                <input
                                                                                    name="stockText"
                                                                                    type="text"
                                                                                    placeholder="Ex: pronta entrega"
                                                                                    defaultValue={
                                                                                        supplierResult.whatsappManualQuote
                                                                                            ? supplierResult.stockText || ''
                                                                                            : ''
                                                                                    }
                                                                                />
                                                                            </label>
                                                                            <label>
                                                                                Observação
                                                                                <input
                                                                                    name="application"
                                                                                    type="text"
                                                                                    placeholder="Opcional"
                                                                                    defaultValue={supplierResult.application || ''}
                                                                                />
                                                                            </label>
                                                                        </div>
                                                                        <button type="submit">
                                                                            Salvar valor no orçamento
                                                                        </button>
                                                                        {supplierResult.whatsappManualQuoteAt && (
                                                                            <small>
                                                                                Valor lançado em {formatDateTime(supplierResult.whatsappManualQuoteAt)}
                                                                            </small>
                                                                        )}
                                                                    </form>
                                                                </>
                                                            ) : (
                                                                <div className="supplier-meta-grid">
                                                                    <div className="supplier-result-meta">
                                                                        <strong>Fabricante:</strong> {supplierResult.brand || 'Não informado'}
                                                                    </div>
                                                                    <div className="supplier-result-meta">
                                                                        <strong>Código:</strong> {supplierResult.code || 'Não informado'}
                                                                    </div>
                                                                    <div className="supplier-result-meta">
                                                                        <strong>Estoque:</strong> {supplierResult.stockText || supplierResult.stock || 0}
                                                                    </div>
                                                                    <div className="supplier-result-meta">
                                                                        <strong>Tipo:</strong> {matchLabel}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {supplierResult.whatsappError && (
                                                                <div className="supplier-view-error">
                                                                    {supplierResult.whatsappError}
                                                                </div>
                                                            )}
                                                            {supplierResult.application && (
                                                                <div className="supplier-result-meta supplier-application">
                                                                    <strong>Obs técnica:</strong> {supplierResult.application}
                                                                </div>
                                                            )}
                                                            {supplierResult.link && (
                                                                <div className="supplier-card-link-row">
                                                                    <a
                                                                        href={supplierResult.link}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        title="Ver produto no site"
                                                                        className="visit-link"
                                                                    >
                                                                        Abrir no fornecedor
                                                                    </a>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <span className="not-found">
                                                {activeResultView === 'summary'
                                                    ? 'Nenhuma oferta válida encontrada para a peça selecionada.'
                                                    : 'Este fornecedor não retornou oferta real para esta peça.'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <style>{`
                .quotes-container { display: flex; flex-direction: column; gap: 2rem; }
                .quotes-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
                .page-subtitle { color: var(--text-muted); margin-top: 0.5rem; }
                .quote-category-selector {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.6rem;
                }
                .quote-category-selector button {
                    min-height: 40px;
                    padding: 0 0.95rem;
                    color: var(--text-main);
                    background: var(--panel-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 999px;
                    cursor: pointer;
                    font-weight: 800;
                }
                .quote-category-selector button.active {
                    color: #fff;
                    background: var(--primary-color);
                    border-color: var(--primary-color);
                }
                .search-box, .results-panel, .history-panel {
                    background: var(--panel-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                }
                .search-box { padding: 1.5rem; }
                .add-part-form {
                    display: grid;
                    grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr) auto;
                    gap: 1rem;
                    align-items: end;
                }
                .input-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.45rem;
                    min-width: 0;
                }
                .input-group label {
                    color: var(--text-main);
                    font-size: 0.95rem;
                    font-weight: 600;
                }
                .input-group-main {
                    min-width: 0;
                }
                .input-group-description {
                    min-width: 0;
                }
                .input-with-icon {
                    position: relative;
                    display: flex;
                    align-items: center;
                }
                .search-icon {
                    position: absolute;
                    left: 0.9rem;
                    color: var(--text-muted);
                    pointer-events: none;
                }
                .part-input {
                    width: 100%;
                    min-width: 0;
                    height: 52px;
                    border-radius: 10px;
                    border: 1px solid var(--border-color);
                    background: var(--panel-bg);
                    color: var(--text-main);
                    padding: 0 1rem;
                    font-size: 0.98rem;
                    transition: border-color 0.2s, box-shadow 0.2s;
                }
                .input-with-icon .part-input {
                    padding-left: 2.8rem;
                }
                .part-input::placeholder {
                    color: var(--text-muted);
                }
                .part-input:focus {
                    outline: none;
                    border-color: var(--primary-color);
                    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
                }
                .secondary-input {
                    background: var(--bg-color);
                }
                .add-btn {
                    background: var(--text-main);
                    color: var(--panel-bg);
                    border: none;
                    padding: 0 1.5rem;
                    height: 52px;
                    border-radius: 8px;
                    font-weight: bold;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    transition: background 0.2s;
                }
                .add-btn:hover { background: var(--primary-hover); }
                .part-list { margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 1.5rem; }
                .part-list-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 1rem;
                    margin-bottom: 1rem;
                }
                .part-list h4 { color: var(--text-muted); font-weight: 500; }
                .quote-meta {
                    color: var(--text-muted);
                    display: inline-flex;
                    align-items: center;
                    gap: 0.4rem;
                    font-size: 0.9rem;
                }
                .tags-container { display: flex; flex-wrap: wrap; gap: 0.8rem; margin-bottom: 1.5rem; }
                .part-tag {
                    background: var(--bg-color);
                    border: 1px solid var(--border-color);
                    color: var(--text-main);
                    padding: 0.6rem 0.9rem;
                    border-radius: 14px;
                    display: flex;
                    align-items: flex-start;
                    gap: 0.8rem;
                    font-size: 0.95rem;
                }
                .part-tag-content { display: flex; flex-direction: column; gap: 0.2rem; }
                .part-tag-content small { color: var(--text-muted); font-size: 0.8rem; }
                .part-tag button {
                    background: none;
                    border: none;
                    color: #ef4444;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0.7;
                    transition: opacity 0.2s;
                }
                .part-tag button:hover { opacity: 1; }
                .start-search-btn {
                    width: 100%;
                    height: 55px;
                    font-size: 1.1rem;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 0.8rem;
                }
                .quote-running-status {
                    margin-top: 0.9rem;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 1rem;
                    color: var(--text-muted);
                    font-size: 0.9rem;
                    background: var(--bg-color);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    padding: 0.8rem 1rem;
                }
                .quote-running-status button {
                    border: 1px solid rgba(239, 68, 68, 0.25);
                    color: #dc2626;
                    background: var(--panel-bg);
                    border-radius: 8px;
                    padding: 0.55rem 0.8rem;
                    font-weight: 700;
                    cursor: pointer;
                    white-space: nowrap;
                }
                .quote-job-warning {
                    margin-top: 0.9rem;
                    color: #dc2626;
                    background: rgba(239, 68, 68, 0.08);
                    border: 1px solid rgba(239, 68, 68, 0.18);
                    border-radius: 8px;
                    padding: 0.8rem 1rem;
                }
                .results-panel { overflow: hidden; min-width: 0; width: 100%; }
                .results-header, .history-panel-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 1rem;
                    padding: 1.5rem;
                    border-bottom: 1px solid var(--border-color);
                    background: var(--bg-color);
                }
                .results-caption, .history-panel-header p {
                    margin-top: 0.35rem;
                    color: var(--text-muted);
                    font-size: 0.9rem;
                }
                .results-list {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    padding: 1.25rem 1.5rem 1.5rem;
                }
                .results-tabs {
                    display: flex;
                    gap: 0.75rem;
                    flex-wrap: wrap;
                }
                .results-tab {
                    border: 1px solid var(--border-color);
                    background: var(--bg-color);
                    color: var(--text-main);
                    border-radius: 999px;
                    padding: 0.6rem 1rem;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.18s ease;
                }
                .results-tab.active {
                    background: var(--primary-color);
                    color: white;
                    border-color: var(--primary-color);
                }
                .quote-item-card {
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 0.8rem;
                    background: var(--bg-color);
                    display: flex;
                    flex-direction: column;
                    gap: 0.65rem;
                }
                .quote-item-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 1rem;
                    flex-wrap: wrap;
                }
                .quote-item-helper {
                    color: var(--text-muted);
                    font-size: 0.85rem;
                    line-height: 1.4;
                }
                .query-variant-selector {
                    display: flex;
                    flex-direction: column;
                    gap: 0.45rem;
                    padding: 0.8rem;
                    border: 1px solid var(--border-color);
                    border-radius: 10px;
                    background: var(--panel-bg);
                }
                .query-variant-selector label {
                    color: var(--text-muted);
                    font-size: 0.76rem;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }
                .query-variant-selector select {
                    width: 100%;
                    border: 1px solid var(--border-color);
                    background: var(--bg-color);
                    color: var(--text-main);
                    border-radius: 8px;
                    padding: 0.65rem 0.75rem;
                    font-size: 0.84rem;
                }
                .query-variant-summary {
                    display: flex;
                    flex-direction: column;
                    gap: 0.2rem;
                    font-size: 0.82rem;
                    color: var(--text-muted);
                    line-height: 1.35;
                }
                .query-variant-summary strong {
                    color: var(--text-main);
                    font-size: 0.9rem;
                }
                .best-offer-badge {
                    background: rgba(16, 185, 129, 0.12);
                    color: #047857;
                    border: 1px solid rgba(16, 185, 129, 0.18);
                    border-radius: 999px;
                    padding: 0.45rem 0.75rem;
                    font-size: 0.82rem;
                    font-weight: 700;
                }
                .supplier-view-card {
                    border: 1px solid var(--border-color);
                    border-radius: 10px;
                    background: var(--panel-bg);
                    padding: 1rem;
                }
                .supplier-results-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 0.8rem;
                }
                .compact-results-grid {
                    align-items: stretch;
                }
                .supplier-group-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }
                .supplier-group-panel {
                    border: 1px solid var(--border-color);
                    border-radius: 10px;
                    background: var(--panel-bg);
                    padding: 0.75rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.65rem;
                }
                .supplier-group-header {
                    display: flex;
                    flex-direction: column;
                    gap: 0.22rem;
                }
                .best-supplier-card {
                    border-color: rgba(16, 185, 129, 0.34);
                    box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.14);
                    background: linear-gradient(180deg, rgba(16, 185, 129, 0.04), var(--panel-bg));
                }
                .compact-supplier-card {
                    min-height: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 0.7rem;
                }
                .supplier-card-topline {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 0.8rem;
                }
                .supplier-card-topline strong {
                    color: var(--text-main);
                    font-size: 0.92rem;
                }
                .supplier-card-price {
                    color: var(--primary-color);
                    font-size: 1rem;
                    font-weight: 800;
                    white-space: nowrap;
                }
                .supplier-offer-selector {
                    display: flex;
                    flex-direction: column;
                    gap: 0.35rem;
                }
                .supplier-offer-selector label {
                    color: var(--text-muted);
                    font-size: 0.74rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }
                .supplier-offer-selector select {
                    width: 100%;
                    border: 1px solid var(--border-color);
                    background: var(--bg-color);
                    color: var(--text-main);
                    border-radius: 8px;
                    padding: 0.6rem 0.75rem;
                    font-size: 0.82rem;
                }
                .supplier-offer-selector select:focus {
                    outline: none;
                    border-color: var(--primary-color);
                    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
                }
                .supplier-view-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 0.75rem;
                    flex-wrap: wrap;
                    margin-bottom: 0.45rem;
                    color: var(--text-main);
                }
                .supplier-view-header strong {
                    font-size: 0.88rem;
                }
                .compact-supplier-header {
                    margin-bottom: 0.3rem;
                }
                .supplier-card-tags {
                    display: flex;
                    gap: 0.45rem;
                    flex-wrap: wrap;
                    margin-bottom: 0.45rem;
                }
                .supplier-pdf-toggle {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.45rem;
                    width: fit-content;
                    color: #92400e;
                    background: #fffbeb;
                    border: 1px solid rgba(245, 158, 11, 0.32);
                    border-radius: 8px;
                    padding: 0.45rem 0.6rem;
                    font-size: 0.78rem;
                    font-weight: 800;
                    cursor: pointer;
                }
                .supplier-pdf-toggle input {
                    width: 16px;
                    height: 16px;
                    margin: 0;
                }
                .whatsapp-manual-quote-form {
                    display: flex;
                    flex-direction: column;
                    gap: 0.65rem;
                    margin-top: 0.75rem;
                    padding: 0.75rem;
                    border: 1px solid rgba(34, 197, 94, 0.18);
                    background: rgba(34, 197, 94, 0.06);
                    border-radius: 8px;
                }
                .whatsapp-manual-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 0.6rem;
                }
                .whatsapp-manual-grid label {
                    display: flex;
                    flex-direction: column;
                    gap: 0.3rem;
                    color: var(--text-muted);
                    font-size: 0.74rem;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }
                .whatsapp-manual-grid input {
                    width: 100%;
                    border: 1px solid var(--border-color);
                    background: var(--panel-bg);
                    color: var(--text-main);
                    border-radius: 8px;
                    padding: 0.55rem 0.65rem;
                    font-size: 0.84rem;
                    text-transform: none;
                    letter-spacing: 0;
                    font-weight: 600;
                }
                .whatsapp-manual-grid input:focus {
                    outline: none;
                    border-color: var(--primary-color);
                    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
                }
                .whatsapp-manual-wide {
                    grid-column: 1 / -1;
                }
                .whatsapp-manual-quote-form button {
                    align-self: flex-start;
                    border-radius: 8px;
                    background: #16a34a;
                    color: #fff;
                    padding: 0.55rem 0.75rem;
                    font-size: 0.8rem;
                    font-weight: 800;
                    cursor: pointer;
                }
                .whatsapp-manual-quote-form small {
                    color: #047857;
                    font-size: 0.74rem;
                    font-weight: 700;
                }
                .supplier-card-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.35rem;
                    background: rgba(16, 185, 129, 0.12);
                    color: #047857;
                    border: 1px solid rgba(16, 185, 129, 0.16);
                    border-radius: 999px;
                    padding: 0.35rem 0.7rem;
                    font-size: 0.76rem;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }
                .supplier-card-match {
                    display: inline-flex;
                    align-items: center;
                    border-radius: 999px;
                    padding: 0.35rem 0.7rem;
                    font-size: 0.76rem;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }
                .supplier-card-match.exact {
                    background: rgba(37, 99, 235, 0.12);
                    color: #1d4ed8;
                    border: 1px solid rgba(37, 99, 235, 0.16);
                }
                .supplier-card-match.similar {
                    background: rgba(245, 158, 11, 0.12);
                    color: #b45309;
                    border: 1px solid rgba(245, 158, 11, 0.18);
                }
                .supplier-card-match.missing-code {
                    background: rgba(107, 114, 128, 0.12);
                    color: #4b5563;
                    border: 1px solid rgba(107, 114, 128, 0.16);
                }
                .supplier-card-match.queued {
                    background: rgba(34, 197, 94, 0.12);
                    color: #15803d;
                    border: 1px solid rgba(34, 197, 94, 0.18);
                }
                .supplier-card-match.pending {
                    background: rgba(59, 130, 246, 0.12);
                    color: #1d4ed8;
                    border: 1px solid rgba(59, 130, 246, 0.18);
                }
                .supplier-card-match.failed {
                    background: rgba(239, 68, 68, 0.12);
                    color: #b91c1c;
                    border: 1px solid rgba(239, 68, 68, 0.18);
                }
                .supplier-card-match.manual-whatsapp {
                    background: rgba(16, 185, 129, 0.14);
                    color: #047857;
                    border: 1px solid rgba(16, 185, 129, 0.22);
                }
                .supplier-view-error {
                    color: #dc2626;
                    background: rgba(239, 68, 68, 0.06);
                    border: 1px solid rgba(239, 68, 68, 0.14);
                    border-radius: 8px;
                    padding: 0.85rem 0.95rem;
                    font-size: 0.88rem;
                    line-height: 1.45;
                }
                .history-header-actions {
                    display: flex;
                    gap: 0.75rem;
                    flex-wrap: wrap;
                    align-items: center;
                }
                .export-actions, .history-card-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
                .export-btn, .history-refresh-btn, .history-batch-btn, .history-card-actions button {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.6rem 1rem;
                    border-radius: 8px;
                    border: none;
                    font-weight: 600;
                    cursor: pointer;
                    font-size: 0.9rem;
                }
                .export-btn.excel { background: #10b981; color: white; }
                .export-btn.excel:hover { background: #059669; }
                .export-btn.pdf { background: #ef4444; color: white; }
                .export-btn.pdf:hover { background: #dc2626; }
                .history-refresh-btn, .history-batch-btn, .history-card-actions button {
                    background: var(--panel-bg);
                    color: var(--text-main);
                    border: 1px solid var(--border-color);
                }
                .history-batch-btn:disabled {
                    opacity: 0.55;
                    cursor: not-allowed;
                }
                .history-card-actions .delete-history-button {
                    color: #dc2626;
                    border-color: rgba(220, 38, 38, 0.18);
                }
                .history-card-actions .delete-history-button:hover {
                    background: rgba(220, 38, 38, 0.08);
                }
                .part-name-cell { min-width: 240px; }
                .part-cell-main {
                    font-weight: 600;
                    color: var(--primary-color);
                    margin-bottom: 0.25rem;
                }
                .part-cell-description {
                    color: var(--text-muted);
                    font-size: 0.85rem;
                    line-height: 1.4;
                }
                .variant-selector {
                    margin-top: 0.8rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                .variant-selector label {
                    color: var(--text-muted);
                    font-size: 0.78rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }
                .variant-options-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.45rem;
                    max-height: 170px;
                    overflow-y: auto;
                    padding-right: 0.2rem;
                }
                .variant-option-card {
                    width: 100%;
                    border-radius: 8px;
                    border: 1px solid var(--border-color);
                    background: var(--panel-bg);
                    color: var(--text-main);
                    padding: 0.5rem 0.65rem;
                    font-size: 0.8rem;
                    text-align: left;
                    cursor: pointer;
                    transition: border-color 0.18s, background 0.18s, box-shadow 0.18s;
                }
                .variant-option-card:hover {
                    border-color: var(--primary-color);
                    background: rgba(37, 99, 235, 0.04);
                }
                .variant-option-card.selected {
                    border-color: var(--primary-color);
                    background: rgba(37, 99, 235, 0.08);
                    box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.12);
                }
                .variant-option-title {
                    font-size: 0.86rem;
                    font-weight: 700;
                    color: var(--text-main);
                    line-height: 1.35;
                    margin-bottom: 0.25rem;
                }
                .variant-option-label {
                    color: var(--text-muted);
                    font-size: 0.72rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                    margin-bottom: 0.2rem;
                }
                .variant-option-meta {
                    font-size: 0.78rem;
                    color: var(--text-muted);
                    line-height: 1.35;
                }
                .supplier-result-card { display: flex; flex-direction: column; gap: 0.35rem; }
                .compact-result-body {
                    padding-top: 0.1rem;
                }
                .supplier-result-label {
                    color: var(--text-muted);
                    font-size: 0.72rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }
                .supplier-result-title {
                    color: var(--text-main);
                    font-size: 0.86rem;
                    font-weight: 600;
                    line-height: 1.35;
                }
                .supplier-result-meta {
                    color: var(--text-muted);
                    font-size: 0.78rem;
                    line-height: 1.35;
                }
                .supplier-meta-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 0.45rem 0.8rem;
                }
                .supplier-result-meta strong {
                    color: var(--text-main);
                }
                .supplier-application {
                    margin-top: 0.15rem;
                }
                .supplier-card-link-row {
                    display: flex;
                    justify-content: flex-end;
                    margin-top: 0.35rem;
                }
                .visit-link {
                    text-decoration: none;
                    font-size: 0.8rem;
                    font-weight: 700;
                    color: var(--primary-color);
                }
                .error-text { color: #ef4444; font-size: 0.85rem; line-height: 1.5; }
                .not-found { color: var(--text-muted); }
                .history-panel { overflow: hidden; }
                .history-panel-header h3 {
                    display: flex;
                    align-items: center;
                    gap: 0.6rem;
                }
                .history-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                    padding: 1rem;
                }
                .history-card {
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 0.8rem 1rem;
                    display: grid;
                    grid-template-columns: auto minmax(0, 1fr) auto;
                    gap: 0.8rem;
                    align-items: center;
                    background: var(--bg-color);
                }
                .history-select {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    align-self: center;
                }
                .history-select input {
                    width: 18px;
                    height: 18px;
                    accent-color: var(--primary-color);
                    cursor: pointer;
                }
                .history-card-active {
                    border-color: var(--primary-color);
                    box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.15);
                }
                .history-card-main {
                    display: flex;
                    flex-direction: column;
                    gap: 0.45rem;
                    min-width: 0;
                    justify-self: start;
                }
                .history-card-header {
                    display: flex;
                    gap: 1rem;
                    flex-wrap: wrap;
                    color: var(--text-muted);
                    font-size: 0.85rem;
                }
                .history-date {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.35rem;
                }
                .history-title {
                    font-weight: 600;
                    color: var(--text-main);
                    word-break: break-word;
                }
                .history-items-preview {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                    color: var(--text-muted);
                    font-size: 0.85rem;
                }
                .history-items-preview span {
                    background: var(--panel-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 999px;
                    padding: 0.25rem 0.6rem;
                }
                .history-card-actions {
                    justify-content: flex-end;
                    align-self: center;
                }
                .history-empty, .history-error {
                    padding: 1.5rem;
                    color: var(--text-muted);
                }
                .history-error { color: #ef4444; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
                .spin { animation: spin 1s linear infinite; }

                @media (max-width: 980px) {
                    .quotes-header,
                    .results-header,
                    .history-panel-header,
                    .history-card {
                        display: flex;
                        flex-direction: column;
                        align-items: stretch;
                    }
                    .add-part-form { grid-template-columns: 1fr; }
                    .add-btn { width: 100%; justify-content: center; }
                    .results-list { padding: 1rem; }
                    .results-tabs { width: 100%; }
                    .quote-item-header,
                    .supplier-view-header {
                        flex-direction: column;
                        align-items: flex-start;
                    }
                    .supplier-card-topline {
                        flex-direction: column;
                        align-items: flex-start;
                    }
                    .supplier-meta-grid,
                    .whatsapp-manual-grid {
                        grid-template-columns: 1fr;
                    }
                    .history-header-actions,
                    .export-actions, .history-card-actions { width: 100%; }
                    .history-card {
                        gap: 0.85rem;
                    }
                    .history-select {
                        justify-content: flex-start;
                    }
                    .history-card-main {
                        width: 100%;
                    }
                    .history-card-header {
                        flex-direction: row;
                        align-items: center;
                        justify-content: space-between;
                        gap: 0.5rem;
                    }
                    .history-card-actions {
                        justify-content: flex-start;
                    }
                    .history-card-actions button {
                        flex: 1 1 calc(50% - 0.5rem);
                        justify-content: center;
                    }
                    .quote-running-status {
                        flex-direction: column;
                        align-items: stretch;
                    }
                }
            `}</style>
        </div>
    );
};

