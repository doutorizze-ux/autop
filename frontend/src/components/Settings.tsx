import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Save, User, Key, Shield, MessageSquare, AlertCircle, CheckCircle, Users, Plus, Trash2, Bot } from 'lucide-react';
import { API_URL } from '../services/api';

type EmployeeUser = {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: string;
};

type BotConfig = {
    enabled: boolean;
    trainingText: string;
    menuText: string;
    handoffKeywords: string;
    handoffMessage: string;
    fallbackText: string;
};

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
        whatsappMode: 'baileys',
        themeColor: '#0056b3',
        themeLogo: ''
    });
    const [botConfig, setBotConfig] = useState<BotConfig>({
        enabled: false,
        trainingText: '',
        menuText: '',
        handoffKeywords: '',
        handoffMessage: '',
        fallbackText: '',
    });
    const [appearanceData, setAppearanceData] = useState({
        color: localStorage.getItem('theme_color') || '#0056b3',
        logo: localStorage.getItem('theme_logo') || ''
    });
    const [employees, setEmployees] = useState<EmployeeUser[]>([]);
    const [employeeForm, setEmployeeForm] = useState({
        id: '',
        name: '',
        email: '',
        password: '',
        role: 'FUNCIONARIO',
    });

    useEffect(() => {
        fetchBotConfig();
        if (user?.role === 'ADMIN') {
            fetchSystemConfig();
            fetchEmployees();
        }
    }, [user]);

    useEffect(() => {
        setProfileData(prev => ({
            ...prev,
            name: user?.name || '',
            email: user?.email || '',
        }));
    }, [user?.name, user?.email]);

    const fetchSystemConfig = async () => {
        try {
            const response = await axios.get(`${API_URL}/api/config`);
            setSystemConfig(response.data);
            const themeColor = response.data.themeColor || localStorage.getItem('theme_color') || '#0056b3';
            const themeLogo = response.data.themeLogo || localStorage.getItem('theme_logo') || '';
            setAppearanceData({ color: themeColor, logo: themeLogo });
            document.documentElement.style.setProperty('--primary-color', themeColor);
            window.dispatchEvent(new CustomEvent('theme-updated', {
                detail: { themeColor, themeLogo }
            }));
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
            await axios.post(`${API_URL}/api/config/profile`, profileData);
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
            await axios.post(`${API_URL}/api/config`, systemConfig);
            setMessage({ type: 'success', text: 'Configurações globais salvas!' });
        } catch (err) {
            setMessage({ type: 'error', text: 'Erro ao salvar configurações' });
        } finally {
            setLoading(false);
        }
    };

    const fetchBotConfig = async () => {
        try {
            const response = await axios.get(`${API_URL}/api/bot/config`);
            setBotConfig(response.data);
        } catch (err) {
            console.error('Erro ao buscar configuracao do bot');
        }
    };

    const handleBotConfigSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await axios.put(`${API_URL}/api/bot/config`, botConfig);
            setBotConfig(response.data);
            setMessage({ type: 'success', text: 'Bot WhatsApp salvo para este usuario!' });
        } catch (err: any) {
            setMessage({ type: 'error', text: err.response?.data?.message || 'Erro ao salvar bot WhatsApp' });
        } finally {
            setLoading(false);
        }
    };

    const fetchEmployees = async () => {
        try {
            const response = await axios.get<EmployeeUser[]>(`${API_URL}/api/auth/users`);
            setEmployees(response.data);
        } catch (err) {
            console.error('Erro ao buscar funcionarios');
        }
    };

    const resetEmployeeForm = () => {
        setEmployeeForm({
            id: '',
            name: '',
            email: '',
            password: '',
            role: 'FUNCIONARIO',
        });
    };

    const handleEmployeeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (employeeForm.id) {
                await axios.put(`${API_URL}/api/auth/users/${employeeForm.id}`, employeeForm);
                setMessage({ type: 'success', text: 'Funcionario atualizado com sucesso!' });
            } else {
                await axios.post(`${API_URL}/api/auth/users`, employeeForm);
                setMessage({ type: 'success', text: 'Funcionario criado com sucesso!' });
            }

            resetEmployeeForm();
            await fetchEmployees();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.response?.data?.message || 'Erro ao salvar funcionario' });
        } finally {
            setLoading(false);
        }
    };

    const handleEditEmployee = (employee: EmployeeUser) => {
        setEmployeeForm({
            id: employee.id,
            name: employee.name,
            email: employee.email,
            password: '',
            role: employee.role,
        });
    };

    const handleDeleteEmployee = async (employee: EmployeeUser) => {
        const confirmed = window.confirm(`Excluir o acesso de ${employee.name}?`);
        if (!confirmed) return;

        try {
            await axios.delete(`${API_URL}/api/auth/users/${employee.id}`);
            setMessage({ type: 'success', text: 'Funcionario removido.' });
            await fetchEmployees();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.response?.data?.message || 'Erro ao excluir funcionario' });
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
                            className={`settings-nav-item ${activeSection === 'funcionarios' ? 'active' : ''}`}
                            onClick={() => setActiveSection('funcionarios')}
                        >
                            <Users size={18} />
                            <span>Funcionarios</span>
                        </button>
                    )}
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
                        className={`settings-nav-item ${activeSection === 'bot' ? 'active' : ''}`}
                        onClick={() => setActiveSection('bot')}
                    >
                        <Bot size={18} />
                        <span>Bot WhatsApp</span>
                    </button>
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
                                <p>Gerencie seu nome, e-mail e troque sua senha de acesso ao sistema.</p>
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

                    {activeSection === 'funcionarios' && user?.role === 'ADMIN' && (
                        <div className="settings-section">
                            <div className="section-header">
                                <h2>Acessos dos Funcionarios</h2>
                                <p>Crie logins individuais para atendimento WhatsApp, pesquisas e cotações.</p>
                            </div>

                            <form onSubmit={handleEmployeeSubmit} className="employee-form">
                                <div className="employee-form-grid">
                                    <div className="form-group">
                                        <label>Nome</label>
                                        <input
                                            className="form-input"
                                            value={employeeForm.name}
                                            onChange={e => setEmployeeForm({ ...employeeForm, name: e.target.value })}
                                            placeholder="Nome do funcionario"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>E-mail de acesso</label>
                                        <input
                                            type="email"
                                            className="form-input"
                                            value={employeeForm.email}
                                            onChange={e => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                                            placeholder="funcionario@loja.com"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>{employeeForm.id ? 'Nova senha (opcional)' : 'Senha'}</label>
                                        <input
                                            type="password"
                                            className="form-input"
                                            value={employeeForm.password}
                                            onChange={e => setEmployeeForm({ ...employeeForm, password: e.target.value })}
                                            placeholder={employeeForm.id ? 'Deixe em branco para manter' : 'Minimo 6 caracteres'}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Permissao</label>
                                        <select
                                            className="form-input"
                                            value={employeeForm.role}
                                            onChange={e => setEmployeeForm({ ...employeeForm, role: e.target.value })}
                                        >
                                            <option value="FUNCIONARIO">Funcionario</option>
                                            <option value="ADMIN">Administrador</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="employee-form-actions">
                                    <button type="submit" className="btn-primary" disabled={loading}>
                                        {employeeForm.id ? <Save size={18} /> : <Plus size={18} />}
                                        <span>{employeeForm.id ? 'Salvar funcionario' : 'Criar funcionario'}</span>
                                    </button>
                                    {employeeForm.id && (
                                        <button type="button" className="btn-secondary" onClick={resetEmployeeForm}>
                                            Cancelar edicao
                                        </button>
                                    )}
                                </div>
                            </form>

                            <div className="employee-list">
                                {employees.map((employee) => (
                                    <div className="employee-card" key={employee.id}>
                                        <div className="employee-main">
                                            <strong>{employee.name}</strong>
                                            <span>{employee.email}</span>
                                        </div>
                                        <span className={`employee-role ${employee.role === 'ADMIN' ? 'admin' : ''}`}>
                                            {employee.role === 'ADMIN' ? 'Admin' : 'Funcionario'}
                                        </span>
                                        <div className="employee-actions">
                                            <button type="button" onClick={() => handleEditEmployee(employee)}>
                                                Editar
                                            </button>
                                            <button
                                                type="button"
                                                className="danger"
                                                onClick={() => void handleDeleteEmployee(employee)}
                                                disabled={employee.id === user.id}
                                            >
                                                <Trash2 size={15} /> Excluir
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
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

                    {activeSection === 'bot' && (
                        <div className="settings-section">
                            <div className="section-header">
                                <h2>Bot WhatsApp deste usuario</h2>
                                <p>Treine e ligue a resposta automatica apenas para o WhatsApp desta conta. Quando o cliente pedir atendente, o bot para e toca alerta.</p>
                            </div>

                            <form onSubmit={handleBotConfigSubmit} className="bot-config-form">
                                <label className="bot-toggle-row">
                                    <input
                                        type="checkbox"
                                        checked={botConfig.enabled}
                                        onChange={e => setBotConfig({ ...botConfig, enabled: e.target.checked })}
                                    />
                                    <span>
                                        <strong>Responder automaticamente quando este WhatsApp receber mensagem</strong>
                                        <small>Desligado por padrao. O funcionario pode ligar/desligar quando quiser.</small>
                                    </span>
                                </label>

                                <div className="form-group">
                                    <label>Treinamento da loja para esta IA</label>
                                    <textarea
                                        className="form-input bot-textarea"
                                        value={botConfig.trainingText}
                                        onChange={e => setBotConfig({ ...botConfig, trainingText: e.target.value })}
                                        placeholder="Ex: nome da loja, horario, endereco, formas de pagamento, politica de garantia, tom de voz, regras de desconto, quando pedir dados do veiculo..."
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Menu automatico</label>
                                    <textarea
                                        className="form-input bot-textarea small"
                                        value={botConfig.menuText}
                                        onChange={e => setBotConfig({ ...botConfig, menuText: e.target.value })}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Palavras que chamam atendente</label>
                                    <input
                                        className="form-input"
                                        value={botConfig.handoffKeywords}
                                        onChange={e => setBotConfig({ ...botConfig, handoffKeywords: e.target.value })}
                                        placeholder="atendente,humano,pessoa,falar com atendente,3"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Mensagem quando chamar atendente</label>
                                    <input
                                        className="form-input"
                                        value={botConfig.handoffMessage}
                                        onChange={e => setBotConfig({ ...botConfig, handoffMessage: e.target.value })}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Resposta de seguranca se a IA falhar</label>
                                    <input
                                        className="form-input"
                                        value={botConfig.fallbackText}
                                        onChange={e => setBotConfig({ ...botConfig, fallbackText: e.target.value })}
                                    />
                                </div>

                                <button type="submit" className="btn-primary" disabled={loading}>
                                    <Save size={18} />
                                    <span>{loading ? 'Salvando...' : 'Salvar Bot WhatsApp'}</span>
                                </button>
                            </form>
                        </div>
                    )}

                    {activeSection === 'aparencia' && (
                        <div className="settings-section">
                            <div className="section-header">
                                <h2>Personalização Visual</h2>
                                <p>Altere o logotipo e a cor principal do sistema para ficar com a cara da autopeças.</p>
                            </div>
                            <form onSubmit={(e) => {
                                e.preventDefault();
                                setLoading(true);
                                const color = appearanceData.color || '#0056b3';
                                const logo = appearanceData.logo.trim();
                                axios.post(`${API_URL}/api/config`, {
                                    ...systemConfig,
                                    themeColor: color,
                                    themeLogo: logo || null,
                                }).then((response) => {
                                    const themeColor = response.data.themeColor || color;
                                    const themeLogo = response.data.themeLogo || '';
                                    setSystemConfig(response.data);
                                    setAppearanceData({ color: themeColor, logo: themeLogo });
                                    localStorage.setItem('theme_color', themeColor);
                                    if (themeLogo) {
                                        localStorage.setItem('theme_logo', themeLogo);
                                    } else {
                                        localStorage.removeItem('theme_logo');
                                    }
                                    document.documentElement.style.setProperty('--primary-color', themeColor);
                                    window.dispatchEvent(new CustomEvent('theme-updated', {
                                        detail: { themeColor, themeLogo }
                                    }));
                                    setMessage({ type: 'success', text: 'Tema atualizado para todos os acessos!' });
                                }).catch(() => {
                                    setMessage({ type: 'error', text: 'Erro ao salvar aparência da loja' });
                                }).finally(() => {
                                    setLoading(false);
                                });
                            }}>
                                <div className="form-group">
                                    <label>Cor Principal do Sistema</label>
                                    <div className="appearance-control-row">
                                        <input 
                                            type="color" 
                                            value={appearanceData.color}
                                            onChange={e => {
                                                const color = e.target.value;
                                                setAppearanceData(prev => ({ ...prev, color }));
                                                document.documentElement.style.setProperty('--primary-color', color);
                                            }}
                                            style={{ height: '45px', width: '80px', padding: '0', cursor: 'pointer', border: '1px solid var(--border-color)', borderRadius: '6px' }}
                                        />
                                        <span style={{color: 'var(--text-muted)', fontSize: '0.9rem'}}>Escolha a cor que combine com a loja.</span>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>URL do Logotipo (Imagem)</label>
                                    <input 
                                        type="url" 
                                        className="form-input" 
                                        placeholder="Ex: https://i.imgur.com/logo.png"
                                        value={appearanceData.logo}
                                        onChange={e => setAppearanceData(prev => ({ ...prev, logo: e.target.value }))}
                                    />
                                    <p style={{fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem'}}>Cole o link de uma imagem da logo da loja para personalizar o sistema.</p>
                                    {appearanceData.logo.trim() && (
                                        <div className="logo-preview">
                                            <img src={appearanceData.logo.trim()} alt="Prévia da logo" />
                                        </div>
                                    )}
                                </div>
                                <button type="submit" className="btn-primary" disabled={loading}>
                                    <Save size={18} />
                                    <span>{loading ? 'Salvando...' : 'Salvar Design'}</span>
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
                .appearance-control-row {
                    display: flex;
                    gap: 1rem;
                    align-items: center;
                    flex-wrap: wrap;
                }
                .bot-config-form {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                .bot-toggle-row {
                    display: flex;
                    align-items: flex-start;
                    gap: 0.85rem;
                    padding: 1rem;
                    background: var(--bg-color);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    cursor: pointer;
                }
                .bot-toggle-row input {
                    width: 18px;
                    height: 18px;
                    margin-top: 0.2rem;
                    flex: 0 0 auto;
                }
                .bot-toggle-row span {
                    display: flex;
                    flex-direction: column;
                    gap: 0.25rem;
                }
                .bot-toggle-row small {
                    color: var(--text-muted);
                    line-height: 1.4;
                }
                .bot-textarea {
                    min-height: 150px;
                    resize: vertical;
                    line-height: 1.45;
                }
                .bot-textarea.small {
                    min-height: 110px;
                }
                .logo-preview {
                    margin-top: 0.75rem;
                    width: 100%;
                    max-width: 260px;
                    height: 110px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--bg-color);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    padding: 0.75rem;
                }
                .logo-preview img {
                    max-width: 100%;
                    max-height: 100%;
                    object-fit: contain;
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
                .employee-form {
                    background: var(--bg-color);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    padding: 1rem;
                    margin-bottom: 1.25rem;
                }
                .employee-form-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 1rem;
                }
                .employee-form-actions {
                    display: flex;
                    gap: 0.75rem;
                    align-items: center;
                    margin-top: 1rem;
                    flex-wrap: wrap;
                }
                .btn-secondary {
                    border: 1px solid var(--border-color);
                    background: var(--panel-bg);
                    color: var(--text-main);
                    border-radius: 8px;
                    padding: 0.75rem 1rem;
                    cursor: pointer;
                    font-weight: 700;
                }
                .employee-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }
                .employee-card {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) auto auto;
                    gap: 1rem;
                    align-items: center;
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    padding: 0.9rem 1rem;
                    background: var(--panel-bg);
                }
                .employee-main {
                    display: flex;
                    flex-direction: column;
                    gap: 0.2rem;
                    min-width: 0;
                }
                .employee-main span {
                    color: var(--text-muted);
                    font-size: 0.85rem;
                    overflow-wrap: anywhere;
                }
                .employee-role {
                    border-radius: 999px;
                    padding: 0.35rem 0.65rem;
                    font-size: 0.78rem;
                    color: #0369a1;
                    background: #e0f2fe;
                    font-weight: 700;
                }
                .employee-role.admin {
                    color: #7c3aed;
                    background: #ede9fe;
                }
                .employee-actions {
                    display: flex;
                    gap: 0.5rem;
                    flex-wrap: wrap;
                    justify-content: flex-end;
                }
                .employee-actions button {
                    border: 1px solid var(--border-color);
                    background: #fff;
                    color: var(--text-main);
                    border-radius: 8px;
                    padding: 0.55rem 0.75rem;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 0.35rem;
                    font-weight: 700;
                }
                .employee-actions button.danger {
                    color: #ef4444;
                    border-color: #fecaca;
                }
                .employee-actions button:disabled {
                    opacity: 0.45;
                    cursor: not-allowed;
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
                    .employee-form-grid,
                    .employee-card {
                        grid-template-columns: 1fr;
                    }
                    .employee-actions,
                    .employee-actions button,
                    .employee-form-actions .btn-primary,
                    .employee-form-actions .btn-secondary {
                        width: 100%;
                        justify-content: center;
                    }
                }
            `}</style>
        </div>
    );
};
