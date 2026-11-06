const fs = require('fs');

const path = 'scraping/suppliers/comdip.js';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    /loginSuccessSelector:\s*\[[\s\S]*?\],/,
    `loginSuccessSelector: [
        'a:has-text("Sair")',
        'text=OFICINA DO',
        'a:has-text("Meu histórico")',
        'a:has-text("Meu Histórico")',
        'a:has-text("Minhas Listas")',
    ],`
);

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed comdip loginSuccessSelector!');
