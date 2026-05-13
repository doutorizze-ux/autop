import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
    CalendarClock,
    Download,
    FileText,
    FolderOpen,
    Loader2,
    RefreshCw,
    Search,
    Trash2,
} from 'lucide-react';
import { API_URL } from '../services/api';

type QuoteHistoryItem = {
    query: string;
    description?: string;
    label?: string;
};

type QuoteHistoryEntry = {
    id: string;
    createdAt: string;
    itemCount: number;
    items: QuoteHistoryItem[];
    title: string;
};

type QuoteHistoryProps = {
    onOpenQuote?: (quoteId: string) => void;
};

const apiBase = API_URL;

const formatDateTime = (value?: string) => {
    if (!value) return '---';
    return new Date(value).toLocaleString('pt-BR');
};

const normalizeText = (value: string) =>
    String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
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

export const QuoteHistory = ({ onOpenQuote }: QuoteHistoryProps) => {
    const [history, setHistory] = useState<QuoteHistoryEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const loadHistory = async () => {
        setIsLoading(true);
        setError('');

        try {
            const response = await axios.get<QuoteHistoryEntry[]>(`${apiBase}/api/quotes/history`);
            setHistory(response.data);
        } catch (loadError) {
            console.error('Load Quote History Error:', loadError);
            setError('Nao foi possivel carregar o historico agora.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadHistory();
    }, []);

    const filteredHistory = useMemo(() => {
        const term = normalizeText(searchTerm);
        if (!term) return history;

        return history.filter((entry) => {
            const searchable = [
                entry.title,
                ...entry.items.flatMap((item) => [item.query, item.description || '', item.label || '']),
            ].join(' ');

            return normalizeText(searchable).includes(term);
        });
    }, [history, searchTerm]);

    const toggleSelection = (quoteId: string) => {
        setSelectedIds((current) =>
            current.includes(quoteId)
                ? current.filter((id) => id !== quoteId)
                : [...current, quoteId]
        );
    };

    const handleExportSaved = async (quoteId: string, type: 'pdf' | 'excel') => {
        try {
            const response = await axios.get(`${apiBase}/api/quotes/history/${quoteId}/export/${type}`, {
                responseType: 'blob',
            });
            downloadBlob(response.data, `orcamento-${quoteId}.${type === 'pdf' ? 'pdf' : 'xlsx'}`);
        } catch (exportError) {
            console.error('Export Saved Quote Error:', exportError);
            alert('Nao foi possivel exportar este orcamento.');
        }
    };

    const handleExportSelectedPdf = async () => {
        if (selectedIds.length === 0) return;

        try {
            const response = await axios.post(
                `${apiBase}/api/quotes/history/export/pdf`,
                { ids: selectedIds },
                { responseType: 'blob' }
            );
            downloadBlob(response.data, `orcamentos-selecionados-${Date.now()}.pdf`);
        } catch (exportError) {
            console.error('Export Selected Quotes Error:', exportError);
            alert('Nao foi possivel exportar os orcamentos selecionados.');
        }
    };

    const handleDeleteHistory = async (quoteId: string) => {
        const confirmed = window.confirm('Excluir esta cotacao do historico?');
        if (!confirmed) return;

        try {
            await axios.delete(`${apiBase}/api/quotes/history/${quoteId}`);
            setSelectedIds((current) => current.filter((id) => id !== quoteId));
            await loadHistory();
        } catch (deleteError) {
            console.error('Delete Quote History Error:', deleteError);
            alert('Nao foi possivel excluir esta cotacao.');
        }
    };

    return (
        <div className="quote-history-page">
            <div className="history-page-header">
                <div>
                    <h1 className="page-title">Produtos Pesquisados</h1>
                    <p className="page-subtitle">Consulte cotações antigas por código, descrição ou data.</p>
                </div>

                <button className="history-refresh-btn" onClick={() => void loadHistory()} disabled={isLoading}>
                    {isLoading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
                    Atualizar
                </button>
            </div>

            <div className="history-toolbar">
                <div className="history-search">
                    <Search size={18} />
                    <input
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Buscar por codigo ou descricao"
                    />
                </div>

                <button
                    className="history-batch-btn"
                    onClick={() => void handleExportSelectedPdf()}
                    disabled={selectedIds.length === 0}
                >
                    <FileText size={16} /> PDF selecionados ({selectedIds.length})
                </button>
            </div>

            <div className="history-stats">
                <div>
                    <strong>{history.length}</strong>
                    <span>cotações salvas</span>
                </div>
                <div>
                    <strong>{filteredHistory.length}</strong>
                    <span>visíveis no filtro</span>
                </div>
                <div>
                    <strong>{selectedIds.length}</strong>
                    <span>selecionadas</span>
                </div>
            </div>

            {error && <div className="history-error">{error}</div>}

            {filteredHistory.length === 0 && !isLoading ? (
                <div className="history-empty">Nenhuma cotação encontrada.</div>
            ) : (
                <div className="history-catalog-list">
                    {filteredHistory.map((entry) => (
                        <article key={entry.id} className="history-catalog-card">
                            <label className="history-select">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.includes(entry.id)}
                                    onChange={() => toggleSelection(entry.id)}
                                />
                            </label>

                            <div className="history-catalog-main">
                                <div className="history-catalog-meta">
                                    <span>
                                        <CalendarClock size={14} /> {formatDateTime(entry.createdAt)}
                                    </span>
                                    <span>{entry.itemCount} {entry.itemCount === 1 ? 'item' : 'itens'}</span>
                                </div>

                                <h3>{entry.title}</h3>

                                <div className="history-product-chips">
                                    {entry.items.slice(0, 8).map((item, index) => (
                                        <span key={`${entry.id}-${item.query}-${index}`}>
                                            <strong>{item.query}</strong>
                                            {item.description && <small>{item.description}</small>}
                                        </span>
                                    ))}
                                    {entry.items.length > 8 && <span>+{entry.items.length - 8}</span>}
                                </div>
                            </div>

                            <div className="history-catalog-actions">
                                <button type="button" onClick={() => onOpenQuote?.(entry.id)}>
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
                        </article>
                    ))}
                </div>
            )}

            <style>{`
                .quote-history-page {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }

                .history-page-header,
                .history-toolbar,
                .history-catalog-card {
                    background: var(--surface);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    box-shadow: var(--shadow-sm);
                }

                .history-page-header {
                    display: flex;
                    justify-content: space-between;
                    gap: 1rem;
                    align-items: flex-start;
                    padding: 1.25rem 1.5rem;
                }

                .history-toolbar {
                    display: grid;
                    grid-template-columns: minmax(220px, 1fr) auto;
                    gap: 1rem;
                    padding: 1rem;
                    align-items: center;
                }

                .history-search {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.8rem 1rem;
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    background: #fff;
                }

                .history-search input {
                    border: 0;
                    outline: 0;
                    width: 100%;
                    color: var(--text-primary);
                    font-size: 0.95rem;
                }

                .history-stats {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 0.75rem;
                }

                .history-stats div {
                    background: #fff;
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    padding: 0.95rem 1rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.2rem;
                }

                .history-stats strong {
                    font-size: 1.35rem;
                    color: var(--text-primary);
                }

                .history-stats span,
                .history-catalog-meta {
                    color: var(--text-secondary);
                    font-size: 0.85rem;
                }

                .history-catalog-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }

                .history-catalog-card {
                    display: grid;
                    grid-template-columns: auto minmax(0, 1fr) auto;
                    gap: 1rem;
                    padding: 1rem;
                    align-items: center;
                }

                .history-select {
                    display: flex;
                    align-items: center;
                }

                .history-select input {
                    width: 16px;
                    height: 16px;
                }

                .history-catalog-main {
                    min-width: 0;
                }

                .history-catalog-meta {
                    display: flex;
                    gap: 1rem;
                    flex-wrap: wrap;
                    margin-bottom: 0.45rem;
                }

                .history-catalog-meta span {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.35rem;
                }

                .history-catalog-main h3 {
                    margin: 0;
                    font-size: 1rem;
                    color: var(--text-primary);
                    overflow-wrap: anywhere;
                }

                .history-product-chips {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.45rem;
                    margin-top: 0.65rem;
                }

                .history-product-chips span {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.35rem;
                    border: 1px solid var(--border-color);
                    background: #fff;
                    border-radius: 999px;
                    padding: 0.35rem 0.65rem;
                    color: var(--text-secondary);
                    font-size: 0.82rem;
                    max-width: 340px;
                }

                .history-product-chips small {
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .history-catalog-actions {
                    display: flex;
                    gap: 0.5rem;
                    flex-wrap: wrap;
                    justify-content: flex-end;
                }

                .history-refresh-btn,
                .history-batch-btn,
                .history-catalog-actions button {
                    border: 1px solid var(--border-color);
                    background: #fff;
                    color: var(--text-primary);
                    border-radius: 8px;
                    padding: 0.65rem 0.85rem;
                    display: inline-flex;
                    align-items: center;
                    gap: 0.45rem;
                    cursor: pointer;
                    font-weight: 700;
                }

                .history-refresh-btn:hover,
                .history-batch-btn:hover,
                .history-catalog-actions button:hover {
                    border-color: var(--primary-color);
                    color: var(--primary-color);
                }

                .history-batch-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .history-catalog-actions .delete-history-button {
                    color: #ef4444;
                    border-color: #fecaca;
                }

                .history-empty,
                .history-error {
                    background: #fff;
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    padding: 1rem;
                    color: var(--text-secondary);
                }

                .history-error {
                    color: #ef4444;
                }

                @media (max-width: 900px) {
                    .history-page-header,
                    .history-toolbar,
                    .history-catalog-card {
                        grid-template-columns: 1fr;
                    }

                    .history-page-header,
                    .history-catalog-card {
                        display: flex;
                        flex-direction: column;
                        align-items: stretch;
                    }

                    .history-stats {
                        grid-template-columns: 1fr;
                    }

                    .history-catalog-actions,
                    .history-batch-btn,
                    .history-refresh-btn {
                        width: 100%;
                    }

                    .history-catalog-actions button {
                        flex: 1 1 120px;
                        justify-content: center;
                    }
                }
            `}</style>
        </div>
    );
};
