-- =====================================================================================
-- SNAPSHOT DE REFERENCIA — Esquema vivo de la base de datos POS AGROMAR
-- =====================================================================================
-- Proyecto Supabase : POS_Agromar (project_id = vfpupvzqdthrglrtkymt)
-- Postgres          : 17.x
-- Generado          : 2026-06-22, vía MCP de Supabase, leyendo la BD REAL/VIVA.
--
-- PROPÓSITO:
--   Documentar el estado REAL del esquema para que auditorías y subagentes puedan
--   leer la base de datos desde un archivo del repo, sin depender del MCP. El
--   historial de migraciones del disco había derivado del estado vivo; este archivo
--   es la fuente de verdad de "cómo está hoy la BD".
--
-- ⚠️  ESTO NO ES UNA MIGRACIÓN EJECUTABLE.
--   El prefijo "_" evita que el Supabase CLI lo tome como migración. No correr tal cual
--   contra una BD (políticas/funciones usan CREATE OR REPLACE pero las tablas no son
--   idempotentes). Es solo lectura/referencia.
--
-- CONTENIDO: extensiones · tablas (13) · constraints · índices · funciones (13) ·
--            triggers (4) · RLS (enable + ~50 políticas) · grants · cron (1 job).
-- =====================================================================================


-- ============================ 1. EXTENSIONES ============================
-- pg_cron 1.6.4 · pg_stat_statements 1.11 · pgcrypto 1.3 · plpgsql 1.0
-- supabase_vault 0.3.1 · uuid-ossp 1.1
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;
-- (pg_stat_statements, supabase_vault, plpgsql: gestionadas por la plataforma)


-- ============================ 2. TABLAS ============================

CREATE TABLE public.clientes (
  id                  uuid           NOT NULL DEFAULT uuid_generate_v4(),
  nombre              varchar        NOT NULL,
  rancho              varchar,
  telefono            varchar,
  limite_credito      numeric(10,2)  DEFAULT 0.00,
  saldo_deudor        numeric(10,2)  DEFAULT 0.00,
  activo_para_credito boolean        DEFAULT true,
  creado_en           timestamptz    DEFAULT now(),
  dias_credito        integer        NOT NULL DEFAULT 30,
  lada                text           NOT NULL DEFAULT '52'::text
);

CREATE TABLE public.lotes (
  id              uuid           NOT NULL DEFAULT uuid_generate_v4(),
  producto_id     uuid,
  lote_no         varchar        NOT NULL,
  stock_lote      numeric(10,2)  NOT NULL,
  fecha_caducidad date,
  fecha_entrada   timestamptz    DEFAULT now(),
  costo           numeric(10,2)  NOT NULL DEFAULT 0.00
);

CREATE TABLE public.movimientos_caja (
  id          uuid           NOT NULL DEFAULT uuid_generate_v4(),
  vendedor_id uuid,
  tipo        varchar        NOT NULL,
  monto       numeric(10,2)  NOT NULL,
  descripcion varchar,
  fecha       timestamptz    DEFAULT now(),
  es_corte    boolean        NOT NULL DEFAULT false,
  metodo      varchar,                 -- M1: efectivo/transferencia/tarjeta/debito (NULL en manuales)
  categoria   varchar,                 -- M1: 'caja' (efectivo) | 'banco' (no-efectivo) | NULL
  venta_id    uuid,                    -- M1: FK ventas(id), 1:1 con el movimiento de la venta
  pago_id     uuid                     -- M1: FK pagos_credito(id), 1:1 con el movimiento del abono
);

CREATE TABLE public.movimientos_inventario (
  id          uuid           NOT NULL DEFAULT uuid_generate_v4(),
  producto_id uuid,
  lote_id     uuid,
  tipo        varchar        NOT NULL,
  cantidad    numeric(10,2)  NOT NULL,
  referencia  varchar,
  descripcion varchar,
  creado_en   timestamp      DEFAULT now(),
  motivo      varchar                       -- Q7: merma/caducidad/robo/ajuste/devolucion (salidas)
);

CREATE TABLE public.ordenes_compra (
  id              uuid           NOT NULL DEFAULT uuid_generate_v4(),
  folio           varchar        NOT NULL,
  proveedor_id    uuid,
  estado          varchar        NOT NULL DEFAULT 'borrador'::character varying,
  fecha           timestamptz    DEFAULT now(),
  fecha_recepcion timestamptz,
  tasa_iva        numeric(4,2)   NOT NULL DEFAULT 0.16,
  subtotal        numeric(10,2)  NOT NULL DEFAULT 0,
  iva             numeric(10,2)  NOT NULL DEFAULT 0,
  total           numeric(10,2)  NOT NULL DEFAULT 0,
  instrucciones   varchar,
  creado_por      uuid,
  creado_en       timestamptz    DEFAULT now()
);
-- NOTA: tasa_iva default 0.16 existe en el esquema, pero el negocio opera SIN IVA
-- (venta de campo). En la práctica las órdenes se capturan con tasa_iva = 0.

CREATE TABLE public.ordenes_compra_detalles (
  id              uuid           NOT NULL DEFAULT uuid_generate_v4(),
  orden_id        uuid,
  producto_id     uuid,
  descripcion     varchar,
  presentacion    varchar,
  cantidad        numeric(10,2)  NOT NULL,
  precio_unitario numeric(10,2)  NOT NULL,
  subtotal        numeric(10,2)  NOT NULL
);

CREATE TABLE public.pagos_credito (
  id         uuid           NOT NULL DEFAULT uuid_generate_v4(),
  venta_id   uuid,
  monto      numeric(10,2)  NOT NULL,
  metodo     varchar        NOT NULL,
  fecha      timestamptz    DEFAULT now(),
  folio_pago varchar        NOT NULL
);
-- NOTA: pagos_credito NO tiene columna vendedor_id.

CREATE TABLE public.perfiles (
  id        uuid       NOT NULL,
  email     varchar    NOT NULL,
  nombre    varchar    NOT NULL,
  rol       varchar    DEFAULT 'vendedor'::character varying,
  creado_en timestamp  DEFAULT now(),
  activo    boolean    NOT NULL DEFAULT true
);
-- perfiles.id = auth.users.id (FK fk_perfiles_users).

CREATE TABLE public.productos (
  id             uuid           NOT NULL DEFAULT uuid_generate_v4(),
  sku            varchar        NOT NULL,
  nombre         varchar        NOT NULL,
  categoria      varchar        NOT NULL,
  unidad         varchar        NOT NULL,
  precio_publico numeric(10,2)  NOT NULL,
  precio_mayoreo numeric(10,2)  NOT NULL,
  tasa_iva       numeric(4,2)   DEFAULT 0.00,
  stock          numeric(10,2)  DEFAULT 0.00,
  stock_minimo   numeric(10,2)  DEFAULT 5.00,
  creado_en      timestamptz    DEFAULT now(),
  costo          numeric(10,2)  NOT NULL DEFAULT 0.00,
  activo         boolean        NOT NULL DEFAULT true  -- M3: false = descontinuado (soft-delete)
);

CREATE TABLE public.proveedor_productos (
  id            uuid           NOT NULL DEFAULT uuid_generate_v4(),
  proveedor_id  uuid           NOT NULL,
  producto_id   uuid           NOT NULL,
  precio_compra numeric(10,2)  NOT NULL DEFAULT 0.00,
  creado_en     timestamptz    DEFAULT now(),
  actualizado_en timestamptz   DEFAULT now()
);

CREATE TABLE public.proveedores (
  id        uuid        NOT NULL DEFAULT uuid_generate_v4(),
  nombre    varchar     NOT NULL,
  contacto  varchar,
  telefono  varchar,
  email     varchar,
  direccion varchar,
  rfc       varchar,
  activo    boolean     NOT NULL DEFAULT true,
  creado_en timestamptz DEFAULT now()
);

CREATE TABLE public.ventas (
  id          uuid           NOT NULL DEFAULT uuid_generate_v4(),
  folio       varchar        NOT NULL,
  cliente_id  uuid,
  vendedor_id uuid,
  tipo_pago   varchar        NOT NULL,
  subtotal    numeric(10,2)  NOT NULL,
  iva         numeric(10,2)  NOT NULL,
  total       numeric(10,2)  NOT NULL,
  estado      varchar        DEFAULT 'cobrada'::character varying,
  fecha       timestamptz    DEFAULT now(),
  plazo_dias  integer        NOT NULL DEFAULT 30
);

CREATE TABLE public.ventas_detalles (
  id              uuid           NOT NULL DEFAULT uuid_generate_v4(),
  venta_id        uuid,
  producto_id     uuid,
  lote_id         uuid,
  cantidad        numeric(10,2)  NOT NULL,
  precio_unitario numeric(10,2)  NOT NULL,
  subtotal        numeric(10,2)  NOT NULL
);


-- F3/M5a: capa de Configuración de empresa (singleton, una sola fila id=1).
CREATE TABLE public.configuracion (
  id              integer       PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  razon_social    varchar       NOT NULL DEFAULT 'AGROMAR',
  descripcion     varchar       NOT NULL DEFAULT '',
  responsable     varchar       NOT NULL DEFAULT '',
  rfc             varchar       NOT NULL DEFAULT '',
  direccion       varchar       NOT NULL DEFAULT '',
  cp              varchar       NOT NULL DEFAULT '',
  ciudad          varchar       NOT NULL DEFAULT '',
  telefono        varchar       NOT NULL DEFAULT '',
  tel_pagare      varchar       NOT NULL DEFAULT '',
  email           varchar       NOT NULL DEFAULT '',
  logo_url        text          DEFAULT '/logo-agromar.png',
  moneda_simbolo  varchar       NOT NULL DEFAULT '$',
  moneda_iso      varchar       NOT NULL DEFAULT 'MXN',
  locale          varchar       NOT NULL DEFAULT 'es-MX',
  iva_default     numeric(4,2)  NOT NULL DEFAULT 0,
  actualizado_en  timestamptz   DEFAULT now()
);
-- RLS: ENABLE; SELECT a anon+authenticated (true); UPDATE solo es_admin().
-- Grants: SELECT a anon, authenticated; UPDATE a authenticated. Seed: fila id=1 con datos de AGROMAR.


-- ============================ 3. CONSTRAINTS ============================

-- clientes
ALTER TABLE public.clientes ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);
ALTER TABLE public.clientes ADD CONSTRAINT clientes_limite_credito_check CHECK ((limite_credito >= (0)::numeric));
ALTER TABLE public.clientes ADD CONSTRAINT clientes_saldo_deudor_check CHECK ((saldo_deudor >= (0)::numeric));

-- lotes
ALTER TABLE public.lotes ADD CONSTRAINT lotes_pkey PRIMARY KEY (id);
ALTER TABLE public.lotes ADD CONSTRAINT lotes_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE;
ALTER TABLE public.lotes ADD CONSTRAINT lotes_costo_check CHECK ((costo >= (0)::numeric));
ALTER TABLE public.lotes ADD CONSTRAINT lotes_stock_lote_check CHECK ((stock_lote >= (0)::numeric));

-- movimientos_caja
ALTER TABLE public.movimientos_caja ADD CONSTRAINT movimientos_caja_pkey PRIMARY KEY (id);
ALTER TABLE public.movimientos_caja ADD CONSTRAINT movimientos_caja_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES perfiles(id) ON DELETE RESTRICT;
ALTER TABLE public.movimientos_caja ADD CONSTRAINT movimientos_caja_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE;       -- M1
ALTER TABLE public.movimientos_caja ADD CONSTRAINT movimientos_caja_pago_id_fkey FOREIGN KEY (pago_id) REFERENCES pagos_credito(id) ON DELETE CASCADE; -- M1
ALTER TABLE public.movimientos_caja ADD CONSTRAINT movimientos_caja_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['apertura'::character varying, 'ingreso'::character varying, 'egreso'::character varying, 'venta'::character varying, 'abono'::character varying])::text[]))); -- M1: +abono
ALTER TABLE public.movimientos_caja ADD CONSTRAINT movimientos_caja_metodo_check CHECK (metodo IS NULL OR (metodo)::text = ANY (ARRAY['efectivo','transferencia','tarjeta','debito']));       -- M1
ALTER TABLE public.movimientos_caja ADD CONSTRAINT movimientos_caja_categoria_check CHECK (categoria IS NULL OR (categoria)::text = ANY (ARRAY['caja','banco']));                               -- M1

-- movimientos_inventario
ALTER TABLE public.movimientos_inventario ADD CONSTRAINT movimientos_inventario_pkey PRIMARY KEY (id);
ALTER TABLE public.movimientos_inventario ADD CONSTRAINT movimientos_inventario_lote_id_fkey FOREIGN KEY (lote_id) REFERENCES lotes(id) ON DELETE SET NULL;
ALTER TABLE public.movimientos_inventario ADD CONSTRAINT movimientos_inventario_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE;
ALTER TABLE public.movimientos_inventario ADD CONSTRAINT movimientos_inventario_cantidad_check CHECK ((cantidad > (0)::numeric));
ALTER TABLE public.movimientos_inventario ADD CONSTRAINT movimientos_inventario_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['entrada'::character varying, 'salida'::character varying])::text[])));
ALTER TABLE public.movimientos_inventario ADD CONSTRAINT movimientos_inventario_motivo_check CHECK (motivo IS NULL OR (motivo)::text = ANY (ARRAY['merma','caducidad','robo','ajuste','devolucion'])); -- Q7

-- ordenes_compra
ALTER TABLE public.ordenes_compra ADD CONSTRAINT ordenes_compra_pkey PRIMARY KEY (id);
ALTER TABLE public.ordenes_compra ADD CONSTRAINT ordenes_compra_folio_key UNIQUE (folio);
ALTER TABLE public.ordenes_compra ADD CONSTRAINT ordenes_compra_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES perfiles(id) ON DELETE SET NULL;
ALTER TABLE public.ordenes_compra ADD CONSTRAINT ordenes_compra_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE RESTRICT;
ALTER TABLE public.ordenes_compra ADD CONSTRAINT ordenes_compra_estado_check CHECK (((estado)::text = ANY ((ARRAY['borrador'::character varying, 'enviada'::character varying, 'recibida'::character varying, 'cancelada'::character varying])::text[])));
ALTER TABLE public.ordenes_compra ADD CONSTRAINT ordenes_compra_tasa_iva_check CHECK ((tasa_iva >= (0)::numeric));

-- ordenes_compra_detalles
ALTER TABLE public.ordenes_compra_detalles ADD CONSTRAINT ordenes_compra_detalles_pkey PRIMARY KEY (id);
ALTER TABLE public.ordenes_compra_detalles ADD CONSTRAINT ordenes_compra_detalles_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES ordenes_compra(id) ON DELETE CASCADE;
ALTER TABLE public.ordenes_compra_detalles ADD CONSTRAINT ordenes_compra_detalles_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT;
ALTER TABLE public.ordenes_compra_detalles ADD CONSTRAINT ordenes_compra_detalles_cantidad_check CHECK ((cantidad > (0)::numeric));
ALTER TABLE public.ordenes_compra_detalles ADD CONSTRAINT ordenes_compra_detalles_precio_unitario_check CHECK ((precio_unitario >= (0)::numeric));

-- pagos_credito
ALTER TABLE public.pagos_credito ADD CONSTRAINT pagos_credito_pkey PRIMARY KEY (id);
ALTER TABLE public.pagos_credito ADD CONSTRAINT pagos_credito_folio_pago_key UNIQUE (folio_pago);
ALTER TABLE public.pagos_credito ADD CONSTRAINT pagos_credito_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE;
ALTER TABLE public.pagos_credito ADD CONSTRAINT pagos_credito_metodo_check CHECK (((metodo)::text = ANY ((ARRAY['efectivo'::character varying, 'transferencia'::character varying, 'tarjeta'::character varying, 'debito'::character varying])::text[])));
ALTER TABLE public.pagos_credito ADD CONSTRAINT pagos_credito_monto_check CHECK ((monto > (0)::numeric));

-- perfiles
ALTER TABLE public.perfiles ADD CONSTRAINT perfiles_pkey PRIMARY KEY (id);
ALTER TABLE public.perfiles ADD CONSTRAINT fk_perfiles_users FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.perfiles ADD CONSTRAINT perfiles_rol_check CHECK (((rol)::text = ANY ((ARRAY['admin'::character varying, 'vendedor'::character varying, 'visitante'::character varying])::text[])));

-- productos
ALTER TABLE public.productos ADD CONSTRAINT productos_pkey PRIMARY KEY (id);
ALTER TABLE public.productos ADD CONSTRAINT productos_sku_key UNIQUE (sku);
ALTER TABLE public.productos ADD CONSTRAINT productos_costo_check CHECK ((costo >= (0)::numeric));
ALTER TABLE public.productos ADD CONSTRAINT productos_precio_mayoreo_check CHECK ((precio_mayoreo >= (0)::numeric));
ALTER TABLE public.productos ADD CONSTRAINT productos_precio_publico_check CHECK ((precio_publico >= (0)::numeric));
ALTER TABLE public.productos ADD CONSTRAINT productos_stock_check CHECK ((stock >= (0)::numeric));
ALTER TABLE public.productos ADD CONSTRAINT productos_stock_minimo_check CHECK ((stock_minimo >= (0)::numeric));
ALTER TABLE public.productos ADD CONSTRAINT productos_tasa_iva_check CHECK ((tasa_iva >= (0)::numeric));

-- proveedor_productos
ALTER TABLE public.proveedor_productos ADD CONSTRAINT proveedor_productos_pkey PRIMARY KEY (id);
ALTER TABLE public.proveedor_productos ADD CONSTRAINT proveedor_productos_proveedor_id_producto_id_key UNIQUE (proveedor_id, producto_id);
ALTER TABLE public.proveedor_productos ADD CONSTRAINT proveedor_productos_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE;
ALTER TABLE public.proveedor_productos ADD CONSTRAINT proveedor_productos_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE CASCADE;

-- proveedores
ALTER TABLE public.proveedores ADD CONSTRAINT proveedores_pkey PRIMARY KEY (id);

-- ventas
ALTER TABLE public.ventas ADD CONSTRAINT ventas_pkey PRIMARY KEY (id);
ALTER TABLE public.ventas ADD CONSTRAINT ventas_folio_key UNIQUE (folio);
ALTER TABLE public.ventas ADD CONSTRAINT ventas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
ALTER TABLE public.ventas ADD CONSTRAINT ventas_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES perfiles(id) ON DELETE RESTRICT;
ALTER TABLE public.ventas ADD CONSTRAINT ventas_estado_check CHECK (((estado)::text = ANY ((ARRAY['cobrada'::character varying, 'pendiente'::character varying, 'cancelada'::character varying])::text[])));
ALTER TABLE public.ventas ADD CONSTRAINT ventas_tipo_pago_check CHECK (((tipo_pago)::text = ANY ((ARRAY['efectivo'::character varying, 'tarjeta'::character varying, 'transferencia'::character varying, 'credito'::character varying, 'debito'::character varying])::text[])));

-- ventas_detalles
ALTER TABLE public.ventas_detalles ADD CONSTRAINT ventas_detalles_pkey PRIMARY KEY (id);
ALTER TABLE public.ventas_detalles ADD CONSTRAINT ventas_detalles_lote_id_fkey FOREIGN KEY (lote_id) REFERENCES lotes(id) ON DELETE RESTRICT;
ALTER TABLE public.ventas_detalles ADD CONSTRAINT ventas_detalles_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT;
ALTER TABLE public.ventas_detalles ADD CONSTRAINT ventas_detalles_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE;
ALTER TABLE public.ventas_detalles ADD CONSTRAINT ventas_detalles_cantidad_check CHECK ((cantidad > (0)::numeric));


-- ============================ 4. ÍNDICES (no-PK/UNIQUE) ============================
CREATE INDEX idx_lotes_producto_id ON public.lotes USING btree (producto_id);
CREATE INDEX idx_movimientos_caja_cortes ON public.movimientos_caja USING btree (fecha DESC) WHERE (es_corte = true);
CREATE INDEX idx_movimientos_caja_vendedor_id ON public.movimientos_caja USING btree (vendedor_id);
CREATE UNIQUE INDEX uq_movcaja_venta ON public.movimientos_caja USING btree (venta_id) WHERE (venta_id IS NOT NULL); -- M1
CREATE UNIQUE INDEX uq_movcaja_pago  ON public.movimientos_caja USING btree (pago_id)  WHERE (pago_id  IS NOT NULL); -- M1
CREATE INDEX idx_movimientos_inventario_lote_id ON public.movimientos_inventario USING btree (lote_id);
CREATE INDEX idx_movimientos_inventario_producto_id ON public.movimientos_inventario USING btree (producto_id);
CREATE INDEX idx_ordenes_compra_creado_por ON public.ordenes_compra USING btree (creado_por);
CREATE INDEX idx_ordenes_compra_proveedor ON public.ordenes_compra USING btree (proveedor_id);
CREATE INDEX idx_oc_detalles_orden ON public.ordenes_compra_detalles USING btree (orden_id);
CREATE INDEX idx_ordenes_compra_detalles_producto_id ON public.ordenes_compra_detalles USING btree (producto_id);
CREATE INDEX idx_pagos_credito_venta_id ON public.pagos_credito USING btree (venta_id);
CREATE INDEX idx_productos_activo ON public.productos USING btree (activo) WHERE (activo = false); -- M3
CREATE INDEX idx_proveedor_productos_producto_id ON public.proveedor_productos USING btree (producto_id);
CREATE INDEX idx_proveedor_productos_proveedor_id ON public.proveedor_productos USING btree (proveedor_id);
CREATE INDEX idx_ventas_cliente_id ON public.ventas USING btree (cliente_id);
CREATE INDEX idx_ventas_vendedor_id ON public.ventas USING btree (vendedor_id);
CREATE INDEX idx_ventas_detalles_lote_id ON public.ventas_detalles USING btree (lote_id);
CREATE INDEX idx_ventas_detalles_producto_id ON public.ventas_detalles USING btree (producto_id);
CREATE INDEX idx_ventas_detalles_venta_id ON public.ventas_detalles USING btree (venta_id);


-- ============================ 5. FUNCIONES (verbatim) ============================

-- --- Helpers de rol (SQL, STABLE, SECURITY DEFINER) ---
CREATE OR REPLACE FUNCTION public.es_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce((select rol = 'admin' and activo from public.perfiles where id = auth.uid()), false); $function$;

CREATE OR REPLACE FUNCTION public.es_operador()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce((select rol in ('admin','vendedor') and activo from public.perfiles where id = auth.uid()), false); $function$;

CREATE OR REPLACE FUNCTION public.es_visitante()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce((select rol = 'visitante' and activo from public.perfiles where id = auth.uid()), false); $function$;

CREATE OR REPLACE FUNCTION public.rol_actual()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT rol FROM public.perfiles WHERE id = auth.uid(); $function$;

-- --- PEPS: descuento de lotes al vender (trigger BEFORE INSERT ventas_detalles) ---
CREATE OR REPLACE FUNCTION public.fn_descontar_lotes_peps()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$;

-- --- Evaluación de clientes morosos (cron diario) ---
CREATE OR REPLACE FUNCTION public.fn_evaluar_clientes_morosos()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE clientes c
  SET activo_para_credito = FALSE
  WHERE c.activo_para_credito = TRUE
    AND EXISTS (
      SELECT 1 FROM ventas v
      LEFT JOIN (SELECT venta_id, SUM(monto) AS pagado FROM pagos_credito GROUP BY venta_id) p ON p.venta_id = v.id
      WHERE v.cliente_id = c.id AND v.tipo_pago = 'credito' AND v.estado = 'pendiente'
        AND (v.total - COALESCE(p.pagado, 0)) > 0
        AND v.fecha < (NOW() - (COALESCE(v.plazo_dias, 30) || ' days')::interval)
    );

  UPDATE clientes c
  SET activo_para_credito = TRUE
  WHERE c.activo_para_credito = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM ventas v
      LEFT JOIN (SELECT venta_id, SUM(monto) AS pagado FROM pagos_credito GROUP BY venta_id) p ON p.venta_id = v.id
      WHERE v.cliente_id = c.id AND v.tipo_pago = 'credito' AND v.estado = 'pendiente'
        AND (v.total - COALESCE(p.pagado, 0)) > 0
        AND v.fecha < (NOW() - (COALESCE(v.plazo_dias, 30) || ' days')::interval)
    );
END;
$function$;

-- --- Procesar abono a crédito (trigger AFTER INSERT/DELETE pagos_credito) ---
-- M1: registra el abono en movimientos_caja (tipo 'abono'); en DELETE se borra por CASCADE de pago_id.
CREATE OR REPLACE FUNCTION public.fn_procesar_abono_credito()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cliente_id UUID;
  v_venta_total NUMERIC(10,2);
  v_total_abonado NUMERIC(10,2);
BEGIN
  -- Obtener el cliente_id y el total de la venta
  SELECT cliente_id, total INTO v_cliente_id, v_venta_total
  FROM public.ventas
  WHERE id = COALESCE(NEW.venta_id, OLD.venta_id);

  IF TG_OP = 'INSERT' THEN
    -- A. Descontar saldo deudor del cliente
    IF v_cliente_id IS NOT NULL THEN
      UPDATE public.clientes
      SET saldo_deudor = GREATEST(0.00, saldo_deudor - NEW.monto)
      WHERE id = v_cliente_id;
    END IF;

    -- B. Calcular el acumulado de pagos para esta venta
    SELECT COALESCE(SUM(monto), 0.00) INTO v_total_abonado
    FROM public.pagos_credito
    WHERE venta_id = NEW.venta_id;

    -- C. Si ya se cubrió el total, marcar la venta como cobrada
    IF v_total_abonado >= v_venta_total THEN
      UPDATE public.ventas
      SET estado = 'cobrada'
      WHERE id = NEW.venta_id;
    END IF;

    -- D. Registrar la cobranza en movimientos_caja (M1).
    INSERT INTO public.movimientos_caja (vendedor_id, tipo, monto, descripcion, metodo, categoria, pago_id)
    VALUES (auth.uid(), 'abono', NEW.monto, 'Abono credito folio ' || NEW.folio_pago,
            NEW.metodo,
            CASE WHEN NEW.metodo = 'efectivo' THEN 'caja' ELSE 'banco' END,
            NEW.id);

  ELSIF TG_OP = 'DELETE' THEN
    -- A. Regresar el saldo deudor al cliente
    IF v_cliente_id IS NOT NULL THEN
      UPDATE public.clientes
      SET saldo_deudor = saldo_deudor + OLD.monto
      WHERE id = v_cliente_id;
    END IF;

    -- B. Regresar el estado de la venta a pendiente
    UPDATE public.ventas
    SET estado = 'pendiente'
    WHERE id = OLD.venta_id;
    -- C. El movimiento de caja del abono se elimina por CASCADE (pago_id).
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- --- Procesar movimiento de inventario (trigger BEFORE INSERT movimientos_inventario) ---
CREATE OR REPLACE FUNCTION public.fn_procesar_movimiento_inventario()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$;

-- --- Registrar abono a crédito (RPC, T-COB-1) ---
-- Valida el sobre-pago en el servidor con FOR UPDATE (anti TOCTOU) y genera folio único.
CREATE OR REPLACE FUNCTION public.fn_registrar_abono(p_venta_id uuid, p_monto numeric, p_metodo character varying)
 RETURNS character varying
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total NUMERIC(10,2); v_estado VARCHAR; v_abonado NUMERIC(10,2); v_saldo NUMERIC(10,2);
  v_folio VARCHAR; v_intentos INT := 0;
BEGIN
  IF NOT public.es_operador() THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol de operador para registrar abonos.';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN RAISE EXCEPTION 'El monto del abono debe ser mayor a 0.'; END IF;
  IF p_metodo NOT IN ('efectivo','transferencia','tarjeta','debito') THEN RAISE EXCEPTION 'Método de pago inválido: %.', p_metodo; END IF;

  SELECT total, estado INTO v_total, v_estado FROM ventas WHERE id = p_venta_id FOR UPDATE;
  IF v_total IS NULL THEN RAISE EXCEPTION 'Venta no encontrada.'; END IF;
  IF v_estado <> 'pendiente' THEN RAISE EXCEPTION 'La venta no está pendiente de pago (estado actual: %).', v_estado; END IF;

  SELECT COALESCE(SUM(monto), 0.00) INTO v_abonado FROM pagos_credito WHERE venta_id = p_venta_id;
  v_saldo := v_total - v_abonado;
  IF p_monto > v_saldo THEN RAISE EXCEPTION 'El abono (%) excede el saldo pendiente (%).', p_monto, v_saldo; END IF;

  LOOP
    v_folio := 'P-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 5));
    BEGIN
      INSERT INTO pagos_credito (venta_id, monto, metodo, folio_pago) VALUES (p_venta_id, p_monto, p_metodo, v_folio);
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_intentos := v_intentos + 1;
      IF v_intentos >= 5 THEN RAISE EXCEPTION 'No se pudo generar un folio único para el abono.'; END IF;
    END;
  END LOOP;
  RETURN v_folio;
END;
$function$;
-- grants: REVOKE anon/public; GRANT authenticated, service_role.

-- --- Anular venta (RPC transaccional, M4) ---
-- Reversa de stock por lote + saldo de crédito + movimiento de caja; marca 'cancelada'.
-- Bloquea si la venta tiene abonos (la reversa parcial es ambigua).
CREATE OR REPLACE FUNCTION public.fn_cancelar_venta(p_venta_id uuid, p_motivo character varying DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_estado VARCHAR; v_tipo_pago VARCHAR; v_total NUMERIC(10,2); v_cliente_id UUID;
  v_abonado NUMERIC(10,2); v_det RECORD; v_folio VARCHAR;
BEGIN
  IF NOT public.es_operador() THEN RAISE EXCEPTION 'No autorizado: se requiere rol de operador para anular ventas.'; END IF;
  SELECT estado, tipo_pago, total, cliente_id, folio INTO v_estado, v_tipo_pago, v_total, v_cliente_id, v_folio
  FROM ventas WHERE id = p_venta_id FOR UPDATE;
  IF v_estado IS NULL THEN RAISE EXCEPTION 'Venta no encontrada.'; END IF;
  IF v_estado = 'cancelada' THEN RAISE EXCEPTION 'La venta ya está cancelada.'; END IF;
  SELECT COALESCE(SUM(monto), 0.00) INTO v_abonado FROM pagos_credito WHERE venta_id = p_venta_id;
  IF v_abonado > 0 THEN RAISE EXCEPTION 'La venta % tiene abonos registrados; elimine los abonos antes de anular.', v_folio; END IF;
  FOR v_det IN SELECT producto_id, lote_id, cantidad FROM ventas_detalles WHERE venta_id = p_venta_id LOOP
    IF v_det.lote_id IS NOT NULL THEN UPDATE lotes SET stock_lote = stock_lote + v_det.cantidad WHERE id = v_det.lote_id; END IF;
    IF v_det.producto_id IS NOT NULL THEN UPDATE productos SET stock = stock + v_det.cantidad WHERE id = v_det.producto_id; END IF;
  END LOOP;
  IF v_tipo_pago = 'credito' AND v_cliente_id IS NOT NULL THEN
    UPDATE clientes SET saldo_deudor = GREATEST(0.00, saldo_deudor - v_total) WHERE id = v_cliente_id;
  END IF;
  DELETE FROM movimientos_caja WHERE venta_id = p_venta_id;
  UPDATE ventas SET estado = 'cancelada' WHERE id = p_venta_id;
END;
$function$;
-- grants: REVOKE anon/public; GRANT authenticated, service_role.

-- --- Recibir orden de compra (RPC) ---
CREATE OR REPLACE FUNCTION public.fn_recibir_orden_compra(p_orden_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_estado varchar; v_folio varchar; v_proveedor_id uuid; v_det record; v_lote_id uuid;
begin
  if not public.es_operador() then
    raise exception 'No autorizado: se requiere rol de operador para recibir órdenes.';
  end if;
  select estado, folio, proveedor_id into v_estado, v_folio, v_proveedor_id from ordenes_compra where id = p_orden_id;
  if v_estado is null then raise exception 'Orden no encontrada.'; end if;
  if v_estado = 'recibida' then raise exception 'La orden ya fue recibida.'; end if;
  if v_estado = 'cancelada' then raise exception 'La orden está cancelada.'; end if;
  for v_det in select * from ordenes_compra_detalles where orden_id = p_orden_id loop
    insert into movimientos_inventario (producto_id, tipo, cantidad, referencia, descripcion)
    values (v_det.producto_id, 'entrada', v_det.cantidad, v_folio, 'Recepción OC ' || v_folio)
    returning lote_id into v_lote_id;
    if v_lote_id is not null then update lotes set costo = v_det.precio_unitario where id = v_lote_id; end if;
    update productos set costo = v_det.precio_unitario where id = v_det.producto_id;
    insert into proveedor_productos (proveedor_id, producto_id, precio_compra)
    values (v_proveedor_id, v_det.producto_id, v_det.precio_unitario)
    on conflict (proveedor_id, producto_id) do update set precio_compra = excluded.precio_compra, actualizado_en = now();
  end loop;
  update ordenes_compra set estado = 'recibida', fecha_recepcion = now() where id = p_orden_id;
end;
$function$;

-- --- Registrar venta completa (RPC principal del POS) ---
-- M1: inserta movimientos_caja para todo CONTADO (efectivo/tarjeta/debito/transferencia) con metodo/categoria.
CREATE OR REPLACE FUNCTION public.fn_registrar_venta_completa(p_folio character varying, p_cliente_id uuid, p_vendedor_id uuid, p_tipo_pago character varying, p_subtotal numeric, p_iva numeric, p_total numeric, p_detalles jsonb, p_plazo_dias integer DEFAULT 30)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_venta_id UUID;
  v_detalle RECORD;
BEGIN
  IF NOT public.es_operador() THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol de operador para registrar ventas.';
  END IF;

  IF p_tipo_pago = 'credito' THEN
    DECLARE
      v_activo BOOLEAN; v_limite DECIMAL; v_saldo DECIMAL; v_nombre VARCHAR;
    BEGIN
      SELECT nombre, activo_para_credito, limite_credito, saldo_deudor
      INTO v_nombre, v_activo, v_limite, v_saldo FROM clientes WHERE id = p_cliente_id;
      IF v_nombre IS NULL THEN RAISE EXCEPTION 'Cliente no seleccionado o inexistente.'; END IF;
      IF NOT v_activo THEN RAISE EXCEPTION 'El cliente % está bloqueado para créditos (moroso).', v_nombre; END IF;
      IF (v_saldo + p_total) > v_limite THEN
        RAISE EXCEPTION 'Límite de crédito excedido. Disponible: %, Total Venta: %', (v_limite - v_saldo), p_total;
      END IF;
    END;
  END IF;

  INSERT INTO ventas (folio, cliente_id, vendedor_id, tipo_pago, subtotal, iva, total, estado, plazo_dias)
  VALUES (p_folio, p_cliente_id, p_vendedor_id, p_tipo_pago, p_subtotal, p_iva, p_total,
          CASE WHEN p_tipo_pago = 'credito' THEN 'pendiente' ELSE 'cobrada' END, p_plazo_dias)
  RETURNING id INTO v_venta_id;

  FOR v_detalle IN
    SELECT * FROM jsonb_to_recordset(p_detalles) AS x(producto_id UUID, cantidad DECIMAL, precio_unitario DECIMAL, subtotal DECIMAL)
  LOOP
    INSERT INTO ventas_detalles (venta_id, producto_id, cantidad, precio_unitario, subtotal)
    VALUES (v_venta_id, v_detalle.producto_id, v_detalle.cantidad, v_detalle.precio_unitario, v_detalle.subtotal);
  END LOOP;

  IF p_tipo_pago = 'credito' THEN
    UPDATE clientes SET saldo_deudor = saldo_deudor + p_total WHERE id = p_cliente_id;
  END IF;

  -- Toda venta de CONTADO entra a caja (no solo efectivo/tarjeta). El crédito NO (no es dinero).
  IF p_tipo_pago IN ('efectivo', 'tarjeta', 'debito', 'transferencia') THEN
    INSERT INTO movimientos_caja (vendedor_id, tipo, monto, descripcion, metodo, categoria, venta_id)
    VALUES (p_vendedor_id, 'venta', p_total, 'Venta contado folio ' || p_folio,
            p_tipo_pago,
            CASE WHEN p_tipo_pago = 'efectivo' THEN 'caja' ELSE 'banco' END,
            v_venta_id);
  END IF;

  RETURN v_venta_id;
END;
$function$;

-- --- Auth: crear perfil al alta de usuario (trigger AFTER INSERT auth.users) ---
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.perfiles (id, email, nombre, rol)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', 'Usuario Nuevo'),
    COALESCE(NEW.raw_user_meta_data->>'rol', 'vendedor')
  );
  RETURN NEW;
END;
$function$;

-- --- Event trigger: habilitar RLS automáticamente en tablas nuevas de public ---
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;


-- --- Anti último-admin (trigger BEFORE UPDATE/DELETE perfiles, M8) ---
CREATE OR REPLACE FUNCTION public.fn_proteger_ultimo_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_otros_admins INT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.rol = 'admin' AND OLD.activo THEN
      SELECT count(*) INTO v_otros_admins FROM perfiles WHERE rol='admin' AND activo AND id <> OLD.id;
      IF v_otros_admins = 0 THEN RAISE EXCEPTION 'No se puede eliminar al último administrador activo.'; END IF;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.rol = 'admin' AND OLD.activo AND (NEW.rol <> 'admin' OR NEW.activo = false) THEN
      SELECT count(*) INTO v_otros_admins FROM perfiles WHERE rol='admin' AND activo AND id <> OLD.id;
      IF v_otros_admins = 0 THEN RAISE EXCEPTION 'No se puede degradar ni desactivar al último administrador activo.'; END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;


-- ============================ 6. TRIGGERS ============================
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER trg_proteger_ultimo_admin BEFORE UPDATE OR DELETE ON public.perfiles FOR EACH ROW EXECUTE FUNCTION fn_proteger_ultimo_admin(); -- M8
CREATE TRIGGER trg_procesar_movimiento_inventario BEFORE INSERT ON public.movimientos_inventario FOR EACH ROW EXECUTE FUNCTION fn_procesar_movimiento_inventario();
CREATE TRIGGER trg_procesar_abono_credito AFTER INSERT OR DELETE ON public.pagos_credito FOR EACH ROW EXECUTE FUNCTION fn_procesar_abono_credito();
CREATE TRIGGER trg_descontar_lotes_peps BEFORE INSERT ON public.ventas_detalles FOR EACH ROW EXECUTE FUNCTION fn_descontar_lotes_peps();
-- (Event trigger asociado a rls_auto_enable: gestionado a nivel de base, no listado en pg_trigger.)


-- ============================ 7. RLS (Row Level Security) ============================
-- RLS HABILITADO en las 13 tablas de public:
ALTER TABLE public.clientes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_caja       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_compra         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_compra_detalles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_credito          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proveedor_productos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proveedores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas_detalles        ENABLE ROW LEVEL SECURITY;

-- --- Políticas (tabla · nombre · cmd · roles · USING / WITH CHECK) ---
-- clientes
CREATE POLICY clientes_delete_admin     ON public.clientes FOR DELETE TO authenticated USING (es_admin());
CREATE POLICY clientes_insert_operador  ON public.clientes FOR INSERT TO authenticated WITH CHECK (es_operador());
CREATE POLICY clientes_select_operador  ON public.clientes FOR SELECT TO authenticated USING (es_operador());
CREATE POLICY clientes_select_visitante ON public.clientes FOR SELECT TO authenticated USING (es_visitante());
CREATE POLICY clientes_update_operador  ON public.clientes FOR UPDATE TO authenticated USING (es_operador()) WITH CHECK (es_operador());
-- lotes
CREATE POLICY lotes_delete_admin       ON public.lotes FOR DELETE TO authenticated USING (es_admin());
CREATE POLICY lotes_insert_operador    ON public.lotes FOR INSERT TO authenticated WITH CHECK (es_operador());
CREATE POLICY lotes_select_autenticados ON public.lotes FOR SELECT TO authenticated USING (true);
CREATE POLICY lotes_update_operador    ON public.lotes FOR UPDATE TO authenticated USING (es_operador()) WITH CHECK (es_operador());
-- movimientos_caja
CREATE POLICY movimientos_caja_delete_admin    ON public.movimientos_caja FOR DELETE TO authenticated USING (es_admin());
CREATE POLICY movimientos_caja_insert_operador ON public.movimientos_caja FOR INSERT TO authenticated WITH CHECK (es_operador());
CREATE POLICY movimientos_caja_select_operador ON public.movimientos_caja FOR SELECT TO authenticated USING (es_operador());
CREATE POLICY movimientos_caja_update_admin    ON public.movimientos_caja FOR UPDATE TO authenticated USING (es_admin()) WITH CHECK (es_admin());
-- movimientos_inventario
CREATE POLICY movimientos_inventario_delete_admin    ON public.movimientos_inventario FOR DELETE TO authenticated USING (es_admin());
CREATE POLICY movimientos_inventario_insert_operador ON public.movimientos_inventario FOR INSERT TO authenticated WITH CHECK (es_operador());
CREATE POLICY movimientos_inventario_select_operador ON public.movimientos_inventario FOR SELECT TO authenticated USING (es_operador());
-- ordenes_compra
CREATE POLICY oc_delete_admin    ON public.ordenes_compra FOR DELETE TO authenticated USING (es_admin());
CREATE POLICY oc_insert_operador ON public.ordenes_compra FOR INSERT TO authenticated WITH CHECK (es_operador());
CREATE POLICY oc_select_operador ON public.ordenes_compra FOR SELECT TO authenticated USING (es_operador());
CREATE POLICY oc_update_operador ON public.ordenes_compra FOR UPDATE TO authenticated USING (es_operador()) WITH CHECK (es_operador());
-- ordenes_compra_detalles
CREATE POLICY ocd_delete_admin    ON public.ordenes_compra_detalles FOR DELETE TO authenticated USING (es_admin());
CREATE POLICY ocd_insert_operador ON public.ordenes_compra_detalles FOR INSERT TO authenticated WITH CHECK (es_operador());
CREATE POLICY ocd_select_operador ON public.ordenes_compra_detalles FOR SELECT TO authenticated USING (es_operador());
CREATE POLICY ocd_update_operador ON public.ordenes_compra_detalles FOR UPDATE TO authenticated USING (es_operador()) WITH CHECK (es_operador());
-- pagos_credito
CREATE POLICY pagos_credito_delete_admin     ON public.pagos_credito FOR DELETE TO authenticated USING (es_admin());
CREATE POLICY pagos_credito_insert_operador  ON public.pagos_credito FOR INSERT TO authenticated WITH CHECK (es_operador());
CREATE POLICY pagos_credito_select_operador  ON public.pagos_credito FOR SELECT TO authenticated USING (es_operador());
CREATE POLICY pagos_credito_select_visitante ON public.pagos_credito FOR SELECT TO authenticated USING (es_visitante());
-- perfiles
CREATE POLICY perfiles_delete_admin          ON public.perfiles FOR DELETE TO authenticated USING (es_admin());
CREATE POLICY perfiles_insert_admin          ON public.perfiles FOR INSERT TO authenticated WITH CHECK (es_admin());
CREATE POLICY perfiles_select_admin_o_propio ON public.perfiles FOR SELECT TO authenticated USING ((es_admin() OR (id = auth.uid())));
CREATE POLICY perfiles_update_admin          ON public.perfiles FOR UPDATE TO authenticated USING (es_admin()) WITH CHECK (es_admin());
-- productos  (⚠️ T-RLS-2: anon puede SELECT productos — incluye costo/stock/precio_mayoreo)
CREATE POLICY productos_delete_admin    ON public.productos FOR DELETE TO authenticated USING (es_admin());
CREATE POLICY productos_insert_operador ON public.productos FOR INSERT TO authenticated WITH CHECK (es_operador());
CREATE POLICY productos_select_todos    ON public.productos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY productos_update_operador ON public.productos FOR UPDATE TO authenticated USING (es_operador()) WITH CHECK (es_operador());
-- proveedor_productos  (roles: public)
CREATE POLICY proveedor_productos_delete_admin    ON public.proveedor_productos FOR DELETE TO public USING (es_admin());
CREATE POLICY proveedor_productos_insert_operador ON public.proveedor_productos FOR INSERT TO public WITH CHECK (es_operador());
CREATE POLICY proveedor_productos_select_operador ON public.proveedor_productos FOR SELECT TO public USING (es_operador());
CREATE POLICY proveedor_productos_update_operador ON public.proveedor_productos FOR UPDATE TO public USING (es_operador()) WITH CHECK (es_operador());
-- proveedores
CREATE POLICY proveedores_delete_admin    ON public.proveedores FOR DELETE TO authenticated USING (es_admin());
CREATE POLICY proveedores_insert_operador ON public.proveedores FOR INSERT TO authenticated WITH CHECK (es_operador());
CREATE POLICY proveedores_select_operador ON public.proveedores FOR SELECT TO authenticated USING (es_operador());
CREATE POLICY proveedores_update_operador ON public.proveedores FOR UPDATE TO authenticated USING (es_operador()) WITH CHECK (es_operador());
-- ventas  (⚠️ T-RLS-1: visitante puede SELECT ventas)
CREATE POLICY ventas_delete_admin     ON public.ventas FOR DELETE TO authenticated USING (es_admin());
CREATE POLICY ventas_insert_operador  ON public.ventas FOR INSERT TO authenticated WITH CHECK (es_operador());
CREATE POLICY ventas_select_operador  ON public.ventas FOR SELECT TO authenticated USING (es_operador());
CREATE POLICY ventas_select_visitante ON public.ventas FOR SELECT TO authenticated USING (es_visitante());
CREATE POLICY ventas_update_admin     ON public.ventas FOR UPDATE TO authenticated USING (es_admin()) WITH CHECK (es_admin());
-- ventas_detalles
CREATE POLICY ventas_detalles_delete_admin     ON public.ventas_detalles FOR DELETE TO authenticated USING (es_admin());
CREATE POLICY ventas_detalles_insert_operador  ON public.ventas_detalles FOR INSERT TO authenticated WITH CHECK (es_operador());
CREATE POLICY ventas_detalles_select_operador  ON public.ventas_detalles FOR SELECT TO authenticated USING (es_operador());
CREATE POLICY ventas_detalles_select_visitante ON public.ventas_detalles FOR SELECT TO authenticated USING (es_visitante());


-- ============================ 8. GRANTS ============================
-- NOTA: por defecto de Supabase, anon/authenticated/service_role tienen TODOS los
-- privilegios DML de tabla (DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE)
-- sobre TODAS las tablas de public; el control real de acceso lo imponen las
-- políticas RLS de arriba. (Excepción: proveedor_productos NO concede a anon.)
--
-- M8 (2026-06-22): anon en 'productos' YA NO tiene SELECT de tabla completa; solo
-- columnas públicas: REVOKE SELECT ON productos FROM anon;
-- GRANT SELECT (id, sku, nombre, categoria, unidad, precio_publico) ON productos TO anon;
-- (anon ya NO puede leer costo/stock/precio_mayoreo — T-RLS-2.)
-- M8: REVOKE EXECUTE de anon/public en fn_registrar_venta_completa y fn_recibir_orden_compra (T-RPC-1).
--
-- Grants de FUNCIONES (EXECUTE):
--   es_admin            -> authenticated, service_role
--   es_operador         -> authenticated, service_role
--   es_visitante        -> PUBLIC, authenticated, service_role
--   rol_actual          -> authenticated, service_role
--   fn_recibir_orden_compra      -> authenticated, service_role
--   fn_registrar_venta_completa  -> authenticated, service_role
--   fn_descontar_lotes_peps      -> service_role
--   fn_evaluar_clientes_morosos  -> service_role
--   fn_procesar_abono_credito    -> service_role
--   fn_procesar_movimiento_inventario -> service_role
--   handle_new_user     -> service_role
--   rls_auto_enable     -> service_role
--   fn_registrar_abono  -> authenticated, service_role (T-COB-1)
--   fn_proteger_ultimo_admin -> service_role (M8)


-- ============================ 9. CRON (pg_cron) ============================
-- jobid 1 · "evaluar-clientes-morosos" · schedule '0 6 * * *' (06:00 UTC diario)
--   command: select public.fn_evaluar_clientes_morosos();
-- SELECT cron.schedule('evaluar-clientes-morosos', '0 6 * * *', $$ select public.fn_evaluar_clientes_morosos(); $$);

-- =====================================================================================
-- FIN DEL SNAPSHOT
-- =====================================================================================
