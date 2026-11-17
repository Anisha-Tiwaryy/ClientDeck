// Invoice PDF with jsPDF (runs server-side so the PDF can be emailed as an attachment).
import { jsPDF } from 'jspdf';

export function invoiceTotals(items) {
  const subtotal = items.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_price), 0);
  return { subtotal: Math.round(subtotal * 100) / 100, total: Math.round(subtotal * 100) / 100 };
}

export function invoicePdf(invoice, lead, items, seller = 'ClientDeck') {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const money = (n) => `${invoice.currency} ${Number(n).toFixed(2)}`;
  doc.setFont('helvetica', 'bold').setFontSize(20).text('INVOICE', 40, 60);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  doc.text(`Invoice no: ${invoice.number}`, 40, 85);
  doc.text(`Issue date: ${String(invoice.issue_date).slice(0, 10)}`, 40, 100);
  doc.text(`Due date: ${String(invoice.due_date).slice(0, 10)}`, 40, 115);
  doc.text(`From: ${seller}`, 360, 85);
  doc.text(`Bill to: ${lead.company}`, 360, 100);
  doc.text(`Attn: ${lead.contact_name}`, 360, 115);
  let y = 160;
  doc.setFont('helvetica', 'bold');
  doc.text('Description', 40, y); doc.text('Qty', 330, y); doc.text('Unit price', 390, y); doc.text('Amount', 480, y);
  doc.line(40, y + 6, 555, y + 6);
  doc.setFont('helvetica', 'normal');
  for (const it of items) {
    y += 22;
    doc.text(String(it.description).slice(0, 55), 40, y);
    doc.text(String(it.quantity), 330, y);
    doc.text(money(it.unit_price), 390, y);
    doc.text(money(Number(it.quantity) * Number(it.unit_price)), 480, y);
  }
  const { total } = invoiceTotals(items);
  y += 30; doc.line(330, y - 12, 555, y - 12);
  doc.setFont('helvetica', 'bold').text('Total', 390, y).text(money(total), 480, y);
  doc.setFont('helvetica', 'normal').setFontSize(9)
    .text(`Status: ${invoice.status.toUpperCase()}`, 40, y + 40);
  return Buffer.from(doc.output('arraybuffer'));
}
