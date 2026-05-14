import { Request, Response } from 'express';
import { ScraperService } from '../services/scraper.service';
import { PrismaClient } from '@prisma/client';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { randomUUID } from 'crypto';
import { AuthRequest } from '../middlewares/auth.middleware';
import { whatsappService } from '../services/whatsapp.service';

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
    userId: string;
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

function getRequestUserId(req: Request) {
    return String((req as AuthRequest).user?.userId || '').trim();
}

function isAdminRequest(req: Request) {
    return (req as AuthRequest).user?.role === 'ADMIN';
}

function getOwnedQuoteWhere(req: Request, id?: string) {
    const userId = getRequestUserId(req);
    return {
        ...(id ? { id } : {}),
        userId,
    };
}

function getReadableQuoteWhere(req: Request, id: string) {
    if (isAdminRequest(req)) {
        return { id };
    }

    return getOwnedQuoteWhere(req, id);
}

function mapQuoteHistoryEntry(quote: any) {
    const parsed = parseStoredQuote(quote);

    return {
        id: quote.id,
        createdAt: quote.createdAt,
        itemCount: parsed.items.length,
        items: parsed.items,
        title: parsed.items.map((item) => item.label).join(' | '),
    };
}

function requireAdmin(req: Request, res: Response) {
    if (!isAdminRequest(req)) {
        res.status(403).json({ message: 'Acesso negado' });
        return false;
    }

    return true;
}

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

function mergeQuoteMatrices(...matrices: QuoteMatrix[]) {
    const merged: QuoteMatrix = {};

    matrices.forEach((matrix) => {
        Object.entries(matrix || {}).forEach(([query, results]) => {
            if (!merged[query]) {
                merged[query] = [];
            }

            (results || []).forEach((result) => {
                const identity = buildResultIdentity(result);
                const existingIndex = merged[query].findIndex((entry: any) => buildResultIdentity(entry) === identity);
                if (existingIndex >= 0) {
                    merged[query][existingIndex] = result;
                } else {
                    merged[query].push(result);
                }
            });
        });
    });

    return merged;
}

function recordQuoteProgress(job: QuoteJob, payload: { supplier: string; productName: string; result: any }) {
    if (!job.matrix[payload.productName]) {
        job.matrix[payload.productName] = [];
    }

    const identity = buildResultIdentity(payload.result);
    const existingIndex = job.matrix[payload.productName].findIndex((entry: any) => buildResultIdentity(entry) === identity);
    if (existingIndex >= 0) {
        job.matrix[payload.productName][existingIndex] = payload.result;
    } else {
        job.matrix[payload.productName].push(payload.result);
    }

    if (!job.suppliers.includes(payload.supplier)) {
        job.suppliers.push(payload.supplier);
    }

    job.updatedAt = new Date().toISOString();
}

const defaultWhatsappQuoteTemplate = [
    'Olá, tudo bem?',
    'Pode cotar este item para mim?',
    '',
    'Código/peça: {{codigo}}',
    'Descrição: {{descricao}}',
    '',
    'Por favor, envie preço, fabricante/marca e disponibilidade.',
].join('\n');

function buildSupplierWhatsappMessage(supplier: any, item: QuoteItem) {
    const template = String(supplier.whatsappMessageTemplate || '').trim() || defaultWhatsappQuoteTemplate;
    const replacements: Record<string, string> = {
        codigo: item.query,
        query: item.query,
        peca: item.query,
        descricao: item.description || '-',
        fornecedor: supplier.name || '',
    };

    return template.replace(/\{\{\s*(codigo|query|peca|descricao|fornecedor)\s*\}\}/gi, (_, key) => {
        return replacements[String(key).toLowerCase()] || '';
    });
}

function buildWhatsappLink(phone?: string | null) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    const withCountry = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
    return `https://wa.me/${withCountry}`;
}

async function sendWhatsappSupplierQuoteRequests(job: QuoteJob) {
    const suppliers = await prisma.supplier.findMany({
        where: {
            whatsappEnabled: true,
            whatsappPhone: { not: null },
        },
        orderBy: { name: 'asc' },
    });
    const matrix: QuoteMatrix = {};

    for (const item of job.items) {
        if (job.cancelled) break;

        for (const supplier of suppliers) {
            if (job.cancelled) break;

            const message = buildSupplierWhatsappMessage(supplier, item);
            const baseResult: any = {
                provider: supplier.name,
                product: `Solicitação enviada pelo WhatsApp: ${item.query}`,
                code: item.query,
                brand: 'WhatsApp',
                price: 'Aguardando resposta',
                available: false,
                stockText: 'Envio pendente',
                link: buildWhatsappLink(supplier.whatsappPhone),
                whatsappStatus: 'pending',
                whatsappPhone: supplier.whatsappPhone,
            };

            let result: any = baseResult;

            try {
                const sent = await whatsappService.sendMessage(job.userId, supplier.whatsappPhone || '', message);
                result = {
                    ...baseResult,
                    stockText: 'Enviado ao servidor do WhatsApp',
                    whatsappStatus: 'queued',
                    whatsappMessageId: sent?.messageId || '',
                    whatsappJid: sent?.to || '',
                };
            } catch (error) {
                result = {
                    ...baseResult,
                    price: '---',
                    stockText: 'Falha no envio',
                    whatsappStatus: 'failed',
                    whatsappError: error instanceof Error ? error.message : 'Não foi possível enviar pelo WhatsApp.',
                };
            }

            if (!matrix[item.query]) {
                matrix[item.query] = [];
            }
            matrix[item.query].push(result);
            recordQuoteProgress(job, {
                supplier: supplier.name,
                productName: item.query,
                result,
            });
        }
    }

    return matrix;
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

function normalizeExportCode(value: unknown) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

function parseExportPrice(value: unknown) {
    if (value === undefined || value === null || value === '') return Number.POSITIVE_INFINITY;
    if (typeof value === 'number') return value;

    const normalized = String(value)
        .replace(/\s/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
        .replace(/[^\d.-]/g, '');

    const parsed = Number.parseFloat(normalized);
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

function isExactResultForQuery(result: any, query: string) {
    const normalizedQuery = normalizeExportCode(query);
    const normalizedCode = normalizeExportCode(result?.code);
    return !!normalizedQuery && !!normalizedCode && normalizedCode === normalizedQuery;
}

function shouldRenderResultInPdf(result: any, query: string) {
    if (!result || result.error || result.whatsappStatus) return false;
    if (!Number.isFinite(parseExportPrice(result.price))) return false;
    return isExactResultForQuery(result, query) || result.exportSelectedSimilar === true;
}

function pickBestResultForExport(results: any[], query: string) {
    const normalizedQuery = normalizeExportCode(query);
    const validResults = results.filter((entry) => entry && !entry.error);
    const hasExact = validResults.some((entry) => normalizeExportCode(entry.code) === normalizedQuery);

    return [...validResults].sort((a, b) => {
        const aExact = normalizeExportCode(a.code) === normalizedQuery;
        const bExact = normalizeExportCode(b.code) === normalizedQuery;
        if (aExact !== bExact) return aExact ? -1 : 1;
        if (hasExact && aExact !== bExact) return aExact ? -1 : 1;
        return parseExportPrice(a.price) - parseExportPrice(b.price);
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

function renderPDFSectionsLegacy(res: Response, sections: QuotePdfSection[], filenamePrefix: string) {
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

function renderPDFSections(res: Response, sections: QuotePdfSection[], filenamePrefix: string) {
    const doc = new PDFDocument({ layout: 'landscape', margin: 36, size: 'A4' });
    const filename = `${filenamePrefix}-${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    doc.pipe(res);

    const pageBottom = () => doc.page.height - doc.page.margins.bottom;
    const startX = doc.page.margins.left;
    const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const columns = {
        supplier: 118,
        price: 76,
        code: 86,
        brand: 92,
        stock: 74,
        product: tableWidth - 118 - 76 - 86 - 92 - 74,
    };

    const ensureSpace = (height: number) => {
        if (doc.y + height <= pageBottom()) return;
        doc.addPage({ layout: 'landscape', margin: 36, size: 'A4' });
    };

    const drawTableHeader = () => {
        const y = doc.y;
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#111827');
        doc.text('FORNECEDOR', startX + 6, y, { width: columns.supplier - 8 });
        doc.text('PRECO', startX + columns.supplier + 6, y, { width: columns.price - 8, align: 'right' });
        doc.text('CODIGO', startX + columns.supplier + columns.price + 6, y, { width: columns.code - 8 });
        doc.text('FABRICANTE', startX + columns.supplier + columns.price + columns.code + 6, y, { width: columns.brand - 8 });
        doc.text('ESTOQUE', startX + columns.supplier + columns.price + columns.code + columns.brand + 6, y, { width: columns.stock - 8 });
        doc.text('PECA RETORNADA', startX + columns.supplier + columns.price + columns.code + columns.brand + columns.stock + 6, y, { width: columns.product - 8 });
        doc.moveDown(0.7);
        doc.moveTo(startX, doc.y).lineTo(startX + tableWidth, doc.y).strokeColor('#111827').lineWidth(0.8).stroke();
        doc.moveDown(0.35);
    };

    const drawSupplierRow = (supplier: string, result: any, bestPrice: number) => {
        const price = result && !result.error ? parseExportPrice(result.price) : Number.POSITIVE_INFINITY;
        const hasPrintableResult = !!result && !result.error && Number.isFinite(price);
        const isBest = hasPrintableResult && price === bestPrice && bestPrice !== Number.POSITIVE_INFINITY;
        const rowHeight = 44;
        ensureSpace(rowHeight + 8);

        const y = doc.y;
        if (isBest) {
            doc.save();
            doc.fillColor('#D1FAE5').rect(startX, y - 3, tableWidth, rowHeight).fill();
            doc.restore();
        }

        const xSupplier = startX;
        const xPrice = xSupplier + columns.supplier;
        const xCode = xPrice + columns.price;
        const xBrand = xCode + columns.code;
        const xStock = xBrand + columns.brand;
        const xProduct = xStock + columns.stock;

        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111827')
            .text(supplier, xSupplier + 6, y + 6, { width: columns.supplier - 8, height: 28, ellipsis: true });

        if (hasPrintableResult) {
            doc.font(isBest ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(isBest ? '#065F46' : '#111827')
                .text(`R$ ${price.toFixed(2)}`, xPrice + 6, y + 6, { width: columns.price - 8, align: 'right' });
            doc.font('Helvetica').fontSize(7.5).fillColor('#374151')
                .text(String(result.code || '-'), xCode + 6, y + 6, { width: columns.code - 8, height: 28, ellipsis: true });
            doc.text(String(result.brand || '-'), xBrand + 6, y + 6, { width: columns.brand - 8, height: 28, ellipsis: true });
            doc.text(String(result.stockText || result.stock || '0'), xStock + 6, y + 6, { width: columns.stock - 8, height: 28, ellipsis: true });
            doc.text(String(result.product || 'Peca sem descricao'), xProduct + 6, y + 6, { width: columns.product - 8, height: 16, ellipsis: true });
            if (result.application) {
                doc.fontSize(6.8).fillColor('#6B7280')
                    .text(String(result.application), xProduct + 6, y + 23, { width: columns.product - 8, height: 14, ellipsis: true });
            }
        } else {
            doc.font('Helvetica').fontSize(8).fillColor('#9CA3AF')
                .text(result?.error ? 'Erro na consulta' : 'Sem retorno', xPrice + 6, y + 12, { width: tableWidth - columns.supplier - 8 });
        }

        doc.y = y + rowHeight;
        doc.moveTo(startX, doc.y).lineTo(startX + tableWidth, doc.y).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
        doc.moveDown(0.25);
    };

    doc.fontSize(18).font('Helvetica-Bold').fillColor('#111827').text('Planilha de Confronto de Precos', { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(8).font('Helvetica').fillColor('#4B5563').text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, {
        align: 'right',
    });
    doc.moveDown(0.8);

    sections.forEach((section, sectionIndex) => {
        ensureSpace(84);

        if (sectionIndex > 0) {
            doc.moveDown(0.6);
            doc.moveTo(startX, doc.y).lineTo(startX + tableWidth, doc.y).strokeColor('#CBD5E1').lineWidth(1).stroke();
            doc.moveDown(0.6);
        }

        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(section.title);
        if (section.subtitle) {
            doc.font('Helvetica').fontSize(8).fillColor('#4B5563').text(section.subtitle);
        }
        doc.moveDown(0.5);

        section.items.forEach((item, itemIndex) => {
            ensureSpace(94);
            if (itemIndex > 0) {
                doc.moveDown(0.4);
            }

            doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(`Pesquisa: ${item.query}`);
            if (item.description) {
                doc.font('Helvetica').fontSize(8).fillColor('#4B5563').text(String(item.description), {
                    width: tableWidth,
                    ellipsis: true,
                });
            }
            doc.moveDown(0.4);
            drawTableHeader();

            const selectedResults = section.suppliers.map((supplier: string) => {
                const result = section.selectedOffers[item.query]?.[supplier] || null;
                return shouldRenderResultInPdf(result, item.query) ? result : null;
            });
            const validPrices = selectedResults
                .filter((result) => result && !result.error)
                .map((result) => parseExportPrice(result.price))
                .filter((price) => Number.isFinite(price));
            const bestPrice = validPrices.length ? Math.min(...validPrices) : Number.POSITIVE_INFINITY;

            section.suppliers.forEach((supplier: string) => {
                const result = section.selectedOffers[item.query]?.[supplier] || null;
                drawSupplierRow(supplier, shouldRenderResultInPdf(result, item.query) ? result : null, bestPrice);
            });
        });
    });

    doc.end();
}

function renderPDF(res: Response, items: QuoteItem[], suppliers: string[], matrix: QuoteMatrix, selectedOffers: SelectedOffersMatrix, filenamePrefix: string) {
    renderPDFSections(
        res,
        [
            {
                title: 'Cotacao',
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
        const userId = getRequestUserId(req);

        if (items.length === 0) {
            return res.status(400).json({ message: 'Lista de produtos e obrigatoria' });
        }

        if (!userId) {
            return res.status(401).json({ message: 'Usuario nao autenticado.' });
        }

        const job: QuoteJob = {
            id: randomUUID(),
            userId,
            status: 'running',
            items,
            suppliers: [],
            matrix: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            cancelled: false,
        };

        quoteJobs.set(job.id, job);

        void runQuoteJob(job);

        return res.status(202).json(serializeQuoteJob(job));
    } catch (err) {
        console.error('Start Quote Job Error:', err);
        return res.status(500).json({ message: 'Erro ao iniciar cotacao em lote' });
    }
};

async function runQuoteJob(job: QuoteJob) {
    try {
        const productNames = job.items.map((item) => item.query);
        const [websiteMatrix, whatsappMatrix] = await Promise.all([
            ScraperService.searchMultipleProducts(
                productNames,
                `user:${job.userId}`,
                { jobId: job.id },
                (payload) => recordQuoteProgress(job, payload),
                () => job.cancelled
            ),
            sendWhatsappSupplierQuoteRequests(job),
        ]);

        if (job.cancelled) {
            job.status = 'cancelled';
            job.completedAt = new Date().toISOString();
            job.updatedAt = job.completedAt;
            return;
        }

        const matrix = mergeQuoteMatrices(websiteMatrix, whatsappMatrix, job.matrix);
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
                userId: job.userId,
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
    const userId = getRequestUserId(req);

    if (!job || job.userId !== userId) {
        return res.status(404).json({ message: 'Orcamento em andamento nao encontrado.' });
    }

    return res.json(serializeQuoteJob(job));
};

export const cancelQuoteJob = async (req: Request, res: Response) => {
    const job = quoteJobs.get(req.params.jobId);
    const userId = getRequestUserId(req);

    if (!job || job.userId !== userId) {
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

export const listQuoteHistory = async (req: Request, res: Response) => {
    try {
        const quotes = await prisma.quote.findMany({
            where: getOwnedQuoteWhere(req),
            orderBy: { createdAt: 'desc' },
        });

        const history = quotes.map(mapQuoteHistoryEntry);

        res.json(history);
    } catch (err) {
        console.error('List Quote History Error:', err);
        res.status(500).json({ message: 'Erro ao listar historico de cotacoes' });
    }
};

export const listTeamQuoteHistory = async (req: Request, res: Response) => {
    try {
        if (!requireAdmin(req, res)) return;

        const [users, quotes] = await Promise.all([
            prisma.user.findMany({
                where: { role: 'FUNCIONARIO' },
                orderBy: { name: 'asc' },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                },
            }),
            prisma.quote.findMany({
                where: {
                    user: {
                        is: { role: 'FUNCIONARIO' },
                    },
                },
                orderBy: { createdAt: 'desc' },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                        },
                    },
                },
            }),
        ]);

        const grouped = new Map<string, any>();

        users.forEach((user) => {
            grouped.set(user.id, {
                userId: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                quoteCount: 0,
                lastQuoteAt: null,
                quotes: [],
            });
        });

        quotes.forEach((quote) => {
            const owner = quote.user;
            if (!owner || owner.role !== 'FUNCIONARIO') return;

            const groupKey = owner.id;
            const group = grouped.get(groupKey);
            if (!group) return;

            group.quotes.push(mapQuoteHistoryEntry(quote));
            group.quoteCount += 1;
            group.lastQuoteAt = group.lastQuoteAt || quote.createdAt;
        });

        const employees = Array.from(grouped.values())
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
            .map((employee) => ({
                ...employee,
                lastQuoteAt: employee.lastQuoteAt,
            }));

        res.json({
            totalQuotes: quotes.length,
            employees,
        });
    } catch (err) {
        console.error('List Team Quote History Error:', err);
        res.status(500).json({ message: 'Erro ao listar cotacoes dos funcionarios' });
    }
};

export const getQuoteHistoryById = async (req: Request, res: Response) => {
    try {
        const quote = await prisma.quote.findFirst({
            where: getReadableQuoteWhere(req, req.params.id),
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
        const existingQuote = await prisma.quote.findFirst({
            where: getOwnedQuoteWhere(req, req.params.id),
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
        const quote = await prisma.quote.findFirst({
            where: getReadableQuoteWhere(req, req.params.id),
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
            where: {
                id: { in: ids },
                ...(isAdminRequest(req) ? {} : { userId: getRequestUserId(req) }),
            },
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
        const quote = await prisma.quote.findFirst({
            where: getReadableQuoteWhere(req, req.params.id),
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
