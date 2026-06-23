CREATE TABLE movimientos_inventario (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  producto_id UUID REFERENCES productos(id) ON DELETE CASCADE,
  lote_id UUID REFERENCES lotes(id) ON DELETE SET NULL,
  tipo VARCHAR CHECK (tipo IN ('entrada', 'salida')) NOT NULL,
  cantidad DECIMAL(10,2) NOT NULL CHECK (cantidad > 0),
  referencia VARCHAR,
  descripcion VARCHAR,
  creado_en TIMESTAMP DEFAULT NOW()
);

ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir lectura general a autenticados" ON movimientos_inventario FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir escritura a autenticados" ON movimientos_inventario FOR INSERT TO authenticated WITH CHECK (true);

-- Trigger para automatizar el stock al registrar entrada o salida manual
CREATE OR REPLACE FUNCTION fn_procesar_movimiento_inventario()
RETURNS TRIGGER AS $$
DECLARE
  cantidad_restante DECIMAL(10,2) := NEW.cantidad;
  lote_record RECORD;
BEGIN
  IF NEW.tipo = 'entrada' THEN
    -- Al ser entrada, creamos un nuevo lote para este producto
    -- Usamos la referencia como nombre de lote (o un consecutivo)
    INSERT INTO lotes (producto_id, lote_no, stock_lote, fecha_entrada)
    VALUES (NEW.producto_id, COALESCE(NEW.referencia, 'LOTE-NUEVO'), NEW.cantidad, NEW.creado_en)
    RETURNING id INTO NEW.lote_id;

    -- Incrementar stock consolidado en productos
    UPDATE productos
    SET stock = stock + NEW.cantidad
    WHERE id = NEW.producto_id;

  ELSIF NEW.tipo = 'salida' THEN
    -- Al ser salida, descontamos de lotes existentes usando PEPS (FIFO)
    IF (SELECT stock FROM productos WHERE id = NEW.producto_id) < NEW.cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente para el ajuste de salida.';
    END IF;

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
      RAISE EXCEPTION 'Error al procesar salida PEPS.';
    END IF;

    -- Decrementar stock consolidado en productos
    UPDATE productos
    SET stock = stock - NEW.cantidad
    WHERE id = NEW.producto_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_procesar_movimiento_inventario
BEFORE INSERT ON movimientos_inventario
FOR EACH ROW
EXECUTE FUNCTION fn_procesar_movimiento_inventario();
