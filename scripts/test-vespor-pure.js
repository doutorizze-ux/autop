const { chromium } = require('../scraping/node_modules/playwright');

async function testVesporPure() {
    console.log('1. Fazendo login API...');
    const loginRes = await fetch('https://vesporpro.com.br/b2b/api/v1/usuario/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://vesporpro.com.br',
            'Referer': 'https://vesporpro.com.br/login',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({
            login: 'centroautomotivo0058@hotmail.com',
            senha: 'Re539597@',
            turnstileToken: ''
        })
    });

    const loginData = await loginRes.json();
    console.log('Login API sucesso:', loginData.success, 'Token:', loginData.token?.slice(0, 20));

    console.log('2. Buscando na API...');
    const searchRes = await fetch('https://vesporpro.com.br/b2b/api/v1/produto/pesquisa', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${loginData.token}`
        },
        body: JSON.stringify({
            codfilial: loginData.usuario.codfilial || '52',
            codfilori: loginData.usuario.codfilori || '52',
            codcliente: loginData.usuario.codcliente || '014198',
            codclienteloja: loginData.usuario.codclienteloja || '01',
            pesquisa: 'W712',
            itenspagina: 50,
            pagina: 1,
            codcondpag: '',
            marcas: [],
            categorias: []
        })
    });

    const searchData = await searchRes.json();
    console.log(`3. Produtos retornados: ${searchData.produtos?.length}`);
    if (searchData.produtos?.length > 0) {
        console.log('Primeiro produto:', searchData.produtos[0].descproduto, '- R$', searchData.produtos[0].vlr_x3 || searchData.produtos[0].vlr_lc);
    }
}

testVesporPure().catch(console.error);
