const receiptPrintStyles = `
  @page { size: auto; margin: 4mm; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    background: #fff !important;
  }
  body {
    color: #000 !important;
    font: 9pt/1.35 "Courier New", Courier, monospace;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .receipt-print, .cash-receipt-print {
    position: static !important;
    display: block !important;
    width: 100% !important;
    max-width: 72mm !important;
    min-width: 0 !important;
    height: auto !important;
    max-height: none !important;
    margin: 0 auto !important;
    padding: 0 !important;
    overflow: visible !important;
    color: #000 !important;
    background: #fff !important;
  }
  .receipt-logo { display: none !important; }
  .receipt-header, .cash-receipt-header {
    display: block !important;
    padding: 0 0 3mm !important;
    border-bottom: 1px dashed #000 !important;
    color: #000 !important;
    text-align: center;
  }
  .receipt-header h2 { margin: 0 0 1mm !important; font-size: 13pt; }
  .receipt-header p, .receipt-business-details { margin: 1mm 0 0 !important; color: #000 !important; font-size: 8pt; }
  .receipt-meta {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 1mm !important;
    padding: 3mm 0 !important;
    color: #000 !important;
  }
  .receipt-meta div, .receipt-payment div { display: flex !important; justify-content: space-between; gap: 2mm; }
  .receipt-meta span, .receipt-payment span { color: #000 !important; font-size: 8pt; }
  .receipt-meta strong, .receipt-payment strong { font-size: 8pt; text-align: right; overflow-wrap: anywhere; }
  .receipt-items {
    display: table !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    border-collapse: collapse !important;
    table-layout: fixed;
  }
  .receipt-items th, .receipt-items td {
    padding: 1.5mm 0.5mm !important;
    border-bottom: 1px dotted #777 !important;
    color: #000 !important;
    font-size: 8pt !important;
    text-align: left;
    vertical-align: top;
    overflow-wrap: anywhere;
  }
  .receipt-items .receipt-qty { width: 10%; text-align: center; }
  .receipt-items .receipt-product { width: 55%; }
  .receipt-items .receipt-amount { width: 35%; text-align: right; }
  .receipt-items td small { display: block; color: #000 !important; font-size: 7.5pt; }
  .receipt-total, .receipt-subtotal, .receipt-payment {
    display: flex !important;
    justify-content: space-between;
    gap: 2mm;
    padding: 2mm 0 !important;
    border-bottom: 1px dashed #000;
    color: #000 !important;
  }
  .receipt-total { font-size: 11pt !important; font-weight: 700; }
  .receipt-total strong { font-size: 13pt; }
  .receipt-payment { display: grid !important; grid-template-columns: minmax(0, 1fr) !important; }
  .receipt-thanks { margin: 4mm 0 0 !important; color: #000 !important; text-align: center; }
  .cash-receipt-print { display: grid !important; gap: 2mm; }
  .cash-receipt-header { display: grid !important; justify-items: center; gap: 1mm; }
  .cash-receipt-header strong, .cash-receipt-header span, .cash-receipt-meta,
  .cash-receipt-lines span, .cash-receipt-notes { color: #000 !important; }
  .cash-receipt-meta, .cash-receipt-lines { display: grid !important; gap: 1mm; }
  .cash-receipt-lines { padding: 2mm 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
  .cash-receipt-lines > div, .cash-receipt-total, .cash-receipt-difference {
    display: flex !important;
    justify-content: space-between;
    gap: 2mm;
    color: #000 !important;
  }
  .cash-receipt-difference { padding: 2mm 0 !important; border-top: 1px dashed #000; border-radius: 0 !important; background: #fff !important; }
  .receipt-items tr, .receipt-total, .receipt-subtotal, .receipt-payment,
  .cash-receipt-header, .cash-receipt-meta, .cash-receipt-lines,
  .cash-receipt-total, .cash-receipt-difference { break-inside: avoid; page-break-inside: avoid; }
`;

export function printElementById(
  elementId: string,
  onError: (message: string) => void,
): void {
  const source = document.getElementById(elementId);
  if (!source) {
    onError('No se encontró el comprobante para imprimir.');
    return;
  }

  const frame = document.createElement('iframe');
  frame.title = 'Vista de impresión del comprobante';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:100vw;height:100vh;border:0;opacity:0;pointer-events:none;';
  frame.onload = () => {
    const printWindow = frame.contentWindow;
    if (!printWindow) {
      frame.remove();
      onError('No fue posible preparar la ventana de impresión.');
      return;
    }

    printWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
    try {
      printWindow.focus();
      printWindow.print();
    } catch (cause) {
      frame.remove();
      onError(cause instanceof Error ? cause.message : 'No fue posible imprimir el comprobante.');
    }
  };
  frame.onerror = () => {
    frame.remove();
    onError('No fue posible cargar el comprobante para imprimir.');
  };
  frame.srcdoc = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Comprobante</title><style>${receiptPrintStyles}</style></head><body>${source.outerHTML}</body></html>`;
  document.body.appendChild(frame);
}
