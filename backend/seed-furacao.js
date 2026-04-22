const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Buscar se já existe para pegar o ID
    const existing = await prisma.supplier.findFirst({
        where: { name: 'Furacão Auto Peças' }
    });

    const data = {
        name: 'Furacão Auto Peças',
        url: 'https://vendas.furacao.com.br/vendas/sav/login',
        needsLogin: true,
        loginUrl: 'https://vendas.furacao.com.br/vendas/sav/login',
        loginUserSelector: 'input#username',
        loginPassSelector: 'input#password',
        loginSubmitSelector: 'button.btn-primary',
        loginExtraSelector: 'select#f',
        loginExtraValue: '1',
        loginCredential: '125435',
        password: 'Re539597@',
        searchUrl: 'https://vendas.furacao.com.br/vendas/sav/produtos',
        searchBarSelector: 'input#gsearch',
        searchBtnSelector: '', // Usa Enter
        itemContainerSelector: 'div.prod-container',
        productNameSelector: 'div.prod-descricao',
        priceSelector: 'div.prod-preco'
    };

    if (existing) {
        await prisma.supplier.update({
            where: { id: existing.id },
            data: data
        });
    } else {
        await prisma.supplier.create({
            data: data
        });
    }
    
    console.log('Fornecedor Furacão sincronizado e pronto!');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
