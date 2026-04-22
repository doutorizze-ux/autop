const { scrapeProduct } = require('./engine');

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Uso: node run-search.js <JSON_FORNECEDOR> <NOME_PRODUTO>');
        process.exit(1);
    }

    let supplier;
    let productName;

    if (args[0] === '--base64') {
        supplier = JSON.parse(Buffer.from(args[1], 'base64').toString());
        productName = args[2];
    } else {
        supplier = JSON.parse(args[0]);
        productName = args[1];
    }

    try {
        const results = await scrapeProduct(supplier, productName);
        console.log('RESULTADO_JSON:' + JSON.stringify(results));
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

main();
