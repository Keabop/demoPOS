-- =====================================================================
-- Sincronización de objetos que existían en la base de datos en vivo
-- pero NO estaban versionados en migraciones (riesgo: perderlos en un
-- rebuild limpio / db reset). Definiciones idempotentes; aplicarlas en
-- una BD que ya los tiene es un no-op.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Trigger que mantiene el saldo deudor del cliente y el estado de la
--    venta a crédito al registrar o cancelar un abono.
--    AFTER INSERT: descuenta el abono del saldo_deudor y, si se liquidó
--                  el total, marca la venta como 'cobrada'.
--    AFTER DELETE: revierte el abono al saldo_deudor y regresa la venta
--                  a 'pendiente'.
-- ---------------------------------------------------------------------
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
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE TRIGGER trg_procesar_abono_credito
  AFTER INSERT OR DELETE ON public.pagos_credito
  FOR EACH ROW EXECUTE FUNCTION public.fn_procesar_abono_credito();

-- ---------------------------------------------------------------------
-- 2. Event trigger defensivo: habilita RLS automáticamente en cualquier
--    tabla nueva creada en el schema public. Red de seguridad para que
--    ninguna tabla quede expuesta sin RLS por olvido.
-- ---------------------------------------------------------------------
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

DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  EXECUTE FUNCTION public.rls_auto_enable();
