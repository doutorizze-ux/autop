import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { socket } from '../services/socket';
import { CheckCircle2, RefreshCcw, WifiOff } from 'lucide-react';

export const WhatsAppConnect = () => {
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'qr'>('connecting');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const autoReconnectStarted = useRef(false);

    const reconnect = async () => {
        try {
            setStatus('connecting');
            setErrorMessage('');
            const response = await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/whatsapp/reconnect`);
            setStatus(response.data.status);
            setQrCode(response.data.qr || null);
            setErrorMessage(response.data.error || '');
        } catch (error: any) {
            setStatus('disconnected');
            setQrCode(null);
            setErrorMessage(error?.response?.data?.message || 'Nao foi possivel iniciar uma nova sessao do WhatsApp.');
        }
    };

    useEffect(() => {
        const fetchInitialStatus = async () => {
            try {
                const response = await axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/whatsapp/status`);
                setStatus(response.data.status);
                setQrCode(response.data.qr || null);
                setErrorMessage(response.data.error || '');

                if (response.data.status === 'disconnected' && !autoReconnectStarted.current) {
                    autoReconnectStarted.current = true;
                    await reconnect();
                }
            } catch {
                setStatus('disconnected');
                setQrCode(null);
                setErrorMessage('Nao foi possivel consultar o status do WhatsApp.');
            }
        };

        fetchInitialStatus();
        const interval = window.setInterval(fetchInitialStatus, 4000);

        socket.on('whatsapp_status', (data: { status: 'connecting' | 'connected' | 'disconnected' | 'qr'; qr?: string }) => {
            setStatus(data.status);
            setQrCode(data.qr || null);
            setErrorMessage('');
        });

        return () => {
            window.clearInterval(interval);
            socket.off('whatsapp_status');
        };
    }, []);

    const renderContent = () => {
        switch (status) {
            case 'qr':
                return (
                    <div style={{ textAlign: 'center' }}>
                        <h3 style={{ marginBottom: '1rem' }}>Escaneie o QR Code</h3>
                        {qrCode ? (
                            <img src={qrCode} alt="WhatsApp QR Code" style={{ background: 'white', padding: '10px', borderRadius: '8px', maxWidth: '300px' }} />
                        ) : (
                            <p>Gerando QR Code...</p>
                        )}
                        <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Abra o WhatsApp &gt; Aparelhos conectados &gt; Conectar um aparelho</p>
                    </div>
                );
            case 'connected':
                return (
                    <div style={{ textAlign: 'center', color: '#10b981' }}>
                        <CheckCircle2 size={64} style={{ marginBottom: '1rem' }} />
                        <h3>WhatsApp Conectado!</h3>
                        <p style={{ color: 'var(--text-muted)' }}>O sistema estÃ¡ pronto para receber e enviar mensagens.</p>
                    </div>
                );
            case 'connecting':
                return (
                    <div style={{ textAlign: 'center' }}>
                        <RefreshCcw size={64} className="spin" style={{ marginBottom: '1rem' }} />
                        <h3>Iniciando WhatsApp...</h3>
                        <p style={{ marginTop: '0.75rem', color: 'var(--text-muted)' }}>Aguarde alguns segundos. O QR Code aparece aqui assim que a sessao nova for criada.</p>
                    </div>
                );
            default:
                return (
                    <div style={{ textAlign: 'center' }}>
                        <WifiOff size={64} style={{ marginBottom: '1rem', color: '#ef4444' }} />
                        <h3>Desconectado</h3>
                        {errorMessage && <p style={{ marginTop: '0.75rem', color: '#ef4444' }}>{errorMessage}</p>}
                        <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={reconnect}>Tentar Novamente</button>
                    </div>
                );
        }
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px', backgroundColor: 'var(--panel-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '2rem' }}>
            {renderContent()}
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .spin {
                    animation: spin 2s linear infinite;
                }
            `}</style>
        </div>
    );
};
