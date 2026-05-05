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
        const entries: Record<string, Array<{ key: string; product: string; application: string; count: number }>> = {};

        partList.forEach((item) => {
            const source = quoteMatrix[item.query] || [];
            const groups = new Map<string, { key: string; product: string; application: string; count: number }>();

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
                });
            });

            entries[item.query] = Array.from(groups.values());
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

    const bestPriceByQuery = useMemo(() => {
        const resultMap = new Map<string, number>();

        partList.forEach((item) => {
            const values = (quoteMatrix[item.query] || [])
                .filter((entry) => {
                    const selectedKey = selectedVariantByQuery[item.query];
                    if (!selectedKey) return true;
                    return normalizeVariantKey(entry.variantKey || `${entry.product || ''} ${entry.application || ''}`) === selectedKey;
                })
                .filter((entry) => !entry.error && entry.price !== undefined && entry.price !== null && entry.price !== '')
                .map((entry) => parseFloat(String(entry.price).replace(',', '.')))
                .filter((value) => !Number.isNaN(value));

            resultMap.set(item.query, values.length > 0 ? Math.min(...values) : Infinity);
        });

        return resultMap;
    }, [partList, quoteMatrix, selectedVariantByQuery]);
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
                            <h3>Quadro de Comparação de Preços</h3>
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

                    <div className="table-responsive">
                        <table className="matrix-table">
                            <thead>
                                <tr>
                                    <th>Peça / Produto</th>
                                    {suppliers.map((supplier) => (
                                        <th key={supplier}>{supplier}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {partList.map((item) => {
                                    const minPrice = bestPriceByQuery.get(item.query) ?? Infinity;
                                    const selectedVariantKey = selectedVariantByQuery[item.query];
                                    const variants = variantOptionsByQuery[item.query] || [];

                                    return (
                                        <tr key={item.query}>
                                            <td className="part-name-cell">
                                                <div className="part-cell-main">{item.query}</div>
                                                {item.description && <div className="part-cell-description">{item.description}</div>}
                                                {variants.length > 1 && (
                                                    <div className="variant-selector">
                                                        <label>Peças encontradas:</label>
                                                        <select
                                                            value={selectedVariantKey || variants[0]?.key || ''}
                                                            onChange={(event) =>
                                                                setSelectedVariantByQuery((current) => ({
                                                                    ...current,
                                                                    [item.query]: event.target.value,
                                                                }))
                                                            }
                                                        >
                                                            {variants.map((variant) => (
                                                                <option key={variant.key} value={variant.key}>
                                                                    {variant.product}
                                                                    {variant.application ? ` | ${variant.application}` : ''}
                                                                    {variant.count > 1 ? ` | ${variant.count} oferta(s)` : ''}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                )}
                                            </td>

                                            {suppliers.map((supplier) => {
                                                const result = quoteMatrix[item.query]?.find((entry) => {
                                                    if (entry.provider !== supplier) return false;
                                                    if (!selectedVariantKey) return true;
                                                    return normalizeVariantKey(entry.variantKey || `${entry.product || ''} ${entry.application || ''}`) === selectedVariantKey;
                                                });
                                                const parsedPrice = result && !result.error && result.price !== undefined
                                                    ? parseFloat(String(result.price).replace(',', '.'))
                                                    : Infinity;
                                                const isBestPrice = parsedPrice === minPrice && minPrice !== Infinity;

                                                return (
                                                    <td key={supplier} className={isBestPrice ? 'best-price' : ''}>
                                                        {result ? (
                                                            result.error ? (
                                                                <span className="error-text" title={result.error}>
                                                                    {result.error}
                                                                </span>
                                                            ) : (
                                                                <div className="supplier-result-card">
                                                                    {result.product && (
                                                                        <div className="supplier-result-title">
                                                                            {result.product}
                                                                        </div>
                                                                    )}
                                                                    {result.code && (
                                                                        <div className="supplier-result-meta">
                                                                            Codigo: {result.code}
                                                                        </div>
                                                                    )}
                                                                    {result.brand && (
                                                                        <div className="supplier-result-meta">
                                                                            Fabricante: {result.brand}
                                                                        </div>
                                                                    )}
                                                                    {result.application && (
                                                                        <div className="supplier-result-meta">
                                                                            Aplicacao: {result.application}
                                                                        </div>
                                                                    )}
                                                                    {result.stock !== undefined && (
                                                                        <div className="supplier-result-meta">
                                                                            Estoque: {result.stockText || result.stock}
                                                                        </div>
                                                                    )}
                                                                    <div className="price-tag">
                                                                        <span>R$ {result.price}</span>
                                                                        {result.link && (
                                                                            <a
                                                                                href={result.link}
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
                                                            <span className="not-found">---</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
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
                .table-responsive { 
                    overflow-x: auto; 
                    -webkit-overflow-scrolling: touch; 
                    width: 100%;
                    padding-bottom: 0.5rem;
                }
                .table-responsive::-webkit-scrollbar {
                    height: 8px;
                }
                .table-responsive::-webkit-scrollbar-track {
                    background: var(--bg-color);
                    border-radius: 4px;
                }
                .table-responsive::-webkit-scrollbar-thumb {
                    background: var(--border-color);
                    border-radius: 4px;
                }
                .table-responsive::-webkit-scrollbar-thumb:hover {
                    background: var(--text-muted);
                }
                .matrix-table { width: 100%; border-collapse: collapse; text-align: left; }
                .matrix-table th {
                    padding: 1rem 1.5rem;
                    color: var(--text-muted);
                    font-size: 0.9rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    border-bottom: 2px solid var(--border-color);
                    white-space: nowrap;
                }
                .matrix-table td {
                    padding: 1.2rem 1.5rem;
                    border-bottom: 1px solid var(--border-color);
                    vertical-align: middle;
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
                    gap: 0.35rem;
                }
                .variant-selector label {
                    color: var(--text-muted);
                    font-size: 0.78rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }
                .variant-selector select {
                    width: 100%;
                    border-radius: 8px;
                    border: 1px solid var(--border-color);
                    background: var(--panel-bg);
                    color: var(--text-main);
                    padding: 0.6rem 0.75rem;
                    font-size: 0.84rem;
                }
                .best-price {
                    background: rgba(16, 185, 129, 0.05);
                    border-left: 3px solid #10b981 !important;
                    color: #10b981;
                    font-weight: bold;
                }
                .price-tag { display: flex; align-items: center; gap: 0.8rem; color: var(--text-main); }
                .supplier-result-card { display: flex; flex-direction: column; gap: 0.35rem; }
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

