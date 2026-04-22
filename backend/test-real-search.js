const { ScraperService } = require('./src/services/scraper.service');

async function test() {
    console.log('--- TESTE DE BUSCA REAL NA FURACÃO ---');
    try {
        const results = await ScraperService.searchMultipleProducts(['Vela de Ignição']);
        console.log('RESULTADOS_DA_FURACAO:');
        console.log(JSON.stringify(results, null, 2));
    } catch (err) {
        console.error('ERRO NO TESTE:', err);
    }
}

test();
