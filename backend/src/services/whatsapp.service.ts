import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion,
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

class WhatsAppService {
    public sock: any = null;
    public qr: string | null = null;
    public status: 'connecting' | 'connected' | 'disconnected' | 'qr' = 'disconnected';
    public lastError: string | null = null;
    private initializing = false;
    private generation = 0;
    private readonly sessionPath = path.join(__dirname, '../../sessions');

    async init() {
        if (this.initializing) return;
        this.initializing = true;
        const generation = ++this.generation;
        this.status = 'connecting';
        this.lastError = null;
        io.emit('whatsapp_status', { status: 'connecting' });

        try {
            this.sock?.end?.();

            const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
            const { version } = await fetchLatestBaileysVersion();

            this.sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: true,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
                },
                browser: ['AutoCRM', 'Chrome', '1.0.0'],
                syncFullHistory: false,
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
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                    this.status = 'disconnected';
                    this.qr = null;
                    this.lastError = `Conexao fechada pelo WhatsApp. Codigo: ${statusCode || 'desconhecido'}`;
                    io.emit('whatsapp_status', { status: 'disconnected' });
                    console.log(`WhatsApp connection closed. statusCode=${statusCode || 'unknown'} shouldReconnect=${shouldReconnect}`);

                    if (statusCode === DisconnectReason.loggedOut) {
                        await this.clearSession();
                    }

                    if (shouldReconnect) {
                        setTimeout(() => {
                            if (generation !== this.generation) return;
                            this.init().catch((error) => console.error('WhatsApp reconnect error:', error));
                        }, 3000);
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

            this.sock.ev.on('messages.upsert', async (m: any) => {
                if (m.type !== 'notify') return;

                for (const msg of m.messages) {
                    if (msg.key.fromMe) continue;

                    const sender = msg.key.remoteJid;
                    const phone = normalizeWhatsappPhone(sender);
                    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
                    const pushName = msg.pushName || `Lead ${phone}`;

                    if (phone) {
                        const client = await prisma.client.upsert({
                            where: { phone },
                            update: {
                                name: pushName,
                                status: 'NOVO',
                                history: text,
                            },
                            create: {
                                name: pushName,
                                phone,
                                status: 'NOVO',
                                history: text,
                            },
                        });

                        io.emit('client_upserted', client);
                    }

                    io.emit('incoming_message', {
                        from: sender,
                        text,
                        timestamp: msg.messageTimestamp,
                        pushName,
                    });
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

    private async clearSession() {
        try {
            await fs.rm(this.sessionPath, { recursive: true, force: true });
        } catch (error) {
            console.error('Erro ao limpar sessao do WhatsApp:', error);
        }
    }

    async reconnect(forceNewSession = false) {
        this.generation += 1;
        this.sock?.end?.();
        this.sock = null;
        this.qr = null;
        this.lastError = null;
        this.initializing = false;

        if (forceNewSession) {
            await this.clearSession();
        }

        await this.init();
    }

    async sendMessage(to: string, text: string) {
        if (!this.sock || this.status !== 'connected') {
            throw new Error('WhatsApp nao conectado');
        }

        const cleanPhone = normalizeWhatsappPhone(to);
        const jid = to.includes('@s.whatsapp.net') ? to : `${cleanPhone}@s.whatsapp.net`;
        await this.sock.sendMessage(jid, { text });
        io.emit('message_sent', { to: jid, text, timestamp: Math.floor(Date.now() / 1000) });
    }
}

export const whatsappService = new WhatsAppService();
