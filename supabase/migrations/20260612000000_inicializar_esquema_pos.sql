-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabla de Perfiles
CREATE TABLE perfiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR NOT NULL,
  nombre VARCHAR NOT NULL,
  rol VARCHAR CHECK (rol IN ('admin', 'vendedor', 'visitante')) DEFAULT 'vendedor',
  creado_en TIMESTAMP DEFAULT NOW()
);

-- 2. Tabla de Productos
CREATE TABLE productos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku VARCHAR UNIQUE NOT NULL,
  nombre VARCHAR NOT NULL,
  categoria VARCHAR NOT NULL,
  unidad VARCHAR NOT NULL,
  precio_publico DECIMAL(10,2) NOT NULL CHECK (precio_publico >= 0),
  precio_mayoreo DECIMAL(10,2) NOT NULL CHECK (precio_mayoreo >= 0),
  tasa_iva DECIMAL(4,2) DEFAULT 0.00 CHECK (tasa_iva >= 0),
  stock DECIMAL(10,2) DEFAULT 0.00 CHECK (stock >= 0),
  stock_minimo DECIMAL(10,2) DEFAULT 5.00 CHECK (stock_minimo >= 0),
  creado_en TIMESTAMP DEFAULT NOW()
);

-- 3. Tabla de Lotes (PEPS/FIFO)
CREATE TABLE lotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  producto_id UUID REFERENCES productos(id) ON DELETE CASCADE,
  lote_no VARCHAR NOT NULL,
  stock_lote DECIMAL(10,2) NOT NULL CHECK (stock_lote >= 0),
  fecha_caducidad DATE,
  fecha_entrada TIMESTAMP DEFAULT NOW()
);

-- 4. Tabla de Clientes
CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR NOT NULL,
  rancho VARCHAR,
  telefono VARCHAR,
  limite_credito DECIMAL(10,2) DEFAULT 0.00 CHECK (limite_credito >= 0),
  saldo_deudor DECIMAL(10,2) DEFAULT 0.00 CHECK (saldo_deudor >= 0),
  activo_para_credito BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMP DEFAULT NOW()
);

-- 5. Tabla de Ventas
CREATE TABLE ventas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio VARCHAR UNIQUE NOT NULL,
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  vendedor_id UUID REFERENCES perfiles(id) ON DELETE RESTRICT,
  tipo_pago VARCHAR CHECK (tipo_pago IN ('efectivo', 'tarjeta', 'transferencia', 'credito', 'debito')) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  iva DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  estado VARCHAR CHECK (estado IN ('cobrada', 'pendiente', 'cancelada')) DEFAULT 'cobrada',
  fecha TIMESTAMP DEFAULT NOW()
);

-- 6. Tabla Detalles de Venta
CREATE TABLE ventas_detalles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venta_id UUID REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES productos(id) ON DELETE RESTRICT,
  lote_id UUID REFERENCES lotes(id) ON DELETE RESTRICT,
  cantidad DECIMAL(10,2) NOT NULL CHECK (cantidad > 0),
  precio_unitario DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL
);

-- 7. Tabla Movimientos de Caja
CREATE TABLE movimientos_caja (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendedor_id UUID REFERENCES perfiles(id) ON DELETE RESTRICT,
  tipo VARCHAR CHECK (tipo IN ('apertura', 'ingreso', 'egreso', 'venta')) NOT NULL,
  monto DECIMAL(10,2) NOT NULL,
  descripcion VARCHAR,
  fecha TIMESTAMP DEFAULT NOW()
);

-- 8. Tabla Pagos de Créditos (Abonos)
CREATE TABLE pagos_credito (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venta_id UUID REFERENCES ventas(id) ON DELETE CASCADE,
  monto DECIMAL(10,2) NOT NULL CHECK (monto > 0),
  metodo VARCHAR CHECK (metodo IN ('efectivo', 'transferencia', 'tarjeta', 'debito')) NOT NULL,
  fecha TIMESTAMP DEFAULT NOW(),
  folio_pago VARCHAR UNIQUE NOT NULL
);

-- Habilitar RLS
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas_detalles ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_credito ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS Básicas (Lectura permitida a usuarios autenticados)
CREATE POLICY "Permitir lectura general a autenticados" ON perfiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir lectura general a autenticados" ON productos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir lectura general a autenticados" ON lotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir lectura general a autenticados" ON clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir lectura general a autenticados" ON ventas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir lectura general a autenticados" ON ventas_detalles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir lectura general a autenticados" ON movimientos_caja FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir lectura general a autenticados" ON pagos_credito FOR SELECT TO authenticated USING (true);

-- Funciones y Triggers

-- A. Descuento PEPS
CREATE OR REPLACE FUNCTION fn_descontar_lotes_peps()
RETURNS TRIGGER AS $$
DECLARE
  cantidad_restante DECIMAL(10,2) := NEW.cantidad;
  lote_record RECORD;
BEGIN
  -- Verificar existencia total
  IF (SELECT stock FROM productos WHERE id = NEW.producto_id) < NEW.cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente para el producto seleccionado.';
  END IF;

  -- Bucle para recorrer lotes ordenados por fecha de entrada (PEPS)
  FOR lote_record IN 
    SELECT id, stock_lote 
    FROM lotes 
    WHERE producto_id = NEW.producto_id AND stock_lote > 0 
    ORDER BY fecha_entrada ASC 
  LOOP
    EXIT WHEN cantidad_restante <= 0;

    IF lote_record.stock_lote >= cantidad_restante THEN
      UPDATE lotes 
      SET stock_lote = stock_lote - cantidad_restante 
      WHERE id = lote_record.id;
      
      NEW.lote_id := lote_record.id;
      cantidad_restante := 0;
    ELSE
      UPDATE lotes 
      SET stock_lote = 0 
      WHERE id = lote_record.id;

      cantidad_restante := cantidad_restante - lote_record.stock_lote;
    END IF;
  END LOOP;

  IF cantidad_restante > 0 THEN
    RAISE EXCEPTION 'Error al procesar el inventario PEPS. Inconsistencia de stock.';
  END IF;

  UPDATE productos
  SET stock = stock - NEW.cantidad
  WHERE id = NEW.producto_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_descontar_lotes_peps
BEFORE INSERT ON ventas_detalles
FOR EACH ROW
EXECUTE FUNCTION fn_descontar_lotes_peps();

-- B. Función de Evaluación de Morosos
CREATE OR REPLACE FUNCTION fn_evaluar_clientes_morosos()
RETURNS VOID AS $$
BEGIN
  UPDATE clientes
  SET activo_para_credito = FALSE
  WHERE id IN (
    SELECT DISTINCT v.cliente_id 
    FROM ventas v
    LEFT JOIN (
      SELECT venta_id, SUM(monto) as total_pagado 
      FROM pagos_credito 
      GROUP BY venta_id
    ) p ON p.venta_id = v.id
    WHERE v.tipo_pago = 'credito' 
      AND v.estado = 'pendiente'
      AND (v.total - COALESCE(p.total_pagado, 0)) > 0
      AND v.fecha < (NOW() - INTERVAL '30 days')
  );
END;
$$ LANGUAGE plpgsql;
