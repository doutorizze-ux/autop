/**
 * Testes da logica da extensao.
 *
 * O que da para testar fora do Chrome: conversao de preco, resolucao de perfil,
 * normalizacao do payload do endpoint interno e extracao de DOM. As APIs
 * chrome.* sao simuladas para o modulo de fornecedores poder ser importado.
 *
 * Rodar: node chrome-extension/tests/run-tests.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const extDir = path.resolve(here, '..');

/* ---------- ambiente simulado do Chrome ---------- */

const chromeStub = {
  tabs: {
    query: async () => [],
    get: async () => null,
    create: async () => ({ id: 1 }),
    update: async () => {},
    remove: async () => {},
    reload: async () => {},
    captureVisibleTab: async () => null,
  },
  scripting: { executeScript: async () => [] },
  alarms: {
    get: async () => null,
    create: () => {},
    clear: async () => {},
    onAlarm: { addListener: () => {} },
  },
  storage: { local: { get: async () => ({}), set: async () => {} } },
  runtime: { onMessage: { addListener: () => {} }, onStartup: { addListener: () => {} }, onInstalled: { addListener: () => {} } },
  cookies: { getAll: async () => [] },
};

globalThis.chrome = chromeStub;

/* ---------- carregamento dos modulos reais ---------- */

const suppliersSource = readFileSync(path.join(extDir, 'suppliers.js'), 'utf8');
const suppliersModule = await import(
  `data:text/javascript;base64,${Buffer.from(suppliersSource).toString('base64')}`
);

const { parsePriceValue, resolveProfile, SUPPLIER_PROFILES } = suppliersModule;

/* ---------- mini framework ---------- */

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error.message}`);
  }
}

console.log('\n== parsePriceValue (contrato com o backend) ==');

test('le formato brasileiro com milhar: "R$ 1.234,56" -> 1234.56', () => {
  assert.equal(parsePriceValue('R$ 1.234,56'), 1234.56);
});

test('le decimal simples: "R$ 89,90" -> 89.9', () => {
  assert.equal(parsePriceValue('R$ 89,90'), 89.9);
});

test('le ponto como milhar em "1.234" -> 1234', () => {
  assert.equal(parsePriceValue('R$ 1.234'), 1234);
});

test('le valor sem simbolo: "249.90" -> 249.9', () => {
  assert.equal(parsePriceValue('249.90'), 249.9);
});

test('preserva numero puro', () => {
  assert.equal(parsePriceValue(76.5), 76.5);
});

test('devolve 0 para texto sem preco', () => {
  assert.equal(parsePriceValue('indisponivel'), 0);
  assert.equal(parsePriceValue('---'), 0);
  assert.equal(parsePriceValue(''), 0);
  assert.equal(parsePriceValue(null), 0);
});

test('sempre devolve numero (nunca NaN) — o backend descarta NaN', () => {
  for (const entry of ['R$ abc', 'R$', 'x1,2,3', undefined, {}, []]) {
    const value = parsePriceValue(entry);
    assert.equal(typeof value, 'number');
    assert.ok(Number.isFinite(value), `valor nao finito para ${JSON.stringify(entry)}`);
  }
});

console.log('\n== resolveProfile ==');

test('casa RMP por nome', () => {
  assert.equal(resolveProfile({ name: 'Real Moto Pecas (RMP)' }).key, 'rmp');
});

test('casa DPK por dominio, mesmo com nome diferente', () => {
  assert.equal(resolveProfile({ name: 'Distribuidora X', url: 'https://www.dpk.com.br' }).key, 'dpk');
});

test('casa Auto Norte por nome fantasia', () => {
  assert.equal(resolveProfile({ name: 'Auto Norte (KKI)' }).key, 'kki');
});

test('casa Comdip por dominio', () => {
  assert.equal(resolveProfile({ name: 'Qualquer', url: 'https://portalcomdip.com.br/comdip' }).key, 'comdip');
});

test('casa Furacao por dominio', () => {
  assert.equal(resolveProfile({ name: 'Fornecedor', url: 'https://vendas.furacao.com.br/vendas/sav' }).key, 'furacao');
});

test('aceita acento em "Furacao" no nome', () => {
  assert.equal(resolveProfile({ name: 'Furacao Auto Pecas' }).key, 'furacao');
});

test('fornecedor desconhecido vira perfil generico com os seletores cadastrados', () => {
  const profile = resolveProfile({
    id: 'abc',
    name: 'Loja Nova',
    url: 'https://lojanova.com.br',
    searchUrl: 'https://lojanova.com.br/busca?termo={query}',
    itemContainerSelector: '.card',
    priceSelector: '.preco',
  });

  assert.ok(profile.key.startsWith('generic:'));
  assert.equal(profile.buildUrl('PH5949'), 'https://lojanova.com.br/busca?termo=PH5949');
  assert.equal(profile.containerSel, '.card');
});

test('generico sem searchUrl monta ?q= como fallback', () => {
  const profile = resolveProfile({ name: 'Loja', url: 'https://loja.com.br', searchUrl: 'https://loja.com.br/busca' });
  assert.equal(profile.buildUrl('filtro'), 'https://loja.com.br/busca?q=filtro');
});

test('generico sem searchUrl nenhum nao tenta URL', () => {
  const profile = resolveProfile({ name: 'Loja', url: 'https://loja.com.br' });
  assert.equal(profile.buildUrl, null);
});

test('todo perfil conhecido tem os campos obrigatorios', () => {
  for (const profile of SUPPLIER_PROFILES) {
    assert.ok(profile.key, 'sem key');
    assert.ok(profile.name, `${profile.key} sem name`);
    assert.ok(profile.containerSel, `${profile.key} sem containerSel`);
    assert.ok(profile.priceSel, `${profile.key} sem priceSel`);
    assert.ok(profile.nameSel, `${profile.key} sem nameSel`);
  }
});

console.log('\n== PAGE_extract (extracao de DOM) ==');

// Mini DOM suficiente para exercitar a funcao real de extracao.
function buildFakeDocument(html) {
  const { JSDOM } = domImpl;
  return new JSDOM(html).window.document;
}

let domImpl = null;
try {
  domImpl = await import('jsdom');
} catch (_) {
  domImpl = null;
}

if (!domImpl) {
  console.log('  skip jsdom nao instalado; testes de extracao pulados');
} else {
  const pageFunctions = await import(
    `data:text/javascript;base64,${Buffer.from(readFileSync(path.join(extDir, 'page-functions.js'), 'utf8')).toString('base64')}`
  );
  const { PAGE_extract, PAGE_probe } = pageFunctions;

  const rmpHtml = `<!doctype html><html><body>
    <ol class="products list items product-items">
      <li class="item product product-item">
        <div class="product-item-info">
          <a class="product-item-link" href="/produto/filtro-oleo-ph5949">Filtro de Oleo PH5949</a>
          <span class="price-box"><span class="price">R$ 27,90</span></span>
          <div class="stock">Disponivel</div>
          <div class="sku">Cod Fabricante: PH5949</div>
        </div>
      </li>
      <li class="item product product-item">
        <div class="product-item-info">
          <a class="product-item-link" href="/produto/pastilha">Pastilha de Freio</a>
          <span class="price-box"><span class="price">R$ 1.234,56</span></span>
          <div class="stock">3 un</div>
          <div class="sku">Marca: Bosch Cod: BOS1234</div>
        </div>
      </li>
      <li class="item product product-item">
        <div class="product-item-info">
          <a class="product-item-link" href="/produto/esgotado">Produto Esgotado</a>
          <span class="price-box"><span class="price">R$ 50,00</span></span>
          <div class="stock">Fora de estoque</div>
        </div>
      </li>
    </ol>
  </body></html>`;

  test('extrai os itens da pagina da RMP', () => {
    const doc = buildFakeDocument(rmpHtml);

    globalThis.document = doc;
    globalThis.location = { href: 'https://www.rmp.com.br/catalogsearch/result/?q=PH5949', origin: 'https://www.rmp.com.br' };
    globalThis.URL = URL;

    const items = PAGE_extract({
      query: 'PH5949',
      provider: 'Real Moto Pecas (RMP)',
      containerSel: 'li.item.product.product-item, .product-item',
      nameSel: '.product-item-link',
      priceSel: '.price-box .price',
    });

    assert.ok(items.length >= 2, `esperava >= 2 itens, veio ${items.length}`);

    const filtro = items.find((item) => item.product.includes('Filtro'));
    assert.ok(filtro, 'filtro nao encontrado');
    assert.equal(filtro.price, 27.9);
  });

  test('respeita o formato brasileiro de milhar na extracao', () => {
    const doc = buildFakeDocument(rmpHtml);
    globalThis.document = doc;
    globalThis.location = { href: 'https://www.rmp.com.br/', origin: 'https://www.rmp.com.br' };

    const items = PAGE_extract({
      query: 'pastilha',
      provider: 'RMP',
      containerSel: '.product-item',
      nameSel: '.product-item-link',
      priceSel: '.price',
    });

    const pastilha = items.find((item) => item.product.includes('Pastilha'));
    assert.ok(pastilha, 'pastilha nao encontrada');
    assert.equal(pastilha.price, 1234.56, 'milhar brasileiro interpretado errado');
  });

  test('marca item indisponivel como available: false', () => {
    const doc = buildFakeDocument(rmpHtml);
    globalThis.document = doc;
    globalThis.location = { href: 'https://www.rmp.com.br/', origin: 'https://www.rmp.com.br' };

    const items = PAGE_extract({
      query: 'x',
      provider: 'RMP',
      containerSel: '.product-item',
      nameSel: '.product-item-link',
      priceSel: '.price',
    });

    const esgotado = items.find((item) => item.product.includes('Esgotado'));
    assert.ok(esgotado, 'item esgotado nao encontrado');
    assert.equal(esgotado.available, false);
  });

  test('todo item extraido tem price numerico (senao o backend descarta)', () => {
    const doc = buildFakeDocument(rmpHtml);
    globalThis.document = doc;
    globalThis.location = { href: 'https://www.rmp.com.br/', origin: 'https://www.rmp.com.br' };

    const items = PAGE_extract({
      query: 'PH5949',
      provider: 'RMP',
      containerSel: '.product-item',
      nameSel: '.product-item-link',
      priceSel: '.price',
    });

    assert.ok(items.length > 0);
    for (const item of items) {
      assert.equal(typeof item.price, 'number', 'price nao numerico');
      assert.ok(item.price > 0, 'price zerado');
      assert.ok(item.product && item.product.length >= 3, 'produto invalido');
      assert.equal(item.provider, 'RMP');
    }
  });

  test('respeita "available" via campo de estoque textual', () => {
    const doc = buildFakeDocument(rmpHtml);
    globalThis.document = doc;
    globalThis.location = { href: 'https://www.rmp.com.br/', origin: 'https://www.rmp.com.br' };

    const items = PAGE_extract({
      query: '3',
      provider: 'RMP',
      containerSel: '.product-item',
      nameSel: '.product-item-link',
      priceSel: '.price',
    });

    const pastilha = items.find((item) => item.product.includes('Pastilha'));
    assert.equal(pastilha.stock, 3, 'quantidade em estoque nao lida');
  });

  test('fallback heuristico funciona sem os seletores cadastrados', () => {
    const doc = buildFakeDocument(`<!doctype html><html><body>
      <div class="unknown-wrapper">
        <div class="row-x">
          <span>Filtro de Ar Esportivo</span>
          <b>R$ 149,90</b>
        </div>
        <div class="row-x">
          <span>Vela de Ignicao Iridium</span>
          <b>R$ 62,50</b>
        </div>
      </div>
    </body></html>`);

    globalThis.document = doc;
    globalThis.location = { href: 'https://portal.exemplo.com/', origin: 'https://portal.exemplo.com' };

    const items = PAGE_extract({
      query: 'filtro',
      provider: 'Portal X',
      containerSel: '.nao-existe-no-html',
      nameSel: '.nao-existe',
      priceSel: '.nao-existe',
    });

    assert.ok(items.length >= 1, `fallback nao achou nada (${items.length})`);
    assert.ok(items.some((item) => item.price === 149.9 || item.price === 62.5));
  });

  test('PAGE_probe detecta quando nao ha resultado', () => {
    const doc = buildFakeDocument('<!doctype html><html><body><p>Nenhum produto encontrado</p></body></html>');
    globalThis.document = doc;
    globalThis.location = { href: 'https://x.com/', origin: 'https://x.com' };
    globalThis.window = { devicePixelRatio: 1 };

    const probe = PAGE_probe({ containerSel: '.product-item' });
    assert.equal(probe.ready, false);
    assert.equal(probe.empty, true);
  });

  test('PAGE_probe detecta tela de login', () => {
    const doc = buildFakeDocument('<!doctype html><html><body><h1>Faca login para continuar</h1><input type="password"></body></html>');
    globalThis.document = doc;
    globalThis.location = { href: 'https://x.com/login', origin: 'https://x.com' };
    globalThis.window = { devicePixelRatio: 1 };

    const probe = PAGE_probe({ containerSel: '.product-item' });
    assert.equal(probe.ready, false);
    assert.equal(probe.logging, true);
  });

  test('PAGE_probe confirma ready quando ha preco visivel', () => {
    const doc = buildFakeDocument(rmpHtml);
    globalThis.document = doc;
    globalThis.location = { href: 'https://www.rmp.com.br/', origin: 'https://www.rmp.com.br' };
    globalThis.window = { devicePixelRatio: 1 };

    const probe = PAGE_probe({ containerSel: '.product-item' });
    assert.equal(probe.ready, true);
    assert.ok(probe.priced > 0);
  });
}

console.log('\n== assinatura dos arquivos do manifest ==');

const manifest = JSON.parse(readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));

test('service worker e module', () => {
  assert.equal(manifest.background.type, 'module');
});

test('declara os arquivos que realmente existem', () => {
  for (const file of [manifest.background.service_worker, 'popup.html', 'popup.js', 'popup.css']) {
    const exists = readFileSync(path.join(extDir, file));
    assert.ok(exists.length > 0, `${file} vazio`);
  }
});

test('o hook roda no MAIN world em document_start (senao nao ve o trafego do portal)', () => {
  const hook = manifest.content_scripts[0];
  assert.equal(hook.world, 'MAIN');
  assert.equal(hook.run_at, 'document_start');
  assert.ok(!hook.js.includes('page-functions.js'), 'page-functions e injetado por scripting, nao por content_script');
});

console.log(`\n${passed} passaram, ${failed} falharam\n`);
process.exit(failed > 0 ? 1 : 0);