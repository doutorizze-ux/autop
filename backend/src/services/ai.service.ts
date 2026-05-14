import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class AIService {
    private static async getClient() {
        // Tentar pegar do banco primeiro
        const config = await prisma.systemConfig.findUnique({ where: { id: 'system_settings' } });
        const apiKey = config?.aiKey || process.env.ANTHROPIC_API_KEY;

        if (!apiKey || apiKey === 'sk-ant-...') {
            throw new Error('Anthropic API Key não configurada');
        }

        return new Anthropic({ apiKey });
    }

    /**
     * Interpreta a mensagem do cliente para extrair peças e veículos
     */
    static async interpretMessage(message: string) {
        try {
            const anthropic = await this.getClient();
            const response = await anthropic.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 1024,
                messages: [{ 
                    role: "user", 
                    content: `Abaixo está uma mensagem de um cliente em uma loja de autopeças. 
                    Extraia todas as peças mencionadas e seus respectivos veículos.
                    Para cada item, crie uma 'searchQuery' técnica usando o caractere '%' entre as palavras-chave (ex: 'AMORTECEDOR % CORSA % 2010').
                    Essa técnica ajuda a filtrar melhor nos sites dos fornecedores.
                    Responda APENAS em formato JSON como no exemplo: 
                    {"parts": [{"name": "Amortecedor Corsa 2010", "searchQuery": "AMORTECEDOR % CORSA % 2010"}]}
                    Mensagem: "${message}"` 
                }],
            });

            const content = response.content[0].type === 'text' ? response.content[0].text : '';
            const data = JSON.parse(content);
            return data;
        } catch (err: any) {
            console.error('AI Error:', err.message);
            return { parts: [], error: err.message || 'Falha ao processar IA' };
        }
    }

    /**
     * Sugere uma resposta baseada na cotação encontrada
     */
    static async suggestResponse(product: string, quoteResults: any[]) {
        try {
            const anthropic = await this.getClient();
            const bestPrice = quoteResults.length > 0 ? quoteResults[0].price : 'N/A';
            const cleanProduct = product.replace(/%/g, '').replace(/\s+/g, ' ').trim();
            
            const response = await anthropic.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 1024,
                messages: [{ 
                    role: "user", 
                    content: `Crie uma resposta curta e profissional de WhatsApp para um cliente que pediu ${cleanProduct}. 
                    Encontramos o melhor preço de R$ ${bestPrice}. 
                    Diga que temos a pronta entrega e pergunte se quer fechar.` 
                }],
            });

            return response.content[0].type === 'text' ? response.content[0].text : '';
        } catch (err) {
            return "Olá! Encontramos a peça que você precisa com um ótimo preço. Como podemos prosseguir?";
        }
    }

    /**
     * Sugere uma resposta para o atendimento WhatsApp sem enviar automaticamente.
     */
    static async suggestWhatsappReply(params: {
        clientName?: string;
        trainingText?: string;
        menuText?: string;
        messages: Array<{
            text?: string;
            fromMe?: boolean;
            timestamp?: number;
            mediaType?: string;
        }>;
    }) {
        try {
            const anthropic = await this.getClient();
            const clientName = String(params.clientName || 'cliente').trim() || 'cliente';
            const trainingText = String(params.trainingText || '').trim();
            const menuText = String(params.menuText || '').trim();
            const history = (params.messages || [])
                .slice(-12)
                .map((message) => {
                    const author = message.fromMe ? 'Loja' : clientName;
                    const text = String(message.text || '').trim();
                    const media = message.mediaType ? ` [midia: ${message.mediaType}]` : '';
                    return `${author}: ${text || '[sem texto]'}${media}`;
                })
                .join('\n');

            const response = await anthropic.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 300,
                messages: [{
                    role: "user",
                    content: `Voce e um assistente de atendimento de uma loja de autopecas.
Crie UMA resposta curta, natural e profissional para WhatsApp, em portugues do Brasil.

Regras:
- Nao envie saudacao longa se a conversa ja estiver em andamento.
- Nao invente preco, estoque, prazo, marca, garantia ou desconto.
- Se faltar codigo, modelo, ano, motor, lado ou medida da peca, peca objetivamente o dado que falta.
- Se o cliente mandou audio, imagem ou video e o contexto nao estiver claro, diga que recebeu e vai verificar ou peca uma informacao objetiva.
- Nao prometa que encontrou a peca se isso nao apareceu no historico.
- Responda apenas com o texto da mensagem, sem aspas e sem explicacoes.

Treinamento da loja:
${trainingText || 'Sem treinamento especifico cadastrado.'}

Menu oficial do atendimento:
${menuText || 'Sem menu cadastrado.'}

Historico:
${history || 'Sem mensagens anteriores.'}`
                }],
            });

            return response.content[0].type === 'text' ? response.content[0].text.trim() : '';
        } catch (err: any) {
            console.error('AI WhatsApp Suggestion Error:', err.message);
            throw err;
        }
    }
}
