import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Globe, Lock, Trash2, ExternalLink } from 'lucide-react';

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
  searchUrl?: string;
  searchBarSelector?: string;
  searchBtnSelector?: string;
  itemContainerSelector?: string;
  productNameSelector?: string;
  priceSelector?: string;
  availableSelector?: string;
}

export const Suppliers = () => {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [showModal, setShowModal] = useState(false);
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
                        </div>
                        <div className="supplier-footer">
                            <a href={s.url} target="_blank" rel="noreferrer" className="visit-link">
                                <span>Visitar Site</span>
                                <ExternalLink size={14} />
                            </a>
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
