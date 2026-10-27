# Extensão Chrome - Agente de Busca de Autopeças (AutoPeças Hub)

Esta extensão substitui os antigos scrapers locais baseados em Playwright que travavam e eram bloqueados por **Cloudflare**, **Turnstile** e **captchas**.

---

## 🚀 Como Funciona

1. **Sessão Real e Sem Bloqueios**:
   - O lojista faz login normalmente no navegador Chrome nos portais dos seus fornecedores (ex: DPK, Real Moto Peças, Kaizen, Comdip, SAV/Furação, etc.).
   - A extensão roda dentro do próprio Chrome com as credenciais, cookies e IP residencial/comercial legítimo do lojista.
   - O Cloudflare **não bloqueia**, pois o tráfego é 100% humano e autêntico.

2. **Integração com o Sistema (Local ou Coolify)**:
   - A extensão se conecta via API com o seu backend (`http://localhost:5000` em testes locais ou a URL do seu Coolify).
   - Quando uma cotação é solicitada no sistema, o backend envia a tarefa para a extensão, que executa a busca instantaneamente nos sites dos fornecedores e devolve os preços e estoques em tempo real para o painel.

---

## 📦 Como Instalar no Google Chrome

1. Abra o **Google Chrome**.
2. Digite na barra de endereços: `chrome://extensions` e pressione **Enter**.
3. No canto superior direito, ative a chave **"Modo do desenvolvedor"** (Developer mode).
4. Clique no botão **"Carregar sem compactação"** (Load unpacked) no canto superior esquerdo.
5. Selecione a pasta deste projeto:
   `C:\Users\mauri\OneDrive\Desktop\centroautomotivo\chrome-extension`
6. Pronto! O ícone do **AutoPeças Hub** aparecerá na barra de ferramentas do seu Chrome.

---

## ⚙️ Configuração

1. Clique no ícone da extensão no Chrome para abrir o popup.
2. Defina os campos:
   - **URL do Backend**:
     - Para testes locais: `http://localhost:5000`
     - Para produção no Coolify: `https://seu-dominio-coolify.com`
   - **Token do Agente**: `autopecas-agent-token` (ou o token configurado no `.env` do backend).
3. Clique em **"Salvar e Conectar"**. O status ficará verde: **Online**.

---

## 🧪 Testando Diretamente no Popup da Extensão

Você pode testar a busca antes mesmo de abrir o sistema:
1. Abra o popup da extensão e clique na aba **"Testar Busca"**.
2. Escolha o fornecedor (ex: *Real Moto Peças*, *Kaizen*, etc.).
3. Digite o código de uma peça (ex: `PH5949` ou `Filtro`) e clique em **"Testar Busca no Navegador"**.
4. Os resultados com nome, preço e disponibilidade aparecerão imediatamente!
