import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Save, User, Key, Shield, MessageSquare, AlertCircle, CheckCircle } from 'lucide-react';

export const Settings = () => {
    const { user } = useAuth();
    const [activeSection, setActiveSection] = useState('perfil');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Profile State
    const [profileData, setProfileData] = useState({
        name: user?.name || '',
        email: user?.email || '',
        password: '',
        confirmPassword: ''
    });

    // Config State
    const [systemConfig, setSystemConfig] = useState({
        aiKey: '',
        whatsappMode: 'baileys'
    });

    useEffect(() => {
        if (user?.role === 'ADMIN') {
            fetchSystemConfig();
        }
    }, [user]);

    const fetchSystemConfig = async () => {
        try {
            const response = await axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/config`);
            setSystemConfig(response.data);
        } catch (err) {
            console.error('Erro ao buscar configurações do sistema');
        }
    };

    const handleProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (profileData.password && profileData.password !== profileData.confirmPassword) {
            setMessage({ type: 'error', text: 'As senhas não coincidem' });
            return;
        }

        setLoading(true);
        try {
            await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/config/profile`, profileData);
            setMessage({ type: 'success', text: 'Perfil atualizado com sucesso!' });
            setProfileData(prev => ({ ...prev, password: '', confirmPassword: '' }));
        } catch (err) {
            setMessage({ type: 'error', text: 'Erro ao atualizar perfil' });
        } finally {
            setLoading(false);
        }
    };

    const handleConfigSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/config`, systemConfig);
            setMessage({ type: 'success', text: 'Configurações globais salvas!' });
        } catch (err) {
            setMessage({ type: 'error', text: 'Erro ao salvar configurações' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="settings-container">
            <h1 className="page-title">Configurações</h1>

            <div className="settings-layout">
                <aside className="settings-nav">
                    <button 
                        className={`settings-nav-item ${activeSection === 'perfil' ? 'active' : ''}`}
                        onClick={() => setActiveSection('perfil')}
                    >
                        <User size={18} />
                        <span>Meu Perfil</span>
                    </button>
                    {user?.role === 'ADMIN' && (
                        <button 
                            className={`settings-nav-item ${activeSection === 'ia' ? 'active' : ''}`}
                            onClick={() => setActiveSection('ia')}
                        >
                            <Shield size={18} />
                            <span>Integração IA</span>
                        </button>
                    )}
                    <button 
                        className={`settings-nav-item ${activeSection === 'whatsapp' ? 'active' : ''}`}
                        onClick={() => setActiveSection('whatsapp')}
                    >
                        <MessageSquare size={18} />
                        <span>WhatsApp Status</span>
                    </button>
                    <button 
                        className={`settings-nav-item ${activeSection === 'aparencia' ? 'active' : ''}`}
                        onClick={() => setActiveSection('aparencia')}
                    >
                        <AlertCircle size={18} />
                        <span>Aparência da Loja</span>
                    </button>
                </aside>

                <main className="settings-content">
                    {message && (
                        <div className={`status-banner ${message.type}`}>
                            {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                            <span>{message.text}</span>
                            <button onClick={() => setMessage(null)}>X</button>
                        </div>
                    )}

                    {activeSection === 'perfil' && (
                        <div className="settings-section">
                            <div className="section-header">
                                <h2>Dados de Acesso</h2>
                                <p>Gerencie seu nome, e-mail e troque sua senha de acesso ao AutoCRM.</p>
                            </div>
                            <form onSubmit={handleProfileSubmit}>
                                <div className="form-group">
                                    <label>Nome Completo</label>
                                    <input 
                                        type="text" 
                                        className="form-input" 
                                        value={profileData.name}
                                        onChange={e => setProfileData({...profileData, name: e.target.value})}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Endereço de E-mail</label>
                                    <input 
                                        type="email" 
                                        className="form-input" 
                                        value={profileData.email}
                                        onChange={e => setProfileData({...profileData, email: e.target.value})}
                                    />
                                </div>
                                <div className="password-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div className="form-group">
                                        <label>Nova Senha (opcional)</label>
                                        <input 
                                            type="password" 
                                            className="form-input" 
                                            placeholder="Deixe em branco para não alterar"
                                            value={profileData.password}
                                            onChange={e => setProfileData({...profileData, password: e.target.value})}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Confirmar Senha</label>
                                        <input 
                                            type="password" 
                                            className="form-input" 
                                            value={profileData.confirmPassword}
                                            onChange={e => setProfileData({...profileData, confirmPassword: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <button type="submit" className="btn-primary" disabled={loading}>
                                    <Save size={18} />
                                    <span>{loading ? 'Salvando...' : 'Atualizar Perfil'}</span>
                                </button>
                            </form>
                        </div>
                    )}

                    {activeSection === 'ia' && user?.role === 'ADMIN' && (
                        <div className="settings-section">
                            <div className="section-header">
                                <h2>Configuração da IA</h2>
                                <p>Insira sua API Key da Anthropic para habilitar a interpretação automática de pedidos e sugestões de resposta.</p>
                            </div>
                            <form onSubmit={handleConfigSubmit}>
                                <div className="form-group">
                                    <label>Anthropic API Key (Claude-3)</label>
                                    <div style={{ position: 'relative' }}>
                                        <Key size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                        <input 
                                            type="password" 
                                            className="form-input" 
                                            style={{ paddingLeft: '2.5rem' }}
                                            placeholder="sk-ant-..."
                                            value={systemConfig.aiKey || ''}
                                            onChange={e => setSystemConfig({...systemConfig, aiKey: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Modelo de Linguagem</label>
                                    <select className="form-input" disabled>
                                        <option>Claude-3 Haiku (Mais rápido e econômico)</option>
                                        <option>Claude-3.5 Sonnet (Mais inteligente)</option>
                                    </select>
                                </div>
                                <button type="submit" className="btn-primary" disabled={loading}>
                                    <Save size={18} />
                                    <span>{loading ? 'Salvando...' : 'Salvar Configurações de IA'}</span>
                                </button>
                            </form>
                        </div>
                    )}

                    {activeSection === 'aparencia' && (
                        <div className="settings-section">
                            <div className="section-header">
                                <h2>Personalização Visual</h2>
                                <p>Altere a logotipo e a cor principal do sistema para ficar com a cara da Autopeças.</p>
                            </div>
                            <form onSubmit={(e) => {
                                e.preventDefault();
                                const color = (document.getElementById('theme_color') as HTMLInputElement)?.value;
                                const logo = (document.getElementById('theme_logo') as HTMLInputElement)?.value;
                                localStorage.setItem('theme_color', color);
                                localStorage.setItem('theme_logo', logo);
                                document.documentElement.style.setProperty('--primary-color', color);
                                setMessage({ type: 'success', text: 'Tema atualizado com sucesso!' });
                            }}>
                                <div className="form-group">
                                    <label>Cor Principal do Sistema</label>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <input 
                                            id="theme_color"
                                            type="color" 
                                            defaultValue={localStorage.getItem('theme_color') || '#0056b3'}
                                            style={{ height: '45px', width: '80px', padding: '0', cursor: 'pointer', border: '1px solid var(--border-color)', borderRadius: '6px' }}
                                        />
                                        <span style={{color: 'var(--text-muted)', fontSize: '0.9rem'}}>Escolha a cor que combine com a loja.</span>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>URL do Logotipo (Imagem)</label>
                                    <input 
                                        id="theme_logo"
                                        type="url" 
                                        className="form-input" 
                                        placeholder="Ex: https://i.imgur.com/logo.png"
                                        defaultValue={localStorage.getItem('theme_logo') || ''}
                                    />
                                    <p style={{fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem'}}>Cole o link de uma imagem da logo da Autopeças para substituir o nome AutoCRM. Recarregue a página após salvar.</p>
                                </div>
                                <button type="submit" className="btn-primary">
                                    <Save size={18} />
                                    <span>Salvar Design</span>
                                </button>
                            </form>
                        </div>
                    )}

                    {activeSection === 'whatsapp' && (
                        <div className="settings-section">
                             <div className="section-header">
                                <h2>Status da Conexão</h2>
                                <p>Veja detalhes da integração atual com o WhatsApp.</p>
                            </div>
                            <div className="status-card">
                                <div className="status-row">
                                    <span>Motor de Conexão:</span>
                                    <span className="badge">Baileys (Web Multi-Device)</span>
                                </div>
                                <div className="status-row">
                                    <span>Persistência:</span>
                                    <span className="badge success">Ativa (Sessão Salva)</span>
                                </div>
                                <div className="status-row">
                                    <span>Webhooks:</span>
                                    <span className="badge success">Operacional</span>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>

            <style>{`
                .settings-container {
                    padding: 1rem 0;
                }
                .settings-layout {
                    display: grid;
                    grid-template-columns: 250px 1fr;
                    gap: 2rem;
                    margin-top: 2rem;
                }
                .settings-nav {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                .settings-nav-item {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding: 0.8rem 1.2rem;
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    border-radius: 8px;
                    transition: all 0.2s;
                    text-align: left;
                }
                .settings-nav-item:hover {
                    background: rgba(255,255,255,0.05);
                    color: var(--text-main);
                }
                .settings-nav-item.active {
                    background: rgba(0, 86, 179, 0.05);
                    color: var(--primary-color);
                    font-weight: 600;
                }
                .settings-content {
                    background: var(--panel-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 2rem;
                    max-width: 800px;
                }
                .settings-section h2 {
                    margin-bottom: 0.5rem;
                }
                .section-header p {
                    color: var(--text-muted);
                    font-size: 0.9rem;
                    margin-bottom: 1.5rem;
                }
                .status-banner {
                    display: flex;
                    align-items: center;
                    gap: 0.8rem;
                    padding: 1rem;
                    border-radius: 8px;
                    margin-bottom: 2rem;
                    font-size: 0.9rem;
                }
                .status-banner.success {
                    background: rgba(16, 185, 129, 0.1);
                    color: #10b981;
                    border: 1px solid rgba(16, 185, 129, 0.2);
                }
                .status-banner.error {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                    border: 1px solid rgba(239, 68, 68, 0.2);
                }
                .status-banner button {
                    margin-left: auto;
                    background: none;
                    border: none;
                    color: inherit;
                    cursor: pointer;
                    font-weight: bold;
                }
                .status-card {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    background: var(--bg-color);
                    padding: 1.5rem;
                    border-radius: 8px;
                }
                .status-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .badge {
                    font-size: 0.75rem;
                    background: var(--border-color);
                    padding: 0.2rem 0.6rem;
                    border-radius: 4px;
                    color: var(--text-muted);
                }
                .badge.success {
                    background: rgba(16, 185, 129, 0.1);
                    color: #10b981;
                }
                
                @media (max-width: 768px) {
                    .settings-layout {
                        grid-template-columns: 1fr;
                        margin-top: 1rem;
                        gap: 1rem;
                    }
                    .settings-nav {
                        flex-direction: row;
                        overflow-x: auto;
                        padding-bottom: 0.5rem;
                        white-space: nowrap;
                    }
                    .settings-nav-item {
                        padding: 0.6rem 1rem;
                    }
                    .settings-content {
                        padding: 1.5rem;
                    }
                    form .form-group {
                        margin-bottom: 1rem;
                    }
                    .settings-section .section-header {
                        margin-bottom: 1rem;
                    }
                    .password-grid {
                        grid-template-columns: 1fr !important;
                    }
                }
            `}</style>
        </div>
    );
};
