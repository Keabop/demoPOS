// Categorías del giro de AGROMAR (casa del campo / agroveterinaria).
// Lista única usada por los menús de alta y edición de producto.
// El campo `productos.categoria` sigue siendo texto libre en la BD y los filtros
// se alimentan dinámicamente vía `fn_categorias_productos()`, así que esta lista
// solo define las opciones ofrecidas al capturar; admite valores externos (p. ej.
// los que traiga una futura migración de catálogo) mediante el fallback del select.
export const CATEGORIAS_PRODUCTOS: readonly string[] = [
  'Semillas',
  'Refacciones',
  'Fertilizantes',
  'Herbicidas',
  'Fungicidas',
  'Insecticidas',
  'Foliares',
];
