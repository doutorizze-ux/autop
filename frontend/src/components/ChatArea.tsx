import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, Paperclip, Search, Send, User, Users2 } from 'lucide-react';
import { API_URL } from '../services/api';
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

const normalizeContactKey = (value: string) => value.replace(/@(s\.whatsapp\.net|lid)$/, '');

const normalizeMessageTimestamp = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : Math.floor(Date.now() / 1000);
};

const getPayloadMessageKeys = (...values: unknown[]) =>
  Array.from(
    new Set(
      values
        .filter(Boolean)
        .map((value) => normalizeContactKey(String(value)))
        .filter(Boolean)
    )
  );

const getClientMessageKeys = (client: Client) => {
  const keys = [client.id, client.whatsappJid, client.phone]
    .filter(Boolean)
    .map((value) => normalizeContactKey(String(value)));
  return Array.from(new Set(keys));
};

const parseClientHistory = (client: Client): Message[] => {
  if (!client.history) return [];

  try {
    const parsed = JSON.parse(client.history);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(
          (item): item is Message =>
          item &&
          typeof item.text === 'string' &&
          typeof item.fromMe === 'boolean' &&
          (typeof item.timestamp === 'number' || typeof item.timestamp === 'string') &&
          !item.system &&
          (!!item.text.trim() || !!item.media) &&
          item.text !== '__PHONE_REQUEST_SENT__'
        )
        .map((item) => ({
          ...item,
          timestamp: normalizeMessageTimestamp(item.timestamp),
          media: item.media || null,
        }));
    }
  } catch (_) {}

  return client.history ? [{ text: client.history, fromMe: false, timestamp: Math.floor(Date.now() / 1000) }] : [];
};

const hasAttendanceMessages = (client: Client) => parseClientHistory(client).length > 0;

const getAttendanceClients = (items: Client[], selectedId?: string | null) =>
  items.filter((client) => hasAttendanceMessages(client) || (!!selectedId && client.id === selectedId));

const mergeMessages = (current: Message[] = [], incoming: Message[] = []) => {
  const all = [...current, ...incoming];
  return all
    .filter(
      (message, index, list) =>
        list.findIndex(
          (item) =>
            item.timestamp === message.timestamp &&
            item.fromMe === message.fromMe &&
            item.text === message.text &&
            (item.media?.url || '') === (message.media?.url || '')
        ) === index
    )
    .sort((a, b) => a.timestamp - b.timestamp);
};

const mergeMessageIntoKeys = (current: Record<string, Message[]>, keys: string[], message: Message) => {
  const next = { ...current };
  keys.forEach((key) => {
    next[key] = mergeMessages(next[key], [message]);
  });
  return next;
};

const mergeClientIntoList = (current: Client[], client: Client, addNew = true) => {
  const existingIndex = current.findIndex(
    (item) => item.id === client.id || item.phone === client.phone || (!!item.whatsappJid && item.whatsappJid === client.whatsappJid)
  );

  if (existingIndex >= 0) {
    const next = [...current];
    next[existingIndex] = client;
    return next;
  }

  return addNew ? [client, ...current] : current;
};

const isTechnicalLid = (value: string) => {
  const raw = String(value || '');
  const digits = raw.replace(/\D/g, '');
  return raw.endsWith('@lid') || (digits.length >= 14 && !digits.startsWith('55'));
};

const formatDigitsAsPhone = (value: string) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits.slice(2);
  }
  return digits || String(value || '');
};

const getResolvedClientPhone = (client: Client) => {
  const rawPhone = String(client.phone || '');
  if (!isTechnicalLid(rawPhone)) {
    return formatDigitsAsPhone(rawPhone);
  }

  const whatsappJid = String(client.whatsappJid || '');
  if (whatsappJid.endsWith('@s.whatsapp.net')) {
    return formatDigitsAsPhone(whatsappJid);
  }

  return '';
};

const formatClientPhone = (client: Client) => getResolvedClientPhone(client) || 'Telefone aguardando sincronização';

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
  const [isMobileLayout, setIsMobileLayout] = useState(() => window.innerWidth <= 768);
  const [showClientListOnMobile, setShowClientListOnMobile] = useState(() => window.innerWidth <= 768);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const hasAttemptedPhoneSyncRef = useRef(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobileLayout(mobile);
      if (!mobile) {
        setShowClientListOnMobile(true);
      } else if (!selectedClient) {
        setShowClientListOnMobile(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [selectedClient]);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/clients`);
        let currentClients = res.data as Client[];
        const selectedId = localStorage.getItem('selected_attendance_client_id');
        setClients(getAttendanceClients(currentClients, selectedId));

        const hasUnresolvedClients = getAttendanceClients(currentClients, selectedId).some((client) => formatClientPhone(client).includes('aguardando'));
        if (hasUnresolvedClients && !hasAttemptedPhoneSyncRef.current) {
          hasAttemptedPhoneSyncRef.current = true;
          try {
            await axios.post(`${API_URL}/api/whatsapp/sync-phones`);
            const refreshed = await axios.get(`${API_URL}/api/clients`);
            currentClients = refreshed.data;
            setClients(getAttendanceClients(currentClients, selectedId));
          } catch (syncError) {
            console.error('Erro ao sincronizar telefones pendentes:', syncError);
          }
        }

        setMessages((prev) => {
          const next = { ...prev };
          currentClients.forEach((client) => {
            next[client.id] = mergeMessages(next[client.id], parseClientHistory(client));
          });
          return next;
        });

        if (selectedId) {
          const client = currentClients.find((item) => item.id === selectedId);
          if (client) {
            setSelectedClient(client);
            if (window.innerWidth <= 768) {
              setShowClientListOnMobile(false);
            }
          }
          localStorage.removeItem('selected_attendance_client_id');
        }
      } catch (err) {
        console.error('Erro ao buscar clientes:', err);
      }
    };

    void fetchClients();

    const handleIncomingMessage = (data: any) => {
      const message: Message = {
        text: data.text || '',
        fromMe: false,
        timestamp: normalizeMessageTimestamp(data.timestamp),
        media: data.media || null,
      };
      const keys = getPayloadMessageKeys(data.clientId, data.whatsappJid, data.phone, data.from);

      if (data.client?.id) {
        setClients((prev) => mergeClientIntoList(prev, data.client, hasAttendanceMessages(data.client)));
      }

      if (keys.length > 0) {
        setMessages((prev) => mergeMessageIntoKeys(prev, keys, message));
      }
    };

    const handleClientUpserted = (client: Client) => {
      setClients((prev) => mergeClientIntoList(prev, client, hasAttendanceMessages(client)));

      setMessages((prev) => ({
        ...prev,
        [client.id]: mergeMessages(prev[client.id], parseClientHistory(client)),
      }));

      setSelectedClient((current) => {
        if (!current) return current;
        const currentKeys = getClientMessageKeys(current);
        const incomingKeys = getClientMessageKeys(client);
        const sameClient = current.id === client.id || currentKeys.some((key) => incomingKeys.includes(key));
        return sameClient ? client : current;
      });
    };

    const handleClientDeleted = (payload: { id: string }) => {
      setClients((prev) => prev.filter((client) => client.id !== payload.id));
      setSelectedClient((current) => (current?.id === payload.id ? null : current));
    };

    const handleMessageSent = (data: any) => {
      const message: Message = {
        text: data.text || '',
        fromMe: true,
        timestamp: normalizeMessageTimestamp(data.timestamp),
        media: data.media || null,
      };
      const keys = getPayloadMessageKeys(data.clientId, data.to);

      if (keys.length > 0) {
        setMessages((prev) => mergeMessageIntoKeys(prev, keys, message));
      }
    };

    socket.on('incoming_message', handleIncomingMessage);
    socket.on('client_upserted', handleClientUpserted);
    socket.on('client_deleted', handleClientDeleted);
    socket.on('message_sent', handleMessageSent);

    return () => {
      socket.off('incoming_message', handleIncomingMessage);
      socket.off('message_sent', handleMessageSent);
      socket.off('client_upserted', handleClientUpserted);
      socket.off('client_deleted', handleClientDeleted);
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
        text,
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
      setClients((prev) => prev.map((client) => (client.id === updatedClient.id ? updatedClient : client)));
      setSelectedClient(updatedClient);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao corrigir telefone do lead');
    }
  };

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    if (isMobileLayout) {
      setShowClientListOnMobile(false);
    }
  };

  const filteredClients = clients.filter((client) => {
    const term = searchTerm.toLowerCase();
    return client.name.toLowerCase().includes(term) || formatClientPhone(client).includes(searchTerm);
  });

  const selectedMessages = selectedClient
    ? getClientMessageKeys(selectedClient)
        .flatMap((key) => messages[key] || [])
        .reduce((acc, message) => mergeMessages(acc, [message]), [] as Message[])
    : [];

  const isSidebarVisible = !isMobileLayout || showClientListOnMobile;
  const isChatVisible = !isMobileLayout || (!showClientListOnMobile && !!selectedClient);

  return (
    <div className={`chat-layout ${isMobileLayout ? 'chat-layout-mobile' : ''}`}>
      {isSidebarVisible && (
        <aside className="chat-sidebar">
          <div className="sidebar-search">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Buscar contato..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>

          <div className="mobile-list-caption">
            <span>{filteredClients.length} cliente(s)</span>
            <small>Toque para abrir a conversa</small>
          </div>

          <div className="conversations-list">
            {filteredClients.map((client) => (
              <button
                key={client.id}
                type="button"
                className={`conversation-item ${selectedClient?.id === client.id ? 'active' : ''}`}
                onClick={() => handleSelectClient(client)}
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
      )}

      {isChatVisible && selectedClient && (
        <section className="chat-main">
          <header className="chat-header">
            <div className="chat-header-main">
              {isMobileLayout && (
                <button type="button" className="mobile-switch-btn" onClick={() => setShowClientListOnMobile(true)}>
                  <ArrowLeft size={18} />
                  <span>Clientes</span>
                </button>
              )}

              <div className="chat-user-info">
                <span className="chat-user-name">{selectedClient.name}</span>
                <span className="chat-user-status">WhatsApp: {formatClientPhone(selectedClient)}</span>
              </div>
            </div>

            <div className="chat-header-actions">
              {!getResolvedClientPhone(selectedClient) && (
                <button type="button" className="fix-phone-btn" onClick={handleFixSelectedPhone}>
                  Corrigir telefone
                </button>
              )}
              {isMobileLayout && (
                <button type="button" className="client-drawer-btn" onClick={() => setShowClientListOnMobile(true)}>
                  <Users2 size={18} />
                </button>
              )}
            </div>
          </header>

          <div className="messages-area">
            {selectedMessages.map((message, index) => (
              <div key={`${message.timestamp}-${index}`} className={`message-wrapper ${message.fromMe ? 'sent' : 'received'}`}>
                <div className="message-bubble">
                  {message.media?.type === 'image' || message.media?.type === 'sticker' ? (
                    <img className="message-image" src={resolveMediaUrl(message.media.url)} alt={message.media.fileName || 'Imagem recebida'} />
                  ) : null}
                  {message.media?.type === 'video' ? <video className="message-video" controls src={resolveMediaUrl(message.media.url)} /> : null}
                  {message.media?.type === 'audio' ? <audio className="message-audio" controls src={resolveMediaUrl(message.media.url)} /> : null}
                  {message.media?.type === 'document' ? (
                    <a className="message-document" href={resolveMediaUrl(message.media.url)} target="_blank" rel="noreferrer">
                      {message.media.fileName || 'Abrir documento'}
                    </a>
                  ) : null}
                  {shouldShowMessageText(message) ? <p>{message.text}</p> : null}
                  <span className="msg-time">
                    {new Date(message.timestamp * 1000).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
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
              onChange={(event) => setInputText(event.target.value)}
            />
            <button type="submit" className="send-btn" disabled={!inputText.trim()} title="Enviar">
              <Send size={20} />
            </button>
          </form>
        </section>
      )}

      {!selectedClient && !isMobileLayout && (
        <section className="chat-main">
          <div className="empty-chat">
            <User size={64} />
            <h3>Selecione um cliente para conversar</h3>
            <p>WhatsApp conectado e pronto para atendimento.</p>
          </div>
        </section>
      )}

      {!selectedClient && isMobileLayout && !showClientListOnMobile && (
        <section className="chat-main">
          <div className="empty-chat">
            <User size={54} />
            <h3>Escolha um cliente</h3>
            <p>Abra a lista para continuar o atendimento.</p>
            <button type="button" className="mobile-switch-btn mobile-switch-btn-solid" onClick={() => setShowClientListOnMobile(true)}>
              <Users2 size={18} />
              <span>Ver clientes</span>
            </button>
          </div>
        </section>
      )}

      <style>{`
        .chat-layout {
          display: flex;
          height: calc(100dvh - 240px);
          min-height: 560px;
          background: var(--panel-bg);
          border: 1px solid var(--border-color);
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
        }

        .chat-sidebar {
          width: 360px;
          min-width: 300px;
          display: flex;
          flex-direction: column;
          min-height: 0;
          background:
            linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(241, 245, 249, 0.96));
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
          min-height: 44px;
          padding: 0.72rem 0.85rem 0.72rem 2.7rem;
          color: var(--text-main);
          background: #fff;
          border: 1px solid var(--border-color);
          border-radius: 14px;
          outline: none;
        }

        .mobile-list-caption {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
          padding: 0.8rem 1rem;
          color: var(--text-muted);
          font-size: 0.8rem;
          border-bottom: 1px solid rgba(215, 222, 231, 0.7);
        }

        .mobile-list-caption span {
          font-weight: 700;
          color: var(--text-main);
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
          border-bottom: 1px solid rgba(215, 222, 231, 0.7);
          cursor: pointer;
          text-align: left;
          transition: background 0.2s ease, transform 0.2s ease;
        }

        .conversation-item:hover,
        .conversation-item.active {
          background: rgba(0, 86, 179, 0.05);
        }

        .conversation-item.active {
          box-shadow: inset 3px 0 0 var(--primary-color);
        }

        .avatar {
          width: 46px;
          height: 46px;
          flex: 0 0 46px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--primary-color);
          background: rgba(0, 86, 179, 0.08);
          border-radius: 16px;
        }

        .conv-info {
          flex: 1;
          min-width: 0;
        }

        .conv-header {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.25rem;
        }

        .conv-name,
        .conv-last-msg {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .conv-name {
          font-weight: 700;
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
          padding: 1rem 1.4rem;
          background: rgba(255, 255, 255, 0.95);
          border-bottom: 1px solid var(--border-color);
          flex-shrink: 0;
        }

        .chat-header-main {
          display: flex;
          align-items: center;
          gap: 0.9rem;
          min-width: 0;
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
          font-weight: 800;
        }

        .chat-user-status {
          color: var(--text-muted);
          font-size: 0.8rem;
        }

        .chat-header-actions {
          display: flex;
          align-items: center;
          gap: 0.55rem;
        }

        .fix-phone-btn,
        .mobile-switch-btn,
        .client-drawer-btn {
          min-height: 38px;
          padding: 0 0.9rem;
          border: 1px solid var(--border-color);
          border-radius: 12px;
          color: var(--text-main);
          background: #fff;
          cursor: pointer;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
        }

        .mobile-switch-btn-solid {
          background: var(--primary-color);
          color: #fff;
          border-color: var(--primary-color);
          margin-top: 1rem;
        }

        .client-drawer-btn {
          width: 40px;
          padding: 0;
        }

        .icon-btn,
        .send-btn {
          width: 46px;
          height: 46px;
          flex: 0 0 46px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 16px;
          cursor: pointer;
        }

        .icon-btn {
          color: var(--text-muted);
          background: #eef4fb;
        }

        .messages-area {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          padding: 1.5rem;
          overflow-y: auto;
          background:
            linear-gradient(rgba(248, 250, 252, 0.92), rgba(248, 250, 252, 0.92)),
            url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png');
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
          max-width: 68%;
          padding: 0.75rem 1rem;
          border-radius: 18px;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
        }

        .sent .message-bubble {
          color: #fff;
          background: linear-gradient(135deg, var(--primary-color), #0c7ff2);
          border-top-right-radius: 4px;
        }

        .received .message-bubble {
          color: #243041;
          background: #ffffff;
          border-top-left-radius: 4px;
        }

        .message-bubble p {
          word-break: break-word;
          white-space: pre-wrap;
          line-height: 1.45;
        }

        .message-image,
        .message-video {
          display: block;
          max-width: min(320px, 100%);
          max-height: 360px;
          object-fit: contain;
          border-radius: 10px;
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
          background: rgba(255, 255, 255, 0.24);
          border-radius: 10px;
          text-decoration: underline;
          word-break: break-word;
        }

        .msg-time {
          float: right;
          margin-top: 6px;
          margin-left: 8px;
          color: rgba(0, 0, 0, 0.45);
          font-size: 0.68rem;
        }

        .sent .msg-time {
          color: rgba(255, 255, 255, 0.78);
        }

        .chat-input-area {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 1.2rem 1.2rem;
          background: rgba(255, 255, 255, 0.95);
          border-top: 1px solid var(--border-color);
          flex-shrink: 0;
        }

        .chat-input-area input {
          flex: 1;
          min-width: 0;
          min-height: 46px;
          padding: 0.8rem 1rem;
          color: var(--text-main);
          background: #fff;
          border: 1px solid var(--border-color);
          border-radius: 999px;
          outline: none;
        }

        .send-btn {
          color: #fff;
          background: linear-gradient(135deg, var(--primary-color), #0c7ff2);
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
          padding: 1.5rem;
          color: var(--text-muted);
          text-align: center;
        }

        .empty-chat svg {
          margin-bottom: 1rem;
          opacity: 0.25;
        }

        @media (max-width: 768px) {
          .chat-layout {
            height: calc(100dvh - 242px);
            min-height: 520px;
            border-radius: 20px;
          }

          .chat-sidebar,
          .chat-main {
            width: 100%;
            min-width: 0;
          }

          .mobile-list-caption {
            display: flex;
          }

          .chat-header {
            padding: 0.9rem 1rem;
          }

          .chat-header-main {
            flex: 1;
            min-width: 0;
          }

          .messages-area {
            padding: 1rem;
          }

          .message-bubble {
            max-width: 88%;
            padding: 0.65rem 0.85rem;
          }

          .chat-input-area {
            gap: 0.55rem;
            padding: 0.8rem;
          }

          .icon-btn,
          .send-btn {
            width: 42px;
            height: 42px;
            flex-basis: 42px;
          }

          .chat-input-area input {
            min-height: 42px;
          }
        }

        @media (max-width: 480px) {
          .chat-layout {
            height: calc(100dvh - 224px);
            min-height: 500px;
          }

          .conversation-item {
            padding: 0.85rem 0.9rem;
          }

          .conv-time {
            display: none;
          }

          .fix-phone-btn {
            display: none;
          }
        }
      `}</style>
    </div>
  );
};
