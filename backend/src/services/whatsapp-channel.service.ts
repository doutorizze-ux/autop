export type WhatsappChannelKind = 'attendance' | 'quote';

export type WhatsappChannelDefinition = {
    key: string;
    label: string;
    kind: WhatsappChannelKind;
    description: string;
};

export const defaultWhatsappChannelKey = 'atendimento-1';
export const quoteWhatsappChannelKey = 'cotacao';

const whatsappChannels: WhatsappChannelDefinition[] = [
    {
        key: defaultWhatsappChannelKey,
        label: 'Atendimento 1',
        kind: 'attendance',
        description: 'WhatsApp principal de atendimento aos clientes.',
    },
    {
        key: 'atendimento-2',
        label: 'Atendimento 2',
        kind: 'attendance',
        description: 'Segundo WhatsApp de atendimento aos clientes.',
    },
    {
        key: quoteWhatsappChannelKey,
        label: 'Cotacao',
        kind: 'quote',
        description: 'WhatsApp reservado para cotacoes com fornecedores.',
    },
];

export function listWhatsappChannels() {
    return whatsappChannels.map((channel) => ({ ...channel }));
}

export function normalizeWhatsappChannelKey(value?: string | null) {
    const rawValue = String(value || '').trim().toLowerCase();
    const channel = whatsappChannels.find((item) => item.key === rawValue);
    return channel?.key || defaultWhatsappChannelKey;
}

export function getWhatsappChannel(value?: string | null) {
    const channelKey = normalizeWhatsappChannelKey(value);
    return whatsappChannels.find((channel) => channel.key === channelKey) || whatsappChannels[0];
}
