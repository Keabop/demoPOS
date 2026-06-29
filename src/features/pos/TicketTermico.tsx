import React from 'react';
import { createPortal } from 'react-dom';
import { ticketHTML, type TicketData } from './ticketModel';

interface Props {
  data: TicketData;
  anchoMm: number;
}

/**
 * Portal de respaldo del ticket: renderiza el HTML del ticket fuera de #root y,
 * vía @media print, lo aísla para que window.print() imprima SOLO el ticket
 * (cuando no hay QZ Tray). El ancho del @page sigue al configurado.
 */
export const TicketTermico: React.FC<Props> = ({ data, anchoMm }) => {
  return createPortal(
    <>
      <style>{`
        @media screen { .print-only-ticket { display: none !important; } }
        @media print {
          body > *:not(.print-only-ticket) { display: none !important; }
          html, body { background:#fff !important; color:#000 !important; margin:0 !important; padding:0 !important; }
          .print-only-ticket { display:block !important; position:relative !important; margin:0 auto !important; }
          @page { size: ${anchoMm}mm auto; margin: 0; }
        }
      `}</style>
      <div className="print-only-ticket" dangerouslySetInnerHTML={{ __html: ticketHTML(data, anchoMm) }} />
    </>,
    document.body,
  );
};
