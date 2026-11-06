const fs = require('fs');

let c = fs.readFileSync('scraping/engine.js', 'utf8');
const target = `            if (strategy.extractItems) {
                items = await strategy.extractItems({ page, supplier, query, dismissTransientUi });
                console.error(\`[DEBUG \${supplier.name}] strategy.extractItems retornou \${items.length} itens\`);
            }`;

const replacement = `            console.error(\`[DEBUG \${supplier.name}] URL exata antes de extrair: \${page.url()}\`);
            if (strategy.extractItems) {
                items = await strategy.extractItems({ page, supplier, query, dismissTransientUi });
                console.error(\`[DEBUG \${supplier.name}] strategy.extractItems retornou \${items.length} itens\`);
            }`;

c = c.replace(target, replacement);
fs.writeFileSync('scraping/engine.js', c, 'utf8');
console.log('Patch applied!');
