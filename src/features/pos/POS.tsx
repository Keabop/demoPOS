import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import type { Producto, Cliente } from '../../types';
import { Icon } from '../../components/Icon';
import { BannerError } from '../../components/BannerError';
import { Topbar } from '../../components/Topbar';
import { NumberInput } from '../../components/NumberInput';
import { fmtMXN } from '../../lib/format';
import { calcularTotales, subtotalLinea, round2 } from '../../lib/money';
import { getConfig } from '../../lib/configNegocio';
import { generarFolioVenta, generarFolioCotizacion } from '../../lib/folios';
import { fechaVencimientoDesdeHoy } from '../../lib/dates';
import { exportarCotizacionPDF } from '../../lib/pdf/cotizacionPDF';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { CheckoutSuccessModal } from './CheckoutSuccessModal';

const SHOW_BARCODE_FEATURES = false;

interface POSProps {
  vendedorId: string;
  vendedorNombre: string;
  onNav?: (screen: string) => void;
}

export const POS: React.FC<POSProps> = ({ vendedorId, vendedorNombre, onNav }) => {
  // Database States
  const [products, setProducts] = useState<Producto[]>([]);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Caja State
  const [isCajaAbierta, setIsCajaAbierta] = useState<boolean>(false);
  const [checkingCaja, setCheckingCaja] = useState<boolean>(true);

  useEffect(() => {
    const checkCaja = async () => {
      try {
        const { data: apData, error: apErr } = await supabase
          .from('movimientos_caja')
          .select('*')
          .eq('tipo', 'apertura')
          .order('fecha', { ascending: false })
          .limit(1);

        if (apErr) throw apErr;

        if (!apData || apData.length === 0) {
          setIsCajaAbierta(false);
          return;
        }

        const lastApertura = apData[0];

        const { data: clData, error: clErr } = await supabase
          .from('movimientos_caja')
          .select('*')
          .eq('tipo', 'egreso')
          .eq('es_corte', true)
          .order('fecha', { ascending: false })
          .limit(1);

        if (clErr) throw clErr;

        const lastCorte = clData && clData.length > 0 ? clData[0] : null;

        if (lastCorte && new Date(lastCorte.fecha).getTime() > new Date(lastApertura.fecha).getTime()) {
          setIsCajaAbierta(false);
        } else {
          setIsCajaAbierta(true);
        }
      } catch (err) {
        console.error('Error checking caja in POS:', err);
      } finally {
        setCheckingCaja(false);
      }
    };

    checkCaja();

    const channel = supabase
      .channel('pos-caja-check')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'movimientos_caja' },
        () => {
          checkCaja();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Cart & Transaction States
  const [cart, setCart] = useState<{ id: string; qty: number }[]>([]);
  const [search, setSearch] = useState('');
  const [scan, setScan] = useState('');
  const [selectedCat, setSelectedCat] = useState('Todos');
  const [tipoVenta, setTipoVenta] = useState<'anonima' | 'cliente'>('cliente');
  const [credito, setCredito] = useState(false);
  const [plazoDias, setPlazoDias] = useState<number>(30);
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'tarjeta' | 'debito' | 'transferencia'>('efectivo');
  const [montoRecibido, setMontoRecibido] = useState<string>(''); // efectivo recibido para calcular el vuelto
  const [selectedClient, setSelectedClient] = useState<Cliente | null>(null);
  
  // Modals States
  const [showWebcamModal, setShowWebcamModal] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showMobileModal, setShowMobileModal] = useState(false);
  const [scanSessionId, setScanSessionId] = useState('');
  const [checkoutStatus, setCheckoutStatus] = useState<{ msg: string } | null>(null);

  // Synchronize credit term with the selected client's default credit days
  useEffect(() => {
    if (selectedClient) {
      setPlazoDias(selectedClient.dias_credito || 30);
    } else {
      setPlazoDias(30);
    }
  }, [selectedClient]);
  const [completedSale, setCompletedSale] = useState<{
    folio: string;
    subtotal: number;
    iva: number;
    total: number;
    clientName: string | null;
    clientPhone: string | null;
    clientLada: string;
    cartItems: Array<Producto & { qty: number }>;
    metodoPago: string;
    efectivoRecibido: number | null;
    cambio: number | null;
  } | null>(null);

  // References
  const scanInputRef = useRef<HTMLInputElement>(null);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Guard síncrono contra doble-cobro: setLoading es asíncrono y no bloquea un
  // segundo clic antes de que React re-renderice el botón deshabilitado.
  const isSubmittingRef = useRef(false);
  const lastBarcodeRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });

  // Beep Audio Alert
  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      console.warn('Audio beep failed:', e);
    }
  };

  // Load Data
  const loadData = async () => {
    try {
      setLoading(true);
      setLoadError(null);

      // Load products (solo activos: los descontinuados no se venden)
      const { data: prods, error: prodsErr } = await supabase
        .from('productos')
        .select('*')
        .eq('activo', true)
        .order('nombre', { ascending: true });
      if (prodsErr) throw prodsErr;
      setProducts(prods || []);

      // Load clients
      const { data: clis, error: clisErr } = await supabase
        .from('clientes')
        .select('*')
        .order('nombre', { ascending: true });
      if (clisErr) throw clisErr;
      setClients(clis || []);

      if (clis && clis.length > 0) {
        // We no longer auto-select clis[0] by default to allow "Seleccione el cliente..." placeholder
      }
    } catch (err) {
      console.error('Error al cargar datos del POS:', err);
      setLoadError(err instanceof Error ? err.message : 'No se pudieron cargar productos y clientes. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Focus barcode input on mount
    if (SHOW_BARCODE_FEATURES && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, []);

  // Keyboard shortcut listener (F2 to focus barcode scanner)
  useEffect(() => {
    if (!SHOW_BARCODE_FEATURES) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        if (scanInputRef.current) {
          scanInputRef.current.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Realtime subscription for Mobile Scanner Sync
  useEffect(() => {
    if (showMobileModal && scanSessionId) {
      // Create channel
      const channel = supabase.channel(`scan:${scanSessionId}`, {
        config: {
          broadcast: { self: false }
        }
      });
      realtimeChannelRef.current = channel;

      channel
        .on('broadcast', { event: 'scan' }, ({ payload }) => {
          if (payload && payload.sku) {
            playBeep();
            handleBarcodeAdd(payload.sku);
          }
        })
        .subscribe((status) => {
          console.log(`POS realtime channel subscribed: ${status}`);
        });
    }

    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [showMobileModal, scanSessionId]);

  // QR Code generator URL helper
  const getMobileScannerUrl = () => {
    return `${window.location.origin}${window.location.pathname}?scan_session=${scanSessionId}`;
  };

  const startMobileSync = () => {
    const newSessionId = 'CAJA-1-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    setScanSessionId(newSessionId);
    setShowMobileModal(true);
  };

  // Helper to resolve barcode input / scan
  const handleBarcodeAdd = (code: string) => {
    if (!code) return;
    const cleanCode = code.trim();

    // Debounce: ignore same code within 3 seconds
    const now = Date.now();
    if (cleanCode === lastBarcodeRef.current.code && now - lastBarcodeRef.current.time < 3000) {
      return;
    }
    lastBarcodeRef.current = { code: cleanCode, time: now };

    const prod = products.find(p => p.sku === cleanCode || p.id === cleanCode);
    if (prod) {
      if ((prod.stock || 0) <= 0) {
        toast.error(`El producto ${prod.nombre} está agotado.`);
        return;
      }
      setCart(prev => {
        const ex = prev.find(c => c.id === prod.id);
        if (ex) {
          if (ex.qty + 1 > (prod.stock || 0)) {
            toast.error(`No puedes agregar más de ${prod.stock} ${prod.unidad} en stock.`);
            return prev;
          }
          return prev.map(c => c.id === prod.id ? { ...c, qty: c.qty + 1 } : c);
        }
        return [...prev, { id: prod.id, qty: 1 }];
      });
      setScan('');
    } else {
      toast.error(`Producto con código/SKU "${cleanCode}" no encontrado.`);
    }
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleBarcodeAdd(scan);
  };

  const addToCart = (id: string) => {
    const prod = products.find(p => p.id === id);
    if (!prod) return;
    if ((prod.stock || 0) <= 0) {
      toast.error(`El producto ${prod.nombre} está agotado.`);
      return;
    }
    setCart(prev => {
      const ex = prev.find(c => c.id === id);
      if (ex) {
        if (ex.qty + 1 > (prod.stock || 0)) {
          toast.error(`No puedes vender más de ${prod.stock} ${prod.unidad} disponibles.`);
          return prev;
        }
        return prev.map(c => c.id === id ? { ...c, qty: c.qty + 1 } : c);
      }
      return [...prev, { id, qty: 1 }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    const prod = products.find(p => p.id === id);
    if (!prod) return;

    setCart(prev => prev.flatMap(c => {
      if (c.id !== id) return c;
      const next = c.qty + delta;
      if (next <= 0) return [];
      if (next > (prod.stock || 0)) {
        toast.error(`Solo hay ${prod.stock} ${prod.unidad} disponibles en stock.`);
        return c;
      }
      return { ...c, qty: next };
    }));
  };

  const updateQtyDirect = (id: string, val: number) => {
    const prod = products.find(p => p.id === id);
    if (!prod) return;

    // Acota a [0, stock]. IMPORTANTE: NO se quita el producto aunque quede en 0,
    // para que el cajero pueda borrar el recuadro y reescribir la cantidad
    // (ej. teclear "20" en lugar de presionar + veinte veces). El producto solo
    // se quita con la "X" o con el botón "-".
    const max = prod.stock || 0;
    const q = Math.max(0, Math.min(val, max));
    setCart(prev => prev.map(c => c.id === id ? { ...c, qty: q } : c));
  };

  const removeFromCart = (id: string) => setCart(prev => prev.filter(c => c.id !== id));
  
  const clearCart = () => setCart([]);

  // Calculate Categories
  const categories = ['Todos', ...new Set(products.map(p => p.categoria))];

  // Filters
  const filteredProducts = products.filter(p =>
    (selectedCat === 'Todos' || p.categoria === selectedCat) &&
    (search === '' || p.nombre.toLowerCase().includes(search.toLowerCase()) || p.sku.includes(search))
  );

  // Cart Totals and Taxes
  const cartItems = cart.map(c => {
    const p = products.find(prod => prod.id === c.id)!;
    return { ...p, qty: c.qty };
  });

  // Calculate pricing based on public or wholesale
  const getProductPrice = (p: Producto) => {
    // We can implement discount if wholesale quantity, or let type determine.
    // For now we use precio_publico
    return Number(p.precio_publico);
  };

  const { subtotal, iva, total } = calcularTotales(
    cartItems.map(c => ({
      precioUnitario: getProductPrice(c),
      cantidad: c.qty,
      tasaIva: Number(c.tasa_iva || 0),
    }))
  );

  // Checkout process
  const handleCotizacion = (modo: 'descargar' | 'imprimir' = 'descargar') => {
    if (cartItems.length === 0) return;
    const partidas = cartItems.map((it, i) => ({
      numero: i + 1,
      unidad: it.unidad,
      cantidad: it.qty,
      descripcion: it.nombre,
      categoria: it.categoria,
      valorUnitario: getProductPrice(it),
      total: subtotalLinea(getProductPrice(it), it.qty),
    }));
    const cliente = tipoVenta === 'cliente' && selectedClient
      ? { nombre: selectedClient.nombre, direccion: selectedClient.rancho, telefono: selectedClient.telefono }
      : { nombre: 'Público en general' };
    exportarCotizacionPDF({
      folio: generarFolioCotizacion(),
      fecha: new Date().toLocaleDateString('es-MX'),
      cliente,
      partidas,
    }, modo);
  };

  const handleCheckout = async () => {
    // Si ya hay un cobro en curso, ignorar clics adicionales (anti doble-cobro).
    if (isSubmittingRef.current) return;

    if (!isCajaAbierta) {
      toast.error('La caja está cerrada. Debe iniciar turno en "Flujo de Caja" antes de registrar ventas.');
      return;
    }

    if (cartItems.length === 0) {
      toast.error('El carrito está vacío.');
      return;
    }

    // Solo se cobran las líneas con cantidad > 0 (un recuadro vacío/0 no cuenta).
    const lineasValidas = cartItems.filter(it => it.qty > 0);
    if (lineasValidas.length === 0) {
      toast.error('Agrega al menos un producto con cantidad mayor a 0.');
      return;
    }

    if (tipoVenta === 'cliente' && !selectedClient) {
      toast.error('Debes seleccionar un cliente para esta venta.');
      return;
    }

    // A partir de aquí el cobro está comprometido: bloquear reentradas.
    isSubmittingRef.current = true;

    // Prepare variables
    const clienteId = tipoVenta === 'cliente' ? selectedClient?.id : null;
    const tipoPago = credito ? 'credito' : metodoPago;
    
    // Folio de venta (la generación impura vive en lib/folios para mantener puro el render).
    const generatedFolio = generarFolioVenta();

    // Map cart items to JSONB structure for the RPC function
    const detalles = lineasValidas.map(it => ({
      producto_id: it.id,
      cantidad: it.qty,
      precio_unitario: getProductPrice(it),
      subtotal: subtotalLinea(getProductPrice(it), it.qty)
    }));

    try {
      setLoading(true);

      // Call database RPC transaction
      const { error } = await supabase.rpc('fn_registrar_venta_completa', {
        p_folio: generatedFolio,
        p_cliente_id: clienteId,
        p_vendedor_id: vendedorId,
        p_tipo_pago: tipoPago,
        p_subtotal: subtotal,
        p_iva: iva,
        p_total: total,
        p_detalles: detalles,
        p_plazo_dias: plazoDias
      });

      if (error) throw error;

      playBeep();
      setCompletedSale({
        folio: generatedFolio,
        subtotal: subtotal,
        iva: iva,
        total: total,
        clientName: tipoVenta === 'cliente' ? (selectedClient?.nombre || null) : null,
        clientPhone: tipoVenta === 'cliente' ? (selectedClient?.telefono || null) : null,
        clientLada: (tipoVenta === 'cliente' ? selectedClient?.lada : null) || '52',
        cartItems: [...lineasValidas],
        metodoPago: tipoPago,
        efectivoRecibido: (!credito && metodoPago === 'efectivo' && montoRecibido !== '' && !isNaN(Number(montoRecibido))) ? round2(Number(montoRecibido)) : null,
        cambio: (!credito && metodoPago === 'efectivo' && montoRecibido !== '' && !isNaN(Number(montoRecibido))) ? round2(Number(montoRecibido) - total) : null,
      });
      clearCart();
      setSelectedClient(null);
      setCredito(false);
      setMetodoPago('efectivo');
      setMontoRecibido('');
      loadData(); // reload catalog stocks
    } catch (err) {
      console.error('Checkout error:', err);
      setCheckoutStatus({
        msg: err instanceof Error ? err.message : 'Error al procesar la venta.'
      });
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const handleSendWhatsApp = async (phone: string): Promise<boolean> => {
    if (!completedSale) return false;

    const formattedDateTime = new Date().toLocaleString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const itemsText = completedSale.cartItems
      .map(item => {
        const price = getProductPrice(item);
        const sub = price * item.qty;
        return `- ${Number(item.qty).toFixed(2)} x ${item.nombre} (${item.unidad}) - ${fmtMXN(sub)}`;
      })
      .join('\n');

    const paymentLabels: Record<string, string> = {
      efectivo: 'EFECTIVO',
      tarjeta: 'TARJETA DE CRÉDITO',
      debito: 'TARJETA DE DÉBITO',
      transferencia: 'TRANSFERENCIA BANCARIA',
      credito: 'CRÉDITO'
    };
    const paymentLabel = paymentLabels[completedSale.metodoPago] || completedSale.metodoPago.toUpperCase();

    const text = `*${getConfig().nombre} - COMPROBANTE DE COMPRA*
----------------------------------
*Folio:* ${completedSale.folio}
*Fecha:* ${formattedDateTime}
${completedSale.clientName ? `*Cliente:* ${completedSale.clientName}\n` : ''}*Forma de Pago:* ${paymentLabel}
----------------------------------
*Detalle de Compra:*
${itemsText}
----------------------------------
*Total:* ${fmtMXN(completedSale.total)} MXN
----------------------------------
¡Gracias por su preferencia!`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    try {
      const webhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/agromar-ventas';
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({
          phone,
          lada: completedSale.clientLada || '52',
          text,
          vendedor: vendedorNombre,
          venta: {
            folio: completedSale.folio,
            total: completedSale.total,
            cliente_nombre: completedSale.clientName,
            cliente_telefono: completedSale.clientPhone,
            items: completedSale.cartItems
          }
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn('Could not send ticket via n8n webhook. Falling back to wa.me link.', err);
      const url = `https://wa.me/${completedSale.clientLada || '52'}${phone}?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
    }

    return true;
  };

  return (
    <>
      <Topbar title="Nueva Venta" subtitle={`Vendedor: ${vendedorNombre} · Caja 1`}>
        {SHOW_BARCODE_FEATURES && (
          <>
            <button className="btn btn-secondary btn-pos-sync" onClick={startMobileSync}>
              <Icon name="device" size={16} />
              Escanear con Celular
            </button>
            <button className="btn btn-secondary btn-pos-webcam" onClick={() => { setCameraError(null); setShowWebcamModal(true); }}>
              <Icon name="eye" size={16} />
              Escanear con WebCam
            </button>
          </>
        )}
      </Topbar>

      <div className="pos-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 420px', height: 'calc(100vh - 64px)', minHeight: 0 }}>
        {/* LEFT: Product Catalog */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>

          <BannerError mensaje={loadError} onReintentar={loadData} />

          {/* Scanner and Search row */}
          <div className="pos-search-row" style={{ display: 'grid', gridTemplateColumns: SHOW_BARCODE_FEATURES ? '1.2fr 1fr' : '1fr', gap: 12 }}>
            {SHOW_BARCODE_FEATURES && (
              <form onSubmit={handleBarcodeSubmit} className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(180deg, var(--surface) 0%, var(--surface-2) 100%)', border: '1.5px solid var(--green-line)' }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--green-soft)', color: 'var(--green-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                  <Icon name="barcode" size={22} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--green-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Código de barras / SKU</div>
                  <input
                    ref={scanInputRef}
                    className="mono"
                    value={scan}
                    onChange={e => setScan(e.target.value)}
                    placeholder="Escanee o teclee el código…"
                    style={{ width: '100%', border: 0, background: 'transparent', fontSize: 16, fontWeight: 600, color: 'var(--ink)', letterSpacing: 0.5, outline: 'none' }}
                  />
                </div>
                <span className="kbd" onClick={() => scanInputRef.current?.focus()}>F2</span>
              </form>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '0 14px', height: 76 }}>
              <Icon name="search" size={18} color="var(--muted)" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre o SKU..."
                style={{ flex: 1, border: 0, background: 'transparent', fontSize: 14, outline: 'none' }}
              />
              {search && <button onClick={() => setSearch('')} style={{ color: 'var(--muted)', padding: 4, background: 'transparent', border: 0, cursor: 'pointer' }}><Icon name="x" size={16} /></button>}
            </div>
          </div>

          {/* Category pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {categories.map(c => (
              <button
                key={c}
                onClick={() => setSelectedCat(c)}
                style={{
                  height: 34, padding: '0 16px', borderRadius: 999,
                  background: selectedCat === c ? 'var(--ink)' : 'var(--surface)',
                  color: selectedCat === c ? '#fff' : 'var(--ink-2)',
                  border: `1px solid ${selectedCat === c ? 'var(--ink)' : 'var(--line)'}`,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer'
                }}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Product grid */}
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Cargando catálogo...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {filteredProducts.map(p => {
                const stockVal = Number(p.stock || 0);
                const low = stockVal < Number(p.stock_minimo);
                const critical = stockVal < Number(p.stock_minimo) / 2;
                const inCart = cart.find(c => c.id === p.id);
                
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p.id)}
                    disabled={stockVal <= 0}
                    style={{
                      background: 'var(--surface)',
                      border: `1.5px solid ${inCart ? 'var(--green)' : 'var(--line)'}`,
                      borderRadius: 12, padding: 12, textAlign: 'left',
                      display: 'flex', flexDirection: 'column', gap: 6,
                      transition: 'all 0.12s', position: 'relative',
                      boxShadow: inCart ? '0 0 0 3px oklch(0.58 0.13 145 / 0.12)' : 'var(--shadow-sm)',
                      cursor: stockVal <= 0 ? 'not-allowed' : 'pointer',
                      opacity: stockVal <= 0 ? 0.5 : 1
                    }}
                  >
                    {/* Image / Letter Box */}
                    <div style={{
                      height: 80, borderRadius: 8,
                      background: `repeating-linear-gradient(45deg, var(--surface-2) 0 6px, #efece3 6px 12px)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1px solid var(--line-2)', position: 'relative',
                    }}>
                      <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--muted-2)', fontFamily: 'JetBrains Mono' }}>
                        {p.nombre.substring(0, 1).toUpperCase()}
                      </div>
                      {inCart && (
                        <div style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 999, background: 'var(--green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                          {inCart.qty}
                        </div>
                      )}
                    </div>
                    
                    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25, color: 'var(--ink)', minHeight: 32, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.nombre}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.unidad}</div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                      <div className="num" style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>
                        {fmtMXN(p.precio_publico)}
                      </div>
                      <span className={`badge ${critical ? 'red' : low ? 'amber' : 'gray'}`} style={{ height: 20, padding: '0 7px', fontSize: 11 }}>
                        <span className="dot"></span>
                        {stockVal}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT: Cart Details */}
        <div className="pos-cart-container" style={{ background: 'var(--surface)', borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          
          {/* Sale Type Selector */}
          <div style={{ padding: 16, borderBottom: '1px solid var(--line)' }}>
            <div className="label">Tipo de venta</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={() => { setTipoVenta('anonima'); setCredito(false); }} style={{
                padding: '12px 12px', borderRadius: 8, fontWeight: 600, fontSize: 14,
                border: `1.5px solid ${tipoVenta === 'anonima' ? 'var(--ink)' : 'var(--line)'}`,
                background: tipoVenta === 'anonima' ? 'var(--ink)' : 'var(--surface)',
                color: tipoVenta === 'anonima' ? '#fff' : 'var(--ink-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                cursor: 'pointer'
              }}>
                <Icon name="cart" size={16} />
                Venta Anónima
              </button>
              <button onClick={() => setTipoVenta('cliente')} style={{
                padding: '12px 12px', borderRadius: 8, fontWeight: 600, fontSize: 14,
                border: `1.5px solid ${tipoVenta === 'cliente' ? 'var(--green)' : 'var(--line)'}`,
                background: tipoVenta === 'cliente' ? 'var(--green-soft)' : 'var(--surface)',
                color: tipoVenta === 'cliente' ? 'var(--green-2)' : 'var(--ink-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                cursor: 'pointer'
              }}>
                <Icon name="users" size={16} />
                Venta a Cliente
              </button>
            </div>

            {tipoVenta === 'cliente' && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div className="label">Cliente Seleccionado</div>
                <select
                  className="input"
                  value={selectedClient?.id || ''}
                  onChange={e => {
                    const found = clients.find(c => c.id === e.target.value);
                    setSelectedClient(found || null);
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: 13,
                    appearance: 'none',
                    backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%237a827e\' stroke-width=\'2\'><path d=\'m6 9 6 6 6-6\'/></svg>")',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 12px center',
                  }}
                >
                  <option value="" disabled>Seleccione el cliente...</option>
                  {clients.map(cli => (
                    <option key={cli.id} value={cli.id}>
                      {cli.nombre} ({cli.rancho || 'Sin rancho'})
                    </option>
                  ))}
                </select>
                {selectedClient && (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6, fontSize: 11, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Límite de crédito:</span>
                      <span className="num" style={{ fontWeight: 600 }}>{fmtMXN(selectedClient.limite_credito)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Saldo deudor actual:</span>
                      <span className="num" style={{ fontWeight: 600, color: Number(selectedClient.saldo_deudor) > 0 ? 'var(--red)' : 'var(--muted)' }}>
                        {fmtMXN(selectedClient.saldo_deudor)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Crédito disponible:</span>
                      <span className="num" style={{ fontWeight: 700, color: 'var(--green-2)' }}>
                        {fmtMXN(Number(selectedClient.limite_credito) - Number(selectedClient.saldo_deudor))}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--line-2)' }}>
                      <span>Estatus crédito:</span>
                      <span style={{
                        fontWeight: 700,
                        color: selectedClient.activo_para_credito ? 'var(--green)' : 'var(--red)'
                      }}>
                        {selectedClient.activo_para_credito ? 'ACTIVO (Apto)' : 'BLOQUEADO (Moroso)'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cart Item List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', minHeight: 0 }}>
            <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div className="h3">Productos ({cartItems.length})</div>
              {cartItems.length > 0 && (
                <button onClick={clearCart} style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', background: 'transparent', border: 0, cursor: 'pointer' }}>
                  Vaciar
                </button>
              )}
            </div>

            {cartItems.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', border: '2px dashed var(--line)', borderRadius: 10 }}>
                <Icon name="cart" size={28} color="var(--muted-2)" />
                <div style={{ marginTop: 10, fontSize: 13 }}>Escanee o seleccione un producto para comenzar</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {cartItems.map(it => {
                  const price = getProductPrice(it);
                  return (
                    <div key={it.id} style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--line-2)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{it.nombre}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }} className="num">
                            {fmtMXN(price)} · {it.unidad}
                          </div>
                        </div>
                        <button onClick={() => removeFromCart(it.id)} style={{ color: 'var(--muted)', padding: 4, background: 'transparent', border: 0, cursor: 'pointer', alignSelf: 'flex-start' }}>
                          <Icon name="x" size={16} />
                        </button>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {/* Quantity controls supporting decimals */}
                        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--line)', overflow: 'hidden' }}>
                          <button onClick={() => updateQty(it.id, -1)} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-2)', background: 'transparent', border: 0, cursor: 'pointer' }}>
                            <Icon name="minus" size={12} />
                          </button>
                          
                          <NumberInput
                            value={it.qty}
                            onChange={(n) => updateQtyDirect(it.id, n)}
                            className=""
                            style={{
                              width: 50,
                              height: 32,
                              border: 0,
                              background: 'transparent',
                              textAlign: 'center',
                              fontWeight: 700,
                              fontSize: 14,
                              outline: 'none',
                              color: 'var(--ink)'
                            }}
                          />

                          <button onClick={() => updateQty(it.id, 1)} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-2)', background: 'transparent', border: 0, cursor: 'pointer' }}>
                            <Icon name="plus" size={12} />
                          </button>
                        </div>
                        <div className="num" style={{ fontSize: 15, fontWeight: 700 }}>
                          {fmtMXN(it.qty * price)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Totals panel */}
          <div style={{ borderTop: '1px solid var(--line)', padding: '14px 16px', background: 'var(--surface-2)' }}>
            <div style={{ display: 'grid', gap: 6, marginBottom: 12, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>Total a Pagar</span>
                <span className="num" style={{ fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em' }}>{fmtMXN(total)}</span>
              </div>
            </div>

            {/* Credit Option Toggle */}
            {tipoVenta === 'cliente' && selectedClient && (
              <>
                <button
                  onClick={() => {
                    if (!selectedClient.activo_para_credito) {
                      toast.error('El cliente seleccionado tiene el crédito bloqueado por morosidad.');
                      return;
                    }
                    setCredito(!credito);
                  }}
                  disabled={!selectedClient.activo_para_credito}
                  style={{
                    width: '100%', padding: '10px 12px', marginBottom: credito ? 6 : 10,
                    border: `1.5px solid ${credito ? 'oklch(0.86 0.07 80)' : 'var(--line)'}`,
                    background: credito ? 'var(--amber-soft)' : 'var(--surface)',
                    borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10,
                    cursor: selectedClient.activo_para_credito ? 'pointer' : 'not-allowed',
                    opacity: selectedClient.activo_para_credito ? 1 : 0.5
                  }}
                >
                  <div style={{
                    width: 38, height: 22, borderRadius: 999,
                    background: credito ? 'var(--amber)' : '#cdc8b8',
                    position: 'relative', flex: 'none', transition: 'all 0.15s'
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: 999, background: '#fff',
                      position: 'absolute', top: 2, left: credito ? 18 : 2,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.15)', transition: 'all 0.15s'
                    }}></div>
                  </div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                      Nota a Crédito ({plazoDias} días)
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      Vence: {fechaVencimientoDesdeHoy(plazoDias)}
                    </div>
                  </div>
                  <Icon name="credit" size={18} color={credito ? 'oklch(0.5 0.12 70)' : 'var(--muted)'} />
                </button>

                {/* Credit Option Plazo Selector */}
                {credito && (
                  <div style={{
                    marginBottom: 10, padding: '10px 12px', background: 'var(--surface)',
                    border: '1.5px solid oklch(0.72 0.14 75 / 0.5)', borderRadius: 8,
                    display: 'flex', flexDirection: 'column', gap: 6,
                    animation: 'scaleIn 0.2s ease-out'
                  }}>
                    <div className="label" style={{ fontSize: 10, marginBottom: 0, letterSpacing: '0.02em' }}>Plazo de Crédito</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <select
                        className="input"
                        value={[5, 14, 30, 45, 60].includes(plazoDias) ? plazoDias : 'custom'}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === 'custom') {
                            setPlazoDias(7); // default custom days
                          } else {
                            setPlazoDias(Number(val));
                          }
                        }}
                        style={{ flex: 1, height: 36, padding: '0 10px', fontSize: 13 }}
                      >
                        <option value="5">5 Días</option>
                        <option value="14">14 Días (2 Semanas)</option>
                        <option value="30">30 Días (1 Mes)</option>
                        <option value="45">45 Días (1.5 Meses)</option>
                        <option value="60">60 Días (2 Meses)</option>
                        <option value="custom">Personalizado...</option>
                      </select>

                      {(![5, 14, 30, 45, 60].includes(plazoDias) || plazoDias === 0) && (
                        <input
                          type="number"
                          min="1"
                          className="input num"
                          value={plazoDias}
                          onChange={e => setPlazoDias(Math.max(1, parseInt(e.target.value) || 1))}
                          style={{ width: 85, height: 36, padding: '0 10px', fontSize: 13 }}
                        />
                      )}
                      <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>días</span>
                    </div>
                    {selectedClient && (() => {
                      const limite = Number(selectedClient.limite_credito) || 0;
                      const saldo = Number(selectedClient.saldo_deudor) || 0;
                      const proyectado = saldo + total;
                      const pct = limite > 0 ? Math.min((proyectado / limite) * 100, 100) : 0;
                      const excede = proyectado > limite;
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
                            <span>Crédito tras esta venta</span>
                            <span className="num" style={{ fontWeight: 700, color: excede ? 'var(--red)' : 'var(--ink-2)' }}>
                              {fmtMXN(proyectado)} / {fmtMXN(limite)}
                            </span>
                          </div>
                          <div style={{ height: 6, borderRadius: 999, background: 'var(--line-2)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.max(2, pct)}%`, borderRadius: 999, background: excede ? 'var(--red)' : pct > 80 ? 'var(--amber)' : 'var(--green)' }} />
                          </div>
                          <div style={{ fontSize: 10, color: excede ? 'var(--red)' : 'var(--muted)' }}>
                            {excede ? `Excede el límite por ${fmtMXN(proyectado - limite)}` : `Disponible después: ${fmtMXN(limite - proyectado)}`}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </>
            )}

            {/* Credit Limit Warnings */}
            {tipoVenta === 'cliente' && selectedClient && credito && (Number(selectedClient.saldo_deudor) + total > Number(selectedClient.limite_credito)) && (
              <div style={{ padding: '8px 12px', background: 'var(--red-soft)', color: 'var(--red)', borderRadius: 8, fontSize: 11, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="alert" size={14} />
                <span>Advertencia: La venta excede el límite de crédito disponible.</span>
              </div>
            )}

            {/* Payment Method Selector (only when NOT credit) */}
            {!credito && (
              <div style={{ marginBottom: 10 }}>
                <div className="label" style={{ marginBottom: 6 }}>Método de Pago</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {/* EFECTIVO */}
                  <button
                    type="button"
                    onClick={() => setMetodoPago('efectivo')}
                    style={{
                      padding: '10px 12px', borderRadius: 8, fontWeight: 600, fontSize: 13,
                      border: `1.5px solid ${metodoPago === 'efectivo' ? 'var(--green)' : 'var(--line)'}`,
                      background: metodoPago === 'efectivo' ? 'var(--green-soft)' : 'var(--surface)',
                      color: metodoPago === 'efectivo' ? 'var(--green-2)' : 'var(--ink-2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      cursor: 'pointer'
                    }}
                  >
                    <Icon name="cash" size={16} />
                    Efectivo
                  </button>

                  {/* TRANSFERENCIA */}
                  <button
                    type="button"
                    onClick={() => setMetodoPago('transferencia')}
                    style={{
                      padding: '10px 12px', borderRadius: 8, fontWeight: 600, fontSize: 13,
                      border: `1.5px solid ${metodoPago === 'transferencia' ? 'oklch(0.6 0.16 30)' : 'var(--line)'}`,
                      background: metodoPago === 'transferencia' ? 'oklch(0.97 0.03 30)' : 'var(--surface)',
                      color: metodoPago === 'transferencia' ? 'oklch(0.5 0.15 30)' : 'var(--ink-2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      cursor: 'pointer'
                    }}
                  >
                    <Icon name="arrow-right" size={16} />
                    Transferencia
                  </button>

                  {/* T. DEBITO */}
                  <button
                    type="button"
                    onClick={() => setMetodoPago('debito')}
                    style={{
                      padding: '10px 12px', borderRadius: 8, fontWeight: 600, fontSize: 12,
                      border: `1.5px solid ${metodoPago === 'debito' ? 'oklch(0.5 0.15 280)' : 'var(--line)'}`,
                      background: metodoPago === 'debito' ? 'oklch(0.96 0.02 280)' : 'var(--surface)',
                      color: metodoPago === 'debito' ? 'oklch(0.45 0.12 280)' : 'var(--ink-2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      cursor: 'pointer'
                    }}
                  >
                    <Icon name="credit" size={16} />
                    T. Débito
                  </button>

                  {/* T. CREDITO */}
                  <button
                    type="button"
                    onClick={() => setMetodoPago('tarjeta')}
                    style={{
                      padding: '10px 12px', borderRadius: 8, fontWeight: 600, fontSize: 12,
                      border: `1.5px solid ${metodoPago === 'tarjeta' ? 'oklch(0.5 0.12 240)' : 'var(--line)'}`,
                      background: metodoPago === 'tarjeta' ? 'oklch(0.94 0.02 240)' : 'var(--surface)',
                      color: metodoPago === 'tarjeta' ? 'oklch(0.45 0.1 240)' : 'var(--ink-2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      cursor: 'pointer'
                    }}
                  >
                    <Icon name="credit" size={16} />
                    T. Crédito
                  </button>
                </div>

                {/* HELPER TEXT BANNERS */}
                {metodoPago === 'transferencia' && (
                  <div style={{ marginTop: 6, padding: '6px 10px', background: 'oklch(0.97 0.03 30)', borderRadius: 6, fontSize: 11, color: 'oklch(0.5 0.15 30)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="alert" size={12} />
                    <span>Verifique que la transferencia por <strong>{fmtMXN(total)}</strong> se haya recibido en la cuenta bancaria antes de continuar.</span>
                  </div>
                )}

                {(metodoPago === 'tarjeta' || metodoPago === 'debito') && (
                  <div style={{ marginTop: 6, padding: '6px 10px', background: 'oklch(0.94 0.02 240)', borderRadius: 6, fontSize: 11, color: 'oklch(0.45 0.1 240)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="alert" size={12} />
                    <span>Ingrese el monto de <strong>{fmtMXN(total)}</strong> en la terminal de cobro físico antes de confirmar.</span>
                  </div>
                )}

                {/* Efectivo recibido + montos rápidos + vuelto */}
                {metodoPago === 'efectivo' && (
                  <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--line-2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label className="label" style={{ fontSize: 11, margin: 0 }}>Efectivo recibido (para calcular el cambio)</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontWeight: 600 }}>$</span>
                      <input
                        className="input num"
                        type="number" step="any" min="0" inputMode="decimal"
                        value={montoRecibido}
                        onChange={e => setMontoRecibido(e.target.value)}
                        placeholder="0.00"
                        style={{ paddingLeft: 22, fontWeight: 700 }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <button type="button" className="btn btn-secondary" style={{ height: 30, padding: '0 10px', fontSize: 12 }} onClick={() => setMontoRecibido(String(total))}>Exacto</button>
                      {[50, 100, 200, 500].map(b => (
                        <button key={b} type="button" className="btn btn-secondary" style={{ height: 30, padding: '0 10px', fontSize: 12 }}
                          onClick={() => setMontoRecibido(prev => String(round2((Number(prev) || 0) + b)))}>
                          +${b}
                        </button>
                      ))}
                      <button type="button" className="btn btn-secondary" style={{ height: 30, padding: '0 10px', fontSize: 12 }} onClick={() => setMontoRecibido('')} title="Limpiar">Limpiar</button>
                    </div>
                    {montoRecibido !== '' && !isNaN(Number(montoRecibido)) && (() => {
                      const cambio = round2(Number(montoRecibido) - total);
                      return (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, color: cambio >= 0 ? 'var(--green-2)' : 'var(--red)' }}>
                          <span>{cambio >= 0 ? 'Cambio' : 'Falta'}</span>
                          <span className="num" style={{ fontSize: 16 }}>{fmtMXN(Math.abs(cambio))}</span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Caja Cerrada Warning Banner */}
            {!isCajaAbierta && !checkingCaja && (
              <div style={{
                background: 'var(--red-soft)',
                color: 'var(--red)',
                padding: '12px 14px',
                borderRadius: 8,
                border: '1px solid oklch(0.58 0.16 25 / 0.2)',
                fontSize: '12px',
                fontWeight: 600,
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <Icon name="alert" size={16} />
                <div style={{ flex: 1 }}>
                  Caja cerrada.
                  {onNav && (
                    <button
                      type="button"
                      onClick={() => onNav('caja')}
                      style={{
                        background: 'transparent',
                        border: 0,
                        padding: 0,
                        color: 'var(--red)',
                        textDecoration: 'underline',
                        fontWeight: 700,
                        cursor: 'pointer',
                        marginLeft: 4
                      }}
                    >
                      Abrir turno
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Action Checkout button */}
            <button
              onClick={handleCheckout}
              disabled={loading || !isCajaAbierta || checkingCaja || cartItems.length === 0 || (tipoVenta === 'cliente' && !selectedClient) || (tipoVenta === 'cliente' && credito && (Number(selectedClient?.saldo_deudor) + total > Number(selectedClient?.limite_credito)))}
              className="btn btn-primary btn-xl btn-block"
              style={{
                background: !isCajaAbierta 
                  ? 'var(--muted-2)' 
                  : (credito 
                      ? 'oklch(0.55 0.16 70)' 
                      : metodoPago === 'tarjeta' 
                        ? 'oklch(0.45 0.12 240)' 
                        : metodoPago === 'debito'
                          ? 'oklch(0.45 0.12 280)'
                          : metodoPago === 'transferencia'
                            ? 'oklch(0.55 0.15 30)'
                            : 'var(--green)'),
                cursor: loading || !isCajaAbierta || cartItems.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              <Icon name={credito ? 'credit' : (metodoPago === 'efectivo' ? 'cash' : metodoPago === 'transferencia' ? 'arrow-right' : 'credit')} size={20} />
              {credito
                ? 'Generar Nota a Crédito'
                : metodoPago === 'transferencia'
                  ? 'Registrar Transferencia'
                  : metodoPago === 'debito'
                    ? 'Cobrar con Tarjeta Débito'
                    : metodoPago === 'tarjeta'
                      ? 'Cobrar con Tarjeta Crédito'
                      : 'Cobrar en Efectivo'}
              <span className="num" style={{ marginLeft: 'auto', fontSize: 18 }}>{fmtMXN(total)}</span>
            </button>

            {/* Generar cotización (no registra venta) */}
            <button
              onClick={() => handleCotizacion('descargar')}
              disabled={cartItems.length === 0}
              className="btn btn-secondary btn-block"
              style={{ marginTop: 8, gap: 8, cursor: cartItems.length === 0 ? 'not-allowed' : 'pointer' }}
            >
              <Icon name="file" size={16} />
              Generar cotización (PDF)
            </button>
            <button
              onClick={() => handleCotizacion('imprimir')}
              disabled={cartItems.length === 0}
              className="btn btn-secondary btn-block"
              style={{ marginTop: 8, gap: 8, cursor: cartItems.length === 0 ? 'not-allowed' : 'pointer' }}
            >
              <Icon name="printer" size={16} />
              Imprimir cotización
            </button>
          </div>
        </div>
      </div>

      {/* WEBCAM SCANNER MODAL */}
      {SHOW_BARCODE_FEATURES && showWebcamModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="card" style={{ width: '90%', maxWidth: 440, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="h3">Escanear con WebCam</div>
              <button
                onClick={() => { setShowWebcamModal(false); setCameraError(null); }}
                style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 4, color: 'var(--muted)' }}
              >
                <Icon name="x" size={20} />
              </button>
            </div>
            
            {cameraError ? (
              <div style={{ padding: 24, background: 'var(--red-soft)', color: 'var(--red)', borderRadius: 8, fontSize: 13, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <Icon name="alert" size={24} />
                <div style={{ fontWeight: 600 }}>Acceso a Cámara Fallido</div>
                <div style={{ lineHeight: 1.4 }}>{cameraError}</div>
              </div>
            ) : (
              <>
                {/* Webcam video reader container */}
                <div id="pc-webcam-reader" style={{ width: '100%', aspectRatio: '1.2', background: '#000', borderRadius: 8, overflow: 'hidden' }}></div>
                
                <div style={{ padding: '0 8px' }}>
                  <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.4, margin: 0 }}>
                    Muestra el código de barras frente a la cámara.
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--green-2)', fontWeight: 600, textAlign: 'center', marginTop: 6, margin: 0 }}>
                    💡 Consejo: Mantén el producto a 15-20 cm y evita reflejos de luz directa para enfocar correctamente.
                  </p>
                </div>
              </>
            )}

            <WebcamScannerRunner
              elementId="pc-webcam-reader"
              setCameraError={setCameraError}
              onScan={(code) => {
                handleBarcodeAdd(code);
                setShowWebcamModal(false);
              }}
            />
          </div>
        </div>
      )}

      {/* MOBILE SCANNER SYNC MODAL */}
      {SHOW_BARCODE_FEATURES && showMobileModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="card" style={{ width: '90%', maxWidth: 460, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div className="h3">Escanear con Celular (Sincronizado)</div>
              <button
                onClick={() => setShowMobileModal(false)}
                style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 4, color: 'var(--muted)' }}
              >
                <Icon name="x" size={20} />
              </button>
            </div>

            <div style={{
              background: '#fff',
              padding: 12,
              borderRadius: 12,
              border: '1.5px solid var(--line)',
              boxShadow: 'var(--shadow-md)'
            }}>
              {/* Public QR Code API to generate a QR pointing to the mobile scanner URL */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(getMobileScannerUrl())}`}
                alt="QR Code de Sincronización"
                style={{ width: 220, height: 220, display: 'block' }}
              />
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Session ID: {scanSessionId}
              </div>
              <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                Escanea este código QR con la cámara de tu celular para abrir el escáner sincronizado. Los productos escaneados se agregarán al carrito de esta PC en tiempo real.
              </p>
            </div>

            {/* Sync status indicator */}
            <div style={{
              width: '100%',
              padding: '10px 14px',
              background: 'var(--green-soft)',
              borderRadius: 8,
              border: '1px solid var(--green-line)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--green-2)'
            }}>
              <span className="pulse-dot"></span>
              <span>Canal abierto. Esperando escaneos del dispositivo móvil...</span>
            </div>
            
            <div style={{ width: '100%', textAlign: 'left' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Link de conexión alternativa:</div>
              <input
                className="input num"
                readOnly
                value={getMobileScannerUrl()}
                onClick={e => (e.target as HTMLInputElement).select()}
                style={{ fontSize: 11, padding: 8, height: 32, background: 'var(--surface-2)' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS/ERROR CHECKOUT FEEDBACK MODAL */}
      {checkoutStatus && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
        }}>
          <div className="card" style={{ width: '90%', maxWidth: 400, padding: 24, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--red-soft)',
              color: 'var(--red)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Icon name="x" size={28} />
            </div>

            <div className="h2">Error de Venta</div>

            <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              {checkoutStatus.msg}
            </p>

            <button
              className="btn btn-primary btn-block"
              onClick={() => setCheckoutStatus(null)}
              style={{ background: 'var(--red)' }}
            >
              Aceptar
            </button>
          </div>
        </div>
      )}

      {completedSale && (
        <CheckoutSuccessModal
          isOpen={completedSale !== null}
          onClose={() => setCompletedSale(null)}
          folio={completedSale.folio}
          subtotal={completedSale.subtotal}
          iva={completedSale.iva}
          total={completedSale.total}
          vendedorNombre={vendedorNombre}
          clientName={completedSale.clientName}
          clientPhone={completedSale.clientPhone}
          cartItems={completedSale.cartItems}
          onSendWhatsApp={handleSendWhatsApp}
          metodoPago={completedSale.metodoPago}
          efectivoRecibido={completedSale.efectivoRecibido}
          cambio={completedSale.cambio}
        />
      )}

      <style>{`
        .pulse-dot {
          width: 8px;
          height: 8px;
          background: var(--green);
          border-radius: 50%;
          animation: pulse-dot-anim 1.5s infinite;
        }
        @keyframes pulse-dot-anim {
          0% { transform: scale(0.85); opacity: 0.5; }
          50% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(0.85); opacity: 0.5; }
        }
      `}</style>
    </>
  );
};

// Runner helper for local webcam scanning inside the PC
interface WebcamRunnerProps {
  elementId: string;
  onScan: (code: string) => void;
  setCameraError: (err: string | null) => void;
}

const WebcamScannerRunner: React.FC<WebcamRunnerProps> = ({ elementId, onScan, setCameraError }) => {
  useEffect(() => {
    let isMounted = true;
    let qrCode: Html5Qrcode | null = null;

    const startScanner = async () => {
      // 1. Check if browser supports mediaDevices and getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        let msg = 'Tu navegador no soporta el acceso a la cámara o la cámara está deshabilitada.';
        if (!window.isSecureContext) {
          msg += ' La cámara requiere un contexto seguro (HTTPS o http://127.0.0.1 / http://localhost).';
        }
        if (isMounted) setCameraError(msg);
        return;
      }

      try {
        // Explicitly request video permission
        await navigator.mediaDevices.getUserMedia({ video: true });
        
        if (!isMounted) return;

        const html5QrCode = new Html5Qrcode(elementId, {
          verbose: false,
          useBarCodeDetectorIfSupported: true,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_39
          ]
        });
        qrCode = html5QrCode;
        
        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 15
          },
          (decodedText) => {
            if (isMounted) {
              onScan(decodedText);
            }
          },
          () => {} // ignore scan frame failures
        );

        if (!isMounted) {
          await html5QrCode.stop();
        }
      } catch (err) {
        console.error('Local camera scanner initiation failed:', err);
        if (!isMounted) return;
        const errName = err instanceof Error ? err.name : '';
        const errMsg = err instanceof Error ? err.message : '';
        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          setCameraError('Permiso denegado. Por favor, permite el acceso a la cámara en el navegador.');
        } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
          setCameraError('No se encontró ninguna cámara conectada en este dispositivo.');
        } else {
          setCameraError('Error al iniciar la cámara: ' + (errMsg || errName));
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (qrCode) {
        const activeQrCode = qrCode;
        if (activeQrCode.isScanning) {
          activeQrCode.stop().catch(err => console.error('Error stopping local camera scanner:', err));
        } else {
          // If it was in the middle of starting, wait a bit and stop it
          setTimeout(() => {
            if (activeQrCode.isScanning) {
              activeQrCode.stop().catch(err => console.error('Error stopping local camera scanner in timeout:', err));
            }
          }, 800);
        }
      }
    };
  }, [elementId, onScan, setCameraError]);

  return null;
};
