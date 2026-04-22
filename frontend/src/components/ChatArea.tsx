import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { socket } from '../services/socket';
import { Send, User, Search, Paperclip, MoreVertical, Sparkles } from 'lucide-react';

interface Client {
  id: string;
  name: string;
  phone: string;
  status: string;
}

interface Message {
  text: string;
  fromMe: boolean;
  timestamp: number;
}

export const ChatArea = () => {
    const [clients, setClients] = useState<Client[]>([]);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [messages, setMessages] = useState<Record<string, Message[]>>({});
    const [inputText, setInputText] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [isAILoading, setIsAILoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchClients = async () => {
            try {
                const res = await axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/clients`);
                setClients(res.data);
            } catch (err) {
                console.error('Erro ao buscar clientes:', err);
            }
        };
        fetchClients();

        socket.on('incoming_message', (data: any) => {
            setMessages(prev => ({
                ...prev,
                [data.from]: [...(prev[data.from] || []), {
                    text: data.text,
                    fromMe: false,
                    timestamp: data.timestamp
                }]
            }));
        });

        socket.on('message_sent', (data: any) => {
            setMessages(prev => ({
                ...prev,
                [data.to]: [...(prev[data.to] || []), {
                    text: data.text,
                    fromMe: true,
                    timestamp: data.timestamp
                }]
            }));
        });

        return () => {
            socket.off('incoming_message');
            socket.off('message_sent');
        };
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, selectedClient]);


    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedClient || !inputText.trim()) return;

        const text = inputText;
        setInputText('');

        try {
            await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/whatsapp/send`, {
                to: selectedClient.phone,
                text
            });
            // O socket.on('message_sent') cuidará de atualizar a UI
        } catch (err) {
            alert('Erro ao enviar mensagem');
        }
    };

    const handleAIInterpret = async () => {
        if (!selectedClient) return;
        const clientMessages = messages[selectedClient.phone] || [];
        if (clientMessages.length === 0) return;

        const lastMessage = clientMessages[clientMessages.length - 1].text;
        
        setIsAILoading(true);
        try {
            const response = await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/ai/interpret`, { message: lastMessage });
            const parts = response.data.parts || [];
            if (parts.length > 0) {
                const partsStr = parts.map((p: any) => p.searchQuery).join(', ');
                alert(`Lista Otimizada para Busca:\n${partsStr}\n\nCopie e cole na aba de Orçamento Geral.`);
            } else {
                alert('A IA não conseguiu identificar peças nesta mensagem.');
            }
        } catch (err) {
            console.error('Erro na IA:', err);
        } finally {
            setIsAILoading(false);
        }
    };

    const filteredClients = clients.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.phone.includes(searchTerm)
    );

    return (
        <div className="chat-layout">
            {/* Sidebar de Conversas */}
            <div className="chat-sidebar">
                <div className="sidebar-search">
                    <div style={{ position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input 
                            type="text" 
                            placeholder="Buscar contato..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                <div className="conversations-list">
                    {filteredClients.map(client => (
                        <div 
                            key={client.id} 
                            className={`conversation-item ${selectedClient?.id === client.id ? 'active' : ''}`}
                            onClick={() => setSelectedClient(client)}
                        >
                            <div className="avatar">
                                <User size={20} />
                            </div>
                            <div className="conv-info">
                                <div className="conv-header">
                                    <span className="conv-name">{client.name}</span>
                                    <span className="conv-time">12:00</span>
                                </div>
                                <div className="conv-last-msg">
                                    {client.phone}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Área do Chat */}
            <div className="chat-main">
                {selectedClient ? (
                    <>
                        <div className="chat-header">
                            <div className="chat-user-info">
                                <span className="chat-user-name">{selectedClient.name}</span>
                                <span className="chat-user-status">WhatsApp: {selectedClient.phone}</span>
                            </div>
                            <div className="chat-header-actions" style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                                <button 
                                    className="ai-btn"
                                    onClick={handleAIInterpret}
                                    disabled={isAILoading}
                                    title="Interpretar com IA"
                                >
                                    <Sparkles size={16} />
                                    <span>{isAILoading ? 'IA...' : 'Auto-Lista via IA'}</span>
                                </button>
                                <MoreVertical size={20} style={{ color: 'var(--text-muted)', cursor: 'pointer' }} />
                            </div>
                        </div>


                        <div className="messages-area">
                            {(messages[selectedClient.phone] || []).map((msg, idx) => (
                                <div key={idx} className={`message-wrapper ${msg.fromMe ? 'sent' : 'received'}`}>
                                    <div className="message-bubble">
                                        <p>{msg.text}</p>
                                        <span className="msg-time">
                                            {new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            <div ref={chatEndRef} />
                        </div>

                        <form className="chat-input-area" onSubmit={handleSendMessage}>
                            <button type="button" className="icon-btn"><Paperclip size={20} /></button>
                            <input 
                                type="text" 
                                placeholder="Digite uma mensagem..." 
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                            />
                            <button type="submit" className="send-btn" disabled={!inputText.trim()}>
                                <Send size={20} />
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="empty-chat">
                        <User size={64} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                        <h3>Selecione um cliente para conversar</h3>
                        <p>O AutoCRM está conectado ao seu WhatsApp.</p>
                    </div>
                )}
            </div>

            <style>{`
                .chat-layout {
                    display: flex;
                    height: calc(100vh - 180px);
                    background-color: var(--panel-bg);
                    border-radius: 12px;
                    border: 1px solid var(--border-color);
                    overflow: hidden;
                }
                .chat-sidebar {
                    width: 350px;
                    border-right: 1px solid var(--border-color);
                    display: flex;
                    flex-direction: column;
                    background: var(--sidebar-bg);
                }
                .sidebar-search {
                    padding: 1rem;
                    border-bottom: 1px solid var(--border-color);
                }
                .sidebar-search input {
                    width: 100%;
                    padding: 0.6rem 0.6rem 0.6rem 2.5rem;
                    background: var(--bg-color);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    color: var(--text-main);
                    outline: none;
                }
                .conversations-list {
                    flex: 1;
                    overflow-y: auto;
                }
                .conversation-item {
                    display: flex;
                    padding: 1rem;
                    gap: 1rem;
                    cursor: pointer;
                    transition: background 0.2s;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                }
                .conversation-item:hover {
                    background: rgba(255,255,255,0.05);
                }
                .conversation-item.active {
                    background: rgba(0, 86, 179, 0.05);
                    border-left: 3px solid var(--primary-color);
                }
                .avatar {
                    width: 48px;
                    height: 48px;
                    background: var(--bg-color);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--text-muted);
                }
                .conv-info {
                    flex: 1;
                    overflow: hidden;
                }
                .conv-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 4px;
                }
                .conv-name {
                    font-weight: 600;
                }
                .conv-time {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                }
                .conv-last-msg {
                    font-size: 0.85rem;
                    color: var(--text-muted);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .chat-main {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    background: #fff;
                }
                .chat-header {
                    padding: 0.8rem 1.5rem;
                    background: var(--bg-color);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid var(--border-color);
                }
                .chat-user-name {
                    display: block;
                    font-weight: 600;
                }
                .chat-user-status {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                }
                .ai-btn {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    background: #6366f1;
                    color: white;
                    border: none;
                    padding: 0.4rem 0.8rem;
                    border-radius: 4px;
                    font-size: 0.8rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .ai-btn:hover { background: #4f46e5; }
                .ai-suggest-btn {
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                    background: #0ea5e9;
                    color: white;
                    border: none;
                    padding: 4px 10px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 0.75rem;
                }

                .messages-area {
                    flex: 1;
                    padding: 2rem;
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    background-image: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png');
                    background-blend-mode: soft-light;
                    opacity: 0.9;
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
                    padding: 0.6rem 1rem;
                    border-radius: 8px;
                    position: relative;
                    box-shadow: 0 1px 1px rgba(0,0,0,0.2);
                }
                .sent .message-bubble {
                    background: var(--primary-color);
                    color: white;
                    border-top-right-radius: 2px;
                }
                .received .message-bubble {
                    background: #e9edef;
                    color: #333;
                    border-top-left-radius: 2px;
                }
                .msg-time {
                    font-size: 0.65rem;
                    color: rgba(0,0,0,0.4);
                    float: right;
                    margin-top: 4px;
                    margin-left: 8px;
                }
                .chat-input-area {
                    padding: 1rem;
                    background: var(--bg-color);
                    display: flex;
                    gap: 1rem;
                    align-items: center;
                }
                .chat-input-area input {
                    flex: 1;
                    background: #fff;
                    border: 1px solid var(--border-color);
                    color: var(--text-main);
                    outline: none;
                }
                .icon-btn, .send-btn {
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                }
                .send-btn {
                    color: var(--primary-color);
                }
                .send-btn:disabled {
                    opacity: 0.5;
                }
                .empty-chat {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    color: var(--text-muted);
                }
            `}</style>
        </div>
    );
};
