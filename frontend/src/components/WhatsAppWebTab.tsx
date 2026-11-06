import React, { useRef, useState, useEffect } from 'react';
import { PhoneCall, ExternalLink, RotateCw, ShieldCheck } from 'lucide-react';

interface WhatsAppWebTabProps {
  channelKey: string;
  channelLabel: string;
  description: string;
}

export const WhatsAppWebTab: React.FC<WhatsAppWebTabProps> = ({
  channelKey,
  channelLabel,
  description,
}) => {
  const safePartition = `persist:whatsapp_${channelKey.replace(/-/g, '_')}`;
  const webviewRef = useRef<any>(null);
  const [, setIsLoading] = useState(true);

  const handleReload = () => {
    if (webviewRef.current && typeof webviewRef.current.reload === 'function') {
      setIsLoading(true);
      webviewRef.current.reload();
    }
  };

  const handleOpenWindow = () => {
    const electron = (window as any).electronAPI;
    if (electron && typeof electron.openWhatsappWindow === 'function') {
      electron.openWhatsappWindow(channelKey, channelLabel);
    } else {
      window.open('https://web.whatsapp.com', '_blank');
    }
  };

  useEffect(() => {
    const node = webviewRef.current;
    if (!node) return;

    const onFinish = () => setIsLoading(false);
    const onStart = () => setIsLoading(true);

    node.addEventListener('did-finish-load', onFinish);
    node.addEventListener('did-start-loading', onStart);

    return () => {
      node.removeEventListener('did-finish-load', onFinish);
      node.removeEventListener('did-start-loading', onStart);
    };
  }, [channelKey]);

  return (
    <div className="whatsapp-web-container">
      <div className="whatsapp-web-header">
        <div className="whatsapp-web-info">
          <div className="whatsapp-web-title-row">
            <h3>{channelLabel}</h3>
            <span className="whatsapp-badge-live">
              <PhoneCall size={14} />
              Chamadas de Voz & Vídeo Habilitadas
            </span>
          </div>
          <p>{description} — Escaneie o QR Code com o WhatsApp do seu celular para conectar.</p>
        </div>

        <div className="whatsapp-web-actions">
          <button
            type="button"
            className="whatsapp-web-btn"
            onClick={handleReload}
            title="Recarregar WhatsApp"
          >
            <RotateCw size={15} />
            Recarregar
          </button>

          <button
            type="button"
            className="whatsapp-web-btn primary"
            onClick={handleOpenWindow}
            title="Abrir em janela própria (ideal para colocar em outro monitor ou no canto da tela)"
          >
            <ExternalLink size={15} />
            Destacar em Janela Separada
          </button>
        </div>
      </div>

      <div className="whatsapp-web-frame-wrapper">
        {React.createElement('webview', {
          ref: webviewRef,
          src: 'https://web.whatsapp.com',
          partition: safePartition,
          useragent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          style: {
            width: '100%',
            height: '100%',
            border: 'none',
          },
          allowpopups: 'true',
        })}
      </div>

      <div className="whatsapp-web-footer-hint">
        <ShieldCheck size={14} />
        <span>
          Sessão persistente e protegida. Só precisa escanear o QR Code uma vez. Chamadas com áudio e microfone liberados.
        </span>
      </div>
    </div>
  );
};
