import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { createRoot } from 'react-dom/client';
import { CalculationPdfDocument } from './CalculationPdfDocument';
import type { CalculationPdfData } from './types';
import './calculationPdf.css';

export const CURRENT_TARIFF_DATE = '01.08.2026';

export async function generateCalculationPdf(data: CalculationPdfData) {
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
    const canvases = await Promise.all(pages.map((page) => html2canvas(page, { scale: 2, backgroundColor: '#f5f7fa', useCORS: true, logging: false })));
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    canvases.forEach((canvas, index) => { if (index > 0) pdf.addPage(); pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297); });
    const suffix = data.dealId ? `сделка_${data.dealId}` : new Date().toISOString().slice(0, 10);
    pdf.save(`Расчет_тарифа_${suffix}.pdf`);
  } finally {
    root.unmount();
    host.remove();
  }
}
