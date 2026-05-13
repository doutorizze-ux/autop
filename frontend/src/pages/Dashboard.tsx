import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Briefcase,
  Settings,
  LogOut,
  Search,
  FileSearch,
  History,
  ChevronRight,
  Sparkles,
  Rocket,
} from 'lucide-react';
import { Clients } from '../components/Clients';
import { WhatsAppConnect } from '../components/WhatsAppConnect';
import { ChatArea } from '../components/ChatArea';
import { Suppliers } from '../components/Suppliers';
import { Settings as SettingsComponent } from '../components/Settings';
import { Quotes } from '../components/Quotes';
import { QuoteHistory } from '../components/QuoteHistory';
import { Roadmap } from '../components/Roadmap';
import { CatalogSearch } from '../components/CatalogSearch';
import { API_URL } from '../services/api';
import { socket } from '../services/socket';

const suppliersAccessPassword = '080782';
const suppliersAccessStorageKey = 'suppliers_access_granted';
const getQuotePrefillStorageKey = (userId?: string) => `quote_prefill_item:${userId || 'sem-usuario'}`;

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, caption: 'Menus principais' },
  { id: 'clientes', label: 'Clientes', icon: Users, caption: 'CRM e funil' },
  { id: 'atendimento', label: 'WhatsApp', icon: MessageSquare, caption: 'Conversas em tempo real' },
  { id: 'cotacoes', label: 'Orcamento Geral', icon: Search, caption: 'Codigos e confrontos' },
  { id: 'historico', label: 'Produtos Pesquisados', icon: History, caption: 'Historico de cotacoes' },
  { id: 'catalogo', label: 'Buscar Codigo', icon: FileSearch, caption: 'Catalogo por descricao' },
  { id: 'fornecedores', label: 'Fornecedores', icon: Briefcase, caption: 'Integracoes e logins', adminOnly: true },
  { id: 'roadmap', label: 'Versao e Roadmap', icon: Rocket, caption: 'Evolucao do produto' },
  { id: 'config', label: 'Configuracoes', icon: Settings, caption: 'Preferencias do sistema' },
];

export const Dashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [wsStatus, setWsStatus] = useState<string>('connecting');
  const [themeLogo, setThemeLogo] = useState(() => localStorage.getItem('theme_logo') || '');
  const [showSuppliersPasswordModal, setShowSuppliersPasswordModal] = useState(false);
  const [suppliersPassword, setSuppliersPassword] = useState('');
  const [suppliersPasswordError, setSuppliersPasswordError] = useState('');
  const [suppliersUnlocked, setSuppliersUnlocked] = useState(
    () => sessionStorage.getItem(suppliersAccessStorageKey) === 'true'
  );
  const [quoteToOpen, setQuoteToOpen] = useState('');

  useEffect(() => {
    const applyTheme = (themeColor?: string, logo?: string) => {
      const color = themeColor || localStorage.getItem('theme_color') || '#0056b3';
      const savedLogo = logo ?? localStorage.getItem('theme_logo') ?? '';
      document.documentElement.style.setProperty('--primary-color', color);
      setThemeLogo(savedLogo);
      localStorage.setItem('theme_color', color);

      if (savedLogo) {
        localStorage.setItem('theme_logo', savedLogo);
      } else {
        localStorage.removeItem('theme_logo');
      }
    };

    const fetchTheme = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/config`);
        applyTheme(response.data.themeColor, response.data.themeLogo || '');
      } catch {
        applyTheme();
      }
    };

    const refreshTheme = (event?: Event) => {
      const detail = (event as CustomEvent<{ themeColor?: string; themeLogo?: string }>)?.detail;
      applyTheme(detail?.themeColor, detail?.themeLogo);
    };

    void fetchTheme();

    window.addEventListener('theme-updated', refreshTheme);
    window.addEventListener('storage', refreshTheme);

    return () => {
      window.removeEventListener('theme-updated', refreshTheme);
      window.removeEventListener('storage', refreshTheme);
    };
  }, []);

  useEffect(() => {
    socket.on('whatsapp_status', (data: any) => {
      setWsStatus(data.status);
    });

    fetch(`${API_URL}/api/whatsapp/status`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setWsStatus(data.status);
      });

    return () => {
      socket.off('whatsapp_status');
    };
  }, []);

  const handleChangeTab = (tabId: string) => {
    if (tabId === 'fornecedores' && !suppliersUnlocked) {
      setSuppliersPassword('');
      setSuppliersPasswordError('');
      setShowSuppliersPasswordModal(true);
      return;
    }

    setActiveTab(tabId);
  };

  const handleUnlockSuppliers = (event: React.FormEvent) => {
    event.preventDefault();

    if (suppliersPassword !== suppliersAccessPassword) {
      setSuppliersPasswordError('Senha incorreta. Tente novamente.');
      return;
    }

    sessionStorage.setItem(suppliersAccessStorageKey, 'true');
    setSuppliersUnlocked(true);
    setSuppliersPassword('');
    setSuppliersPasswordError('');
    setShowSuppliersPasswordModal(false);
    setActiveTab('fornecedores');
  };

  const visibleNavItems = navItems.filter((item) => !item.adminOnly || user?.role === 'ADMIN');
  const activeItem = visibleNavItems.find((item) => item.id === activeTab) || visibleNavItems[0];
  const dashboardMenuItems = visibleNavItems.filter((item) => item.id !== 'dashboard');

  return (
    <div className="layout-container">
      <aside className="sidebar">
        <div className="sidebar-shell">
          <div className="sidebar-header">
            <div className="brand-mark">
              {themeLogo ? (
                <img src={themeLogo} alt="Logo" className="logo-image" />
              ) : (
                <div className="brand-fallback">
                  <span className="brand-kicker">Autopecas</span>
                  <h2>AutoCRM</h2>
                </div>
              )}
            </div>
            <div className="sidebar-summary">
              <span className="sidebar-chip">
                <Sparkles size={14} /> Operacao ativa
              </span>
              <p>Fluxo centralizado de atendimento, cotacoes e fornecedores.</p>
            </div>
          </div>

          <nav className="sidebar-nav">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleChangeTab(item.id)}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                >
                  <span className="nav-icon-wrap">
                    <Icon size={18} />
                  </span>
                  <span className="nav-copy">
                    <strong>{item.label}</strong>
                    <small>{item.caption}</small>
                  </span>
                  <ChevronRight size={16} className="nav-chevron" />
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-context">
            <span className="topbar-label">Painel operacional</span>
            <h1>{activeItem?.label || 'Dashboard'}</h1>
          </div>

          <div className="user-profile">
            <div className="user-badge">
              <span className="user-badge-label">Sessao atual</span>
              <span className="user-badge-name">{user?.name} ({user?.role})</span>
            </div>
            <button className="logout-btn" onClick={logout} title="Sair">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <section className="page-content">
          {activeTab === 'dashboard' && (
            <div className="dashboard-home">
              <div className="dashboard-home-header">
                <div>
                  <h2 className="page-title">Dashboard</h2>
                  <p>Escolha o modulo para continuar a operacao.</p>
                </div>
                <span className={`dashboard-status ${wsStatus === 'connected' ? 'connected' : ''}`}>
                  WhatsApp {wsStatus === 'connected' ? 'conectado' : 'aguardando conexao'}
                </span>
              </div>

              <div className="dashboard-menu-grid">
                {dashboardMenuItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="dashboard-menu-card"
                      onClick={() => handleChangeTab(item.id)}
                    >
                      <span className="dashboard-menu-icon">
                        <Icon size={22} />
                      </span>
                      <span className="dashboard-menu-copy">
                        <strong>{item.label}</strong>
                        <small>{item.caption}</small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'clientes' && (
            <Clients
              onOpenAttendance={(clientId) => {
                localStorage.setItem('selected_attendance_client_id', clientId);
                setActiveTab('atendimento');
              }}
            />
          )}

          {activeTab === 'atendimento' && (
            <div className="dashboard-section">
              <div className="section-heading">
                <h2 className="page-title">Atendimento WhatsApp</h2>
                <p>Converse, troque de cliente no celular com mais facilidade e mantenha o time rapido no balcao.</p>
              </div>
              {wsStatus === 'connected' ? <ChatArea /> : <WhatsAppConnect />}
            </div>
          )}

          {activeTab === 'fornecedores' && <Suppliers />}
          {activeTab === 'cotacoes' && <Quotes openHistoryId={quoteToOpen} />}
          {activeTab === 'historico' && (
            <QuoteHistory
              onOpenQuote={(quoteId) => {
                setQuoteToOpen(quoteId);
                setActiveTab('cotacoes');
              }}
            />
          )}
          {activeTab === 'catalogo' && (
            <CatalogSearch
              onUseCode={(payload) => {
                localStorage.setItem(getQuotePrefillStorageKey(user?.id), JSON.stringify(payload));
                window.dispatchEvent(new Event('quote-prefill-ready'));
                setActiveTab('cotacoes');
              }}
            />
          )}
          {activeTab === 'roadmap' && <Roadmap />}
          {activeTab === 'config' && <SettingsComponent />}
        </section>

        {showSuppliersPasswordModal && (
          <div className="modal-overlay">
            <div className="modal-content auth-card" style={{ maxWidth: '420px', width: '100%' }}>
              <h2 style={{ marginBottom: '0.75rem' }}>Acesso protegido</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
                Digite a senha para abrir a area de fornecedores.
              </p>

              <form onSubmit={handleUnlockSuppliers}>
                <div className="form-group">
                  <label>Senha de acesso</label>
                  <input
                    type="password"
                    className="form-input"
                    value={suppliersPassword}
                    onChange={(event) => {
                      setSuppliersPassword(event.target.value);
                      if (suppliersPasswordError) setSuppliersPasswordError('');
                    }}
                    autoFocus
                  />
                </div>

                {suppliersPasswordError && (
                  <div style={{ color: '#dc2626', marginBottom: '1rem', fontSize: '0.92rem' }}>
                    {suppliersPasswordError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button type="submit" className="btn-primary">
                    Entrar
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setShowSuppliersPasswordModal(false);
                      setSuppliersPassword('');
                      setSuppliersPasswordError('');
                    }}
                    style={{
                      flex: 1,
                      padding: '0.85rem',
                      background: 'var(--bg-color)',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
