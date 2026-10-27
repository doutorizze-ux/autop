const fs = require('fs');
let code = fs.readFileSync('scraping/suppliers/comdip.js', 'utf8');

code = code.replace(
`    searchSelector: [
        'input[type="search"]',
        'input[placeholder*="nome" i]',
        'input[placeholder*="marca" i]',
        'input[placeholder*="buscar" i]',
        '.search-input',
    ],`,
`    searchSelector: [
        'input[name="src"]:visible',
        'input[placeholder*="Busque por Nome"]:visible',
        'input[type="search"]:visible',
        'input[placeholder*="buscar" i]:visible',
        '.search-input',
    ],`
);

fs.writeFileSync('scraping/suppliers/comdip.js', code, 'utf8');
console.log('comdip.js patched successfully!');
