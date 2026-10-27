const fs = require('fs');
const path = require('path');

const skyPath = path.join(__dirname, '..', 'scraping', 'suppliers', 'sky.js');
let content = fs.readFileSync(skyPath, 'utf8');

content = content.replace(
    'const providerName = `${supplier.name} - ${selectedLabel || \'Principal\'}`;',
    'const providerName = supplier.name;'
);

content = content.replace(
    'const branchProviderName = `${supplier.name} - ${optionLabel}`;',
    'const branchProviderName = supplier.name;'
);

fs.writeFileSync(skyPath, content, 'utf8');
console.log('sky.js provider names patched to supplier.name successfully!');
