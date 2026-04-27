import { Request, Response } from 'express';
import { ScraperService } from '../services/scraper.service';
import { PrismaClient } from '@prisma/client';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

const prisma = new PrismaClient();

export const searchQuote = async (req: Request, res: Response) => {
    try {
        const { productNames } = req.body; // Agora recebe um array
        if (!productNames || !Array.isArray(productNames)) {
            return res.status(400).json({ message: 'Lista de produtos é obrigatória' });
        }

        const results = await ScraperService.searchMultipleProducts(productNames);
        res.json(results);
    } catch (err) {
        res.status(500).json({ message: 'Erro ao processar cotação em lote' });
    }
};

export const exportPDF = async (req: Request, res: Response) => {
    try {
        const { matrix, products, suppliers } = req.body;
        
        const doc = new PDFDocument({ layout: 'landscape', margin: 30 });
        const filename = `confronto-${Date.now()}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

        doc.pipe(res);

        // Header
        doc.fontSize(20).text('AutoCRM - Planilha de Confronto de Preços', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).text(`Gerado em: ${new Date().toLocaleString()}`, { align: 'right' });
        doc.moveDown();

        // Calcular larguras das colunas
        const colWidth = (doc.page.width - 150) / suppliers.length;
        const startX = 30;
        let currentY = doc.y;

        // Cabeçalho da Tabela
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('PEÇA / CÓDIGO', startX, currentY, { width: 120 });
        
        suppliers.forEach((s: string, i: number) => {
            doc.text(s.toUpperCase(), startX + 120 + (i * colWidth), currentY, { width: colWidth, align: 'center' });
        });

        doc.moveDown(0.5);
        doc.moveTo(startX, doc.y).lineTo(doc.page.width - 30, doc.y).stroke();
        doc.moveDown(0.5);

        // Linhas de Peças
        products.forEach((product: string) => {
            currentY = doc.y;
            if (currentY > doc.page.height - 50) {
                doc.addPage({ layout: 'landscape', margin: 30 });
                currentY = 30;
            }

            doc.font('Helvetica').fontSize(9).text(product, startX, currentY, { width: 120 });

            // Encontrar o menor preço da linha para destacar (marca-texto amarelo visual)
            const rowPrices = suppliers.map((s: string) => {
                const item = matrix[product]?.find((res: any) => res.provider === s);
                return item && !item.error ? parseFloat(item.price) : Infinity;
            });
            const minPrice = Math.min(...rowPrices);

            suppliers.forEach((s: string, i: number) => {
                const item = matrix[product]?.find((res: any) => res.provider === s);
                const x = startX + 120 + (i * colWidth);
                
                if (item && !item.error) {
                    const price = parseFloat(item.price);
                    
                    // Se for o menor preço, destacar o fundo (simular marca-texto)
                    if (price === minPrice && minPrice !== Infinity) {
                        doc.save();
                        doc.fillColor('#FFFF00').rect(x, currentY - 2, colWidth, 12).fill();
                        doc.restore();
                        doc.fillColor('black').font('Helvetica-Bold');
                    } else {
                        doc.fillColor('#444').font('Helvetica');
                    }
                    
                    doc.text(`R$ ${price.toFixed(2)}`, x, currentY, { width: colWidth, align: 'center' });
                } else {
                    doc.fillColor('#ccc').text('---', x, currentY, { width: colWidth, align: 'center' });
                }
            });

            doc.moveDown(0.8);
            doc.fillColor('#eee').moveTo(startX, doc.y).lineTo(doc.page.width - 30, doc.y).stroke().fillColor('black');
            doc.moveDown(0.2);
        });

        doc.end();
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Erro ao gerar PDF da matriz' });
    }
};

export const exportExcel = async (req: Request, res: Response) => {
    // Similar logic for Excel grid
    try {
        const { matrix, products, suppliers } = req.body;
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Confronto');

        const header = ['PEÇA', ...suppliers];
        const columns = [{ header: 'PEÇA', key: 'product', width: 30 }];
        suppliers.forEach((s: string) => {
            columns.push({ header: s, key: s, width: 15 });
        });
        worksheet.columns = columns;

        products.forEach((product: string) => {
            const row: any = { product };
            
            // Encontrar o menor preço da linha
            const rowPrices = suppliers.map((s: string) => {
                const item = matrix[product]?.find((res: any) => res.provider === s);
                return item && !item.error ? parseFloat(item.price) : Infinity;
            });
            const minPrice = Math.min(...rowPrices);

            suppliers.forEach((s: string) => {
                const item = matrix[product]?.find((res: any) => res.provider === s);
                row[s] = item && !item.error ? parseFloat(item.price) : '---';
            });

            const excelRow = worksheet.addRow(row);
            
            // Aplicar cor amarela no menor preço
            suppliers.forEach((s: string, i: number) => {
                if (row[s] === minPrice && minPrice !== Infinity) {
                    excelRow.getCell(i + 2).fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFFFFF00' }
                    };
                }
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=confronto.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        res.status(500).json({ message: 'Erro ao gerar Excel da matriz' });
    }
};
