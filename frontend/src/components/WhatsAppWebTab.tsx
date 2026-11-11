import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  PhoneCall,
  ExternalLink,
  RotateCw,
  MessageSquare,
  Monitor,
  Globe,
  UserCheck,
  Sparkles,
  Maximize2,
  Minimize2,
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
  const [isMaximized, setIsMaximized] = useState(false);

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

  // Gerador do script V2 que intercepta Enter e Botão Enviar no WhatsApp Web (Lexical)
  const getSignatureInjectionCode = useCallback(
    (cfg: { name: string; enabled: boolean; format: 'prefix' | 'suffix' }) => {
      return `
(function() {
  window.__ATTENDANT_SIGNATURE_CONFIG = ${JSON.stringify(cfg)};
  if (window.__ATTENDANT_SIGNATURE_V2_INSTALLED) return;
  window.__ATTENDANT_SIGNATURE_V2_INSTALLED = true;
  window.__BYPASS_SIG_SEND = false;
  window.__SIG_IN_PROGRESS = false;

  function getComposer() {
    var selectors = [
      '#main footer div[contenteditable="true"][role="textbox"]',
      '#main footer div[contenteditable="true"][data-lexical-editor="true"]',
      '#main footer div[contenteditable="true"]',
      'footer div[contenteditable="true"][data-tab="10"]',
      'div[contenteditable="true"][data-tab="10"]'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && !el.closest('#side') && el.getAttribute('data-tab') !== '3') {
        return el;
      }
    }
    var lexicalAll = document.querySelectorAll('div[contenteditable="true"][data-lexical-editor="true"]');
    for (var j = 0; j < lexicalAll.length; j++) {
      var cand = lexicalAll[j];
      if (!cand.closest('#side') && cand.getAttribute('data-tab') !== '3') {
        return cand;
      }
    }
    return null;
  }

  function findSendButton(target) {
    if (!target || !target.closest) return null;
    return target.closest(
      'button[aria-label="Enviar"], ' +
      'button[aria-label="Send"], ' +
      'button[aria-label*="Enviar" i], ' +
      'button[data-tab="11"], ' +
      'span[data-icon="send"], ' +
      'span[data-icon="wds-ic-send-filled"]'
    );
  }

  function buildSignPlan(composer) {
    var config = window.__ATTENDANT_SIGNATURE_CONFIG;
    if (!config || !config.enabled || !config.name || !config.name.trim()) return null;

    var name = config.name.trim();
    var rawText = composer.innerText || composer.textContent || '';
    var cleanText = rawText.replace(/\\u200B/g, '').trim();
    if (!cleanText) return null;

    var prefix = '*[' + name + ']:* ';
    var prefixCheck = '[' + name + ']:';
    var suffixCheck = '~ Atendente ' + name;

    if (config.format === 'suffix') {
      if (cleanText.indexOf(suffixCheck) !== -1) return null;
      return { format: 'suffix', name: name, textToInsert: '_~ Atendente ' + name + '_' };
    } else {
      if (cleanText.indexOf(prefixCheck) !== -1 || cleanText.indexOf('*[') === 0) return null;
      return { format: 'prefix', name: name, textToInsert: prefix };
    }
  }

  function triggerNativeSignAndSend(e, composer) {
    if (window.__BYPASS_SIG_SEND) return;
    if (window.__SIG_IN_PROGRESS) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return;
    }

    var plan = buildSignPlan(composer);
    if (!plan) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    window.__SIG_IN_PROGRESS = true;
    setTimeout(function() { window.__SIG_IN_PROGRESS = false; }, 1500);

    try {
      composer.focus();
      var sel = window.getSelection();
      var range = document.createRange();
      var walker = document.createTreeWalker(composer, NodeFilter.SHOW_TEXT, null);

      if (plan.format === 'suffix') {
        var lastText = null;
        var n;
        while ((n = walker.nextNode())) lastText = n;
        if (lastText) {
          range.setStart(lastText, lastText.length);
          range.collapse(true);
        } else {
          range.selectNodeContents(composer);
          range.collapse(false);
        }
      } else {
        var firstText = walker.nextNode();
        if (firstText) {
          range.setStart(firstText, 0);
          range.collapse(true);
        } else {
          range.selectNodeContents(composer);
          range.collapse(true);
        }
      }

      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {}

    console.debug('__WA_SIGN_SEND__:' + JSON.stringify(plan));
  }

  window.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      var composer = getComposer();
      if (composer && (composer === e.target || composer.contains(e.target))) {
        triggerNativeSignAndSend(e, composer);
      }
    }
  }, true);

  ['pointerdown', 'mousedown', 'click'].forEach(function(evtName) {
    window.addEventListener(evtName, function(e) {
      var sendBtn = findSendButton(e.target);
      if (sendBtn) {
        var composer = getComposer();
        if (composer) {
          triggerNativeSignAndSend(e, composer);
        }
      }
    }, true);
  });
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

    let safetyTimer: any = setTimeout(() => {
      setIsLoading(false);
    }, 3500);

    const onFinish = () => {
      setIsLoading(false);
      isDomReadyRef.current = true;
      if (safetyTimer) clearTimeout(safetyTimer);
      syncSignature();
    };

    const onStart = () => {
      if (!isDomReadyRef.current) {
        setIsLoading(true);
      }
    };

    const onDomReady = () => {
      setIsLoading(false);
      isDomReadyRef.current = true;
      if (safetyTimer) clearTimeout(safetyTimer);
      syncSignature();
    };

    const onNavigateInPage = () => {
      if (isDomReadyRef.current) {
        syncSignature();
      }
    };

    const onConsoleMessage = async (event: any) => {
      const msg = String(event?.message || '');
      if (!msg.startsWith('__WA_SIGN_SEND__:')) return;
      try {
        const plan = JSON.parse(msg.slice('__WA_SIGN_SEND__:'.length));
        if (typeof node.focus === 'function') node.focus();

        if (plan.format === 'suffix' && typeof node.sendInputEvent === 'function') {
          node.sendInputEvent({ type: 'keyDown', keyCode: 'Return', modifiers: ['shift'] });
          node.sendInputEvent({ type: 'char', keyCode: 'Return', modifiers: ['shift'] });
          node.sendInputEvent({ type: 'keyUp', keyCode: 'Return', modifiers: ['shift'] });
          node.sendInputEvent({ type: 'keyDown', keyCode: 'Return', modifiers: ['shift'] });
          node.sendInputEvent({ type: 'char', keyCode: 'Return', modifiers: ['shift'] });
          node.sendInputEvent({ type: 'keyUp', keyCode: 'Return', modifiers: ['shift'] });
          await new Promise((r) => setTimeout(r, 25));
        }

        if (typeof node.insertText === 'function') {
          await node.insertText(plan.textToInsert);
        }

        await new Promise((r) => setTimeout(r, 75));

        if (typeof node.executeJavaScript === 'function') {
          await node.executeJavaScript(`
            window.__BYPASS_SIG_SEND = true;
            window.__SIG_IN_PROGRESS = false;
            (function() {
              var c = document.querySelector('#main footer div[contenteditable="true"]') ||
                      document.querySelector('div[contenteditable="true"][data-lexical-editor="true"]:not([data-tab="3"])');
              if (c) c.focus();
            })();
          `).catch(() => {});
        }

        if (typeof node.sendInputEvent === 'function') {
          node.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
          node.sendInputEvent({ type: 'char', keyCode: 'Return' });
          node.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
        }

        setTimeout(() => {
          if (typeof node.executeJavaScript === 'function') {
            node.executeJavaScript('window.__BYPASS_SIG_SEND = false;').catch(() => {});
          }
        }, 200);
      } catch (err) {
        console.warn('[WhatsApp Signature Error]', err);
        if (typeof node.executeJavaScript === 'function') {
          node.executeJavaScript('window.__SIG_IN_PROGRESS = false; window.__BYPASS_SIG_SEND = false;').catch(() => {});
        }
      }
    };

    const syncInterval = setInterval(() => {
      if (isDomReadyRef.current) {
        syncSignature();
      }
    }, 3000);

    node.addEventListener('did-finish-load', onFinish);
    node.addEventListener('did-start-loading', onStart);
    node.addEventListener('dom-ready', onDomReady);
    node.addEventListener('did-navigate-in-page', onNavigateInPage);
    node.addEventListener('console-message', onConsoleMessage);

    return () => {
      if (safetyTimer) clearTimeout(safetyTimer);
      clearInterval(syncInterval);
      node.removeEventListener('did-finish-load', onFinish);
      node.removeEventListener('did-start-loading', onStart);
      node.removeEventListener('dom-ready', onDomReady);
      node.removeEventListener('did-navigate-in-page', onNavigateInPage);
      node.removeEventListener('console-message', onConsoleMessage);
    };
  }, [channelKey, syncSignature]);

  // Preview da mensagem
  const sampleName = signatureName.trim() || 'Atendente';
  const previewText =
    signatureFormat === 'prefix'
      ? `*[${sampleName}]:* Olá!`
      : `Olá!\n_~ Atendente ${sampleName}_`;

  return (
    <div className={`whatsapp-web-container ${isMaximized ? 'maximized' : ''}`}>
      <div className="whatsapp-compact-topbar">
        <div className="whatsapp-compact-brand">
          <h3>{channelLabel}</h3>
          <span className="whatsapp-badge-live" title={description}>
            <PhoneCall size={12} />
            Voz & Vídeo
          </span>
        </div>

        <div className="whatsapp-compact-signature">
          <UserCheck size={15} className="sig-mini-icon" />
          <input
            id={`sig-name-${channelKey}`}
            type="text"
            className="signature-name-input compact"
            value={signatureName}
            onChange={handleNameChange}
            placeholder="Nome atendente..."
            title="Nome do colaborador que aparecerá nas mensagens"
            maxLength={30}
          />

          <select
            id={`sig-format-${channelKey}`}
            className="signature-format-select compact"
            value={signatureFormat}
            onChange={handleFormatChange}
            title="Formato da assinatura"
          >
            <option value="prefix">*[Nome]:* Mensagem</option>
            <option value="suffix">Mensagem ~ Atendente</option>
          </select>

          <label className="signature-toggle-label compact" title="Ativar/Desativar assinatura automática">
            <input
              type="checkbox"
              checked={signatureEnabled}
              onChange={handleToggleEnabled}
            />
            <span>Assinar</span>
          </label>

          <div
            className={`preview-bubble compact ${!signatureEnabled ? 'disabled' : ''}`}
            title="Como o cliente verá sua mensagem"
          >
            <Sparkles size={11} />
            <span>{signatureEnabled ? previewText : 'Sem assinatura'}</span>
          </div>
        </div>

        <div className="whatsapp-web-actions compact">
          {isElectron && (
            <button
              type="button"
              className="whatsapp-web-btn compact"
              onClick={handleReload}
              title="Recarregar WhatsApp"
            >
              <RotateCw size={14} />
            </button>
          )}

          <button
            type="button"
            className="whatsapp-web-btn compact"
            onClick={() => setIsMaximized((prev) => !prev)}
            title={isMaximized ? 'Restaurar tamanho normal' : 'Expandir WhatsApp em Tela Cheia'}
          >
            {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span>{isMaximized ? 'Reduzir' : 'Tela Cheia'}</span>
          </button>

          <button
            type="button"
            className="whatsapp-web-btn primary compact"
            onClick={handleOpenWindow}
            title="Abrir em janela separada"
          >
            <ExternalLink size={14} />
            <span>Janela Separada</span>
          </button>
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
                flex: '1 1 0%',
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
    </div>
  );
};
