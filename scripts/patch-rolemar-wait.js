const fs = require('fs');

let c = fs.readFileSync('scraping/suppliers/rolemar.js', 'utf8');

c = c.replace(
    /preferStrategySelectors:\s*true,/,
    `preferStrategySelectors: true,
    waitForResultsOnly: true,`
);

fs.writeFileSync('scraping/suppliers/rolemar.js', c, 'utf8');
console.log('Added waitForResultsOnly to rolemar.js');
