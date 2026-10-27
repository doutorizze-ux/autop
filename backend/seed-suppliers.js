const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const suppliersData = [
  {
    name: 'DPK',
    url: 'https://www.dpk.com.br',
    type: 'Distribuidor',
    needsLogin: true,
    loginUrl: 'https://www.dpk.com.br/#/login',
    loginUserSelector: 'input[type="email"], input[formcontrolname="email"]',
    loginPassSelector: 'input[type="password"], input[formcontrolname="senha"]',
    loginSubmitSelector: 'button[type="submit"], button.btn-entrar',
    loginCredential: 'atendimento@centroautomotivo0058.com',
    password: 'Re539597@',
    searchUrl: 'https://www.dpk.com.br/#/busca-produto?termo={query}',
    searchBarSelector: 'input[formcontrolname="descricao"]',
    searchBtnSelector: 'button.btn-buscar',
    itemContainerSelector: 'div.card-produto, div.produto-item',
    productNameSelector: '.titulo-produto, h3',
    priceSelector: '.preco-produto, .valor',
    websiteSearchEnabled: true,
  },
  {
    name: 'Auto Norte (KKI)',
    url: 'https://kki.autonorte.com.br',
    type: 'Distribuidor',
    needsLogin: true,
    loginUrl: 'https://kki.autonorte.com.br/login',
    loginUserSelector: 'input[type="email"], input[placeholder*="email" i]',
    loginPassSelector: 'input[type="password"]',
    loginSubmitSelector: 'button[type="submit"]',
    loginCredential: 'atendimento@centroautomotivo0058.com',
    password: '71401',
    searchUrl: 'https://kki.autonorte.com.br/compras',
    searchBarSelector: 'input[placeholder*="pesquisar" i], input[type="search"]',
    searchBtnSelector: 'button[type="submit"]',
    itemContainerSelector: 'div[class*="jay046"], div.produto',
    productNameSelector: 'p[class*="rhqd7b"], h3, strong',
    priceSelector: 'button, span.preco',
    websiteSearchEnabled: true,
  },
  {
    name: 'Real Moto Peças (RMP)',
    url: 'https://www.rmp.com.br',
    type: 'Distribuidor',
    needsLogin: true,
    loginUrl: 'https://www.rmp.com.br/customer/account/login/',
    loginUserSelector: 'input[name="login[username]"], input[type="email"]',
    loginPassSelector: 'input[name="login[password]"], input[type="password"]',
    loginSubmitSelector: 'button[type="submit"].login',
    loginCredential: 'centroautomotivo0058@hotmail.com',
    password: 'Ren@n0058@',
    searchUrl: 'https://www.rmp.com.br/catalogsearch/result/?q={query}',
    searchBarSelector: '#search-cod-fab-input, #minisearch-input-top-search',
    searchBtnSelector: 'button.btn-search-fab-cod, button[type="submit"]',
    itemContainerSelector: 'li.item.product.product-item, .product-item',
    productNameSelector: '.product-item-name a, .product-name',
    priceSelector: '.price-box .price, .price',
    websiteSearchEnabled: true,
  },
  {
    name: 'Comdip',
    url: 'https://portalcomdip.com.br/comdip/compras',
    type: 'Distribuidor',
    needsLogin: true,
    loginUrl: 'https://portalcomdip.com.br/comdip/login',
    loginUserSelector: 'input[placeholder*="cnpj" i], #Cnpj, #Login',
    loginPassSelector: 'input[placeholder*="senha" i], #pass, input[type="password"]',
    loginSubmitSelector: 'button:has-text("Entrar"), button[type="submit"]',
    loginCredential: '33.299.637/0001-80',
    password: 'Re539597@',
    searchUrl: 'https://portalcomdip.com.br/comdip/compras/pesquisa/termo-busca/{query}/1',
    searchBarSelector: 'input[type="search"], .search-input',
    searchBtnSelector: 'button[type="submit"]',
    itemContainerSelector: '[class*="produto"], [class*="item"], article',
    productNameSelector: 'h2, h3, h4, a, strong',
    priceSelector: '.price, .valor',
    websiteSearchEnabled: true,
  },
  {
    name: 'Sky Peças',
    url: 'https://cliente.skypecas.com.br',
    type: 'Distribuidor',
    needsLogin: true,
    loginUrl: 'https://cliente.skypecas.com.br/login',
    loginUserSelector: 'input[name="login"], input[placeholder*="usuario" i], input[type="text"]',
    loginPassSelector: 'input[type="password"]',
    loginSubmitSelector: 'button[type="submit"]',
    loginCredential: 'renan0058',
    password: 'rE539597@',
    searchUrl: 'https://cliente.skypecas.com.br/produtos',
    searchBarSelector: '#btnBuscar, input[placeholder*="codigo" i]',
    searchBtnSelector: '#btnBuscar, button[type="submit"]',
    websiteSearchEnabled: true,
  },
  {
    name: 'Furacão Auto Peças',
    url: 'https://vendas.furacao.com.br/vendas/sav/produtos',
    type: 'Distribuidor',
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
    searchBtnSelector: '',
    itemContainerSelector: 'div.prod-container, .product-box',
    productNameSelector: 'div.prod-descricao, .product-title',
    priceSelector: 'div.prod-preco, .product-price',
    websiteSearchEnabled: true,
  },
  {
    name: 'Kaizen Auto Peças',
    url: 'https://portal.kaizenautopecas.com.br/principal',
    type: 'Distribuidor',
    needsLogin: true,
    loginUrl: 'https://portal.kaizenautopecas.com.br',
    loginUserSelector: 'input[placeholder*="cnpj" i], input[placeholder*="cpf" i]',
    loginPassSelector: 'input[type="password"]',
    loginSubmitSelector: 'button:has-text("Entrar")',
    loginCredential: '33.299.637/0001-80',
    password: 'Re539597@',
    searchUrl: 'https://portal.kaizenautopecas.com.br/principal',
    websiteSearchEnabled: true,
  }
];

async function main() {
  console.log('--- Configurando Fornecedores ---');
  for (const item of suppliersData) {
    const existing = await prisma.supplier.findFirst({
      where: {
        OR: [
          { name: { contains: item.name } },
          { url: { contains: item.url } }
        ]
      }
    });

    if (existing) {
      await prisma.supplier.update({
        where: { id: existing.id },
        data: item,
      });
      console.log(`[ATUALIZADO] ${item.name} (${item.loginCredential})`);
    } else {
      await prisma.supplier.create({
        data: item,
      });
      console.log(`[CRIADO] ${item.name} (${item.loginCredential})`);
    }
  }

  const all = await prisma.supplier.findMany();
  console.log(`Total de fornecedores configurados: ${all.length}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
