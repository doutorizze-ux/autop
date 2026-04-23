const { scrapeProduct } = require('./engine');

let currentSupplier = null;

function emitJsonError(error) {
    const message = error instanceof Error ? error.message : String(error);
    const payload = {
        provider: currentSupplier ? currentSupplier.name : 'Desconhecido',
        error: message,
    };

    console.error(`[FATAL] ${message}`);
    console.log(JSON.stringify(payload));
    process.exit(0);
}

process.on('unhandledRejection', (reason) => {
    emitJsonError(reason);
});

process.on('uncaughtException', (error) => {
    emitJsonError(error);
});

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

    currentSupplier = supplier;

    try {
        const results = await scrapeProduct(supplier, productName);
        console.log(JSON.stringify(results));
        process.exit(0);
    } catch (error) {
        console.log(JSON.stringify({
            provider: supplier ? supplier.name : 'Desconhecido',
            error: error.message,
        }));
        process.exit(0);
    }
}

main();
