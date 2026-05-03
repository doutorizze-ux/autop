import makeWASocket, {
    Browsers,
    DisconnectReason,
    downloadContentFromMessage,
    extractMessageContent,
    fetchLatestBaileysVersion,
    getContentType,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import pino from 'pino';
import QRCode from 'qrcode';
import { io } from '../index';

const prisma = new PrismaClient();
const whatsappIdentityMapPath = path.join(__dirname, '../../data/whatsapp-identity-map.json');
const whatsappIdentityCache = new Map<string, string>();
let whatsappIdentityCacheLoaded = false;

type StoredChatMessage = {
    text: string;
    fromMe: boolean;
    timestamp: number;
    system?: boolean;
    media?: StoredChatMedia | null;
};

type StoredChatMedia = {
    type: 'image' | 'video' | 'audio' | 'document' | 'sticker';
    url: string;
    mimetype?: string;
    fileName?: string;
};

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

function isLidWhatsappJid(jid: string) {
    return String(jid || '').endsWith('@lid');
}

function isDirectChatJid(jid: string) {
    const raw = String(jid || '');
    if (!raw) return false;
    if (raw === 'status@broadcast' || raw.endsWith('@broadcast')) return false;
    if (raw.endsWith('@g.us') || raw.endsWith('@newsletter')) return false;
    return raw.endsWith('@s.whatsapp.net') || raw.endsWith('@lid');
}

function isStatusBroadcastJid(jid: string) {
    return String(jid || '') === 'status@broadcast';
}

function isUnresolvedPhone(value: string) {
    const raw = String(value || '');
    const digits = raw.replace(/\D/g, '');
    return raw.endsWith('@lid') || (digits.length >= 14 && !digits.startsWith('55'));
}

function isResolvedPhone(value: string) {
    const digits = String(value || '').replace(/\D/g, '');
    return (digits.length === 10 || digits.length === 11) || (digits.startsWith('55') && (digits.length === 12 || digits.length === 13));
}

function normalizeContactName(value: string) {
    return String(value || '').trim().toLowerCase();
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

async function loadWhatsappIdentityCache() {
    if (whatsappIdentityCacheLoaded) return;
    whatsappIdentityCacheLoaded = true;

    try {
        const raw = await fs.readFile(whatsappIdentityMapPath, 'utf8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
            for (const [lid, realJid] of Object.entries(data)) {
                const normalizedLid = normalizeWhatsappJid(String(lid));
                const normalizedRealJid = normalizeWhatsappJid(String(realJid));
                if (isLidWhatsappJid(normalizedLid) && isRealWhatsappJid(normalizedRealJid)) {
                    whatsappIdentityCache.set(normalizedLid, normalizedRealJid);
                }
            }
        }
    } catch (_) {}
}

async function saveWhatsappIdentityCache() {
    await fs.mkdir(path.dirname(whatsappIdentityMapPath), { recursive: true });
    await fs.writeFile(
        whatsappIdentityMapPath,
        JSON.stringify(Object.fromEntries(whatsappIdentityCache.entries()), null, 2),
        'utf8'
    );
}

async function rememberWhatsappIdentity(lid?: string, realJid?: string) {
    const normalizedLid = normalizeWhatsappJid(lid || '');
    const normalizedRealJid = normalizeWhatsappJid(realJid || '');

    if (!isLidWhatsappJid(normalizedLid) || !isRealWhatsappJid(normalizedRealJid)) return '';

    await loadWhatsappIdentityCache();
    if (whatsappIdentityCache.get(normalizedLid) !== normalizedRealJid) {
        whatsappIdentityCache.set(normalizedLid, normalizedRealJid);
        await saveWhatsappIdentityCache();
    }

    return normalizedRealJid;
}

async function resolveRealJidFromIdentityMap(jid?: string) {
    const normalizedJid = normalizeWhatsappJid(jid || '');
    if (isRealWhatsappJid(normalizedJid)) return normalizedJid;
    if (!isLidWhatsappJid(normalizedJid)) return '';

    await loadWhatsappIdentityCache();
    return whatsappIdentityCache.get(normalizedJid) || '';
}

function findRealWhatsappJidDeep(value: unknown, visited = new Set<unknown>()): string {
    if (!value || visited.has(value)) return '';

    if (typeof value === 'string') {
        return pickRealWhatsappJid(value);
    }

    if (typeof value !== 'object') return '';
    visited.add(value);

    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findRealWhatsappJidDeep(item, visited);
            if (found) return found;
        }
        return '';
    }

    for (const item of Object.values(value as Record<string, unknown>)) {
        const found = findRealWhatsappJidDeep(item, visited);
        if (found) return found;
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

function extractBrazilPhoneFromText(text: string) {
    const matches = String(text || '').match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/g) || [];

    for (const match of matches) {
        let digits = match.replace(/\D/g, '');
        if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
            digits = digits.slice(2);
        }
        if (digits.length === 10 || digits.length === 11) {
            return digits;
        }
    }

    return '';
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
        throw new Error('Contato sem telefone válido.');
    }

    // IDs @lid do WhatsApp costumam chegar como números longos sem código do país.
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
        videoMessage: '[Vídeo recebido]',
        audioMessage: '[Áudio recebido]',
        documentMessage: '[Documento recebido]',
        stickerMessage: '[Figurinha recebida]',
        contactMessage: '[Contato recebido]',
        locationMessage: '[Localização recebida]',
    };

    return mediaLabels[type] || '[Mensagem recebida]';
}

function getMediaKind(type?: string): StoredChatMedia['type'] | null {
    const mediaKinds: Record<string, StoredChatMedia['type']> = {
        imageMessage: 'image',
        videoMessage: 'video',
        audioMessage: 'audio',
        documentMessage: 'document',
        stickerMessage: 'sticker',
    };

    return type ? mediaKinds[type] || null : null;
}

function getMediaExtension(mimetype?: string, fileName?: string) {
    const fileExtension = String(fileName || '').split('.').pop();
    if (fileExtension && fileExtension.length <= 8 && fileExtension !== fileName) {
        return fileExtension.toLowerCase();
    }

    const mimeExtension = String(mimetype || '').split('/').pop()?.split(';')[0];
    if (mimeExtension) {
        if (mimeExtension === 'jpeg') return 'jpg';
        if (mimeExtension.length <= 8) return mimeExtension;
    }

    return 'bin';
}

async function saveWhatsappMedia(message: any): Promise<StoredChatMedia | null> {
    const content: any = extractMessageContent(message || {});
    const type = getContentType(content);
    const body: any = type ? content?.[type] : null;
    const mediaKind = getMediaKind(type);

    if (!body || !mediaKind) return null;

    try {
        const stream = await downloadContentFromMessage(
            body,
            (mediaKind === 'sticker' ? 'sticker' : mediaKind) as any
        );
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
            chunks.push(Buffer.from(chunk));
        }

        const mediaDir = path.join(__dirname, '../../data/whatsapp-media');
        await fs.mkdir(mediaDir, { recursive: true });

        const originalFileName = body.fileName || body.title || '';
        const extension = getMediaExtension(body.mimetype, originalFileName);
        const storedFileName = `${Date.now()}-${randomUUID()}.${extension}`;
        await fs.writeFile(path.join(mediaDir, storedFileName), Buffer.concat(chunks));

        return {
            type: mediaKind,
            url: `/media/whatsapp/${storedFileName}`,
            mimetype: body.mimetype,
            fileName: originalFileName || undefined,
        };
    } catch (error) {
        console.error('Erro ao salvar mídia do WhatsApp:', error);
        return null;
    }
}

function readClientHistory(history?: string | null): StoredChatMessage[] {
    if (!history) return [];

    try {
        const parsed = JSON.parse(history);
        if (Array.isArray(parsed)) {
            return parsed.filter(item =>
                item &&
                typeof item.text === 'string' &&
                (!!item.text.trim() || !!item.media)
            );
        }
    } catch (_) {}

    return [{ text: history, fromMe: false, timestamp: Math.floor(Date.now() / 1000) }];
}

async function appendClientMessage(clientId: string, message: StoredChatMessage) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return null;

    const history = readClientHistory(client.history);
    const alreadySaved = history.some(item =>
        item.timestamp === message.timestamp &&
        item.fromMe === message.fromMe &&
        item.text === message.text &&
        (item.media?.url || '') === (message.media?.url || '')
    );

    const nextHistory = alreadySaved ? history : [...history, message].slice(-300);

    return prisma.client.update({
        where: { id: client.id },
        data: {
            history: JSON.stringify(nextHistory),
            status: client.status === 'FINALIZADO' ? 'NOVO' : client.status,
        },
    });
}

function mergeChatHistories(...histories: Array<string | null | undefined>) {
    const messages = histories.flatMap((history) => readClientHistory(history));
    const deduped = messages
        .filter((message, index, list) =>
            list.findIndex(item =>
                item.timestamp === message.timestamp &&
                item.fromMe === message.fromMe &&
                item.text === message.text &&
                (item.media?.url || '') === (message.media?.url || '')
            ) === index
        )
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-300);

    return deduped.length > 0 ? JSON.stringify(deduped) : null;
}

async function enrichExistingClientPhoneFromWhatsappIdentity(params: {
    realJid?: string;
    name?: string;
}) {
    const realJid = normalizeWhatsappJid(params.realJid || '');
    const realPhone = isRealWhatsappJid(realJid) ? toDisplayPhone(realJid) : '';
    const contactName = normalizeContactName(params.name || '');

    if (!realPhone || !contactName) return null;

    const clients = await prisma.client.findMany({
        orderBy: { updatedAt: 'desc' },
    });
    const existingWithPhone = clients.find((client) => client.phone === realPhone);

    const unresolvedClient = clients.find((client) =>
        isUnresolvedPhone(client.phone) &&
        normalizeContactName(client.name) === contactName
    );

    if (existingWithPhone && unresolvedClient && existingWithPhone.id !== unresolvedClient.id) {
        const mergedClient = await prisma.client.update({
            where: { id: existingWithPhone.id },
            data: {
                name: existingWithPhone.name || unresolvedClient.name,
                phone: realPhone,
                whatsappJid: unresolvedClient.whatsappJid || existingWithPhone.whatsappJid || realJid,
                status: existingWithPhone.status === 'FINALIZADO' ? unresolvedClient.status : existingWithPhone.status,
                history: mergeChatHistories(existingWithPhone.history, unresolvedClient.history),
            },
        });
        await prisma.client.delete({ where: { id: unresolvedClient.id } }).catch(() => null);
        io.emit('client_deleted', { id: unresolvedClient.id });
        return mergedClient;
    }

    if (existingWithPhone) return existingWithPhone;
    if (!unresolvedClient) return null;

    return prisma.client.update({
        where: { id: unresolvedClient.id },
        data: {
            phone: realPhone,
            whatsappJid: unresolvedClient.whatsappJid || realJid,
        },
    });
}

async function upsertClientFromWhatsapp(params: {
    jid: string;
    realJid?: string;
    name?: string;
    text?: string;
}) {
    const technicalJid = normalizeWhatsappJid(params.jid);
    const mappedRealJid = await resolveRealJidFromIdentityMap(technicalJid);
    const realJid = normalizeWhatsappJid(params.realJid || mappedRealJid || '');
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

    if (!existing && !realPhone && isUnresolvedPhone(phone) && params.name) {
        const contactName = normalizeContactName(params.name);
        const clients = await prisma.client.findMany({
            orderBy: { updatedAt: 'desc' },
        });
        existing = clients.find((client) =>
            normalizeContactName(client.name) === contactName &&
            isResolvedPhone(client.phone)
        ) || null;
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

    const existingPhone = existing?.phone || '';
    const keepExistingPhone = !!existing && isUnresolvedPhone(phone) && isResolvedPhone(existingPhone);
    const updateData = {
        name: params.name || existing?.name || `Lead ${phone}`,
        phone: keepExistingPhone ? existingPhone : phone,
        whatsappJid: realJid || technicalJid || existing?.whatsappJid,
        status: 'NOVO',
        history: existing?.history || null,
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
                        ? 'WhatsApp pediu reinício da conexão para concluir o pareamento.'
                        : `Conexão fechada pelo WhatsApp. Código: ${statusCode || 'desconhecido'}`;
                    io.emit('whatsapp_status', { status: this.status });
                    console.log(`WhatsApp connection closed. statusCode=${statusCode || 'unknown'} shouldReconnect=${shouldReconnect}`);

                    if (statusCode === DisconnectReason.loggedOut) {
                        await this.rotateSession();
                        this.lastError = 'Sessão do WhatsApp expirada. Clique em Tentar Novamente para gerar um QR Code novo.';
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
                    await rememberWhatsappIdentity(lid, jid);
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
                await this.syncContacts(contacts);
            });

            this.sock.ev.on('contacts.update', async (contacts: any[]) => {
                await this.syncContacts(contacts);
            });

            this.sock.ev.on('messages.upsert', async (m: any) => {
                if (m.type !== 'notify') return;

                for (const msg of m.messages) {
                    if (msg.key.fromMe) continue;

                    const sender = String(msg.key.remoteJid || '');
                    if (isStatusBroadcastJid(sender)) {
                        const statusRealJid = pickRealWhatsappJid(
                            msg.key?.participant,
                            msg.key?.remoteJidAlt,
                            msg.key?.participantPn,
                            msg.key?.senderPn,
                            msg.participant,
                            findRealWhatsappJidDeep(msg)
                        );
                        const enrichedClient = await enrichExistingClientPhoneFromWhatsappIdentity({
                            realJid: statusRealJid,
                            name: msg.pushName,
                        });
                        if (enrichedClient) {
                            io.emit('client_upserted', enrichedClient);
                        }
                        continue;
                    }

                    if (!isDirectChatJid(sender)) continue;

                    const realJidFromMessage = pickRealWhatsappJid(
                        sender,
                        msg.key?.participant,
                        msg.key?.remoteJidAlt,
                        msg.key?.participantPn,
                        msg.key?.senderPn,
                        msg.participant,
                        findRealWhatsappJidDeep(msg)
                    );
                    const realJid = realJidFromMessage || await resolveRealJidFromIdentityMap(sender);
                    if (realJidFromMessage && sender) {
                        await rememberWhatsappIdentity(sender, realJidFromMessage);
                    }
                    const text = getWhatsappMessageText(msg.message);
                    const media = await saveWhatsappMedia(msg.message);
                    if (!text.trim() && !media) continue;

                    const resolvedRealJid = realJid;
                    const displayPhone = toDisplayPhone(resolvedRealJid || sender);
                    const pushName = msg.pushName || `Lead ${displayPhone}`;

                    if (sender) {
                        let client = await upsertClientFromWhatsapp({
                            jid: sender,
                            realJid: resolvedRealJid,
                            name: pushName,
                            text,
                        });

                        if (client) {
                            client = await appendClientMessage(client.id, {
                                text,
                                fromMe: false,
                                timestamp: Number(msg.messageTimestamp) || Math.floor(Date.now() / 1000),
                                media,
                            }) || client;

                            io.emit('client_upserted', client);
                            io.emit('incoming_message', {
                                from: sender,
                                clientId: client.id,
                                phone: client.phone,
                                whatsappJid: client.whatsappJid,
                                text,
                                media,
                                timestamp: msg.messageTimestamp,
                                pushName,
                            });

                        }
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

    private async syncContacts(contacts: any[]) {
        for (const contact of contacts) {
            try {
                const contactJid = normalizeWhatsappJid(contact.id);
                const lidJid = normalizeWhatsappJid(contact.lid);
                const discoveredRealJid = isRealWhatsappJid(contactJid) ? contactJid : findRealWhatsappJidDeep(contact);
                const technicalJid = lidJid || contactJid;
                const realJid = discoveredRealJid || await resolveRealJidFromIdentityMap(technicalJid);

                if (!technicalJid || !realJid || technicalJid === realJid) continue;

                await rememberWhatsappIdentity(technicalJid, realJid);

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
            throw new Error('WhatsApp não conectado');
        }

        const jid = buildWhatsappJid(to);
        const exists = await this.sock.onWhatsApp(jid).catch(() => []);
        if (jid.endsWith('@s.whatsapp.net') && Array.isArray(exists) && exists.length > 0 && exists[0]?.exists === false) {
            throw new Error('Este telefone não possui WhatsApp ou não foi encontrado.');
        }

        await this.sock.sendMessage(jid, { text });

        const digits = normalizeWhatsappPhone(jid);
        let client = await prisma.client.findFirst({
            where: {
                OR: [
                    { whatsappJid: jid },
                    { phone: digits },
                    { phone: toDisplayPhone(jid) },
                ],
            },
        });

        if (client) {
            client = await appendClientMessage(client.id, {
                text,
                fromMe: true,
                timestamp: Math.floor(Date.now() / 1000),
            }) || client;
            io.emit('client_upserted', client);
        }

        io.emit('message_sent', {
            to: jid,
            clientId: client?.id,
            text,
            timestamp: Math.floor(Date.now() / 1000),
        });
    }
}

export const whatsappService = new WhatsAppService();
