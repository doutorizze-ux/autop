import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Paperclip, Search, Send, User, MoreVertical } from 'lucide-react';
import { socket } from '../services/socket';

interface Client {
  id: string;
  name: string;
  phone: string;
  whatsappJid?: string | null;
  status: string;
  history?: string | null;
}

interface Message {
  text: string;
  fromMe: boolean;
  timestamp: number;
  system?: boolean;
  media?: {
    type: 'image' | 'video' | 'audio' | 'document' | 'sticker';
    url: string;
    mimetype?: string;
    fileName?: string;
  } | null;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const normalizeContactKey = (value: string) => value.replace(/@(s\.whatsapp\.net|lid)$/, '');
const getClientMessageKeys = (client: Client) => {
  const keys = [client.id, client.whatsappJid, client.phone]
    .filter(Boolean)
    .map(value => normalizeContactKey(String(value)));
  return Array.from(new Set(keys));
};
const parseClientHistory = (client: Client): Message[] => {
  if (!client.history) return [];

  try {
    const parsed = JSON.parse(client.history);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is Message =>
        item &&
        typeof item.text === 'string' &&
        typeof item.fromMe === 'boolean' &&
        typeof item.timestamp === 'number' &&
        !item.system &&
        (!!item.text.trim() || !!item.media) &&
        item.text !== '__PHONE_REQUEST_SENT__'
      );
    }
  } catch (_) {}

  return client.history ? [{ text: client.history, fromMe: false, timestamp: Math.floor(Date.now() / 1000) }] : [];
};
const mergeMessages = (current: Message[] = [], incoming: Message[] = []) => {
  const all = [...current, ...incoming];
  return all
    .filter((message, index, list) =>
      list.findIndex(item =>
        item.timestamp === message.timestamp &&
        item.fromMe === message.fromMe &&
        item.text === message.text &&
        (item.media?.url || '') === (message.media?.url || '')
      ) === index
    )
    .sort((a, b) => a.timestamp - b.timestamp);
};
const isTechnicalLid = (value: string) => {
  const raw = String(value || '');
  const digits = raw.replace(/\D/g, '');
  return raw.endsWith('@lid') || (digits.length >= 14 && !digits.startsWith('55'));
};
const formatClientPhone = (client: Client) => {
  const raw = String(client.phone || '');
  if (isTechnicalLid(raw)) return 'Telefone aguardando sincronização';

  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits.slice(2);
  }
  return raw;
};

const resolveMediaUrl = (url?: string) => {
  if (!url) return '';
  return url.startsWith('http') ? url : `${API_URL}${url}`;
};

const shouldShowMessageText = (message: Message) => {
  if (!message.text?.trim()) return false;
  if (!message.media) return true;
  const mediaLabels = new Set([
    '[Imagem recebida]',
    '[Vídeo recebido]',
    '[Video recebido]',
    '[Áudio recebido]',
    '[Audio recebido]',
    '[Documento recebido]',
    '[Figurinha recebida]',
  ]);
  return !mediaLabels.has(message.text.trim());
};

export const ChatArea = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [inputText, setInputText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const hasAttemptedPhoneSyncRef = useRef(false);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/clients`);
        let currentClients = res.data as Client[];
        setClients(currentClients);
        const hasUnresolvedClients = currentClients.some((client: Client) => formatClientPhone(client).includes('aguardando'));
        if (hasUnresolvedClients && !hasAttemptedPhoneSyncRef.current) {
          hasAttemptedPhoneSyncRef.current = true;
          try {
            await axios.post(`${API_URL}/api/whatsapp/sync-phones`);
            const refreshed = await axios.get(`${API_URL}/api/clients`);
            currentClients = refreshed.data;
            setClients(currentClients);
          } catch (syncError) {
            console.error('Erro ao sincronizar telefones pendentes:', syncError);
          }
        }
        setMessages(prev => {
          const next = { ...prev };
          currentClients.forEach((client: Client) => {
            next[client.id] = mergeMessages(next[client.id], parseClientHistory(client));
          });
          return next;
        });
        const selectedId = localStorage.getItem('selected_attendance_client_id');
        if (selectedId) {
          const client = currentClients.find((item: Client) => item.id === selectedId);
          if (client) {
            setSelectedClient(client);
          }
          localStorage.removeItem('selected_attendance_client_id');
        }
      } catch (err) {
        console.error('Erro ao buscar clientes:', err);
      }
    };

    fetchClients();

    socket.on('incoming_message', (data: any) => {
      const contactKey = normalizeContactKey(data.clientId || data.whatsappJid || data.from);
      setMessages(prev => ({
        ...prev,
        [contactKey]: [
          ...(prev[contactKey] || []),
          { text: data.text, fromMe: false, timestamp: data.timestamp, media: data.media || null }
        ]
      }));
    });

    socket.on('client_upserted', (client: Client) => {
      setClients(prev => {
        const existingIndex = prev.findIndex(item =>
          item.id === client.id ||
          item.phone === client.phone ||
          (!!item.whatsappJid && item.whatsappJid === client.whatsappJid)
        );
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = client;
          return next;
        }
        return [client, ...prev];
      });
      setMessages(prev => ({
        ...prev,
        [client.id]: mergeMessages(prev[client.id], parseClientHistory(client))
      }));
      setSelectedClient(current => {
        if (!current) return current;
        const currentKeys = getClientMessageKeys(current);
        const incomingKeys = getClientMessageKeys(client);
        const sameClient = current.id === client.id || currentKeys.some(key => incomingKeys.includes(key));
        return sameClient ? client : current;
      });
    });

    socket.on('client_deleted', (payload: { id: string }) => {
      setClients(prev => prev.filter(client => client.id !== payload.id));
      setSelectedClient(current => current?.id === payload.id ? null : current);
    });

    socket.on('message_sent', (data: any) => {
      const contactKey = normalizeContactKey(data.clientId || data.to);
      setMessages(prev => ({
        ...prev,
        [contactKey]: [
          ...(prev[contactKey] || []),
          { text: data.text, fromMe: true, timestamp: data.timestamp, media: data.media || null }
        ]
      }));
    });

    return () => {
      socket.off('incoming_message');
      socket.off('message_sent');
      socket.off('client_upserted');
      socket.off('client_deleted');
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedClient]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !inputText.trim()) return;

    const text = inputText.trim();
    setInputText('');

    try {
      await axios.post(`${API_URL}/api/whatsapp/send`, {
        to: selectedClient.whatsappJid || selectedClient.phone,
        text
      });
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Erro ao enviar mensagem');
      setInputText(text);
    }
  };

  const handleFixSelectedPhone = async () => {
    if (!selectedClient) return;

    const phone = window.prompt('Digite o telefone real do cliente com DDD:', '');
    if (!phone) return;

    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 13) {
      alert('Digite um telefone válido com DDD.');
      return;
    }

    try {
      const response = await axios.patch(`${API_URL}/api/clients/${selectedClient.id}`, {
        phone: digits,
      });
      const updatedClient = response.data as Client;
      setClients(prev => prev.map(client => client.id === updatedClient.id ? updatedClient : client));
      setSelectedClient(updatedClient);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao corrigir telefone do lead');
    }
  };

  const filteredClients = clients.filter(client => {
    const term = searchTerm.toLowerCase();
    return client.name.toLowerCase().includes(term) || formatClientPhone(client).includes(searchTerm);
  });

  const selectedMessages = selectedClient
    ? getClientMessageKeys(selectedClient)
        .flatMap(key => messages[key] || [])
        .reduce((acc, message) => mergeMessages(acc, [message]), [] as Message[])
    : [];

  return (
    <div className="chat-layout">
      <aside className="chat-sidebar">
        <div className="sidebar-search">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Buscar contato..."
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="conversations-list">
          {filteredClients.map(client => (
            <button
              key={client.id}
              type="button"
              className={`conversation-item ${selectedClient?.id === client.id ? 'active' : ''}`}
              onClick={() => setSelectedClient(client)}
            >
              <span className="avatar">
                <User size={20} />
              </span>
              <span className="conv-info">
                <span className="conv-header">
                  <span className="conv-name">{client.name}</span>
                  <span className="conv-time">{client.status}</span>
                </span>
                <span className="conv-last-msg">{formatClientPhone(client)}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="chat-main">
        {selectedClient ? (
          <>
            <header className="chat-header">
              <div className="chat-user-info">
                <span className="chat-user-name">{selectedClient.name}</span>
                <span className="chat-user-status">WhatsApp: {formatClientPhone(selectedClient)}</span>
              </div>
              <div className="chat-header-actions">
                {isTechnicalLid(selectedClient.phone) && (
                  <button type="button" className="fix-phone-btn" onClick={handleFixSelectedPhone}>
                    Corrigir telefone
                  </button>
                )}
                <button type="button" className="header-icon-btn" title="Opções">
                  <MoreVertical size={20} />
                </button>
              </div>
            </header>

            <div className="messages-area">
              {selectedMessages.map((message, index) => (
                <div key={`${message.timestamp}-${index}`} className={`message-wrapper ${message.fromMe ? 'sent' : 'received'}`}>
                  <div className="message-bubble">
                    {message.media?.type === 'image' || message.media?.type === 'sticker' ? (
                      <img
                        className="message-image"
                        src={resolveMediaUrl(message.media.url)}
                        alt={message.media.fileName || 'Imagem recebida'}
                      />
                    ) : null}
                    {message.media?.type === 'video' ? (
                      <video className="message-video" controls src={resolveMediaUrl(message.media.url)} />
                    ) : null}
                    {message.media?.type === 'audio' ? (
                      <audio className="message-audio" controls src={resolveMediaUrl(message.media.url)} />
                    ) : null}
                    {message.media?.type === 'document' ? (
                      <a
                        className="message-document"
                        href={resolveMediaUrl(message.media.url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {message.media.fileName || 'Abrir documento'}
                      </a>
                    ) : null}
                    {shouldShowMessageText(message) ? <p>{message.text}</p> : null}
                    <span className="msg-time">
                      {new Date(message.timestamp * 1000).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <form className="chat-input-area" onSubmit={handleSendMessage}>
              <button type="button" className="icon-btn" title="Anexar">
                <Paperclip size={20} />
              </button>
              <input
                type="text"
                placeholder="Digite uma mensagem..."
                value={inputText}
                onChange={event => setInputText(event.target.value)}
              />
              <button type="submit" className="send-btn" disabled={!inputText.trim()} title="Enviar">
                <Send size={20} />
              </button>
            </form>
          </>
        ) : (
          <div className="empty-chat">
            <User size={64} />
            <h3>Selecione um cliente para conversar</h3>
            <p>WhatsApp conectado e pronto para atendimento.</p>
          </div>
        )}
      </section>

      <style>{`
        .chat-layout {
          display: flex;
          height: calc(100dvh - 180px);
          min-height: 460px;
          background-color: var(--panel-bg);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          overflow: hidden;
        }

        .chat-sidebar {
          width: 350px;
          min-width: 280px;
          display: flex;
          flex-direction: column;
          min-height: 0;
          background: var(--sidebar-bg);
          border-right: 1px solid var(--border-color);
        }

        .sidebar-search {
          position: relative;
          padding: 1rem;
          border-bottom: 1px solid var(--border-color);
        }

        .search-icon {
          position: absolute;
          left: 1.65rem;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          pointer-events: none;
        }

        .sidebar-search input {
          width: 100%;
          min-height: 42px;
          padding: 0.65rem 0.75rem 0.65rem 2.5rem;
          color: var(--text-main);
          background: var(--bg-color);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          outline: none;
        }

        .conversations-list {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
        }

        .conversation-item {
          width: 100%;
          display: flex;
          gap: 1rem;
          align-items: center;
          padding: 1rem;
          color: var(--text-main);
          background: transparent;
          border: 0;
          border-bottom: 1px solid var(--border-color);
          cursor: pointer;
          text-align: left;
          transition: background 0.2s;
        }

        .conversation-item:hover,
        .conversation-item.active {
          background: var(--sidebar-hover);
        }

        .conversation-item.active {
          border-left: 3px solid var(--primary-color);
        }

        .avatar {
          width: 48px;
          height: 48px;
          flex: 0 0 48px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          background: var(--bg-color);
          border-radius: 50%;
        }

        .conv-info {
          flex: 1;
          min-width: 0;
        }

        .conv-header {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 4px;
        }

        .conv-name,
        .conv-last-msg {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .conv-name {
          font-weight: 600;
        }

        .conv-time,
        .conv-last-msg {
          color: var(--text-muted);
          font-size: 0.78rem;
        }

        .chat-main {
          flex: 1;
          min-width: 0;
          min-height: 0;
          display: flex;
          flex-direction: column;
          background: #fff;
        }

        .chat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.85rem 1.5rem;
          background: var(--bg-color);
          border-bottom: 1px solid var(--border-color);
          flex-shrink: 0;
        }

        .chat-user-info {
          min-width: 0;
        }

        .chat-user-name,
        .chat-user-status {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .chat-user-name {
          font-weight: 700;
        }

        .chat-user-status {
          color: var(--text-muted);
          font-size: 0.78rem;
        }

        .chat-header-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .fix-phone-btn {
          min-height: 36px;
          padding: 0 0.8rem;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          color: var(--text-main);
          background: #fff;
          cursor: pointer;
          font-weight: 600;
        }

        .header-icon-btn,
        .icon-btn,
        .send-btn {
          width: 44px;
          height: 44px;
          flex: 0 0 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 50%;
          cursor: pointer;
        }

        .header-icon-btn,
        .icon-btn {
          color: var(--text-muted);
          background: transparent;
        }

        .messages-area {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 2rem;
          overflow-y: auto;
          background-color: #f5f7f9;
          background-image: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png');
        }

        .message-wrapper {
          display: flex;
          width: 100%;
        }

        .message-wrapper.sent {
          justify-content: flex-end;
        }

        .message-wrapper.received {
          justify-content: flex-start;
        }

        .message-bubble {
          max-width: 65%;
          padding: 0.65rem 1rem;
          border-radius: 8px;
          box-shadow: 0 1px 1px rgba(0, 0, 0, 0.14);
        }

        .sent .message-bubble {
          color: #fff;
          background: var(--primary-color);
          border-top-right-radius: 2px;
        }

        .received .message-bubble {
          color: #333;
          background: #e9edef;
          border-top-left-radius: 2px;
        }

        .message-bubble p {
          word-break: break-word;
          white-space: pre-wrap;
        }

        .message-image,
        .message-video {
          display: block;
          max-width: min(320px, 100%);
          max-height: 360px;
          object-fit: contain;
          border-radius: 6px;
          background: rgba(0, 0, 0, 0.08);
        }

        .message-audio {
          display: block;
          width: min(320px, 100%);
          max-width: 100%;
        }

        .message-document {
          display: inline-flex;
          max-width: 100%;
          padding: 0.55rem 0.7rem;
          color: inherit;
          background: rgba(255, 255, 255, 0.28);
          border-radius: 6px;
          text-decoration: underline;
          word-break: break-word;
        }

        .msg-time {
          float: right;
          margin-top: 4px;
          margin-left: 8px;
          color: rgba(0, 0, 0, 0.45);
          font-size: 0.68rem;
        }

        .sent .msg-time {
          color: rgba(255, 255, 255, 0.76);
        }

        .chat-input-area {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem;
          background: var(--bg-color);
          border-top: 1px solid var(--border-color);
          flex-shrink: 0;
        }

        .chat-input-area input {
          flex: 1;
          min-width: 0;
          min-height: 44px;
          padding: 0.75rem 1rem;
          color: var(--text-main);
          background: #fff;
          border: 1px solid var(--border-color);
          border-radius: 999px;
          outline: none;
        }

        .send-btn {
          color: #fff;
          background: var(--primary-color);
        }

        .send-btn:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .empty-chat {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          color: var(--text-muted);
          text-align: center;
        }

        .empty-chat svg {
          margin-bottom: 1rem;
          opacity: 0.25;
        }

        @media (max-width: 768px) {
          .chat-layout {
            height: calc(100dvh - 168px);
            min-height: 0;
            flex-direction: column;
            border-radius: 8px;
          }

          .chat-sidebar {
            width: 100%;
            min-width: 0;
            height: 34%;
            min-height: 150px;
            max-height: 230px;
            border-right: none;
            border-bottom: 1px solid var(--border-color);
          }

          .sidebar-search {
            padding: 0.75rem;
          }

          .search-icon {
            left: 1.4rem;
          }

          .conversation-item {
            padding: 0.75rem;
            gap: 0.75rem;
          }

          .avatar {
            width: 40px;
            height: 40px;
            flex-basis: 40px;
          }

          .chat-main {
            flex: 1;
          }

          .chat-header {
            padding: 0.75rem 1rem;
          }

          .messages-area {
            padding: 1rem;
          }

          .message-bubble {
            max-width: 86%;
            padding: 0.55rem 0.8rem;
          }

          .chat-input-area {
            position: sticky;
            bottom: 0;
            gap: 0.5rem;
            padding: 0.75rem;
          }

          .header-icon-btn,
          .icon-btn,
          .send-btn {
            width: 40px;
            height: 40px;
            flex-basis: 40px;
          }

          .chat-input-area input {
            min-height: 40px;
          }
        }

        @media (max-width: 480px) {
          .chat-layout {
            height: calc(100dvh - 152px);
          }

          .chat-sidebar {
            height: 31%;
            min-height: 132px;
          }

          .conv-time {
            display: none;
          }

          .empty-chat h3 {
            font-size: 1rem;
          }
        }
      `}</style>
    </div>
  );
};
