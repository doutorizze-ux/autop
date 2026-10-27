const fs = require('fs');
let code = fs.readFileSync('scraping/suppliers/sky.js', 'utf8');

code = code.replace(
    'async function runBranchSearch(page, query, dismissTransientUi) {',
    `async function runBranchSearch(page, query, dismissTransientUi) {
    console.log('[SKY DEBUG] runBranchSearch called with query:', query, 'url:', page.url());`
);

code = code.replace(
    'const cards = Array.from(document.querySelectorAll(\'#tb_produto .bx_produto, .bx_produto\'));',
    `const cards = Array.from(document.querySelectorAll('#tb_produto .bx_produto, .bx_produto'));
            console.log('[SKY BROWSER] parseProductCards found:', cards.length);`
);

fs.writeFileSync('scraping/suppliers/sky.js', code, 'utf8');
console.log('sky.js debug added');
