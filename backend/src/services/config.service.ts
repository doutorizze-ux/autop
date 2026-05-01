import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class ConfigService {
    static async getConfig() {
        let config = await prisma.systemConfig.findUnique({
            where: { id: 'system_settings' }
        });

        if (!config) {
            config = await prisma.systemConfig.create({
                data: { id: 'system_settings' }
            });
        }

        return config;
    }

    static async updateConfig(data: { aiKey?: string; whatsappMode?: string; themeColor?: string; themeLogo?: string | null }) {
        return await prisma.systemConfig.update({
            where: { id: 'system_settings' },
            data
        });
    }

    static async updateProfile(userId: string, data: { name?: string; email?: string; password?: string }) {
        const updateData: any = { name: data.name, email: data.email };
        if (data.password) {
            const bcrypt = require('bcryptjs');
            updateData.password = await bcrypt.hash(data.password, 10);
        }
        return await prisma.user.update({
            where: { id: userId },
            data: updateData
        });
    }
}
