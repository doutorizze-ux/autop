import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Globe, Lock, Trash2, ExternalLink, Play } from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  url: string;
  type?: string;
  needsLogin: boolean;
  loginUrl?: string;
  loginUserSelector?: string;
  loginPassSelector?: string;
  loginSubmitSelector?: string;
  loginCredential?: string;
  password?: string;
  loginExtraSelector?: string;
  loginExtraValue?: string;
  sessionData?: string;
  searchUrl?: string;
  searchBarSelector?: string;
  searchBtnSelector?: string;
  itemContainerSelector?: string;
  productNameSelector?: string;
  priceSelector?: string;
  availableSelector?: string;
}

interface SupplierTestResult {
  provider: string;
  product: string;
  price: string | number;
  available: boolean;
  link?: string;
  error?: string;
}

export const Suppliers = () => {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [testModalSupplier, setTestModalSupplier] = useState<Supplier | null>(null);
    const [testProduct, setTestProduct] = useState('');
    const [isTestingSupplier, setIsTestingSupplier] = useState(false);
    const [testResult, setTestResult] = useState<SupplierTestResult | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        url: '',
        type: 'Atacado',
        needsLogin: false,
        loginUrl: '',
        loginUserSelector: '',
        loginPassSelector: '',
        loginSubmitSelector: '',
        loginCredential: '',
        password: '',
        loginExtraSelector: '',
        loginExtraValue: '',
        sessionData: '',
        searchUrl: '',
        searchBarSelector: '',
        searchBtnSelector: '',
        itemContainerSelector: '',
        productNameSelector: '',
        priceSelector: '',
        availableSelector: ''
    });

    const [activeSection, setActiveSection] = useState<'basic' | 'login' | 'mapping'>('basic');

    useEffect(() => {
        fetchSuppliers();
    }, []);

    const fetchSuppliers = async () => {
        try {
            const response = await axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/suppliers`);
            setSuppliers(response.data);
        } catch (err) {
            console.error('Erro ao buscar fornecedores');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const isEdit = (formData as any).id;
            if (isEdit) {
                await axios.put(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/suppliers/${(formData as any).id}`, formData);
            } else {
                await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/suppliers`, formData);
            }
            setShowModal(false);
            setFormData({
                name: '', url: '', type: 'Atacado',
                needsLogin: false, loginUrl: '', loginUserSelector: '',
                loginPassSelector: '', loginSubmitSelector: '',
                loginCredential: '', password: '',
                loginExtraSelector: '', loginExtraValue: '',
                sessionData: '',
                searchUrl: '', searchBarSelector: '', searchBtnSelector: '',
                itemContainerSelector: '', productNameSelector: '', priceSelector: '',
                availableSelector: ''
            });
            fetchSuppliers();
        } catch (err: any) {
            alert('Erro ao salvar: ' + (err.response?.data?.message || err.message));
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Deseja remover este fornecedor?')) return;
        try {
            await axios.delete(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/suppliers/${id}`);
            fetchSuppliers();
        } catch (err) {
            alert('Erro ao remover');
        }
    };

    const openTestModal = (supplier: Supplier) => {
        setTestModalSupplier(supplier);
        setTestProduct('');
        setTestResult(null);
    };

    const closeTestModal = () => {
        setTestModalSupplier(null);
        setTestProduct('');
        setTestResult(null);
        setIsTestingSupplier(false);
    };

    const handleTestSupplier = async () => {
        if (!testModalSupplier || !testProduct.trim()) return;

        try {
            setIsTestingSupplier(true);
            setTestResult(null);

            const response = await axios.post(
                `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/suppliers/${testModalSupplier.id}/test`,
                { product: testProduct.trim() }
            );

            setTestResult(response.data);
        } catch (err: any) {
            setTestResult({
                provider: testModalSupplier.name,
                product: testProduct.trim(),
                price: '---',
                available: false,
                error: err.response?.data?.message || err.message || 'Erro ao testar fornecedor.',
                link: testModalSupplier.url,
            });
        } finally {
            setIsTestingSupplier(false);
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 className="page-title">Fornecedores</h1>
                <button className="btn-primary" onClick={() => setShowModal(true)} style={{ width: 'auto', padding: '0.6rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Plus size={18} />
                    <span>Novo Fornecedor</span>
                </button>
            </div>

            <div className="supplier-grid">
                {suppliers.map(s => (
                    <div key={s.id} className="supplier-card">
                        <div className="supplier-header">
                            <div>
                                <h3>{s.name}</h3>
                                <span className="type-badge">{s.type}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="edit-btn" onClick={() => { setFormData({...s, password: s.password || ''} as any); setShowModal(true); }} style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', opacity: 0.6 }}><ExternalLink size={16} /></button>
                                <button className="delete-btn" onClick={() => handleDelete(s.id)}><Trash2 size={16} /></button>
                            </div>
                        </div>
                        <div className="supplier-body">
                            <p><Globe size={14} /> {s.url}</p>
                            <p><Lock size={14} /> Login: {s.needsLogin ? 'Ativado' : 'Desativado'}</p>
                            {s.sessionData && <p><Lock size={14} /> SessÃ£o manual: Configurada</p>}
                        </div>
                        <div className="supplier-footer">
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    className="test-link"
                                    onClick={() => openTestModal(s)}
                                >
                                    <Play size={14} />
                                    <span>Testar Busca</span>
                                </button>
                                <a href={s.url} target="_blank" rel="noreferrer" className="visit-link">
                                    <span>Visitar Site</span>
                                    <ExternalLink size={14} />
                                </a>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content auth-card" style={{ maxWidth: '700px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h2 style={{ marginBottom: '1rem' }}>Configurar Fornecedor</h2>
                        
                        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
                            <button onClick={() => setActiveSection('basic')} style={{ padding: '0.5rem 1rem', background: 'none', border: 'none', color: activeSection === 'basic' ? 'var(--primary-color)' : 'var(--text-muted)', borderBottom: activeSection === 'basic' ? '2px solid var(--primary-color)' : 'none', cursor: 'pointer' }}>Geral</button>
                            <button onClick={() => setActiveSection('login')} style={{ padding: '0.5rem 1rem', background: 'none', border: 'none', color: activeSection === 'login' ? 'var(--primary-color)' : 'var(--text-muted)', borderBottom: activeSection === 'login' ? '2px solid var(--primary-color)' : 'none', cursor: 'pointer' }}>Login</button>
                            <button onClick={() => setActiveSection('mapping')} style={{ padding: '0.5rem 1rem', background: 'none', border: 'none', color: activeSection === 'mapping' ? 'var(--primary-color)' : 'var(--text-muted)', borderBottom: activeSection === 'mapping' ? '2px solid var(--primary-color)' : 'none', cursor: 'pointer' }}>Mapeamento de Busca</button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            {activeSection === 'basic' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div className="form-group">
                                        <label>Nome do Fornecedor</label>
                                        <input type="text" className="form-input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                                    </div>
                                    <div className="form-group">
                                        <label>URL Principal</label>
                                        <input type="url" className="form-input" value={formData.url} onChange={e => setFormData({...formData, url: e.target.value})} required />
                                    </div>
                                    <div className="form-group">
                                        <label>Categoria</label>
                                        <select className="form-input" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                                            <option>Atacado</option>
                                            <option>Varejo</option>
                                            <option>Distribuidora</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {activeSection === 'login' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                        <input type="checkbox" checked={formData.needsLogin} onChange={e => setFormData({...formData, needsLogin: e.target.checked})} />
                                        <label>Requer Login para buscar?</label>
                                    </div>
                                    
                                    {formData.needsLogin && (
                                        <>
                                            <div className="form-group">
                                                <label>URL da Página de Login</label>
                                                <input type="text" className="form-input" value={formData.loginUrl} onChange={e => setFormData({...formData, loginUrl: e.target.value})} placeholder="https://..." />
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                <div className="form-group">
                                                    <label>Seletor Usuário/Email</label>
                                                    <input type="text" className="form-input" value={formData.loginUserSelector} onChange={e => setFormData({...formData, loginUserSelector: e.target.value})} placeholder="#email" />
                                                </div>
                                                <div className="form-group">
                                                    <label>Seletor Senha</label>
                                                    <input type="text" className="form-input" value={formData.loginPassSelector} onChange={e => setFormData({...formData, loginPassSelector: e.target.value})} placeholder="#password" />
                                                </div>
                                            </div>
                                            <div className="form-group">
                                                <label>Seletor Botão Entrar</label>
                                                <input type="text" className="form-input" value={formData.loginSubmitSelector} onChange={e => setFormData({...formData, loginSubmitSelector: e.target.value})} placeholder="button[type='submit']" />
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                <div className="form-group">
                                                    <label>Credencial (PDF de Login)</label>
                                                    <input type="text" className="form-input" value={formData.loginCredential} onChange={e => setFormData({...formData, loginCredential: e.target.value})} />
                                                </div>
                                                <div className="form-group">
                                                    <label>Senha de Acesso</label>
                                                    <input type="password" title="Não exibimos por segurança" className="form-input" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                <div className="form-group">
                                                    <label>Seletor Campo Extra (CNPJ/Perfil)</label>
                                                    <input type="text" className="form-input" value={formData.loginExtraSelector} onChange={e => setFormData({...formData, loginExtraSelector: e.target.value})} placeholder="#cnpj" />
                                                </div>
                                                <div className="form-group">
                                                    <label>Valor Campo Extra</label>
                                                    <input type="text" className="form-input" value={formData.loginExtraValue} onChange={e => setFormData({...formData, loginExtraValue: e.target.value})} />
                                                </div>
                                            </div>
                                            <div className="form-group">
                                                <label>Sessão/Cookies JSON (opcional)</label>
                                                <textarea
                                                    className="form-input"
                                                    value={formData.sessionData}
                                                    onChange={e => setFormData({...formData, sessionData: e.target.value})}
                                                    placeholder='Cole aqui um JSON de cookies ou storageState para reutilizar uma sessão autenticada'
                                                    rows={6}
                                                    style={{ resize: 'vertical', minHeight: '140px' }}
                                                />
                                                <small style={{ color: 'var(--text-muted)' }}>
                                                    Use este campo quando o portal bloquear login automático. Pode ser um array de cookies exportado do navegador ou um storageState do Playwright.
                                                </small>
                                                <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.35rem' }}>
                                                    Exemplo: faÃ§a login manual no portal, exporte os cookies com Cookie-Editor ou copie um storageState e cole aqui.
                                                </small>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {activeSection === 'mapping' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div className="form-group">
                                        <label>Seletor Barra de Busca</label>
                                        <input type="text" className="form-input" value={formData.searchBarSelector} onChange={e => setFormData({...formData, searchBarSelector: e.target.value})} placeholder="#search-input" />
                                    </div>
                                    <div className="form-group">
                                        <label>Seletor Botão de Busca (opcional)</label>
                                        <input type="text" className="form-input" value={formData.searchBtnSelector} onChange={e => setFormData({...formData, searchBtnSelector: e.target.value})} placeholder=".btn-search" />
                                    </div>
                                    
                                    <h4 style={{ margin: '1rem 0 0.5rem 0', color: 'var(--primary-color)' }}>Extração de Dados</h4>
                                    
                                    <div className="form-group">
                                        <label>Seletor do Container do Produto</label>
                                        <input type="text" className="form-input" value={formData.itemContainerSelector} onChange={e => setFormData({...formData, itemContainerSelector: e.target.value})} placeholder=".product-item" />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div className="form-group">
                                            <label>Seletor Nome do Produto</label>
                                            <input type="text" className="form-input" value={formData.productNameSelector} onChange={e => setFormData({...formData, productNameSelector: e.target.value})} placeholder="h2.title" />
                                        </div>
                                        <div className="form-group">
                                            <label>Seletor Preço</label>
                                            <input type="text" className="form-input" value={formData.priceSelector} onChange={e => setFormData({...formData, priceSelector: e.target.value})} placeholder=".price-value" />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                                <button type="submit" className="btn-primary" style={{ flex: 2 }}>Salvar Fornecedor</button>
                                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)} style={{ flex: 1, padding: '0.85rem', background: 'var(--bg-color)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {testModalSupplier && (
                <div className="modal-overlay">
                    <div className="modal-content auth-card" style={{ maxWidth: '560px', width: '90%' }}>
                        <h2 style={{ marginBottom: '0.5rem' }}>Testar Fornecedor</h2>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            Vamos validar a integra&ccedil;&atilde;o de <strong>{testModalSupplier.name}</strong> sem depender do or&ccedil;amento completo.
                        </p>

                        <div className="form-group" style={{ marginBottom: '1rem' }}>
                            <label>Produto para teste</label>
                            <input
                                type="text"
                                className="form-input"
                                value={testProduct}
                                onChange={(e) => setTestProduct(e.target.value)}
                                placeholder="Ex: pastilha hilux"
                            />
                        </div>

                        {testResult && (
                            <div
                                style={{
                                    border: `1px solid ${testResult.error ? '#ffb3b3' : 'var(--border-color)'}`,
                                    background: testResult.error ? 'rgba(255, 77, 77, 0.08)' : 'rgba(0, 86, 179, 0.08)',
                                    borderRadius: '8px',
                                    padding: '1rem',
                                    marginBottom: '1rem',
                                }}
                            >
                                <p style={{ marginBottom: '0.4rem', fontWeight: 600 }}>{testResult.provider}</p>
                                <p style={{ marginBottom: '0.4rem' }}>Produto: {testResult.product}</p>
                                {!testResult.error && <p style={{ marginBottom: '0.4rem' }}>Preco: {testResult.price}</p>}
                                {testResult.error && <p style={{ color: '#d92d20' }}>{testResult.error}</p>}
                                {testResult.link && (
                                    <a href={testResult.link} target="_blank" rel="noreferrer" className="visit-link">
                                        <span>Abrir resultado</span>
                                        <ExternalLink size={14} />
                                    </a>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={handleTestSupplier}
                                disabled={isTestingSupplier || !testProduct.trim()}
                                style={{ flex: 2, opacity: isTestingSupplier || !testProduct.trim() ? 0.7 : 1 }}
                            >
                                {isTestingSupplier ? 'Testando...' : 'Executar Teste'}
                            </button>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={closeTestModal}
                                style={{ flex: 1, padding: '0.85rem', background: 'var(--bg-color)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' }}
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}


            <style>{`
                .supplier-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
                    gap: 1.5rem;
                }
                .supplier-card {
                    background: var(--panel-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    padding: 1.5rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                .supplier-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                }
                .type-badge {
                    font-size: 0.7rem;
                    background: rgba(0, 86, 179, 0.1);
                    color: var(--primary-color);
                    padding: 0.2rem 0.5rem;
                    border-radius: 4px;
                    font-weight: 600;
                    text-transform: uppercase;
                }
                .delete-btn {
                    background: none;
                    border: none;
                    color: #ff4d4d;
                    cursor: pointer;
                    opacity: 0.6;
                    transition: opacity 0.2s;
                }
                .delete-btn:hover {
                    opacity: 1;
                }
                .supplier-body p {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    color: var(--text-muted);
                    font-size: 0.9rem;
                    margin-bottom: 0.5rem;
                }
                .supplier-footer {
                    margin-top: auto;
                    padding-top: 1rem;
                    border-top: 1px solid var(--border-color);
                }
                .visit-link {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    color: var(--text-main);
                    text-decoration: none;
                    font-size: 0.9rem;
                    font-weight: 500;
                }
                .visit-link:hover {
                    color: var(--primary-color);
                }
                .test-link {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    color: var(--primary-color);
                    background: rgba(0, 86, 179, 0.08);
                    border: 1px solid rgba(0, 86, 179, 0.15);
                    border-radius: 6px;
                    padding: 0.45rem 0.75rem;
                    cursor: pointer;
                    font-size: 0.9rem;
                    font-weight: 500;
                }
                .test-link:hover {
                    background: rgba(0, 86, 179, 0.14);
                }
                .modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.85);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 2000;
                }
            `}</style>
        </div>
    );
};
