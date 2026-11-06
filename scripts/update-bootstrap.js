const fs = require('fs');
const path = require('path');

const p = path.resolve(__dirname, '../backend/src/services/supplier-bootstrap.ts');
let c = fs.readFileSync(p, 'utf8');

const target = `export async function bootstrapSuppliers() {
    try {
        const count = await prisma.supplier.count();
        if (count > 0) {
            console.log(\`[Bootstrap] Banco de dados já possui \${count} fornecedores configurados. Nenhuma alteração forçada.\`);
            return;
        }

        console.log('[Bootstrap] Banco de dados sem fornecedores. Inicializando lista padrão inicial...');
        const sessionsDir = path.resolve(__dirname, '../../../scraping/sessions');

        for (const item of defaultSuppliers) {
            const { sessionSlug, ...supplierData } = item;
            let sessionJson: string | null = null;

            if (sessionSlug) {
                const sessionFile = path.join(sessionsDir, \`\${sessionSlug}.json\`);
                if (fs.existsSync(sessionFile)) {
                    try {
                        sessionJson = fs.readFileSync(sessionFile, 'utf8');
                    } catch (_) {}
                }
            }

            await prisma.supplier.create({
                data: {
                    ...supplierData,
                    sessionData: sessionJson,
                },
            });
            console.log(\`[Bootstrap] Fornecedor inicial criado: \${item.name}\`);
        }
        console.log('[Bootstrap] Inicialização inicial concluída com sucesso.');
    } catch (error: any) {
        console.error('[Bootstrap Error] Falha ao sincronizar fornecedores:', error.message);
    }
}`;

const replacement = `export async function bootstrapSuppliers() {
    try {
        const count = await prisma.supplier.count();
        if (count >= 8) {
            console.log(\`[Bootstrap] Banco de dados já possui \${count} fornecedores configurados. Nenhuma alteração forçada.\`);
            return;
        }

        console.log(\`[Bootstrap] Banco de dados possui \${count} fornecedores. Sincronizando fornecedores padrão...\`);
        const possibleDirs = [
            process.env.SCRAPER_SESSIONS_DIR,
            path.resolve(__dirname, '../../../scraping/sessions'),
            path.resolve(__dirname, '../../scraping/sessions'),
            path.join(process.cwd(), 'scraping/sessions'),
        ].filter(Boolean) as string[];
        const sessionsDir = possibleDirs.find((d) => fs.existsSync(d)) || possibleDirs[1];

        for (const item of defaultSuppliers) {
            const exists = await prisma.supplier.findFirst({
                where: { name: item.name },
            });
            if (exists) continue;

            const { sessionSlug, ...supplierData } = item;
            let sessionJson: string | null = null;

            if (sessionSlug && sessionsDir) {
                const sessionFile = path.join(sessionsDir, \`\${sessionSlug}.json\`);
                if (fs.existsSync(sessionFile)) {
                    try {
                        sessionJson = fs.readFileSync(sessionFile, 'utf8');
                    } catch (_) {}
                }
            }

            await prisma.supplier.create({
                data: {
                    ...supplierData,
                    sessionData: sessionJson,
                },
            });
            console.log(\`[Bootstrap] Fornecedor inicial criado: \${item.name}\`);
        }
        console.log('[Bootstrap] Inicialização de fornecedores concluída com sucesso.');
    } catch (error: any) {
        console.error('[Bootstrap Error] Falha ao sincronizar fornecedores:', error.message);
    }
}`;

c = c.replace(target, replacement);
fs.writeFileSync(p, c, 'utf8');
console.log('Updated supplier-bootstrap.ts successfully!');
