import { useState, useEffect } from 'react';
import { socket } from '../services/socket';
import { CheckCircle2, RefreshCcw, WifiOff } from 'lucide-react';

export const WhatsAppConnect = () => {
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'qr'>('connecting');
    const [qrCode, setQrCode] = useState<string | null>(null);

    useEffect(() => {
        socket.on('whatsapp_status', (data: { status: any, qr?: string }) => {
            setStatus(data.status);
            if (data.qr) setQrCode(data.qr);
        });

        // Solicitar status inicial se necessário (ou o backend emitirá ao conectar)
        
        return () => {
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
                        <p style={{ color: 'var(--text-muted)' }}>O sistema está pronto para receber e enviar mensagens.</p>
                    </div>
                );
            case 'connecting':
                return (
                    <div style={{ textAlign: 'center' }}>
                        <RefreshCcw size={64} className="spin" style={{ marginBottom: '1rem' }} />
                        <h3>Iniciando WhatsApp...</h3>
                    </div>
                );
            default:
                return (
                    <div style={{ textAlign: 'center' }}>
                        <WifiOff size={64} style={{ marginBottom: '1rem', color: '#ef4444' }} />
                        <h3>Desconectado</h3>
                        <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => window.location.reload()}>Tentar Novamente</button>
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
