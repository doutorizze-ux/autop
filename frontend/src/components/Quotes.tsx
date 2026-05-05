import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { socket } from '../services/socket';
import {
    Search,
    Plus,
    Trash2,
    FileText,
    Download,
    Loader2,
    RefreshCw,
    History,
    FolderOpen,
    Clock3,
} from 'lucide-react';

type QuoteItemInput = {
    query: string;
    description?: string;
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
};

type QuoteMatrix = Record<string, QuoteResult[]>;

type QuoteHistoryEntry = {
    id: string;
    createdAt: string;
    itemCount: number;
    items: QuoteItemInput[];
    title: string;
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

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const activeQuoteJobStorageKey = 'active_quote_job_id';

const buildItemLabel = (item: QuoteItemInput) => {
    const query = String(item.query || '').trim();
    const description = String(item.description || '').trim();
    return description ? `${query} - ${description}` : query;
};

const formatDateTime = (value?: string) => {
    if (!value) return '---';
    return new Date(value).toLocaleString('pt-BR');
};

const normalizeVariantKey = (value?: string) =>
    String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

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

export const Quotes = () => {
    const [partList, setPartList] = useState<QuoteItemInput[]>([]);
    const [newPart, setNewPart] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [quoteMatrix, setQuoteMatrix] = useState<QuoteMatrix>({});
    const [suppliers, setSuppliers] = useState<string[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [history, setHistory] = useState<QuoteHistoryEntry[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);
    const [currentQuoteId, setCurrentQuoteId] = useState('');
    const [currentCreatedAt, setCurrentCreatedAt] = useState('');
    const [activeHistoryId, setActiveHistoryId] = useState('');
    const [activeJobId, setActiveJobId] = useState(() => localStorage.getItem(activeQuoteJobStorageKey) || '');
    const [quoteJobStatus, setQuoteJobStatus] = useState('');
    const [quoteJobError, setQuoteJobError] = useState('');
    const [selectedVariantByQuery, setSelectedVariantByQuery] = useState<Record<string, string>>({});
    const [activeResultView, setActiveResultView] = useState<'summary' | string>('summary');

    const loadHistory = async () => {
        setIsHistoryLoading(true);
        setHistoryError('');

        try {
            const response = await axios.get<QuoteHistoryEntry[]>(`${apiBase}/api/quotes/history`);
            setHistory(response.data);
        } catch (error) {
            console.error('Load Quote History Error:', error);
            setHistoryError('Não foi possível carregar o histórico agora.');
        } finally {
            setIsHistoryLoading(false);
        }
    };

    useEffect(() => {
        void loadHistory();
    }, []);

    const applyQuoteJob = async (data: QuoteSearchResponse) => {
        setQuoteJobStatus(data.status || '');
        setQuoteJobError(data.error || '');
        setPartList(
            data.items.map((item) => ({
                query: item.query,
                description: item.description,
                label: item.label,
            }))
        );
        setQuoteMatrix(data.matrix || {});
        setSuppliers(data.suppliers || []);

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
            setActiveHistoryId(data.quoteId || '');
            await loadHistory();
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
    }, [activeJobId]);

    useEffect(() => {
        const handleProgress = (data: { supplier: string; productName: string; result: any }) => {
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
    }, []);

    const handleAddPart = (event?: React.FormEvent) => {
        if (event) event.preventDefault();

        const query = newPart.trim();
        const description = newDescription.trim();

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
            },
        ]);

        setNewPart('');
        setNewDescription('');
    };

    const handleRemovePart = (index: number) => {
        setPartList((current) => current.filter((_, itemIndex) => itemIndex !== index));
    };

    const handleSearchPrices = async () => {
        if (partList.length === 0) return;

        setIsSearching(true);
        setQuoteMatrix({});
        setSuppliers([]);
        setCurrentQuoteId('');
        setCurrentCreatedAt('');
        setActiveHistoryId('');
        setQuoteJobStatus('running');
        setQuoteJobError('');

        try {
            const response = await axios.post<QuoteSearchResponse>(`${apiBase}/api/quotes/search`, {
                items: partList.map((item) => ({
                    query: item.query,
                    description: item.description,
                })),
                socketId: socket.id
            });

            if (response.data.jobId) {
                localStorage.setItem(activeQuoteJobStorageKey, response.data.jobId);
            }
            await applyQuoteJob(response.data);
        } catch (error) {
            console.error('Search Quote Error:', error);
            alert('Erro ao buscar preços. Verifique se os fornecedores estão configurados corretamente.');
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

    const handleExportCurrent = async (type: 'pdf' | 'excel') => {
        try {
            const response = await axios.post(`${apiBase}/api/quotes/export/${type}`, {
                items: partList.map((item) => ({
                    query: item.query,
                    description: item.description,
                })),
                suppliers,
                matrix: quoteMatrix,
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
        setActiveHistoryId(quoteId);
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
            setCurrentQuoteId(response.data.quoteId || quoteId);
            setCurrentCreatedAt(response.data.createdAt);
            setIsSearching(false);
            setActiveJobId('');
            localStorage.removeItem(activeQuoteJobStorageKey);
        } catch (error) {
            console.error('Open Saved Quote Error:', error);
            alert('Não foi possível abrir essa cotação salva.');
        }
    };

    const handleExportSaved = async (quoteId: string, type: 'pdf' | 'excel') => {
        try {
            const response = await axios.get(`${apiBase}/api/quotes/history/${quoteId}/export/${type}`, {
                responseType: 'blob',
            });

            downloadBlob(
                response.data,
                `orcamento-${quoteId}.${type === 'pdf' ? 'pdf' : 'xlsx'}`
            );
        } catch (error) {
            console.error('Export Saved Quote Error:', error);
            alert('Não foi possível exportar a cotação salva.');
        }
    };

    const toggleHistorySelection = (quoteId: string) => {
        setSelectedHistoryIds((current) =>
            current.includes(quoteId) ? current.filter((id) => id !== quoteId) : [...current, quoteId]
        );
    };

    const handleExportSelectedHistoryPdf = async () => {
        if (selectedHistoryIds.length === 0) {
            alert('Selecione pelo menos um orçamento do histórico.');
            return;
        }

        try {
            const response = await axios.post(
                `${apiBase}/api/quotes/history/export/pdf`,
                { ids: selectedHistoryIds },
                { responseType: 'blob' }
            );

            downloadBlob(response.data, `orcamentos-selecionados-${Date.now()}.pdf`);
        } catch (error) {
            console.error('Export Selected Quotes PDF Error:', error);
            alert('Não foi possível gerar o PDF com os orçamentos selecionados.');
        }
    };

    const handleDeleteHistory = async (quoteId: string) => {
        const confirmed = window.confirm('Tem certeza que deseja excluir esta cotação salva?');
        if (!confirmed) return;

        try {
            await axios.delete(`${apiBase}/api/quotes/history/${quoteId}`);
            setSelectedHistoryIds((current) => current.filter((id) => id !== quoteId));

            if (activeHistoryId === quoteId) {
                setActiveHistoryId('');
                setCurrentQuoteId('');
                setCurrentCreatedAt('');
            }

            await loadHistory();
        } catch (error) {
            console.error('Delete Saved Quote Error:', error);
            alert('Não foi possível excluir a cotação salva.');
        }
    };

    const hasResults = partList.length > 0 && suppliers.length > 0;

    const variantOptionsByQuery = useMemo(() => {
        const entries: Record<string, Array<{ key: string; product: string; application: string; count: number; code: string; brand: string }>> = {};

        partList.forEach((item) => {
            const source = quoteMatrix[item.query] || [];
            const groups = new Map<string, { key: string; product: string; application: string; count: number; code: string; brand: string }>();

            source.forEach((result) => {
                if (result.error) return;
                const key = normalizeVariantKey(result.variantKey || `${result.product || ''} ${result.application || ''}`);
                if (!key) return;

                const existing = groups.get(key);
                if (existing) {
                    existing.count += 1;
                    return;
                }

                groups.set(key, {
                    key,
                    product: String(result.product || item.query),
                    application: String(result.application || ''),
                    count: 1,
                    code: String(result.code || ''),
                    brand: String(result.brand || ''),
                });
            });

            entries[item.query] = Array.from(groups.values()).sort((a, b) => {
                const codeA = a.code.toLowerCase();
                const codeB = b.code.toLowerCase();
                const query = item.query.toLowerCase();

                const aStarts = codeA === query ? -1 : 0;
                const bStarts = codeB === query ? -1 : 0;
                if (aStarts !== bStarts) return aStarts - bStarts;

                const productCompare = a.product.localeCompare(b.product, 'pt-BR');
                if (productCompare !== 0) return productCompare;

                return a.application.localeCompare(b.application, 'pt-BR');
            });
        });

        return entries;
    }, [partList, quoteMatrix]);

    useEffect(() => {
        setSelectedVariantByQuery((current) => {
            const next = { ...current };
            let changed = false;

            partList.forEach((item) => {
                const variants = variantOptionsByQuery[item.query] || [];
                if (variants.length <= 1) {
                    if (next[item.query]) {
                        delete next[item.query];
                        changed = true;
                    }
                    return;
                }

                const currentValue = next[item.query];
                const stillExists = variants.some((variant) => variant.key === currentValue);
                if (!stillExists) {
                    next[item.query] = variants[0].key;
                    changed = true;
                }
            });

            return changed ? next : current;
        });
    }, [partList, variantOptionsByQuery]);

    const filteredResultsByQuery = useMemo(() => {
        const map: Record<string, QuoteResult[]> = {};

        partList.forEach((item) => {
            const selectedKey = selectedVariantByQuery[item.query];
            map[item.query] = (quoteMatrix[item.query] || []).filter((entry) => {
                if (!selectedKey) return true;
                return normalizeVariantKey(entry.variantKey || `${entry.product || ''} ${entry.application || ''}`) === selectedKey;
            });
        });

        return map;
    }, [partList, quoteMatrix, selectedVariantByQuery]);

    const bestResultByQuery = useMemo(() => {
        const map = new Map<string, QuoteResult | null>();

        partList.forEach((item) => {
            const candidates = (filteredResultsByQuery[item.query] || [])
                .filter((entry) => !entry.error && entry.price !== undefined && entry.price !== null && entry.price !== '');

            const sorted = [...candidates].sort((a, b) => {
                const priceA = parseFloat(String(a.price).replace(',', '.'));
                const priceB = parseFloat(String(b.price).replace(',', '.'));
                return priceA - priceB;
            });

            map.set(item.query, sorted[0] || null);
        });

        return map;
    }, [partList, filteredResultsByQuery]);

    useEffect(() => {
        if (activeResultView === 'summary') return;
        if (!suppliers.includes(activeResultView)) {
            setActiveResultView('summary');
        }
    }, [activeResultView, suppliers]);
    return (
        <div className="quotes-container">
            <div className="quotes-header">
                <div>
                    <h1 className="page-title">Orçamento Simultâneo</h1>
                    <p className="page-subtitle">
                        Pesquise uma peça em todos os fornecedores cadastrados ao mesmo tempo.
                    </p>
                </div>
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
                            <h4>Lista de Cotação ({partList.length} itens)</h4>
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
                                    <RefreshCw size={20} /> Iniciar Orçamento em Todos os Fornecedores
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
                <div className="results-panel">
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

                    <div className="results-tabs">
                        <button
                            type="button"
                            className={`results-tab ${activeResultView === 'summary' ? 'active' : ''}`}
                            onClick={() => setActiveResultView('summary')}
                        >
                            Menor valor
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

                    <div className="results-list">
                        {partList.map((item) => {
                            const selectedVariantKey = selectedVariantByQuery[item.query];
                            const variants = variantOptionsByQuery[item.query] || [];
                            const currentResults = filteredResultsByQuery[item.query] || [];
                            const bestResult = bestResultByQuery.get(item.query);
                            const supplierResult = activeResultView === 'summary'
                                ? bestResult
                                : currentResults.find((entry) => entry.provider === activeResultView) || null;

                            return (
                                <div key={item.query} className="quote-item-card">
                                    <div className="quote-item-header">
                                        <div className="part-cell-main">{item.query}</div>
                                        {bestResult && (
                                            <div className="best-offer-badge">
                                                Melhor oferta atual: {bestResult.provider} • R$ {bestResult.price}
                                            </div>
                                        )}
                                    </div>

                                    {item.description && <div className="part-cell-description">{item.description}</div>}

                                    {variants.length > 1 && (
                                        <div className="variant-selector">
                                            <label>{variants.length} peças encontradas no código. Escolha a correta:</label>
                                            <div className="variant-options-list">
                                                {variants.map((variant) => {
                                                    const isSelected = (selectedVariantKey || variants[0]?.key || '') === variant.key;
                                                    return (
                                                        <button
                                                            key={variant.key}
                                                            type="button"
                                                            className={`variant-option-card ${isSelected ? 'selected' : ''}`}
                                                            onClick={() =>
                                                                setSelectedVariantByQuery((current) => ({
                                                                    ...current,
                                                                    [item.query]: variant.key,
                                                                }))
                                                            }
                                                        >
                                                            <div className="variant-option-label">
                                                                Veículo / Aplicação
                                                            </div>
                                                            <div className="variant-option-title">
                                                                {variant.product}
                                                            </div>
                                                            <div className="variant-option-meta">
                                                                {variant.code ? `Código: ${variant.code}` : 'Código não informado'}
                                                                {variant.brand ? ` | Fabricante: ${variant.brand}` : ''}
                                                            </div>
                                                            {variant.application && (
                                                                <div className="variant-option-meta">
                                                                    Obs técnica: {variant.application}
                                                                </div>
                                                            )}
                                                            <div className="variant-option-meta">
                                                                {variant.count} oferta(s) encontrada(s)
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    <div className="supplier-view-card">
                                        <div className="supplier-view-header">
                                            <strong>{activeResultView === 'summary' ? (supplierResult?.provider || 'Menor valor') : activeResultView}</strong>
                                            {supplierResult && !supplierResult.error && <span>R$ {supplierResult.price}</span>}
                                        </div>

                                        {supplierResult ? (
                                            supplierResult.error ? (
                                                <div className="supplier-view-error">{supplierResult.error}</div>
                                            ) : (
                                                <div className="supplier-result-card">
                                                    {supplierResult.product && (
                                                        <>
                                                            <div className="supplier-result-label">
                                                                Veículo / Aplicação
                                                            </div>
                                                            <div className="supplier-result-title">
                                                                {supplierResult.product}
                                                            </div>
                                                        </>
                                                    )}
                                                    {supplierResult.code && (
                                                        <div className="supplier-result-meta">
                                                            Código: {supplierResult.code}
                                                        </div>
                                                    )}
                                                    {supplierResult.brand && (
                                                        <div className="supplier-result-meta">
                                                            Fabricante: {supplierResult.brand}
                                                        </div>
                                                    )}
                                                    {supplierResult.application && (
                                                        <div className="supplier-result-meta">
                                                            Obs técnica: {supplierResult.application}
                                                        </div>
                                                    )}
                                                    {supplierResult.stock !== undefined && (
                                                        <div className="supplier-result-meta">
                                                            Estoque: {supplierResult.stockText || supplierResult.stock}
                                                        </div>
                                                    )}
                                                    <div className="price-tag">
                                                        <span>R$ {supplierResult.price}</span>
                                                        {supplierResult.link && (
                                                            <a
                                                                href={supplierResult.link}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                title="Ver produto no site"
                                                                className="visit-link"
                                                            >
                                                                🔗
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        ) : (
                                            <span className="not-found">
                                                {activeResultView === 'summary'
                                                    ? 'Nenhuma oferta válida encontrada para a peça selecionada.'
                                                    : 'Este fornecedor não retornou essa peça selecionada.'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="history-panel">
                <div className="history-panel-header">
                    <div>
                        <h3>
                            <History size={18} /> Histórico de Orçamentos
                        </h3>
                        <p>Consulte cotações anteriores por data e baixe PDF/Excel novamente.</p>
                    </div>
                    <div className="history-header-actions">
                        <button
                            className="history-batch-btn"
                            type="button"
                            onClick={() => void handleExportSelectedHistoryPdf()}
                            disabled={selectedHistoryIds.length === 0}
                        >
                            <FileText size={16} /> PDF selecionados ({selectedHistoryIds.length})
                        </button>
                        <button className="history-refresh-btn" onClick={() => void loadHistory()} disabled={isHistoryLoading}>
                            {isHistoryLoading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
                            Atualizar
                        </button>
                    </div>
                </div>

                {historyError && <div className="history-error">{historyError}</div>}

                {history.length === 0 && !isHistoryLoading ? (
                    <div className="history-empty">Nenhuma cotação salva ainda.</div>
                ) : (
                    <div className="history-list">
                        {history.map((entry) => (
                            <div
                                key={entry.id}
                                className={`history-card ${activeHistoryId === entry.id ? 'history-card-active' : ''}`}
                            >
                                <label className="history-select">
                                    <input
                                        type="checkbox"
                                        checked={selectedHistoryIds.includes(entry.id)}
                                        onChange={() => toggleHistorySelection(entry.id)}
                                    />
                                </label>
                                <div className="history-card-main">
                                    <div className="history-card-header">
                                        <span className="history-date">
                                            <Clock3 size={14} /> {formatDateTime(entry.createdAt)}
                                        </span>
                                        <span className="history-count">{entry.itemCount} item(ns)</span>
                                    </div>
                                    <div className="history-title">{entry.title}</div>
                                    <div className="history-items-preview">
                                        {entry.items.slice(0, 3).map((item, index) => (
                                            <span key={`${entry.id}-${item.query}-${index}`}>{buildItemLabel(item)}</span>
                                        ))}
                                        {entry.items.length > 3 && <span>+{entry.items.length - 3} itens</span>}
                                    </div>
                                </div>

                                <div className="history-card-actions">
                                    <button type="button" onClick={() => void handleOpenHistory(entry.id)}>
                                        <FolderOpen size={15} /> Abrir
                                    </button>
                                    <button type="button" onClick={() => void handleExportSaved(entry.id, 'pdf')}>
                                        <FileText size={15} /> PDF
                                    </button>
                                    <button type="button" onClick={() => void handleExportSaved(entry.id, 'excel')}>
                                        <Download size={15} /> Excel
                                    </button>
                                    <button
                                        type="button"
                                        className="delete-history-button"
                                        onClick={() => void handleDeleteHistory(entry.id)}
                                    >
                                        <Trash2 size={15} /> Excluir
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <style>{`
                .quotes-container { display: flex; flex-direction: column; gap: 2rem; }
                .quotes-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
                .page-subtitle { color: var(--text-muted); margin-top: 0.5rem; }
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
                .results-tabs {
                    display: flex;
                    gap: 0.75rem;
                    flex-wrap: wrap;
                    padding: 1rem 1.5rem 0;
                    background: var(--panel-bg);
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
                .results-list {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    padding: 1.25rem 1.5rem 1.5rem;
                }
                .quote-item-card {
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 1rem;
                    background: var(--bg-color);
                    display: flex;
                    flex-direction: column;
                    gap: 0.9rem;
                }
                .quote-item-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 1rem;
                    flex-wrap: wrap;
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
                .supplier-view-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 0.75rem;
                    flex-wrap: wrap;
                    margin-bottom: 0.75rem;
                    color: var(--text-main);
                }
                .supplier-view-header strong {
                    font-size: 0.95rem;
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
                    max-height: 260px;
                    overflow-y: auto;
                    padding-right: 0.2rem;
                }
                .variant-option-card {
                    width: 100%;
                    border-radius: 8px;
                    border: 1px solid var(--border-color);
                    background: var(--panel-bg);
                    color: var(--text-main);
                    padding: 0.6rem 0.75rem;
                    font-size: 0.84rem;
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
                .price-tag { display: flex; align-items: center; gap: 0.8rem; color: var(--text-main); }
                .supplier-result-card { display: flex; flex-direction: column; gap: 0.35rem; }
                .supplier-result-label {
                    color: var(--text-muted);
                    font-size: 0.72rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }
                .supplier-result-title {
                    color: var(--text-main);
                    font-size: 0.92rem;
                    font-weight: 600;
                    line-height: 1.35;
                }
                .supplier-result-meta {
                    color: var(--text-muted);
                    font-size: 0.82rem;
                    line-height: 1.35;
                }
                .visit-link { text-decoration: none; font-size: 1.1rem; }
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
                    gap: 1rem;
                    padding: 1.5rem;
                }
                .history-card {
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 1rem;
                    display: grid;
                    grid-template-columns: auto minmax(0, 1fr) auto;
                    gap: 1rem;
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
                    .results-tabs { padding: 1rem 1rem 0; }
                    .quote-item-header,
                    .supplier-view-header {
                        flex-direction: column;
                        align-items: flex-start;
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

