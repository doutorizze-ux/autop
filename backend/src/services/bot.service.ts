import { PrismaClient } from '@prisma/client';
import { AIService } from './ai.service';

const prisma = new PrismaClient();

const defaultMenuText = [
    'Ola! Sou o assistente virtual da loja.',
    'Escolha uma opcao:',
    '1 - Cotar uma peca',
    '2 - Informar modelo/ano do veiculo',
    '3 - Falar com atendente',
].join('\n');

const defaultHandoffMessage = 'Certo, vou chamar um atendente para continuar seu atendimento.';
const defaultFallbackText = 'Recebi sua mensagem. Vou verificar e ja te respondo.';
const defaultHandoffKeywords = '3,atendente,atendendente,atendimento,humano,pessoa,falar com atendente,vendedor';

type BotConfigInput = {
    enabled?: boolean;
    trainingText?: string;
    menuText?: string;
    handoffKeywords?: string;
    handoffMessage?: string;
    fallbackText?: string;
};

type BotReplyInput = {
    userId: string;
    clientName?: string;
    clientStatus?: string;
    incomingText?: string;
    messages: Array<{
        text?: string;
        fromMe?: boolean;
        timestamp?: number;
        mediaType?: string;
    }>;
};

function normalizeText(value: string) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function serializeConfig(config: any) {
    return {
        id: config.id,
        userId: config.userId,
        enabled: !!config.enabled,
        trainingText: config.trainingText || '',
        menuText: config.menuText || defaultMenuText,
        handoffKeywords: config.handoffKeywords || defaultHandoffKeywords,
        handoffMessage: config.handoffMessage || defaultHandoffMessage,
        fallbackText: config.fallbackText || defaultFallbackText,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
    };
}

export class BotService {
    static async getConfig(userId: string) {
        if (!userId) {
            throw new Error('Usuario nao identificado para configurar o bot.');
        }

        let config = await prisma.botConfig.findUnique({ where: { userId } });

        if (!config) {
            config = await prisma.botConfig.create({
                data: {
                    userId,
                    enabled: false,
                    menuText: defaultMenuText,
                    handoffKeywords: defaultHandoffKeywords,
                    handoffMessage: defaultHandoffMessage,
                    fallbackText: defaultFallbackText,
                },
            });
        }

        return serializeConfig(config);
    }

    static async updateConfig(userId: string, data: BotConfigInput) {
        const config = await this.getConfig(userId);
        const updated = await prisma.botConfig.update({
            where: { userId },
            data: {
                enabled: !!data.enabled,
                trainingText: String(data.trainingText ?? config.trainingText ?? '').trim(),
                menuText: String(data.menuText ?? config.menuText ?? '').trim() || defaultMenuText,
                handoffKeywords: String(data.handoffKeywords ?? config.handoffKeywords ?? '').trim() || defaultHandoffKeywords,
                handoffMessage: String(data.handoffMessage ?? config.handoffMessage ?? '').trim() || defaultHandoffMessage,
                fallbackText: String(data.fallbackText ?? config.fallbackText ?? '').trim() || defaultFallbackText,
            },
        });

        return serializeConfig(updated);
    }

    static isHandoffRequest(text: string, handoffKeywords: string) {
        const normalizedText = normalizeText(text);
        if (!normalizedText) return false;

        return `${handoffKeywords || defaultHandoffKeywords},atendendente,atendimento,falar com alguem`
            .split(',')
            .map((keyword) => normalizeText(keyword))
            .filter(Boolean)
            .some((keyword) => {
                if (/^\d+$/.test(keyword)) {
                    return normalizedText === keyword;
                }

                return normalizedText.includes(keyword);
            });
    }

    static isMenuRequest(text: string) {
        const normalizedText = normalizeText(text);
        return ['menu', 'opcoes', 'opcao', 'inicio', 'começar', 'comecar'].some((keyword) =>
            normalizedText.includes(normalizeText(keyword))
        );
    }

    static getFixedMenuOptionReply(text: string) {
        const normalizedText = normalizeText(text);

        if (normalizedText === '1') {
            return 'Claro. Me envie o codigo da peca ou o nome da peca com modelo, ano e motor do veiculo que eu ja verifico para voce.';
        }

        if (normalizedText === '2') {
            return 'Perfeito. Me informe modelo, ano, motor e, se tiver, placa ou chassi. Com esses dados fica mais facil localizar a peca correta.';
        }

        return '';
    }

    static async buildReply(input: BotReplyInput): Promise<
        | { action: 'none' }
        | { action: 'handoff'; message: string }
        | { action: 'reply'; message: string }
    > {
        const config = await this.getConfig(input.userId);

        if (!config.enabled) {
            return { action: 'none' };
        }

        if (input.clientStatus === 'AGUARDANDO_ATENDENTE') {
            return { action: 'none' };
        }

        const incomingText = String(input.incomingText || '').trim();
        const hasStoreReply = input.messages.some((message) => !!message.fromMe);
        const fixedMenuOptionReply = this.getFixedMenuOptionReply(incomingText);

        if (this.isHandoffRequest(incomingText, config.handoffKeywords)) {
            return {
                action: 'handoff',
                message: config.handoffMessage,
            };
        }

        if (fixedMenuOptionReply) {
            return {
                action: 'reply',
                message: fixedMenuOptionReply,
            };
        }

        if (!hasStoreReply || this.isMenuRequest(incomingText)) {
            return {
                action: 'reply',
                message: config.menuText,
            };
        }

        try {
            const suggestion = await AIService.suggestWhatsappReply({
                clientName: input.clientName,
                trainingText: config.trainingText,
                menuText: config.menuText,
                messages: input.messages,
            });

            return {
                action: 'reply',
                message: suggestion || config.fallbackText,
            };
        } catch (_) {
            return {
                action: 'reply',
                message: config.fallbackText,
            };
        }
    }
}
