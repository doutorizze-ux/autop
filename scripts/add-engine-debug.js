const fs = require('fs');

// Add debug logs to engine.js around lines 1410-1440
let content = fs.readFileSync('scraping/engine.js', 'utf8');

const target = `            let items = [];
            if (strategy.extractItems) {
                items = await strategy.extractItems({ page, supplier, query, dismissTransientUi });
            }`;

const replacement = `            let items = [];
            if (strategy.extractItems) {
                items = await strategy.extractItems({ page, supplier, query, dismissTransientUi });
                console.error(\`[DEBUG \${supplier.name}] strategy.extractItems retornou \${items.length} itens\`);
            }`;

content = content.replace(target, replacement);

const target2 = `            finalItems = buildBrowserPayload(items, supplier);`;
const replacement2 = `            finalItems = buildBrowserPayload(items, supplier);
            console.error(\`[DEBUG \${supplier.name}] buildBrowserPayload retornou \${finalItems.length} itens\`);`;

content = content.replace(target2, replacement2);

fs.writeFileSync('scraping/engine.js', content, 'utf8');
console.log('Added debug logs to engine.js');
