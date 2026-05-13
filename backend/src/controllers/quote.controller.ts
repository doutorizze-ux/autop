import { Request, Response } from 'express';
import { ScraperService } from '../services/scraper.service';
import { PrismaClient } from '@prisma/client';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

type QuoteItem = {
    query: string;
    description?: string;
    label: string;
};

type QuoteMatrix = Record<string, any[]>;
type SelectedOffersMatrix = Record<string, Record<string, any | null>>;

type StoredQuotePayload = {
    version: number;
    items: QuoteItem[];
    suppliers: string[];
    matrix: QuoteMatrix;
    selectedOffers?: SelectedOffersMatrix;
};

type ParsedStoredQuote = {
    items: QuoteItem[];
    suppliers: string[];
    matrix: QuoteMatrix;
    selectedOffers?: SelectedOffersMatrix;
};

type QuotePdfSection = {
    title: string;
    subtitle?: string;
    items: QuoteItem[];
    suppliers: string[];
    matrix: QuoteMatrix;
    selectedOffers: SelectedOffersMatrix;
};

type QuoteJobStatus = 'running' | 'completed' | 'failed' | 'cancelled';

type QuoteJob = {
    id: string;
    status: QuoteJobStatus;
    items: QuoteItem[];
    suppliers: string[];
    matrix: QuoteMatrix;
    createdAt: string;
    updatedAt: string;
    quoteId?: string;
    completedAt?: string;
    error?: string;
    cancelled: boolean;
};

const quoteJobs = new Map<string, QuoteJob>();

function buildResultIdentity(result: any) {
    const normalize = (value: unknown) =>
        String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();

    return [
        normalize(result?.provider),
        normalize(result?.variantKey || `${result?.product || ''} ${result?.application || ''}`),
        normalize(result?.brand),
        normalize(result?.code),
    ].join('::');
}

function serializeQuoteJob(job: QuoteJob) {
    return {
        jobId: job.id,
        status: job.status,
        items: job.items,
        suppliers: job.suppliers,
        matrix: job.matrix,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt,
        quoteId: job.quoteId,
        error: job.error,
    };
}

function buildItemLabel(query: string, description?: string) {
    const cleanDescription = String(description || '').trim();
    return cleanDescription ? `${query} - ${cleanDescription}` : query;
}

function normalizeQuoteItems(body: any): QuoteItem[] {
    if (Array.isArray(body?.items)) {
        const normalized = body.items
            .map((item: any) => {
                const query = String(item?.query || item?.product || '').trim();
                const description = String(item?.description || '').trim();

                if (!query) {
                    return null;
                }

                return {
                    query,
                    description: description || undefined,
                    label: buildItemLabel(query, description),
                };
            })
            .filter(Boolean) as QuoteItem[];

        const uniqueMap = new Map<string, QuoteItem>();
        normalized.forEach((item) => {
            if (!uniqueMap.has(item.query)) {
                uniqueMap.set(item.query, item);
            }
        });

        return Array.from(uniqueMap.values());
    }

    if (Array.isArray(body?.productNames)) {
        return body.productNames
            .map((productName: any) => String(productName || '').trim())
            .filter(Boolean)
            .map((query: string) => ({
                query,
                label: query,
            }));
    }

    return [];
}

function extractSuppliersFromMatrix(matrix: QuoteMatrix) {
    return Array.from(
        new Set(
            Object.values(matrix)
                .flat()
                .map((result: any) => result?.provider)
                .filter(Boolean)
        )
    ) as string[];
}

function pickBestResultForExport(results: any[], query: string) {
    const normalizeCode = (value: unknown) =>
        String(value || '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .trim();

    const parsePrice = (value: unknown) => {
        if (value === undefined || value === null || value === '') return Number.POSITIVE_INFINITY;
        if (typeof value === 'number') return value;

        const normalized = String(value)
            .replace(/\s/g, '')
            .replace(/\./g, '')
            .replace(',', '.')
            .replace(/[^\d.-]/g, '');

        const parsed = Number.parseFloat(normalized);
        return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
    };

    const normalizedQuery = normalizeCode(query);
    const validResults = results.filter((entry) => entry && !entry.error);
    const hasExact = validResults.some((entry) => normalizeCode(entry.code) === normalizedQuery);

    return [...validResults].sort((a, b) => {
        const aExact = normalizeCode(a.code) === normalizedQuery;
        const bExact = normalizeCode(b.code) === normalizedQuery;
        if (aExact !== bExact) return aExact ? -1 : 1;
        if (hasExact && aExact !== bExact) return aExact ? -1 : 1;
        return parsePrice(a.price) - parsePrice(b.price);
    })[0] || null;
}

function buildSelectedOffersMatrix(
    matrix: QuoteMatrix,
    suppliers: string[],
    queries: string[],
    rawSelectedOffers?: any
): SelectedOffersMatrix {
    const selectedOffers: SelectedOffersMatrix = {};

    queries.forEach((query) => {
        selectedOffers[query] = {};

        suppliers.forEach((supplier) => {
            const explicitSelection = rawSelectedOffers?.[query]?.[supplier];
            if (explicitSelection && !explicitSelection.error) {
                selectedOffers[query][supplier] = explicitSelection;
                return;
            }

            const supplierResults = (matrix[query] || []).filter((entry) => entry?.provider === supplier);
            selectedOffers[query][supplier] = pickBestResultForExport(supplierResults, query);
        });
    });

    return selectedOffers;
}

function normalizeExportData(body: any) {
    const matrix = (body?.matrix || {}) as QuoteMatrix;
    const items = normalizeQuoteItems(body);
    const fallbackProducts = Array.isArray(body?.products) ? body.products : [];
    const normalizedItems =
        items.length > 0
            ? items
            : fallbackProducts
                  .map((product: any) => String(product || '').trim())
                  .filter(Boolean)
                  .map((query: string) => ({ query, label: query }));

    const suppliers =
        Array.isArray(body?.suppliers) && body.suppliers.length > 0
            ? body.suppliers
            : extractSuppliersFromMatrix(matrix);

    const selectedOffers = buildSelectedOffersMatrix(
        matrix,
        suppliers,
        normalizedItems.map((item: QuoteItem) => item.query),
        body?.selectedOffers
    );

    return { items: normalizedItems, suppliers, matrix, selectedOffers };
}

function parseStoredQuote(quote: { product: string; results: string; createdAt: Date }): ParsedStoredQuote {
    try {
        const parsed = JSON.parse(quote.results);

        if (parsed?.items && parsed?.matrix) {
            const items = parsed.items.map((item: any) => {
                const query = String(item?.query || '').trim();
                const description = String(item?.description || '').trim();

                return {
                    query,
                    description: description || undefined,
                    label: buildItemLabel(query, description),
                };
            });

            return {
                items,
                suppliers: Array.isArray(parsed.suppliers) ? parsed.suppliers : extractSuppliersFromMatrix(parsed.matrix),
                matrix: parsed.matrix as QuoteMatrix,
                selectedOffers: parsed.selectedOffers as SelectedOffersMatrix | undefined,
            };
        }

        const legacyProducts = quote.product
            .split(',')
            .map((product) => product.trim())
            .filter(Boolean);

        return {
            items: legacyProducts.map((query) => ({ query, label: query })),
            suppliers: extractSuppliersFromMatrix(parsed),
            matrix: parsed as QuoteMatrix,
        };
    } catch {
        const legacyProducts = quote.product
            .split(',')
            .map((product) => product.trim())
            .filter(Boolean);

        return {
            items: legacyProducts.map((query) => ({ query, label: query })),
            suppliers: [],
            matrix: {},
        };
    }
}

function drawPDFTableHeader(doc: PDFKit.PDFDocument, suppliers: string[]) {
    const firstColumnWidth = 180;
    const colWidth = suppliers.length > 0 ? (doc.page.width - (firstColumnWidth + 60)) / suppliers.length : 0;
    const startX = 30;
    const currentY = doc.y;

    doc.fontSize(10).font('Helvetica-Bold').fillColor('black');
    doc.text('PESQUISA', startX, currentY, { width: firstColumnWidth });

    suppliers.forEach((supplier: string, index: number) => {
        doc.text(supplier.toUpperCase(), startX + firstColumnWidth + index * colWidth, currentY, {
            width: colWidth,
            align: 'center',
        });
    });

    doc.moveDown(0.5);
    doc.moveTo(startX, doc.y).lineTo(doc.page.width - 30, doc.y).stroke();
    doc.moveDown(0.5);

    return { firstColumnWidth, colWidth, startX };
}

function renderPDFSections(res: Response, sections: QuotePdfSection[], filenamePrefix: string) {
    const doc = new PDFDocument({ layout: 'landscape', margin: 30 });
    const filename = `${filenamePrefix}-${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    doc.pipe(res);

    sections.forEach((section, sectionIndex) => {
        if (sectionIndex > 0) {
            doc.addPage({ layout: 'landscape', margin: 30 });
        }

        doc.fontSize(20).font('Helvetica-Bold').fillColor('black').text(section.title, { align: 'center' });
        doc.moveDown(0.4);

        if (section.subtitle) {
            doc.fontSize(10).font('Helvetica').fillColor('#4B5563').text(section.subtitle, { align: 'center' });
            doc.moveDown(0.5);
        }

        doc.fontSize(10).font('Helvetica').fillColor('black').text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, {
            align: 'right',
        });
        doc.moveDown();

        let { firstColumnWidth, colWidth, startX } = drawPDFTableHeader(doc, section.suppliers);

        section.items.forEach((item) => {
            let currentY = doc.y;
            if (currentY > doc.page.height - 70) {
                doc.addPage({ layout: 'landscape', margin: 30 });
                doc.fontSize(16).font('Helvetica-Bold').fillColor('black').text(section.title, { align: 'center' });
                doc.moveDown(0.4);
                if (section.subtitle) {
                    doc.fontSize(9).font('Helvetica').fillColor('#4B5563').text(section.subtitle, { align: 'center' });
                    doc.moveDown(0.5);
                }
                ({ firstColumnWidth, colWidth, startX } = drawPDFTableHeader(doc, section.suppliers));
                currentY = doc.y;
            }

            doc.font('Helvetica-Bold').fontSize(9).fillColor('black').text(item.query, startX, currentY, { width: firstColumnWidth });
            if (item.description) {
                doc.font('Helvetica').fontSize(8).fillColor('#666').text(item.description, startX, currentY + 11, { width: firstColumnWidth });
            }

            const selectedResults = section.suppliers.map((supplier: string) => section.selectedOffers[item.query]?.[supplier] || null);
            const rowPrices = selectedResults.map((result) => (result && !result.error ? Number.parseFloat(String(result.price)) : Infinity));
            const minPrice = Math.min(...rowPrices);
            const rowHeight = item.description ? 66 : 56;

            section.suppliers.forEach((supplier: string, index: number) => {
                const result = section.selectedOffers[item.query]?.[supplier] || null;
                const x = startX + firstColumnWidth + index * colWidth;

                if (result && !result.error) {
                    const price = Number.parseFloat(String(result.price));
                    if (price === minPrice && minPrice !== Infinity) {
                        doc.save();
                        doc.fillColor('#D1FAE5').rect(x, currentY - 2, colWidth, rowHeight).fill();
                        doc.restore();
                        doc.font('Helvetica-Bold').fillColor('#065F46');
                    } else {
                        doc.font('Helvetica').fillColor('#111827');
                    }

                    doc.fontSize(9).text(`R$ ${price.toFixed(2)}`, x + 4, currentY + 3, { width: colWidth - 8, align: 'center' });
                    doc.fontSize(7).fillColor('#111827').text(`${result.brand || 'Sem fabricante'}${result.code ? ` • ${result.code}` : ''}`, x + 4, currentY + 16, {
                        width: colWidth - 8,
                        align: 'center',
                    });
                    doc.fontSize(7).fillColor('#4B5563').text(String(result.product || 'Peça sem descrição'), x + 4, currentY + 27, {
                        width: colWidth - 8,
                        align: 'center',
                        height: 18,
                        ellipsis: true,
                    });
                    if (result.application) {
                        doc.fontSize(6.5).fillColor('#6B7280').text(`Obs: ${String(result.application)}`, x + 4, currentY + 39, {
                            width: colWidth - 8,
                            align: 'center',
                            height: 14,
                            ellipsis: true,
                        });
                    }
                    doc.fontSize(6.5).fillColor('#6B7280').text(`Estoque: ${result.stockText || result.stock || 0}`, x + 4, currentY + rowHeight - 12, {
                        width: colWidth - 8,
                        align: 'center',
                    });
                } else {
                    const errorText = result?.error ? 'Erro' : '---';
                    doc.font('Helvetica').fontSize(8).fillColor('#9CA3AF').text(errorText, x, currentY + 18, {
                        width: colWidth,
                        align: 'center',
                    });
                }
            });

            doc.y = currentY + rowHeight;
            doc.fillColor('#E5E7EB').moveTo(startX, doc.y).lineTo(doc.page.width - 30, doc.y).stroke();
            doc.fillColor('black').moveDown(0.3);
        });
    });

    doc.end();
}

function renderPDF(res: Response, items: QuoteItem[], suppliers: string[], matrix: QuoteMatrix, selectedOffers: SelectedOffersMatrix, filenamePrefix: string) {
    renderPDFSections(
        res,
        [
            {
                title: 'Planilha de Confronto de Precos',
                items,
                suppliers,
                matrix,
                selectedOffers,
            },
        ],
        filenamePrefix
    );
}

async function renderExcel(res: Response, items: QuoteItem[], suppliers: string[], matrix: QuoteMatrix, selectedOffers: SelectedOffersMatrix, filenamePrefix: string) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Resumo');
    const detailWorksheet = workbook.addWorksheet('Ofertas Selecionadas');

    worksheet.columns = [
        { header: 'CODIGO', key: 'query', width: 24 },
        { header: 'DESCRICAO', key: 'description', width: 40 },
        ...suppliers.map((supplier) => ({ header: supplier, key: supplier, width: 18 })),
    ];

    items.forEach((item) => {
        const rowPrices = suppliers.map((supplier: string) => {
            const result = selectedOffers[item.query]?.[supplier];
            return result && !result.error ? Number.parseFloat(String(result.price)) : Infinity;
        });
        const minPrice = Math.min(...rowPrices);

        const rowData: Record<string, string | number> = {
            query: item.query,
            description: item.description || '',
        };

        suppliers.forEach((supplier: string) => {
            const result = selectedOffers[item.query]?.[supplier];
            rowData[supplier] = result && !result.error ? Number.parseFloat(String(result.price)) : '---';
        });

        const excelRow = worksheet.addRow(rowData);
        suppliers.forEach((supplier: string, index: number) => {
            if (rowData[supplier] === minPrice && minPrice !== Infinity) {
                excelRow.getCell(index + 3).fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFD1FAE5' },
                };
                excelRow.getCell(index + 3).font = { bold: true, color: { argb: 'FF065F46' } };
            }
        });
    });

    detailWorksheet.columns = [
        { header: 'CODIGO PESQUISADO', key: 'query', width: 20 },
        { header: 'DESCRICAO DA EQUIPE', key: 'description', width: 28 },
        { header: 'FORNECEDOR', key: 'provider', width: 24 },
        { header: 'TIPO', key: 'matchType', width: 18 },
        { header: 'PECA SELECIONADA', key: 'product', width: 40 },
        { header: 'CODIGO DO FORNECEDOR', key: 'code', width: 20 },
        { header: 'FABRICANTE', key: 'brand', width: 22 },
        { header: 'APLICACAO / OBS', key: 'application', width: 38 },
        { header: 'ESTOQUE', key: 'stock', width: 18 },
        { header: 'PRECO', key: 'price', width: 14 },
    ];

    items.forEach((item) => {
        suppliers.forEach((supplier) => {
            const result = selectedOffers[item.query]?.[supplier];
            if (!result || result.error) return;

            const normalizedQuery = String(item.query || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const normalizedCode = String(result.code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const matchType = normalizedCode
                ? normalizedCode === normalizedQuery
                    ? 'Código exato'
                    : 'Similar real'
                : 'Código não informado';

            detailWorksheet.addRow({
                query: item.query,
                description: item.description || '',
                provider: supplier,
                matchType,
                product: result.product || '',
                code: result.code || '',
                brand: result.brand || '',
                application: result.application || '',
                stock: result.stockText || result.stock || '',
                price: Number.parseFloat(String(result.price)),
            });
        });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filenamePrefix}-${Date.now()}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
}

export const searchQuote = async (req: Request, res: Response) => {
    try {
        const items = normalizeQuoteItems(req.body);

        if (items.length === 0) {
            return res.status(400).json({ message: 'Lista de produtos e obrigatoria' });
        }

        if (items.length > 1) {
            return res.status(400).json({ message: 'Informe apenas um codigo ou produto por cotacao.' });
        }

        const job: QuoteJob = {
            id: randomUUID(),
            status: 'running',
            items,
            suppliers: [],
            matrix: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            cancelled: false,
        };

        quoteJobs.set(job.id, job);

        void runQuoteJob(job, req.body.socketId);

        return res.status(202).json(serializeQuoteJob(job));
    } catch (err) {
        console.error('Start Quote Job Error:', err);
        return res.status(500).json({ message: 'Erro ao iniciar cotacao em lote' });
    }
};

async function runQuoteJob(job: QuoteJob, socketId?: string) {
    try {
        const productNames = job.items.map((item) => item.query);
        const matrix = await ScraperService.searchMultipleProducts(
            productNames,
            socketId,
            ({ supplier, productName, result }) => {
                if (!job.matrix[productName]) {
                    job.matrix[productName] = [];
                }

                const identity = buildResultIdentity(result);
                const existingIndex = job.matrix[productName].findIndex((entry: any) => buildResultIdentity(entry) === identity);
                if (existingIndex >= 0) {
                    job.matrix[productName][existingIndex] = result;
                } else {
                    job.matrix[productName].push(result);
                }

                if (!job.suppliers.includes(supplier)) {
                    job.suppliers.push(supplier);
                }

                job.updatedAt = new Date().toISOString();
            },
            () => job.cancelled
        );

        if (job.cancelled) {
            job.status = 'cancelled';
            job.completedAt = new Date().toISOString();
            job.updatedAt = job.completedAt;
            return;
        }

        const suppliers = extractSuppliersFromMatrix(matrix);

        const payload: StoredQuotePayload = {
            version: 2,
            items: job.items,
            suppliers,
            matrix,
            selectedOffers: buildSelectedOffersMatrix(matrix, suppliers, job.items.map((item) => item.query)),
        };

        const savedQuote = await prisma.quote.create({
            data: {
                product: job.items.map((item) => item.label).join(' | '),
                results: JSON.stringify(payload),
            },
        });

        job.status = 'completed';
        job.quoteId = savedQuote.id;
        job.completedAt = savedQuote.createdAt.toISOString();
        job.updatedAt = new Date().toISOString();
        job.suppliers = suppliers;
        job.matrix = matrix;
    } catch (err) {
        console.error('Run Quote Job Error:', err);
        job.status = 'failed';
        job.error = err instanceof Error ? err.message : 'Erro ao processar cotacao em lote';
        job.completedAt = new Date().toISOString();
        job.updatedAt = job.completedAt;
    }
}

export const getQuoteJob = async (req: Request, res: Response) => {
    const job = quoteJobs.get(req.params.jobId);

    if (!job) {
        return res.status(404).json({ message: 'Orcamento em andamento nao encontrado.' });
    }

    return res.json(serializeQuoteJob(job));
};

export const cancelQuoteJob = async (req: Request, res: Response) => {
    const job = quoteJobs.get(req.params.jobId);

    if (!job) {
        return res.status(404).json({ message: 'Orcamento em andamento nao encontrado.' });
    }

    if (job.status === 'running') {
        job.cancelled = true;
        job.status = 'cancelled';
        job.updatedAt = new Date().toISOString();
        job.completedAt = job.updatedAt;
    }

    return res.json(serializeQuoteJob(job));
};

export const listQuoteHistory = async (_req: Request, res: Response) => {
    try {
        const quotes = await prisma.quote.findMany({
            orderBy: { createdAt: 'desc' },
        });

        const history = quotes.map((quote) => {
            const parsed = parseStoredQuote(quote);
            return {
                id: quote.id,
                createdAt: quote.createdAt,
                itemCount: parsed.items.length,
                items: parsed.items,
                title: parsed.items.map((item) => item.label).join(' | '),
            };
        });

        res.json(history);
    } catch (err) {
        console.error('List Quote History Error:', err);
        res.status(500).json({ message: 'Erro ao listar historico de cotacoes' });
    }
};

export const getQuoteHistoryById = async (req: Request, res: Response) => {
    try {
        const quote = await prisma.quote.findUnique({
            where: { id: req.params.id },
        });

        if (!quote) {
            return res.status(404).json({ message: 'Cotacao nao encontrada' });
        }

        const parsed = parseStoredQuote(quote);

        res.json({
            id: quote.id,
            createdAt: quote.createdAt,
            items: parsed.items,
            suppliers: parsed.suppliers,
            matrix: parsed.matrix,
        });
    } catch (err) {
        console.error('Get Quote History Error:', err);
        res.status(500).json({ message: 'Erro ao carregar cotacao salva' });
    }
};

export const deleteQuoteHistory = async (req: Request, res: Response) => {
    try {
        const existingQuote = await prisma.quote.findUnique({
            where: { id: req.params.id },
            select: { id: true },
        });

        if (!existingQuote) {
            return res.status(404).json({ error: 'Cotacao nao encontrada.' });
        }

        await prisma.quote.delete({
            where: { id: req.params.id },
        });

        return res.json({ success: true });
    } catch (error) {
        console.error('Erro ao excluir cotacao do historico:', error);
        return res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

export const exportPDF = async (req: Request, res: Response) => {
    try {
        const { items, suppliers, matrix, selectedOffers } = normalizeExportData(req.body);
        renderPDF(res, items, suppliers, matrix, selectedOffers, 'orcamento');
    } catch (err) {
        console.error('Export PDF Error:', err);
        res.status(500).json({ message: 'Erro ao gerar PDF da matriz' });
    }
};

export const exportExcel = async (req: Request, res: Response) => {
    try {
        const { items, suppliers, matrix, selectedOffers } = normalizeExportData(req.body);
        await renderExcel(res, items, suppliers, matrix, selectedOffers, 'orcamento');
    } catch (err) {
        console.error('Export Excel Error:', err);
        res.status(500).json({ message: 'Erro ao gerar Excel da matriz' });
    }
};

export const exportSavedQuotePDF = async (req: Request, res: Response) => {
    try {
        const quote = await prisma.quote.findUnique({
            where: { id: req.params.id },
        });

        if (!quote) {
            return res.status(404).json({ message: 'Cotacao nao encontrada' });
        }

        const parsed = parseStoredQuote(quote);
        renderPDF(
            res,
            parsed.items,
            parsed.suppliers,
            parsed.matrix,
            parsed.selectedOffers || buildSelectedOffersMatrix(parsed.matrix, parsed.suppliers, parsed.items.map((item) => item.query)),
            `orcamento-${quote.id}`
        );
    } catch (err) {
        console.error('Export Saved PDF Error:', err);
        res.status(500).json({ message: 'Erro ao gerar PDF da cotacao salva' });
    }
};

export const exportMultipleSavedQuotesPDF = async (req: Request, res: Response) => {
    try {
        const ids = Array.isArray(req.body?.ids)
            ? req.body.ids.map((id: unknown) => String(id || '').trim()).filter(Boolean)
            : [];

        if (ids.length === 0) {
            return res.status(400).json({ message: 'Selecione ao menos um orcamento para exportar.' });
        }

        const quotes = await prisma.quote.findMany({
            where: { id: { in: ids } },
        });

        if (quotes.length === 0) {
            return res.status(404).json({ message: 'Nenhuma cotacao encontrada para exportacao.' });
        }

        const orderMap = new Map<string, number>(ids.map((id: string, index: number) => [id, index]));
        const orderedQuotes = [...quotes].sort(
            (a, b) => (orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER)
        );

        const sections: QuotePdfSection[] = orderedQuotes.map((quote, index) => {
            const parsed = parseStoredQuote(quote);
            return {
                title: `Orcamento ${index + 1}`,
                subtitle: `${new Date(quote.createdAt).toLocaleString('pt-BR')} | ${parsed.items.length} item(ns)`,
                items: parsed.items,
                suppliers: parsed.suppliers,
                matrix: parsed.matrix,
                selectedOffers:
                    parsed.selectedOffers ||
                    buildSelectedOffersMatrix(parsed.matrix, parsed.suppliers, parsed.items.map((item) => item.query)),
            };
        });

        renderPDFSections(res, sections, 'orcamentos-selecionados');
    } catch (err) {
        console.error('Export Multiple Saved PDFs Error:', err);
        res.status(500).json({ message: 'Erro ao gerar PDF dos orcamentos selecionados' });
    }
};

export const exportSavedQuoteExcel = async (req: Request, res: Response) => {
    try {
        const quote = await prisma.quote.findUnique({
            where: { id: req.params.id },
        });

        if (!quote) {
            return res.status(404).json({ message: 'Cotacao nao encontrada' });
        }

        const parsed = parseStoredQuote(quote);
        await renderExcel(
            res,
            parsed.items,
            parsed.suppliers,
            parsed.matrix,
            parsed.selectedOffers || buildSelectedOffersMatrix(parsed.matrix, parsed.suppliers, parsed.items.map((item) => item.query)),
            `orcamento-${quote.id}`
        );
    } catch (err) {
        console.error('Export Saved Excel Error:', err);
        res.status(500).json({ message: 'Erro ao gerar Excel da cotacao salva' });
    }
};
