import { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Search, Phone, History, ChevronRight, Trash2 } from 'lucide-react';

interface Client {
  id: string;
  name: string;
  phone: string;
  whatsappJid?: string | null;
  status: string;
  updatedAt: string;
}

type ClientsProps = {
  onOpenAttendance?: (clientId: string) => void;
};

export const Clients = ({ onOpenAttendance }: ClientsProps) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [, setError] = useState('');

  const formatClientPhone = (client: Client) => {
    const raw = String(client.phone || '');
    const digits = raw.replace(/\D/g, '');
    const isTechnicalLid = raw.endsWith('@lid') || (digits.length >= 14 && !digits.startsWith('55'));
    if (isTechnicalLid) return 'Telefone aguardando sincronização';
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
      return digits.slice(2);
    }
    return raw;
  };

  const fetchClients = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/clients`);
      setClients(response.data);
    } catch (err) {
      setError('Erro ao buscar clientes');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/clients`, {
        name: newName,
        phone: newPhone
      });
      setNewName('');
      setNewPhone('');
      setShowAddModal(false);
      fetchClients();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao criar cliente');
    }
  };

  const handleDeleteClient = async (client: Client) => {
    const confirmed = window.confirm(`Excluir o lead ${client.name}?`);
    if (!confirmed) return;

    try {
      await axios.delete(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/clients/${client.id}`);
      setClients(current => current.filter(item => item.id !== client.id));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao excluir lead');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'NOVO': return '#3b82f6';
      case 'EM_ATENDIMENTO': return '#f59e0b';
      case 'FINALIZADO': return '#10b981';
      default: return 'var(--text-muted)';
    }
  };

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    formatClientPhone(c).includes(searchTerm)
  );

  return (
    <div className="clients-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 className="page-title">Clientes (CRM)</h1>
        <button className="btn-primary" onClick={() => setShowAddModal(true)} style={{ width: 'auto', padding: '0.6rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={18} />
          <span>Novo Cliente</span>
        </button>
      </div>

      <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
        <Search style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
        <input 
          type="text" 
          placeholder="Buscar por nome ou telefone..." 
          className="form-input" 
          style={{ paddingLeft: '3rem' }}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div>Carregando clientes...</div>
      ) : (
        <div className="client-grid">
          {filteredClients.map(client => (
            <div key={client.id} className="client-card">
              <div className="client-header">
                <h3>{client.name}</h3>
                <span className="status-badge" style={{ backgroundColor: `${getStatusColor(client.status)}20`, color: getStatusColor(client.status), padding: '0.25rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                  {client.status}
                </span>
              </div>
              <div className="client-info">
                <p><Phone size={14} /> {formatClientPhone(client)}</p>
                <p><History size={14} /> Atualizado em: {new Date(client.updatedAt).toLocaleDateString()}</p>
              </div>
              <div className="client-actions">
                <button
                  className="btn-secondary"
                  onClick={() => onOpenAttendance?.(client.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, justifyContent: 'center', padding: '0.5rem', background: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px', cursor: 'pointer' }}
                >
                  <span>Ver Atendimento</span>
                  <ChevronRight size={16} />
                </button>
                <button
                  className="delete-client-btn"
                  onClick={() => void handleDeleteClient(client)}
                  title="Excluir lead"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content auth-card">
            <h2 style={{ marginBottom: '1.5rem' }}>Cadastrar Cliente</h2>
            <form onSubmit={handleCreateClient}>
              <div className="form-group">
                <label>Nome Completo</label>
                <input type="text" className="form-input" value={newName} onChange={e => setNewName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Telefone (WhatsApp)</label>
                <input type="text" className="form-input" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Ex: 5511999999999" required />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button type="submit" className="btn-primary">Salvar</button>
                <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)} style={{ flex: 1, padding: '0.85rem', background: 'var(--bg-color)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .client-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1.5rem;
        }
        .client-card {
          background-color: var(--panel-bg);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 1.5rem;
          transition: transform 0.2s ease;
        }
        .client-card:hover {
          transform: translateY(-5px);
          border-color: var(--primary-color);
        }
        .client-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1rem;
        }
        .client-info p {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--text-muted);
          font-size: 0.9rem;
          margin-bottom: 0.5rem;
        }
        .client-actions {
          margin-top: 1.5rem;
          display: flex;
          gap: 0.6rem;
        }
        .delete-client-btn {
          width: 38px;
          border: 1px solid rgba(239, 68, 68, 0.25);
          border-radius: 4px;
          background: rgba(239, 68, 68, 0.08);
          color: #dc2626;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal-content {
          width: 90%;
          max-width: 450px;
        }
      `}</style>
    </div>
  );
};
