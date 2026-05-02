import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import authRoutes from './routes/auth.routes';
import clientRoutes from './routes/client.routes';
import whatsappRoutes from './routes/whatsapp.routes';
import supplierRoutes from './routes/supplier.routes';
import quoteRoutes from './routes/quote.routes';
import aiRoutes from './routes/ai.routes';
import configRoutes from './routes/config.routes';


dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

export { io };

import { whatsappService } from './services/whatsapp.service';

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/media/whatsapp', express.static(path.join(__dirname, '../data/whatsapp-media')));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/config', configRoutes);


server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    whatsappService.init().catch(err => console.error('WhatsApp Init Error:', err));
});
