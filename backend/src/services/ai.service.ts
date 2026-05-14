import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type WhatsappReplyParams = {
    clientName?: string;
    trainingText?: string;
    menuText?: string;
    messages: Array<{
        text?: string;
        fromMe?: boolean;
        timestamp?: number;
        mediaType?: string;
    }>;
};

export class AIService {
    static isBillingOrCreditError(error: any) {
        const raw = JSON.stringify(error?.error || error?.message || error || '').toLowerCase();
        return raw.includes('credit balance') || raw.includes('billing') || raw.includes('purchase credits');
    }

    static getFriendlyErrorMessage(error: any) {
        const raw = String(error?.message || '').toLowerCase();

        if (this.isBillingOrCreditError(error)) {
            return 'A IA da Anthropic esta sem credito. Recarregue os creditos ou atualize a chave em Configuracoes > Integracao IA.';
        }

        if (raw.includes('api key') || raw.includes('key nao configurada') || raw.includes('key nÃ£o configurada')) {
            return 'A chave da IA nao esta configurada. Ajuste em Configuracoes > Integracao IA.';
        }

        return 'Nao foi possivel gerar a resposta da IA agora. Tente novamente em instantes.';
    }

    private static normalizeLocalText(value: unknown) {
        return String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private static getLatestCustomerMessage(messages: WhatsappReplyParams['messages']) {
        return [...(messages || [])].reverse().find((message) => !message.fromMe) || null;
    }

    private static findTrainingLine(trainingText: string, incomingText: string) {
        const normalizedIncoming = this.normalizeLocalText(incomingText);
        if (!normalizedIncoming) return '';

        const groups = [
            ['horario', 'funcionamento', 'abre', 'fecha'],
            ['endereco', 'localizacao', 'onde fica', 'rua', 'bairro'],
            ['pagamento', 'pix', 'cartao', 'credito', 'debito', 'parcel'],
            ['entrega', 'delivery', 'motoboy', 'frete'],
            ['garantia', 'troca', 'devolucao'],
            ['desconto', 'melhor preco', 'negociar'],
        ];

        const lines = String(trainingText || '')
            .split(/\r?\n|;/)
            .map((line) => line.trim())
            .filter(Boolean);

        for (const group of groups) {
            const askedAboutGroup = group.some((keyword) => normalizedIncoming.includes(keyword));
            if (!askedAboutGroup) continue;

            const matchingLine = lines.find((line) => {
                const normalizedLine = this.normalizeLocalText(line);
                return group.some((keyword) => normalizedLine.includes(keyword));
            });

            if (matchingLine) {
                return matchingLine;
            }
        }

        return '';
    }

    static buildLocalWhatsappReply(params: WhatsappReplyParams) {
        const latestMessage = this.getLatestCustomerMessage(params.messages);
        const incomingText = String(latestMessage?.text || '').trim();
        const normalizedText = this.normalizeLocalText(incomingText);
        const mediaType = latestMessage?.mediaType || '';
        const menuText = String(params.menuText || '').trim();
        const trainingLine = this.findTrainingLine(String(params.trainingText || ''), incomingText);

        if (trainingLine) {
            return trainingLine;
        }

        if (normalizedText === '1') {
            return 'Claro. Me envie o codigo da peca ou o nome da peca com modelo, ano e motor do veiculo que eu ja verifico para voce.';
        }

        if (normalizedText === '2') {
            return 'Perfeito. Me informe modelo, ano, motor e, se tiver, placa ou chassi. Com esses dados fica mais facil localizar a peca correta.';
        }

        if (normalizedText === '3' || normalizedText.includes('atendente') || normalizedText.includes('humano')) {
            return 'Certo, vou chamar um atendente para continuar seu atendimento.';
        }

        if (['menu', 'opcoes', 'opcao', 'inicio', 'comecar'].some((keyword) => normalizedText.includes(keyword))) {
            return menuText || 'Escolha uma opcao:\n1 - Cotar uma peca\n2 - Informar modelo/ano do veiculo\n3 - Falar com atendente';
        }

        if (mediaType === 'audio') {
            return 'Recebi seu audio. Para agilizar, pode me enviar tambem o codigo da peca ou modelo, ano e motor do veiculo?';
        }

        if (mediaType === 'image' || mediaType === 'video') {
            return 'Recebi a imagem. Pode me confirmar qual peca voce precisa e o modelo, ano e motor do veiculo?';
        }

        if (normalizedText.includes('preco') || normalizedText.includes('valor') || normalizedText.includes('cotar') || normalizedText.includes('orcamento')) {
            return 'Consigo cotar para voce. Me envie o codigo da peca ou o nome da peca com modelo, ano e motor do veiculo.';
        }

        if (normalizedText.includes('codigo') || normalizedText.includes('peca') || normalizedText.includes('filtro') || normalizedText.includes('pastilha') || normalizedText.includes('amortecedor')) {
            return 'Certo. Para confirmar certinho, me envie tambem modelo, ano e motor do veiculo.';
        }

        if (normalizedText.includes('obrigado') || normalizedText.includes('obrigada') || normalizedText.includes('valeu')) {
            return 'Eu que agradeco. Se precisar de mais alguma peca, e so me chamar.';
        }

        if (normalizedText === 'oi' || normalizedText === 'ola' || normalizedText.includes('bom dia') || normalizedText.includes('boa tarde') || normalizedText.includes('boa noite')) {
            return menuText || 'Ola! Sou o assistente virtual da loja.\nEscolha uma opcao:\n1 - Cotar uma peca\n2 - Informar modelo/ano do veiculo\n3 - Falar com atendente';
        }

        return 'Certo. Para eu te ajudar melhor, me envie o codigo da peca ou o nome da peca com modelo, ano e motor do veiculo.';
    }

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
    static async suggestWhatsappReply(params: WhatsappReplyParams) {
        return this.buildLocalWhatsappReply(params);
    }
}
