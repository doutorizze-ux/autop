const fs = require('fs');
const path = require('path');

const enginePath = path.join(__dirname, '..', 'scraping', 'engine.js');
let content = fs.readFileSync(enginePath, 'utf8');

const oldFn = `function buildSearchQueries(productName) {
    const baseQuery = safeString(productName);
    const queries = [baseQuery];
    const wildcardQuery = baseQuery.replace(/\\s+/g, '%');
    if (wildcardQuery && wildcardQuery !== baseQuery && !queries.includes(wildcardQuery)) {
        queries.push(wildcardQuery);
    }
    const tokens = baseQuery
        .split(/\\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);

    for (const token of tokens) {
        if (!queries.includes(token)) {
            queries.push(token);
        }
    }

    return queries.slice(0, 2);
}`;

const newFn = `function buildSearchQueries(productName) {
    const baseQuery = safeString(productName).trim();
    const queries = [baseQuery];

    // Clean alphanumeric code (e.g. "PSL-560" -> "PSL560")
    const cleanNoPunct = baseQuery.replace(/[-_.\\s]/g, '');
    if (cleanNoPunct && cleanNoPunct !== baseQuery && !queries.includes(cleanNoPunct)) {
        queries.push(cleanNoPunct);
    }

    // Letters + Numbers with hyphen (e.g. "PSL560" -> "PSL-560")
    const withHyphen = baseQuery.replace(/^([A-Za-z]{2,5})(\\d{2,6})$/, '$1-$2');
    if (withHyphen !== baseQuery && !queries.includes(withHyphen)) {
        queries.push(withHyphen);
    }

    const withSpace = baseQuery.replace(/^([A-Za-z]{2,5})(\\d{2,6})$/, '$1 $2');
    if (withSpace !== baseQuery && !queries.includes(withSpace)) {
        queries.push(withSpace);
    }

    const tokens = baseQuery
        .split(/\\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);

    for (const token of tokens) {
        if (!queries.includes(token)) {
            queries.push(token);
        }
    }

    return queries.slice(0, 3);
}`;

const oldNorm = oldFn.replace(/\r\n/g, '\n');
const contentNorm = content.replace(/\r\n/g, '\n');

if (contentNorm.includes(oldNorm)) {
    content = contentNorm.replace(oldNorm, newFn.replace(/\r\n/g, '\n'));
    fs.writeFileSync(enginePath, content, 'utf8');
    console.log('engine.js buildSearchQueries updated successfully!');
} else {
    console.log('Target buildSearchQueries not found.');
}
