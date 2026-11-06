const fs = require('fs');
const path = require('path');

const p = path.resolve(__dirname, '../scraping/suppliers/vespor.js');
let c = fs.readFileSync(p, 'utf8');

// Atualizar getFreshApiToken para retornar os dados completos (mesmo em erro)
c = c.replace(
`        const data = await res.json();
        if (data?.token) {
            return data;
        }
    } catch (_) {}
    return null;`,
`        const data = await res.json();
        return data;
    } catch (_) {}
    return null;`
);

// Atualizar directSearch para repassar a mensagem real do servidor da Vespor
c = c.replace(
`            const loginData = await getFreshApiToken(supplier?.loginCredential, supplier?.password);
            if (!loginData?.token) {
                console.error('[vespor] Falha ao autenticar na API do Vespor Pro');
                return null;
            }`,
`            const loginData = await getFreshApiToken(supplier?.loginCredential, supplier?.password);
            if (!loginData?.token) {
                const serverMsg = loginData?.message || 'Servidor da Vespor Pro temporariamente indisponível.';
                console.error('[vespor] Aviso da API do Vespor Pro:', serverMsg);
                return [{
                    provider: supplier.name,
                    product: query,
                    price: '---',
                    available: false,
                    error: \`Aviso do Fornecedor: \${serverMsg}\`,
                    link: 'https://vesporpro.com.br/login'
                }];
            }`
);

fs.writeFileSync(p, c, 'utf8');
console.log('Successfully updated scraping/suppliers/vespor.js');
