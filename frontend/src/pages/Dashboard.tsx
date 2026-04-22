import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Users, MessageSquare, Briefcase, Settings, LogOut, Search } from 'lucide-react';
import { Clients } from '../components/Clients';
import { WhatsAppConnect } from '../components/WhatsAppConnect';
import { ChatArea } from '../components/ChatArea';
import { Suppliers } from '../components/Suppliers';
import { Settings as SettingsComponent } from '../components/Settings';
import { Quotes } from '../components/Quotes';
import { socket } from '../services/socket';



export const Dashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('clientes');
  const [wsStatus, setWsStatus] = useState<string>('connecting');

  useEffect(() => {
    socket.on('whatsapp_status', (data: any) => {
      setWsStatus(data.status);
    });
    
    // Buscar status inicial
    fetch('http://localhost:5000/api/whatsapp/status', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
    .then(r => r.json())
    .then(data => {
        console.log('WhatsApp Initial Status:', data.status);
        setWsStatus(data.status);
    });

    return () => {
      socket.off('whatsapp_status');
    };
  }, []);

  return (
    <div className="layout-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          {localStorage.getItem('theme_logo') ? (
            <img src={localStorage.getItem('theme_logo')!} alt="Logo" className="logo-image" />
          ) : (
            <h2>Auto<span>CRM</span></h2>
          )}
        </div>
        <nav className="sidebar-nav">
          <button 
            onClick={() => setActiveTab('clientes')} 
            className={`nav-item ${activeTab === 'clientes' ? 'active' : ''}`}
            style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }}
          >
            <Users size={20} />
            <span>Clientes</span>
          </button>
          <button 
            onClick={() => setActiveTab('atendimento')} 
            className={`nav-item ${activeTab === 'atendimento' ? 'active' : ''}`}
            style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }}
          >
            <MessageSquare size={20} />
            <span>Atendimento (WhatsApp)</span>
          </button>
          <button 
            onClick={() => setActiveTab('cotacoes')} 
            className={`nav-item ${activeTab === 'cotacoes' ? 'active' : ''}`}
            style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }}
          >
            <Search size={20} />
            <span>Orçamento Geral</span>
          </button>
          {user?.role === 'ADMIN' && (
            <button 
              onClick={() => setActiveTab('fornecedores')} 
              className={`nav-item ${activeTab === 'fornecedores' ? 'active' : ''}`}
              style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }}
            >
              <Briefcase size={20} />
              <span>Fornecedores</span>
            </button>
          )}
          <button 
            onClick={() => setActiveTab('config')} 
            className={`nav-item ${activeTab === 'config' ? 'active' : ''}`}
            style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }}
          >
            <Settings size={20} />
            <span>Configurações</span>
          </button>
        </nav>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="user-profile">
            <span>Olá, {user?.name} ({user?.role})</span>
            <button className="logout-btn" onClick={logout} title="Sair">
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <section className="page-content">
          {activeTab === 'clientes' && <Clients />}
          {activeTab === 'atendimento' && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <h1 className="page-title">Atendimento WhatsApp</h1>
              {wsStatus === 'connected' ? <ChatArea /> : <WhatsAppConnect />}
            </div>
          )}
          {activeTab === 'fornecedores' && (
            <Suppliers />
          )}
          {activeTab === 'cotacoes' && (
            <Quotes />
          )}
          {activeTab === 'config' && (
            <SettingsComponent />
          )}

        </section>
      </main>
    </div>
  );
};
