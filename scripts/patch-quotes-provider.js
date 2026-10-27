const fs = require('fs');
const path = require('path');

const quotesPath = path.join(__dirname, '..', 'frontend', 'src', 'components', 'Quotes.tsx');
let content = fs.readFileSync(quotesPath, 'utf8');

const matchesProviderFn = `const matchesProviderName = (entryProvider: string, targetProvider: string): boolean => {
    if (!entryProvider || !targetProvider) return false;
    const a = entryProvider.trim().toLowerCase();
    const b = targetProvider.trim().toLowerCase();
    return a === b || a.startsWith(\`\${b} -\`) || b.startsWith(\`\${a} -\`) || a.includes(b) || b.includes(a);
};
`;

const oldVariant = `const getProviderResultsForVariant = (
    results: QuoteResult[],
    provider: string,
    query: string,
    selectedVariantKey?: string
) =>
    sortSupplierResults(
        results.filter(
            (entry) =>
                entry.provider === provider &&
                !entry.error &&
                (!!entry.whatsappStatus || !selectedVariantKey || buildVariantGroupKey(entry) === selectedVariantKey)
        ),
        query
    );`;

const newVariant = `const getProviderResultsForVariant = (
    results: QuoteResult[],
    provider: string,
    query: string,
    selectedVariantKey?: string
) =>
    sortSupplierResults(
        results.filter(
            (entry) =>
                matchesProviderName(entry.provider, provider) &&
                !entry.error &&
                (!!entry.whatsappStatus || !selectedVariantKey || buildVariantGroupKey(entry) === selectedVariantKey)
        ),
        query
    );`;

const oldNorm = oldVariant.replace(/\r\n/g, '\n');
const contentNorm = content.replace(/\r\n/g, '\n');

if (contentNorm.includes(oldNorm)) {
    content = contentNorm.replace(oldNorm, matchesProviderFn + newVariant);
    console.log('Quotes.tsx getProviderResultsForVariant updated.');
} else {
    console.log('Target getProviderResultsForVariant not found.');
}

// Also replace line 755
content = content.replace(
    'const providerResults = sourceResults.filter((entry) => entry.provider === provider && !entry.error && !entry.whatsappStatus);',
    'const providerResults = sourceResults.filter((entry) => matchesProviderName(entry.provider, provider) && !entry.error && !entry.whatsappStatus);'
);

fs.writeFileSync(quotesPath, content, 'utf8');
console.log('Quotes.tsx written successfully!');
