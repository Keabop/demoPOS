-- M8 (subconjunto seguro y no-disruptivo): endurecer RLS/roles.
-- NOTA: dos ítems quedan fuera por requerir más:
--   * T-RLS-1 (el visitante lee toda la cartera): requiere una VISTA/RPC de columnas
--     públicas y repuntar HistorialClientes; se hará en un cambio enfocado.
--   * T-RLS-3 (signup público auto-asignando admin): el alta legítima pasa por el Edge
--     Function (verifica admin) + handle_new_user; la mitigación real es DESHABILITAR el
--     signup público en el dashboard de Supabase Auth (no es SQL).

-- 1) Anti último-admin: impedir borrar/desactivar/degradar al último admin activo.
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
      IF v_otros_admins = 0 THEN
        RAISE EXCEPTION 'No se puede eliminar al último administrador activo.';
      END IF;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.rol = 'admin' AND OLD.activo AND (NEW.rol <> 'admin' OR NEW.activo = false) THEN
      SELECT count(*) INTO v_otros_admins FROM perfiles WHERE rol='admin' AND activo AND id <> OLD.id;
      IF v_otros_admins = 0 THEN
        RAISE EXCEPTION 'No se puede degradar ni desactivar al último administrador activo.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_proteger_ultimo_admin ON public.perfiles;
CREATE TRIGGER trg_proteger_ultimo_admin
  BEFORE UPDATE OR DELETE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_proteger_ultimo_admin();

-- 2) T-RPC-1: revocar EXECUTE a anon/public en las RPCs SECURITY DEFINER.
REVOKE EXECUTE ON FUNCTION public.fn_registrar_venta_completa(character varying, uuid, uuid, character varying, numeric, numeric, numeric, jsonb, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.fn_recibir_orden_compra(uuid) FROM anon, public;

-- 3) T-RLS-2: que anon NO lea costo/stock/precio_mayoreo de productos.
REVOKE SELECT ON public.productos FROM anon;
GRANT SELECT (id, sku, nombre, categoria, unidad, precio_publico) ON public.productos TO anon;
