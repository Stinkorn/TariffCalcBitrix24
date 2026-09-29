import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { createRoot } from 'react-dom/client';
import { CalculationPdfDocument } from './CalculationPdfDocument';
import type { CalculationPdfData } from './types';
import './calculationPdf.css';

export const CURRENT_TARIFF_DATE = '01.08.2026';

export async function generateCalculationPdf(data: CalculationPdfData) {
  return generateCalculationsPdf([data]);
}

export async function generateCalculationsPdf(items: CalculationPdfData[]) {
  if (items.length === 0) throw new Error('No calculations selected');
  let pdf: jsPDF | null = null;
  let renderedPages = 0;
  for (const data of items) {
    const host = document.createElement('div');
    host.className = 'calculation-pdf-host';
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      root.render(<CalculationPdfDocument data={data} />);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      await document.fonts.ready;
      const pages = Array.from(host.querySelectorAll<HTMLElement>('.calculation-pdf-page'));
      if (pages.length !== 2) throw new Error('PDF must contain exactly two pages');
      if (!pdf) pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      for (const page of pages) {
        const canvas = await html2canvas(page, { scale: 2, backgroundColor: '#f5f7fa', useCORS: true, logging: false });
        if (renderedPages > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);
        renderedPages += 1;
      }
    } finally {
      root.unmount();
      host.remove();
    }
  }
  if (!pdf) throw new Error('PDF generation failed');
  const filename = items.length === 1 && items[0].dealId
    ? `Расчет_тарифа_сделка_${items[0].dealId}.pdf`
    : items.length === 1
      ? `Расчет_тарифа_${new Date().toISOString().slice(0, 10)}.pdf`
      : `Расчеты_тарифов_${items.length}_${new Date().toISOString().slice(0, 10)}.pdf`;
  pdf.save(filename);
}
