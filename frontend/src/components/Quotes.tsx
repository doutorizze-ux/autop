import { useState } from 'react';
import axios from 'axios';
import { Search, Plus, Trash2, FileText, Download, Loader2, RefreshCw, Sparkles } from 'lucide-react';

export const Quotes = () => {
    const [partList, setPartList] = useState<string[]>([]);
    const [newPart, setNewPart] = useState('');
    const [quoteMatrix, setQuoteMatrix] = useState<Record<string, any[]>>({});
    const [isSearching, setIsSearching] = useState(false);

    const handleAddPart = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (newPart.trim() && !partList.includes(newPart.trim())) {
            setPartList([...partList, newPart.trim()]);
            setNewPart('');
        }
    };

    const handleRemovePart = (index: number) => {
        setPartList(partList.filter((_, i) => i !== index));
    };

    const handleSearchPrices = async () => {
        if (partList.length === 0) return;

        setIsSearching(true);
        try {
            const response = await axios.post('http://localhost:5000/api/quotes/search', { productNames: partList });
            setQuoteMatrix(response.data);
        } catch (err) {
            alert('Erro ao buscar preços. Verifique se os fornecedores estão configurados corretamente.');
        } finally {
            setIsSearching(false);
        }
    };

    const handleExport = async (type: 'pdf' | 'excel') => {
        try {
            const suppliers = Array.from(new Set(Object.values(quoteMatrix).flat().map(r => r.provider)));
            const response = await axios.post(`http://localhost:5000/api/quotes/export/${type}`, {
                products: partList,
                suppliers: suppliers,
                matrix: quoteMatrix
            }, { responseType: 'blob' });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `orcamento.${type === 'pdf' ? 'pdf' : 'xlsx'}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            alert('Erro ao exportar arquivo.');
        }
    };

    const suppliers = Array.from(new Set(Object.values(quoteMatrix).flat().map(r => (r as any).provider)));
    const hasResults = Object.keys(quoteMatrix).length > 0;

    return (
        <div className="quotes-container">
            <div className="quotes-header">
                <div>
                    <h1 className="page-title">Orçamento Simultâneo</h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Pesquise uma peça em todos os fornecedores cadastrados ao mesmo tempo.</p>
                </div>
                <div className="expert-tip">
                    <Sparkles size={16} />
                    <span><strong>Dica do Dono:</strong> Use o caractere <strong>%</strong> entre as palavras (ex: <i>Pastilha % Hilux % 2022</i>) para buscas mais precisas.</span>
                </div>
            </div>

            <div className="search-box">
                <form onSubmit={handleAddPart} className="add-part-form">
                    <Search className="search-icon" size={20} />
                    <input 
                        type="text" 
                        placeholder="Digite o código ou nome da peça (ex: Pastilha de freio Hilux) e pressione Enter..." 
                        value={newPart}
                        onChange={e => setNewPart(e.target.value)}
                        className="part-input"
                    />
                    <button type="submit" className="add-btn">
                        <Plus size={18} /> Adicionar
                    </button>
                </form>
                
                {partList.length > 0 && (
                    <div className="part-list">
                        <h4>Lista de Cotação ({partList.length} itens)</h4>
                        <div className="tags-container">
                            {partList.map((part, i) => (
                                <span key={i} className="part-tag">
                                    {part}
                                    <button type="button" onClick={() => handleRemovePart(i)}><Trash2 size={14} /></button>
                                </span>
                            ))}
                        </div>
                        
                        <button 
                            className="btn-primary start-search-btn" 
                            onClick={handleSearchPrices} 
                            disabled={isSearching}
                        >
                            {isSearching ? <><Loader2 className="spin" size={20} /> Cotando em andamento...</> : <><RefreshCw size={20} /> Iniciar Orçamento em Todos os Fornecedores</>}
                        </button>
                    </div>
                )}
            </div>

            {hasResults && (
                <div className="results-panel">
                    <div className="results-header">
                        <h3>Quadro de Comparação de Preços</h3>
                        <div className="export-actions">
                            <button className="export-btn excel" onClick={() => handleExport('excel')}>
                                <Download size={16} /> Exportar Excel
                            </button>
                            <button className="export-btn pdf" onClick={() => handleExport('pdf')}>
                                <FileText size={16} /> Gerar PDF
                            </button>
                        </div>
                    </div>
                    
                    <div className="table-responsive">
                        <table className="matrix-table">
                            <thead>
                                <tr>
                                    <th>Peça / Produto</th>
                                    {suppliers.map(s => <th key={s}>{s}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {partList.map(part => {
                                    // Identify min price
                                    let minPrice = Infinity;
                                    suppliers.forEach(sup => {
                                        const item = quoteMatrix[part]?.find((r: any) => r.provider === sup);
                                        if (item && !item.error) {
                                            const val = parseFloat(item.price);
                                            if (!isNaN(val) && val < minPrice) minPrice = val;
                                        }
                                    });

                                    return (
                                        <tr key={part}>
                                            <td className="part-name-cell">{part}</td>
                                            {suppliers.map(s => {
                                                const res = quoteMatrix[part]?.find((r: any) => r.provider === s);
                                                const isMinPrice = res && !res.error && parseFloat(res.price) === minPrice;
                                                
                                                return (
                                                    <td key={s} className={isMinPrice ? 'best-price' : ''}>
                                                        {res ? (
                                                            res.error ? (
                                                                <span className="error-text" title={res.error}>{res.error}</span>
                                                            ) : (
                                                                <div className="price-tag">
                                                                    <span>R$ {res.price}</span>
                                                                    {res.link && <a href={res.link} target="_blank" rel="noreferrer" title="Ver Produto no Site" className="visit-link">🔗</a>}
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

            <style>{`
                .quotes-container { display: flex; flex-direction: column; gap: 2rem; }
                .quotes-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
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
                .search-box { background: var(--panel-bg); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.5rem; }
                .add-part-form { display: flex; align-items: center; gap: 1rem; position: relative; }
                .search-icon { position: absolute; left: 1rem; color: var(--text-muted); }
                .part-input { flex: 1; background: var(--bg-color); border: 1px solid var(--border-color); padding: 1rem 1rem 1rem 3rem; border-radius: 8px; color: var(--text-main); font-size: 1rem; outline: none; transition: border 0.2s; }
                .part-input:focus { border-color: var(--primary-color); }
                .add-btn { background: var(--text-main); color: var(--panel-bg); border: none; padding: 0 1.5rem; height: 50px; border-radius: 8px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; transition: background 0.2s; }
                .add-btn:hover { background: var(--primary-hover); }
                
                .part-list { margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 1.5rem; }
                .part-list h4 { color: var(--text-muted); margin-bottom: 1rem; font-weight: 500; }
                .tags-container { display: flex; flex-wrap: wrap; gap: 0.8rem; margin-bottom: 1.5rem; }
                .part-tag { background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-main); padding: 0.5rem 1rem; border-radius: 20px; display: flex; align-items: center; gap: 0.8rem; font-size: 0.95rem; }
                .part-tag button { background: none; border: none; color: #ef4444; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0.7; transition: opacity 0.2s; }
                .part-tag button:hover { opacity: 1; }
                
                .start-search-btn { width: 100%; height: 55px; font-size: 1.1rem; display: flex; justify-content: center; align-items: center; gap: 0.8rem; }
                
                .results-panel { background: var(--panel-bg); border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden; }
                .results-header { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem; border-bottom: 1px solid var(--border-color); background: var(--bg-color); }
                .export-actions { display: flex; gap: 1rem; }
                .export-btn { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1rem; border-radius: 6px; border: none; color: white; font-weight: 600; cursor: pointer; font-size: 0.9rem; }
                .export-btn.excel { background: #10b981; }
                .export-btn.excel:hover { background: #059669; }
                .export-btn.pdf { background: #ef4444; }
                .export-btn.pdf:hover { background: #dc2626; }
                
                .table-responsive { overflow-x: auto; -webkit-overflow-scrolling: touch; }
                .matrix-table { width: 100%; border-collapse: collapse; text-align: left; }
                .matrix-table th { padding: 1rem 1.5rem; color: var(--text-muted); font-size: 0.9rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid var(--border-color); white-space: nowrap; }
                .matrix-table td { padding: 1.2rem 1.5rem; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
                .part-name-cell { font-weight: 600; color: var(--primary-color); }
                
                .best-price { background: rgba(16, 185, 129, 0.05); border-left: 3px solid #10b981 !important; color: #10b981; font-weight: bold; }
                .price-tag { display: flex; align-items: center; gap: 0.8rem; color: var(--text-main); }
                .visit-link { text-decoration: none; font-size: 1.2rem; filter: grayscale(1); transition: filter 0.2s; }
                .visit-link:hover { filter: grayscale(0); }
                .error-text { color: #ef4444; font-size: 0.85rem; }
                .not-found { color: var(--text-muted); }
                
                @keyframes spin { 100% { transform: rotate(360deg); } }
                .spin { animation: spin 1s linear infinite; }
            `}</style>
        </div>
    );
};
