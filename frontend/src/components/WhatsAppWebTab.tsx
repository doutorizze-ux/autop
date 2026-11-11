import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  PhoneCall,
  ExternalLink,
  RotateCw,
  ShieldCheck,
  MessageSquare,
  Monitor,
  Globe,
  UserCheck,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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
  const { user } = useAuth();
  const isElectron =
    typeof window !== 'undefined' &&
    (Boolean((window as any).electronAPI) || navigator.userAgent.includes('Electron'));

  const safePartition = `persist:whatsapp_${channelKey.replace(/-/g, '_')}`;
  const webviewRef = useRef<any>(null);
  const isDomReadyRef = useRef<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);

  // Assinatura do atendente local (armazenada por máquina/usuário)
  const [signatureName, setSignatureName] = useState<string>(() => {
    return (
      localStorage.getItem(`wa_sig_name_${channelKey}`) ||
      localStorage.getItem('wa_sig_name_global') ||
      ''
    );
  });

  const [signatureEnabled, setSignatureEnabled] = useState<boolean>(() => {
    const val = localStorage.getItem(`wa_sig_enabled_${channelKey}`);
    return val === null ? true : val === 'true';
  });

  const [signatureFormat, setSignatureFormat] = useState<'prefix' | 'suffix'>(() => {
    return (localStorage.getItem('wa_sig_format') as 'prefix' | 'suffix') || 'prefix';
  });

  // Preenche com o nome do usuário logado se ainda não tiver configurado
  useEffect(() => {
    if (!signatureName && user?.name) {
      setSignatureName(user.name);
      localStorage.setItem(`wa_sig_name_${channelKey}`, user.name);
      localStorage.setItem('wa_sig_name_global', user.name);
    }
  }, [user, signatureName, channelKey]);

  // Gerador do script que intercepta Enter e Enviar no WhatsApp Web
  const getSignatureInjectionCode = useCallback(
    (cfg: { name: string; enabled: boolean; format: 'prefix' | 'suffix' }) => {
      return `
(function() {
  window.__ATTENDANT_SIGNATURE_CONFIG = ${JSON.stringify(cfg)};
  if (window.__ATTENDANT_SIGNATURE_INSTALLED) return;
  window.__ATTENDANT_SIGNATURE_INSTALLED = true;

  function getComposer() {
    return document.querySelector('footer div[contenteditable="true"][role="textbox"]') ||
           document.querySelector('div[contenteditable="true"][data-tab="10"]');
  }

  function applySignature(composer) {
    const config = window.__ATTENDANT_SIGNATURE_CONFIG;
    if (!config || !config.enabled || !config.name || !config.name.trim()) return false;
    
    const name = config.name.trim();
    const rawText = composer.innerText || composer.textContent || '';
    const cleanText = rawText.replace(/\\u200B/g, '').trim();
    if (!cleanText) return false;

    const prefix = '*[' + name + ']:* ';
    const prefixCheck = '[' + name + ']:';
    const suffix = '\\n\\n_~ Atendente ' + name + '_';
    const suffixCheck = '~ Atendente ' + name;

    let newText = cleanText;
    if (config.format === 'suffix') {
      if (cleanText.includes(suffixCheck)) return false;
      newText = cleanText + suffix;
    } else {
      if (cleanText.includes(prefixCheck) || cleanText.startsWith('*[')) return false;
      newText = prefix + cleanText;
    }

    try {
      composer.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(composer);
      sel.removeAllRanges();
      sel.addRange(range);
      
      const success = document.execCommand('insertText', false, newText);
      if (!success) {
        const dt = new DataTransfer();
        dt.setData('text/plain', newText);
        composer.dispatchEvent(new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true
        }));
      }
      return true;
    } catch (e) {
      console.warn('[Signature] Falha ao assinar:', e);
      return false;
    }
  }

  window.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      const composer = getComposer();
      if (composer && (composer === e.target || composer.contains(e.target))) {
        applySignature(composer);
      }
    }
  }, true);

  window.addEventListener('pointerdown', function(e) {
    const sendBtn = e.target && e.target.closest && e.target.closest('button[aria-label*="Enviar" i], button span[data-icon="send"], span[data-icon="send"]');
    if (sendBtn) {
      const composer = getComposer();
      if (composer) {
        applySignature(composer);
      }
    }
  }, true);
})();
`;
    },
    []
  );

  const syncSignature = useCallback(() => {
    const cfg = {
      name: signatureName.trim(),
      enabled: signatureEnabled,
      format: signatureFormat,
    };

    if (isDomReadyRef.current && webviewRef.current && typeof webviewRef.current.executeJavaScript === 'function') {
      try {
        webviewRef.current.executeJavaScript(getSignatureInjectionCode(cfg)).catch(() => {});
      } catch (_) {}
    }

    const electron = (window as any).electronAPI;
    if (electron?.updateWhatsappSignature) {
      try {
        electron.updateWhatsappSignature(channelKey, {
          signatureName: signatureName.trim(),
          signatureEnabled,
          signatureFormat,
        });
      } catch (_) {}
    }
  }, [channelKey, signatureName, signatureEnabled, signatureFormat, getSignatureInjectionCode]);

  useEffect(() => {
    if (isDomReadyRef.current) {
      syncSignature();
    }
  }, [syncSignature]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSignatureName(val);
    localStorage.setItem(`wa_sig_name_${channelKey}`, val);
    localStorage.setItem('wa_sig_name_global', val);
  };

  const handleToggleEnabled = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setSignatureEnabled(val);
    localStorage.setItem(`wa_sig_enabled_${channelKey}`, String(val));
  };

  const handleFormatChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as 'prefix' | 'suffix';
    setSignatureFormat(val);
    localStorage.setItem('wa_sig_format', val);
  };

  const handleReload = () => {
    if (webviewRef.current && typeof webviewRef.current.reload === 'function') {
      setIsLoading(true);
      webviewRef.current.reload();
    }
  };

  const handleOpenWindow = () => {
    const electron = (window as any).electronAPI;
    if (electron && typeof electron.openWhatsappWindow === 'function') {
      electron.openWhatsappWindow(channelKey, channelLabel, {
        signatureName: signatureName.trim(),
        signatureEnabled,
        signatureFormat,
      });
    } else {
      window.open('https://web.whatsapp.com', '_blank');
    }
  };

  useEffect(() => {
    const node = webviewRef.current;
    if (!node) return;

    const onFinish = () => {
      setIsLoading(false);
      isDomReadyRef.current = true;
      syncSignature();
    };
    const onStart = () => setIsLoading(true);
    const onDomReady = () => {
      isDomReadyRef.current = true;
      syncSignature();
    };

    node.addEventListener('did-finish-load', onFinish);
    node.addEventListener('did-start-loading', onStart);
    node.addEventListener('dom-ready', onDomReady);

    return () => {
      node.removeEventListener('did-finish-load', onFinish);
      node.removeEventListener('did-start-loading', onStart);
      node.removeEventListener('dom-ready', onDomReady);
    };
  }, [channelKey, syncSignature]);

  // Preview da mensagem
  const sampleName = signatureName.trim() || 'Atendente';
  const previewText =
    signatureFormat === 'prefix'
      ? `*[${sampleName}]:* Olá! Como posso te ajudar hoje?`
      : `Olá! Como posso te ajudar hoje?\n\n_~ Atendente ${sampleName}_`;

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
          {isElectron && (
            <button
              type="button"
              className="whatsapp-web-btn"
              onClick={handleReload}
              title="Recarregar WhatsApp"
            >
              <RotateCw size={15} />
              Recarregar
            </button>
          )}

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

      {/* Barra de Assinatura Automática do Atendente */}
      <div className="whatsapp-signature-bar">
        <div className="whatsapp-signature-left">
          <div className="signature-icon-badge">
            <UserCheck size={18} />
          </div>
          <div className="signature-fields">
            <div className="signature-input-group">
              <label htmlFor={`sig-name-${channelKey}`}>Colaborador(a):</label>
              <input
                id={`sig-name-${channelKey}`}
                type="text"
                className="signature-name-input"
                value={signatureName}
                onChange={handleNameChange}
                placeholder="Seu nome (ex: Lucas, Mariana...)"
                maxLength={30}
              />
            </div>

            <div className="signature-select-group">
              <label htmlFor={`sig-format-${channelKey}`}>Estilo:</label>
              <select
                id={`sig-format-${channelKey}`}
                className="signature-format-select"
                value={signatureFormat}
                onChange={handleFormatChange}
              >
                <option value="prefix">Prefixo (*[Nome]:* Mensagem)</option>
                <option value="suffix">Sufixo (Mensagem ~ Atendente Nome)</option>
              </select>
            </div>

            <label className="signature-toggle-label">
              <input
                type="checkbox"
                checked={signatureEnabled}
                onChange={handleToggleEnabled}
              />
              <span>Assinar mensagens automaticamente</span>
            </label>
          </div>
        </div>

        <div className="whatsapp-signature-preview-box">
          <span className="preview-label">
            <Sparkles size={12} />
            Como o cliente vê:
          </span>
          <div className={`preview-bubble ${!signatureEnabled ? 'disabled' : ''}`}>
            {signatureEnabled ? previewText : 'Olá! Como posso te ajudar hoje? (Sem assinatura)'}
          </div>
        </div>
      </div>

      <div className="whatsapp-web-frame-wrapper">
        {isElectron ? (
          <>
            {isLoading && (
              <div className="whatsapp-loading-overlay">
                <RotateCw size={26} className="whatsapp-spinner" />
                <p>Carregando {channelLabel}...</p>
              </div>
            )}
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
          </>
        ) : (
          <div className="whatsapp-web-browser-card">
            <div className="whatsapp-browser-icon-bubble">
              <MessageSquare size={44} color="#22c55e" />
            </div>
            <h3>Conectar ao WhatsApp Web — {channelLabel}</h3>
            <p className="whatsapp-browser-desc">
              Você está acessando a plataforma via <strong>Navegador Web (Nuvem / Coolify)</strong>.
              <br />
              Por diretrizes de segurança globais do WhatsApp/Meta, o WhatsApp Web bloqueia a incorporação direta dentro de navegadores web comuns.
            </p>

            <button
              type="button"
              className="whatsapp-browser-launch-btn"
              onClick={handleOpenWindow}
            >
              <ExternalLink size={18} />
              Abrir {channelLabel} no Navegador
            </button>

            <div className="whatsapp-browser-tip-box">
              <div className="whatsapp-browser-tip-item">
                <Globe size={18} className="tip-icon" />
                <span><strong>No Coolify / Web:</strong> Você atende e envia mensagens abrindo a janela do WhatsApp com um clique no botão acima.</span>
              </div>
              <div className="whatsapp-browser-tip-item">
                <Monitor size={18} className="tip-icon" />
                <span><strong>No App Desktop (.exe):</strong> O WhatsApp Web roda 100% integrado diretamente dentro do sistema com sessões permanentes, chamadas de voz e assinatura automática de cada atendente.</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="whatsapp-web-footer-hint">
        <ShieldCheck size={14} />
        <span>
          Sessão persistente e protegida. Só precisa escanear o QR Code uma vez. Chamadas liberadas e cada colaborador envia com a sua própria assinatura!
        </span>
      </div>
    </div>
  );
};
