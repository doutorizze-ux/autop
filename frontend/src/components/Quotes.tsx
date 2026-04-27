import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
    Search,
    Plus,
    Trash2,
    FileText,
    Download,
    Loader2,
    RefreshCw,
    Sparkles,
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
    quoteId: string;
    createdAt: string;
    items: QuoteItemInput[];
    suppliers: string[];
    matrix: QuoteMatrix;
};

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const buildItemLabel = (item: QuoteItemInput) => {
    const query = String(item.query || '').trim();
    const description = String(item.description || '').trim();
    return description ? `${query} - ${description}` : query;
};

const formatDateTime = (value?: string) => {
    if (!value) return '---';
    return new Date(value).toLocaleString('pt-BR');
};

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
    const [currentQuoteId, setCurrentQuoteId] = useState('');
    const [currentCreatedAt, setCurrentCreatedAt] = useState('');
    const [activeHistoryId, setActiveHistoryId] = useState('');

    const loadHistory = async () => {
        setIsHistoryLoading(true);
        setHistoryError('');

        try {
            const response = await axios.get<QuoteHistoryEntry[]>(`${apiBase}/api/quotes/history`);
            setHistory(response.data);
        } catch (error) {
            console.error('Load Quote History Error:', error);
            setHistoryError('Nao foi possivel carregar o historico agora.');
        } finally {
            setIsHistoryLoading(false);
        }
    };

    useEffect(() => {
        void loadHistory();
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
        try {
            const response = await axios.post<QuoteSearchResponse>(`${apiBase}/api/quotes/search`, {
                items: partList.map((item) => ({
                    query: item.query,
                    description: item.description,
                })),
            });

            setPartList(
                response.data.items.map((item) => ({
                    query: item.query,
                    description: item.description,
                    label: item.label,
                }))
            );
            setQuoteMatrix(response.data.matrix || {});
            setSuppliers(response.data.suppliers || []);
            setCurrentQuoteId(response.data.quoteId);
            setCurrentCreatedAt(response.data.createdAt);
            setActiveHistoryId(response.data.quoteId);
            await loadHistory();
        } catch (error) {
            console.error('Search Quote Error:', error);
            alert('Erro ao buscar precos. Verifique se os fornecedores estao configurados corretamente.');
        } finally {
            setIsSearching(false);
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
        } catch (error) {
            console.error('Open Saved Quote Error:', error);
            alert('Nao foi possivel abrir essa cotacao salva.');
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
            alert('Nao foi possivel exportar a cotacao salva.');
        }
    };

    const handleDeleteHistory = async (quoteId: string) => {
        const confirmed = window.confirm('Tem certeza que deseja excluir esta cotacao salva?');
        if (!confirmed) return;

        try {
            await axios.delete(`${apiBase}/api/quotes/history/${quoteId}`);

            if (activeHistoryId === quoteId) {
                setActiveHistoryId('');
                setCurrentQuoteId('');
                setCurrentCreatedAt('');
            }

            await loadHistory();
        } catch (error) {
            console.error('Delete Saved Quote Error:', error);
            alert('Nao foi possivel excluir a cotacao salva.');
        }
    };

    const hasResults = partList.length > 0 && suppliers.length > 0;

    const bestPriceByQuery = useMemo(() => {
        const resultMap = new Map<string, number>();

        partList.forEach((item) => {
            const values = (quoteMatrix[item.query] || [])
                .filter((entry) => !entry.error && entry.price !== undefined && entry.price !== null && entry.price !== '')
                .map((entry) => parseFloat(String(entry.price).replace(',', '.')))
                .filter((value) => !Number.isNaN(value));

            resultMap.set(item.query, values.length > 0 ? Math.min(...values) : Infinity);
        });

        return resultMap;
    }, [partList, quoteMatrix]);

    return (
        <div className="quotes-container">
            <div className="quotes-header">
                <div>
                    <h1 className="page-title">Orcamento Simultaneo</h1>
                    <p className="page-subtitle">
                        Pesquise uma peca em todos os fornecedores cadastrados ao mesmo tempo.
                    </p>
                </div>
                <div className="expert-tip">
                    <Sparkles size={16} />
                    <span>
                        <strong>Dica do Dono:</strong> Use o caractere <strong>%</strong> entre as palavras
                        (ex: <i>Pastilha % Hilux % 2022</i>) para buscas mais precisas.
                    </span>
                </div>
            </div>

            <div className="search-box">
                <form onSubmit={handleAddPart} className="add-part-form">
                    <div className="input-group input-group-main">
                        <label htmlFor="quote-query">Codigo ou nome da peca</label>
                        <div className="input-with-icon">
                            <Search className="search-icon" size={20} />
                            <input
                                id="quote-query"
                                type="text"
                                placeholder="Digite o codigo ou nome da peca"
                                value={newPart}
                                onChange={(event) => setNewPart(event.target.value)}
                                className="part-input"
                            />
                        </div>
                    </div>

                    <div className="input-group input-group-description">
                        <label htmlFor="quote-description">Descricao opcional para a equipe</label>
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
                            <h4>Lista de Cotacao ({partList.length} itens)</h4>
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
                                    <RefreshCw size={20} /> Iniciar Orcamento em Todos os Fornecedores
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {hasResults && (
                <div className="results-panel">
                    <div className="results-header">
                        <div>
                            <h3>Quadro de Comparacao de Precos</h3>
                            {currentQuoteId && (
                                <p className="results-caption">
                                    Cotacao salva em {formatDateTime(currentCreatedAt)}
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
                                    <th>Peca / Produto</th>
                                    {suppliers.map((supplier) => (
                                        <th key={supplier}>{supplier}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {partList.map((item) => {
                                    const minPrice = bestPriceByQuery.get(item.query) ?? Infinity;

                                    return (
                                        <tr key={item.query}>
                                            <td className="part-name-cell">
                                                <div className="part-cell-main">{item.query}</div>
                                                {item.description && <div className="part-cell-description">{item.description}</div>}
                                            </td>

                                            {suppliers.map((supplier) => {
                                                const result = quoteMatrix[item.query]?.find((entry) => entry.provider === supplier);
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
                            <History size={18} /> Historico de Orcamentos
                        </h3>
                        <p>Consulte cotacoes anteriores por data e baixe PDF/Excel novamente.</p>
                    </div>
                    <button className="history-refresh-btn" onClick={() => void loadHistory()} disabled={isHistoryLoading}>
                        {isHistoryLoading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
                        Atualizar
                    </button>
                </div>

                {historyError && <div className="history-error">{historyError}</div>}

                {history.length === 0 && !isHistoryLoading ? (
                    <div className="history-empty">Nenhuma cotacao salva ainda.</div>
                ) : (
                    <div className="history-list">
                        {history.map((entry) => (
                            <div
                                key={entry.id}
                                className={`history-card ${activeHistoryId === entry.id ? 'history-card-active' : ''}`}
                            >
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
                .expert-tip {
                    background: rgba(99, 102, 241, 0.1);
                    border: 1px solid rgba(99, 102, 241, 0.2);
                    padding: 0.8rem 1rem;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    gap: 0.8rem;
                    color: #6366f1;
                    font-size: 0.9rem;
                    max-width: 450px;
                }
                .search-box, .results-panel, .history-panel {
                    background: var(--panel-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                }
                .search-box { padding: 1.5rem; }
                .add-part-form {
                    display: grid;
                    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto;
                    gap: 1rem;
                    align-items: end;
                }
                .input-group { display: flex; flex-direction: column; gap: 0.5rem; }
                .input-group label { color: var(--text-muted); font-size: 0.9rem; }
                .input-with-icon { position: relative; }
                .search-icon { position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); }
                .part-input {
                    width: 100%;
                    background: var(--bg-color);
                    border: 1px solid var(--border-color);
                    padding: 1rem;
                    border-radius: 8px;
                    color: var(--text-main);
                    font-size: 1rem;
                    outline: none;
                    transition: border 0.2s;
                    min-height: 52px;
                }
                .input-with-icon .part-input { padding-left: 3rem; }
                .part-input:focus { border-color: var(--primary-color); }
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
                .results-panel { overflow: hidden; }
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
                .export-actions, .history-card-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
                .export-btn, .history-refresh-btn, .history-card-actions button {
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
                .history-refresh-btn, .history-card-actions button {
                    background: var(--panel-bg);
                    color: var(--text-main);
                    border: 1px solid var(--border-color);
                }
                .history-card-actions .delete-history-button {
                    color: #dc2626;
                    border-color: rgba(220, 38, 38, 0.18);
                }
                .history-card-actions .delete-history-button:hover {
                    background: rgba(220, 38, 38, 0.08);
                }
                .table-responsive { overflow-x: auto; -webkit-overflow-scrolling: touch; }
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
                .best-price {
                    background: rgba(16, 185, 129, 0.05);
                    border-left: 3px solid #10b981 !important;
                    color: #10b981;
                    font-weight: bold;
                }
                .price-tag { display: flex; align-items: center; gap: 0.8rem; color: var(--text-main); }
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
                    display: flex;
                    justify-content: space-between;
                    gap: 1rem;
                    align-items: center;
                    background: var(--bg-color);
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
                        flex-direction: column;
                        align-items: stretch;
                    }
                    .add-part-form { grid-template-columns: 1fr; }
                    .export-actions, .history-card-actions { width: 100%; }
                }
            `}</style>
        </div>
    );
};
