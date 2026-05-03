import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
  Users,
  MessageSquare,
  Briefcase,
  Settings,
  LogOut,
  Search,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { Clients } from '../components/Clients';
import { WhatsAppConnect } from '../components/WhatsAppConnect';
import { ChatArea } from '../components/ChatArea';
import { Suppliers } from '../components/Suppliers';
import { Settings as SettingsComponent } from '../components/Settings';
import { Quotes } from '../components/Quotes';
import { socket } from '../services/socket';

const navItems = [
  { id: 'clientes', label: 'Clientes', icon: Users, caption: 'CRM e funil' },
  { id: 'atendimento', label: 'WhatsApp', icon: MessageSquare, caption: 'Conversas em tempo real' },
  { id: 'cotacoes', label: 'Orçamento Geral', icon: Search, caption: 'Códigos e confrontos' },
  { id: 'fornecedores', label: 'Fornecedores', icon: Briefcase, caption: 'Integrações e logins', adminOnly: true },
  { id: 'config', label: 'Configurações', icon: Settings, caption: 'Preferências do sistema' },
];

export const Dashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('clientes');
  const [wsStatus, setWsStatus] = useState<string>('connecting');
  const [themeLogo, setThemeLogo] = useState(() => localStorage.getItem('theme_logo') || '');

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
        const response = await axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/config`);
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

    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/whatsapp/status`, {
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

  const visibleNavItems = navItems.filter((item) => !item.adminOnly || user?.role === 'ADMIN');
  const activeItem = visibleNavItems.find((item) => item.id === activeTab) || visibleNavItems[0];

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
                  <span className="brand-kicker">Autopeças</span>
                  <h2>AutoCRM</h2>
                </div>
              )}
            </div>
            <div className="sidebar-summary">
              <span className="sidebar-chip">
                <Sparkles size={14} /> Operação ativa
              </span>
              <p>Fluxo centralizado de atendimento, cotações e fornecedores.</p>
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
                  onClick={() => setActiveTab(item.id)}
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
              <span className="user-badge-label">Sessão atual</span>
              <span className="user-badge-name">{user?.name} ({user?.role})</span>
            </div>
            <button className="logout-btn" onClick={logout} title="Sair">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <section className="page-content">
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
                <p>Converse, troque de cliente no celular com mais facilidade e mantenha o time rápido no balcão.</p>
              </div>
              {wsStatus === 'connected' ? <ChatArea /> : <WhatsAppConnect />}
            </div>
          )}
          {activeTab === 'fornecedores' && <Suppliers />}
          {activeTab === 'cotacoes' && <Quotes />}
          {activeTab === 'config' && <SettingsComponent />}
        </section>
      </main>
    </div>
  );
};
