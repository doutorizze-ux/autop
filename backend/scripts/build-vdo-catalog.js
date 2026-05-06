const fs = require('fs');
const path = require('path');

const sourcePath = 'C:\\tmp\\vdo_catalog_extract\\vdo_pages_ocr.jsonl';
const outputPath = path.resolve(__dirname, '../data/vdo-catalog.json');

const raw = fs.readFileSync(sourcePath, 'utf8');
const pages = raw
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const skipExact = new Set([
  'Tabela de Aplicacao',
  'TabeladeAplicacao',
  'Tabela deAplicacao',
  'Tabela de Aplicação',
  'Produto',
  'CodigoVDO',
  'Descricao/Especificacao',
  'Descricao/ Especificacao',
  'Veiculo*Motor*Combustivel',
  '(Continuacao)',
  '(Continuagao)',
  'Catalogo de pecas de reposicao 2026',
  'Catalogodepecas dereposicao2026',
  'Catalogo depecas de reposicao2026',
  'VDO',
  'VUO',
]);

const codeRegex = /^(?=.*\d)[A-Z0-9][A-Z0-9.\-/]{3,}$/;

function normalizeLine(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .trim();
}

function isPageFooter(line) {
  return /^\d{1,3}$/.test(line);
}

function isCodeLine(line) {
  if (!line) return false;
  if (skipExact.has(line)) return false;
  if (line === 'LANCAMENTO' || line === 'Original') return false;
  if (!codeRegex.test(line)) return false;
  if (line.includes('*')) return false;
  return true;
}

function looksLikeBrand(line) {
  if (!line) return false;
  if (line.length > 40) return false;
  if (/\d/.test(line)) return false;
  if (line.includes('*') || line.includes(':')) return false;
  return /^[A-ZÀ-Ú /.-]+$/.test(line);
}

function looksLikeUpcomingRecordStart(lines, index) {
  const current = lines[index];
  if (!current || current.includes('*') || current.includes(':')) return false;
  if (!(looksLikeBrand(current) || current === 'LANCAMENTO' || current === 'Original')) return false;

  for (let offset = 1; offset <= 4; offset += 1) {
    const next = lines[index + offset];
    if (!next) break;
    if (isCodeLine(next)) return true;
  }
  return false;
}

const flattened = [];

pages.forEach((page) => {
  page.lines
    .map(normalizeLine)
    .filter((line) => line && !skipExact.has(line) && !isPageFooter(line))
    .forEach((line) => flattened.push(line));
});

const records = [];
const recentContext = [];

for (let i = 0; i < flattened.length; i += 1) {
  const line = flattened[i];
  if (!line) continue;

  if (isCodeLine(line)) {
    const previousContext = recentContext.slice(-4);
    let description = '';
    let cursor = i + 1;

    while (cursor < flattened.length) {
      const candidate = flattened[cursor];
      if (!candidate || candidate === 'LANCAMENTO' || candidate === 'Original') {
        cursor += 1;
        continue;
      }
      description = candidate;
      cursor += 1;
      break;
    }

    const applications = [];
    const references = [];

    while (cursor < flattened.length) {
      const candidate = flattened[cursor];
      if (!candidate) {
        cursor += 1;
        continue;
      }

      if (isCodeLine(candidate) || looksLikeUpcomingRecordStart(flattened, cursor)) {
        break;
      }

      if (candidate === 'LANCAMENTO' || candidate === 'Original') {
        cursor += 1;
        continue;
      }

      if (candidate.includes('*')) {
        applications.push(candidate);
      } else if (/^[A-Z0-9 .\-\/]{5,}$/.test(candidate) || candidate.includes(':')) {
        references.push(candidate);
      } else {
        applications.push(candidate);
      }

      cursor += 1;
    }

    const brand = previousContext.find(looksLikeBrand) || '';
    const contextWithoutBrand = previousContext.filter((entry) => entry !== brand);

    records.push({
      code: line,
      description,
      brand,
      category: contextWithoutBrand[0] || '',
      family: contextWithoutBrand[1] || '',
      context: previousContext,
      applications,
      references,
      searchText: [
        line,
        description,
        brand,
        ...contextWithoutBrand,
        ...applications,
        ...references,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    });

    i = cursor - 1;
    continue;
  }

  recentContext.push(line);
  if (recentContext.length > 8) {
    recentContext.shift();
  }
}

const unique = new Map();

records.forEach((record) => {
  const key = `${record.code}::${record.description}::${record.brand}`;
  if (!unique.has(key)) {
    unique.set(key, record);
  }
});

const finalRecords = Array.from(unique.values()).sort((a, b) => {
  const brandCompare = String(a.brand || '').localeCompare(String(b.brand || ''), 'pt-BR');
  if (brandCompare !== 0) return brandCompare;
  return String(a.code || '').localeCompare(String(b.code || ''), 'pt-BR');
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      count: finalRecords.length,
      items: finalRecords,
    },
    null,
    2
  ),
  'utf8'
);

console.log(`VDO catalog generated with ${finalRecords.length} records at ${outputPath}`);
