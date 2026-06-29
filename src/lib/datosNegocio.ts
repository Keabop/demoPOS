// Datos fijos del negocio para encabezados y documentos legales (cotización, orden
// de compra, pagaré). Centralizado aquí para facilitar reutilizar el sistema con otro
// negocio en el futuro (capa de configuración).
export const DATOS_NEGOCIO = {
  nombre: 'AGROMAR',
  descripcion: 'Semillas, Herbicidas, Insecticidas, Foliares, Fungicidas y Abono.',
  telefono: '(462) 107-8185',
  email: 'agromar_irapuato@hotmail.com',
  responsable: 'MAURICIO AGUILAR RAZO',
  rfc: 'AURM-640315-V77',
  direccion: 'Av. San José de Jorge López No. 1691, San José de Jorge López, Irapuato, Gto.',
  cp: '36648',
  telPagare: '(462)-62-2-00-39',
  ciudad: 'Irapuato, Guanajuato',
} as const;
