import makeWASocket, { 
    DisconnectReason, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import pino from 'pino';
import { io } from '../index';
import QRCode from 'qrcode';

class WhatsAppService {
    public sock: any = null;
    public qr: string | null = null;
    public status: 'connecting' | 'connected' | 'disconnected' | 'qr' = 'disconnected';

    async init() {
        this.status = 'connecting';
        io.emit('whatsapp_status', { status: 'connecting' });
        
        const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, '../../sessions'));
        const { version } = await fetchLatestBaileysVersion();

        this.sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: true,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
            },
        });

        this.sock.ev.on('connection.update', async (update: any) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                this.qr = await QRCode.toDataURL(qr);
                this.status = 'qr';
                io.emit('whatsapp_status', { status: 'qr', qr: this.qr });
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                this.status = 'disconnected';
                this.qr = null;
                io.emit('whatsapp_status', { status: 'disconnected' });
                if (shouldReconnect) this.init();
            } else if (connection === 'open') {
                this.status = 'connected';
                this.qr = null;
                io.emit('whatsapp_status', { status: 'connected' });
                console.log('WhatsApp connection opened');
            }
        });

        this.sock.ev.on('creds.update', saveCreds);

        this.sock.ev.on('messages.upsert', async (m: any) => {
            if (m.type === 'notify') {
                for (const msg of m.messages) {
                    if (!msg.key.fromMe) {
                        // Emitir mensagem recebida para o frontend
                        const sender = msg.key.remoteJid;
                        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
                        
                        io.emit('incoming_message', {
                            from: sender,
                            text: text,
                            timestamp: msg.messageTimestamp,
                            pushName: msg.pushName
                        });
                    }
                }
            }
        });
    }

    async sendMessage(to: string, text: string) {
        if (!this.sock) throw new Error('WhatsApp não inicializado');
        const jid = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`;
        await this.sock.sendMessage(jid, { text });
        
        // Emitir confirmação para o frontend atualizar a tela (opcional)
        io.emit('message_sent', { to: jid, text, timestamp: Math.floor(Date.now() / 1000) });
    }
}

export const whatsappService = new WhatsAppService();
