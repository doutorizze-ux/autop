const fs = require('fs');

let c = fs.readFileSync('scraping/engine.js', 'utf8');
const target = `            if (strategy.extractItems) {
                items = await strategy.extractItems({ page, supplier, query, dismissTransientUi });
                console.error(\`[DEBUG \${supplier.name}] strategy.extractItems retornou \${items.length} itens\`);
            }`;

const replacement = `            if (strategy.extractItems) {
                const htmlLen = await page.evaluate(() => document.body.innerHTML.length);
                const cardsCount = await page.evaluate(() => document.querySelectorAll('.product-info, .ui-product-card').length);
                console.error(\`[DEBUG \${supplier.name}] No momento do extract: htmlLen=\${htmlLen}, cardsCount=\${cardsCount}\`);
                items = await strategy.extractItems({ page, supplier, query, dismissTransientUi });
                console.error(\`[DEBUG \${supplier.name}] strategy.extractItems retornou \${items.length} itens\`);
            }`;

c = c.replace(target, replacement);
fs.writeFileSync('scraping/engine.js', c, 'utf8');
console.log('Patch htmlLen applied!');
