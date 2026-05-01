import makeWASocket, {
    Browsers,
    DisconnectReason,
    extractMessageContent,
    fetchLatestBaileysVersion,
    getContentType,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import pino from 'pino';
import QRCode from 'qrcode';
import { io } from '../index';

const prisma = new PrismaClient();

function normalizeWhatsappPhone(jid: string) {
    return String(jid || '').replace(/@s\.whatsapp\.net$/, '').replace(/\D/g, '');
}

function normalizeWhatsappJid(jid: string) {
    const raw = String(jid || '').trim();
    if (!raw) return '';
    if (raw.includes('@')) return raw;

    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length >= 14 && !digits.startsWith('55')) {
        return `${digits}@lid`;
    }
    return `${digits}@s.whatsapp.net`;
}

function isRealWhatsappJid(jid: string) {
    return String(jid || '').endsWith('@s.whatsapp.net');
}

function pickRealWhatsappJid(...values: unknown[]) {
    for (const value of values) {
        const raw = String(value || '').trim();
        if (!raw.includes('@s.whatsapp.net')) continue;
        const jid = normalizeWhatsappJid(raw);
        if (isRealWhatsappJid(jid)) return jid;
    }
    return '';
}

function toDisplayPhone(jidOrPhone: string) {
    const digits = normalizeWhatsappPhone(jidOrPhone);
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
        return digits.slice(2);
    }
    return digits;
}

function buildWhatsappJid(value: string) {
    const raw = String(value || '').trim();
    if (!raw) {
        throw new Error('Contato sem telefone/WhatsApp.');
    }

    if (raw.includes('@')) {
        return raw;
    }

    const digits = raw.replace(/\D/g, '');
    if (!digits) {
        throw new Error('Contato sem telefone valido.');
    }

    // IDs @lid do WhatsApp costumam chegar como numeros longos sem codigo do pais.
    if (digits.length >= 14 && !digits.startsWith('55')) {
        return `${digits}@lid`;
    }

    const withCountry = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
    return `${withCountry}@s.whatsapp.net`;
}

function getWhatsappMessageText(message: any): string {
    const content: any = extractMessageContent(message || {});
    const type = getContentType(content);
    const body: any = type ? content?.[type] : null;

    if (!content || !type) return '';

    if (typeof content.conversation === 'string') return content.conversation;
    if (typeof body === 'string') return body;

    const candidates = [
        body?.text,
        body?.caption,
        body?.selectedDisplayText,
        body?.title,
        body?.description,
        body?.name,
        body?.displayName,
        body?.singleSelectReply?.selectedRowId,
        body?.selectedButtonId,
        body?.hydratedTemplateButtonReply?.hydratedButton?.displayText,
    ];

    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }

    if (body?.nativeFlowResponseMessage?.paramsJson) {
        try {
            const params = JSON.parse(body.nativeFlowResponseMessage.paramsJson);
            return params?.display_text || params?.title || params?.id || '';
        } catch (_) {}
    }

    const mediaLabels: Record<string, string> = {
        imageMessage: '[Imagem recebida]',
        videoMessage: '[Video recebido]',
        audioMessage: '[Audio recebido]',
        documentMessage: '[Documento recebido]',
        stickerMessage: '[Figurinha recebida]',
        contactMessage: '[Contato recebido]',
        locationMessage: '[Localizacao recebida]',
    };

    return mediaLabels[type] || '[Mensagem recebida]';
}

async function upsertClientFromWhatsapp(params: {
    jid: string;
    realJid?: string;
    name?: string;
    text?: string;
}) {
    const technicalJid = normalizeWhatsappJid(params.jid);
    const realJid = normalizeWhatsappJid(params.realJid || '');
    const realPhone = isRealWhatsappJid(realJid) ? toDisplayPhone(realJid) : '';
    const technicalPhone = normalizeWhatsappPhone(technicalJid);
    const fallbackPhone = isRealWhatsappJid(technicalJid) ? toDisplayPhone(technicalJid) : technicalPhone;
    const phone = realPhone || fallbackPhone;

    if (!phone) return null;

    const lookupPhones = [phone, technicalPhone, normalizeWhatsappPhone(realJid)]
        .filter(Boolean)
        .filter((item, index, list) => list.indexOf(item) === index);

    let existing = realPhone
        ? await prisma.client.findUnique({ where: { phone: realPhone } })
        : null;

    if (!existing) {
        existing = await prisma.client.findFirst({
            where: {
                OR: [
                    { whatsappJid: technicalJid },
                    ...(realJid ? [{ whatsappJid: realJid }] : []),
                    ...lookupPhones.map(item => ({ phone: item })),
                ],
            },
        });
    }

    if (existing && realPhone && technicalPhone && technicalPhone !== realPhone) {
        await prisma.client.deleteMany({
            where: {
                NOT: { id: existing.id },
                OR: [
                    { phone: technicalPhone },
                    { whatsappJid: technicalJid },
                ],
            },
        });
    }

    const updateData = {
        name: params.name || existing?.name || `Lead ${phone}`,
        phone,
        whatsappJid: technicalJid || realJid || existing?.whatsappJid,
        status: 'NOVO',
        history: params.text || existing?.history,
    };

    if (existing) {
        return prisma.client.update({
            where: { id: existing.id },
            data: updateData,
        });
    }

    return prisma.client.create({
        data: updateData,
    });
}

class WhatsAppService {
    public sock: any = null;
    public qr: string | null = null;
    public status: 'connecting' | 'connected' | 'disconnected' | 'qr' = 'disconnected';
    public lastError: string | null = null;
    private initializing = false;
    private generation = 0;
    private activeSessionPath = '';
    private readonly sessionRoot = path.join(__dirname, '../../data/whatsapp-sessions');
    private readonly activeSessionMarker = path.join(this.sessionRoot, 'active-session.txt');

    async init() {
        if (this.initializing) return;
        this.initializing = true;
        const generation = ++this.generation;
        this.status = 'connecting';
        this.lastError = null;
        io.emit('whatsapp_status', { status: 'connecting' });

        try {
            this.closeSocket();

            const sessionPath = await this.getActiveSessionPath();
            const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
            const { version } = await fetchLatestBaileysVersion();

            this.sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: true,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
                },
                browser: Browsers.ubuntu('Chrome'),
                syncFullHistory: false,
                markOnlineOnConnect: false,
            });

            this.sock.ev.on('connection.update', async (update: any) => {
                if (generation !== this.generation) return;
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    this.qr = await QRCode.toDataURL(qr);
                    this.status = 'qr';
                    io.emit('whatsapp_status', { status: 'qr', qr: this.qr });
                }

                if (connection === 'close') {
                    const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
                    const restartRequired = statusCode === DisconnectReason.restartRequired;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                    this.status = restartRequired ? 'connecting' : 'disconnected';
                    this.qr = null;
                    this.lastError = restartRequired
                        ? 'WhatsApp pediu reinicio da conexao para concluir o pareamento.'
                        : `Conexao fechada pelo WhatsApp. Codigo: ${statusCode || 'desconhecido'}`;
                    io.emit('whatsapp_status', { status: this.status });
                    console.log(`WhatsApp connection closed. statusCode=${statusCode || 'unknown'} shouldReconnect=${shouldReconnect}`);

                    if (statusCode === DisconnectReason.loggedOut) {
                        await this.rotateSession();
                        this.lastError = 'Sessao do WhatsApp expirada. Clique em Tentar Novamente para gerar um QR Code novo.';
                    }

                    if (shouldReconnect) {
                        setTimeout(() => {
                            if (generation !== this.generation) return;
                            this.init().catch((error) => console.error('WhatsApp reconnect error:', error));
                        }, restartRequired ? 500 : 3000);
                    }
                } else if (connection === 'open') {
                    this.status = 'connected';
                    this.qr = null;
                    this.lastError = null;
                    io.emit('whatsapp_status', { status: 'connected' });
                    console.log('WhatsApp connection opened');
                }
            });

            this.sock.ev.on('creds.update', saveCreds);

            this.sock.ev.on('chats.phoneNumberShare', async ({ lid, jid }: { lid: string; jid: string }) => {
                try {
                    const client = await upsertClientFromWhatsapp({
                        jid: lid,
                        realJid: jid,
                    });
                    if (client) {
                        io.emit('client_upserted', client);
                    }
                } catch (error) {
                    console.error('Erro ao sincronizar telefone real do WhatsApp:', error);
                }
            });

            this.sock.ev.on('contacts.upsert', async (contacts: any[]) => {
                for (const contact of contacts) {
                    try {
                        const contactJid = normalizeWhatsappJid(contact.id);
                        const lidJid = normalizeWhatsappJid(contact.lid);
                        const realJid = isRealWhatsappJid(contactJid) ? contactJid : '';
                        const technicalJid = lidJid || contactJid;

                        if (!technicalJid || !realJid || technicalJid === realJid) continue;

                        const client = await upsertClientFromWhatsapp({
                            jid: technicalJid,
                            realJid,
                            name: contact.name || contact.notify || contact.verifiedName,
                        });
                        if (client) {
                            io.emit('client_upserted', client);
                        }
                    } catch (error) {
                        console.error('Erro ao atualizar contato do WhatsApp:', error);
                    }
                }
            });

            this.sock.ev.on('messages.upsert', async (m: any) => {
                if (m.type !== 'notify') return;

                for (const msg of m.messages) {
                    if (msg.key.fromMe) continue;

                    const sender = String(msg.key.remoteJid || '');
                    const realJid = pickRealWhatsappJid(
                        sender,
                        msg.key?.participant,
                        msg.participant
                    );
                    const text = getWhatsappMessageText(msg.message);
                    const displayPhone = toDisplayPhone(realJid || sender);
                    const pushName = msg.pushName || `Lead ${displayPhone}`;

                    if (sender) {
                        const client = await upsertClientFromWhatsapp({
                            jid: sender,
                            realJid,
                            name: pushName,
                            text,
                        });

                        if (client) {
                            io.emit('client_upserted', client);
                        }

                        io.emit('incoming_message', {
                            from: sender,
                            clientId: client?.id,
                            phone: client?.phone,
                            whatsappJid: client?.whatsappJid,
                            text,
                            timestamp: msg.messageTimestamp,
                            pushName,
                        });
                    }
                }
            });
        } catch (error) {
            console.error('WhatsApp Init Error:', error);
            this.status = 'disconnected';
            this.qr = null;
            this.lastError = error instanceof Error ? error.message : String(error);
            io.emit('whatsapp_status', { status: 'disconnected' });
        } finally {
            this.initializing = false;
        }
    }

    private closeSocket() {
        try {
            this.sock?.end?.();
        } catch (error) {
            console.error('Erro ao encerrar socket do WhatsApp:', error);
        }
    }

    private async getActiveSessionPath() {
        if (this.activeSessionPath) {
            return this.activeSessionPath;
        }

        await fs.mkdir(this.sessionRoot, { recursive: true });

        try {
            const sessionName = (await fs.readFile(this.activeSessionMarker, 'utf8')).trim();
            if (sessionName) {
                this.activeSessionPath = path.join(this.sessionRoot, sessionName);
                return this.activeSessionPath;
            }
        } catch (_) {}

        this.activeSessionPath = path.join(this.sessionRoot, 'current');
        await fs.writeFile(this.activeSessionMarker, 'current', 'utf8');
        return this.activeSessionPath;
    }

    private async rotateSession() {
        await fs.mkdir(this.sessionRoot, { recursive: true });
        const sessionName = `session-${Date.now()}`;
        this.activeSessionPath = path.join(this.sessionRoot, sessionName);
        await fs.writeFile(this.activeSessionMarker, sessionName, 'utf8');
    }

    async reconnect(forceNewSession = false) {
        this.generation += 1;
        this.closeSocket();
        this.sock = null;
        this.qr = null;
        this.lastError = null;
        this.initializing = false;

        if (forceNewSession) {
            await this.rotateSession();
        }

        await this.init();
    }

    async sendMessage(to: string, text: string) {
        if (!this.sock || this.status !== 'connected') {
            throw new Error('WhatsApp nao conectado');
        }

        const jid = buildWhatsappJid(to);
        const exists = await this.sock.onWhatsApp(jid).catch(() => []);
        if (jid.endsWith('@s.whatsapp.net') && Array.isArray(exists) && exists.length > 0 && exists[0]?.exists === false) {
            throw new Error('Este telefone nao possui WhatsApp ou nao foi encontrado.');
        }

        await this.sock.sendMessage(jid, { text });
        io.emit('message_sent', { to: jid, text, timestamp: Math.floor(Date.now() / 1000) });
    }
}

export const whatsappService = new WhatsAppService();
