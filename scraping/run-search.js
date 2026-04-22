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
        // GARANTIA ABSOLUTA DE SAÍDA JSON NO FORMATO SOLICITADO
        console.log(JSON.stringify(results));
        process.exit(0);
    } catch (err) {
        // GARANTIA ABSOLUTA DE SAÍDA DE ERRO NO FORMATO SOLICITADO
        console.log(JSON.stringify({
            provider: supplier ? supplier.name : "Desconhecido",
            error: err.message
        }));
        process.exit(0);
    }
}

main();
