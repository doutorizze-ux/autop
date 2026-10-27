const { scrapeProduct } = require('../scraping/engine');

async function testDpk() {
    const dpkSupplier = {
        name: 'DPK',
        url: 'https://www.dpk.com.br',
        loginUrl: 'https://www.dpk.com.br/#/login',
        needsLogin: true,
        loginCredential: 'atendimento@centroautomotivo0058.com',
        password: 'Re539597@',
        searchUrl: 'https://www.dpk.com.br/#/busca-produto?termo={query}'
    };

    const res = await scrapeProduct(dpkSupplier, 'vela');
    console.log('DPK vela results count:', Array.isArray(res) ? res.length : res);
    if (Array.isArray(res) && res.length > 0) {
        console.log('Primeira oferta DPK:', res[0]);
    }
}

testDpk().catch(console.error);
