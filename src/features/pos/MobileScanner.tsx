import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../components/Icon';
import { useConfig } from '../config/ConfigContext';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface MobileScannerProps {
  session: string;
}

export const MobileScanner: React.FC<MobileScannerProps> = ({ session }) => {
  const { config } = useConfig();
  const [status, setStatus] = useState<'conectar' | 'conectando' | 'conectado' | 'error'>('conectando');
  const [scannedList, setScannedList] = useState<{ sku: string; nombre: string; hora: string }[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [flashOn, setFlashOn] = useState<boolean>(false);
  const [cooldownActive, setCooldownActive] = useState<boolean>(false);
  
  const qrCodeInstance = useRef<Html5Qrcode | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const cooldownRef = useRef<boolean>(false);

  // Play audio beep
  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(900, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {
      console.warn('Audio beep no soportado:', e);
    }
  };

  // Trigger vibration
  const triggerVibration = () => {
    if (navigator.vibrate) {
      navigator.vibrate(80);
    }
  };

  useEffect(() => {
    // 1. Connect to Supabase Broadcast channel
    const channel = supabase.channel(`scan:${session}`, {
      config: {
        broadcast: { self: false }
      }
    });

    channelRef.current = channel;

    channel
      .on('system', { event: '*' }, (payload) => {
        console.log('System event:', payload);
      })
      .subscribe((status) => {
        console.log('Realtime status on mobile:', status);
        if (status === 'SUBSCRIBED') {
          setStatus('conectado');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setStatus('error');
          setErrorMsg('Error de conexión con el servidor en tiempo real.');
        }
      });

    // 2. Start Camera and Scanner
    const startScanner = async () => {
      try {
        // Wait a brief moment for the DOM element to mount
        await new Promise((resolve) => setTimeout(resolve, 300));
        
        const html5QrCode = new Html5Qrcode('mobile-camera-reader', {
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
        qrCodeInstance.current = html5QrCode;
        setCameraActive(true);

        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 15
          },
          async (decodedText) => {
            // Check global cooldown (prevent scanning anything for 2.5s)
            if (cooldownRef.current) {
              return;
            }

            // Debounce: ignore same code within 8 seconds
            const now = Date.now();
            if (decodedText === lastScanRef.current.code && now - lastScanRef.current.time < 8000) {
              return;
            }

            // Set cooldown
            cooldownRef.current = true;
            setCooldownActive(true);
            setTimeout(() => {
              cooldownRef.current = false;
              setCooldownActive(false);
            }, 2500);

            lastScanRef.current = { code: decodedText, time: now };

            playBeep();
            triggerVibration();
            
            // Broadcast the scanned code to the PC
            if (channelRef.current) {
              channelRef.current.send({
                type: 'broadcast',
                event: 'scan',
                payload: { sku: decodedText }
              });
            }

            // Fetch product name locally to show on screen
            let nombreProducto = 'Cargando...';
            try {
              const { data } = await supabase
                .from('productos')
                .select('nombre')
                .eq('sku', decodedText)
                .maybeSingle();
              if (data) {
                nombreProducto = data.nombre;
              } else {
                nombreProducto = 'Producto no encontrado en catálogo';
              }
            } catch {
              nombreProducto = 'Código enviado';
            }

            setScannedList((prev) => [
              {
                sku: decodedText,
                nombre: nombreProducto,
                hora: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              },
              ...prev.slice(0, 4), // Keep last 5 scans
            ]);
          },
          () => {
            // verbose scan errors, ignore to keep console clean
          }
        );
      } catch (err) {
        console.error('Error al iniciar cámara:', err);
        setCameraActive(false);
        setErrorMsg('No se pudo acceder a la cámara trasera. Asegúrate de dar permisos.');
        setStatus('error');
      }
    };

    startScanner();

    // Cleanup on unmount
    return () => {
      if (qrCodeInstance.current && qrCodeInstance.current.isScanning) {
        qrCodeInstance.current.stop().catch((e) => console.error('Error al detener cámara:', e));
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [session]);

  const toggleFlash = async () => {
    if (qrCodeInstance.current && qrCodeInstance.current.isScanning) {
      try {
        const nextFlash = !flashOn;
        // Apply flash via constraint (supported by some browsers on environment camera)
        await qrCodeInstance.current.applyVideoConstraints({
          advanced: [{ torch: nextFlash } as unknown as MediaTrackConstraintSet]
        });
        setFlashOn(nextFlash);
      } catch {
        console.warn('Flash no soportado en este dispositivo/navegador.');
      }
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      width: '100vw',
      background: '#0d110f', // Dark background for camera scanning contrast
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 9999
    }}>
      {/* Top Header */}
      <div style={{
        padding: '16px 20px',
        background: '#151d19',
        borderBottom: '1px solid #233029',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: 'var(--green)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Icon name="leaf" size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>{config.nombre} POS</div>
            <div style={{ fontSize: 11, color: '#a4b3ad' }}>Escáner Remoto</div>
          </div>
        </div>

        {/* Status Indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: status === 'conectado' ? '#1b3a24' : '#3d2b10',
          padding: '6px 12px',
          borderRadius: 20,
          fontSize: 11,
          fontWeight: 600,
          color: status === 'conectado' ? '#a3e635' : '#fbbf24'
        }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: status === 'conectado' ? '#a3e635' : '#fbbf24',
            animation: status === 'conectado' ? 'none' : 'pulse 1.5s infinite'
          }}></span>
          {status === 'conectado' ? 'En línea' : 'Conectando...'}
        </div>
      </div>

      {/* Main Camera Viewport */}
      <div style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        background: '#000'
      }}>
        {/* html5-qrcode camera container */}
        <div id="mobile-camera-reader" style={{ width: '100%', height: '100%', objectFit: 'cover' }}></div>

        {/* Cooldown Overlay Banner */}
        {cooldownActive && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(27, 58, 36, 0.95)',
            backdropFilter: 'blur(8px)',
            border: '1.5px solid #a3e635',
            padding: '16px 24px',
            borderRadius: 16,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            zIndex: 20,
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
            animation: 'fadeIn 0.15s ease-out',
            textAlign: 'center'
          }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: '#a3e635',
              color: '#151d19',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Icon name="check" size={22} strokeWidth={3} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>¡Enviado!</div>
            <div style={{ fontSize: 12, color: '#a4b3ad' }}>
              Registrado en PC · Pausa de 2s
            </div>
          </div>
        )}

        {/* Scanning tip overlay */}
        {cameraActive && (
          <div style={{
            position: 'absolute',
            top: 16,
            left: 16,
            right: 16,
            background: 'rgba(21, 29, 25, 0.85)',
            border: '1px solid #233029',
            padding: '10px 14px',
            borderRadius: 10,
            fontSize: 12,
            color: '#fff',
            textAlign: 'center',
            lineHeight: 1.4,
            zIndex: 10,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
          }}>
            💡 <strong>Tip:</strong> Sostén el producto a unos 15-20 cm y asegúrate de tener buena luz.
          </div>
        )}

        {/* Scanning Overlay (Aim Frame) */}
        {cameraActive && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            pointerEvents: 'none'
          }}>
            <div style={{ background: 'rgba(0,0,0,0.5)', height: '15%' }}></div>
            <div style={{ display: 'flex', height: '70%' }}>
              <div style={{ background: 'rgba(0,0,0,0.5)', flex: 1 }}></div>
              
              {/* Target Scan Box */}
              <div style={{
                width: '70vw',
                height: '70vw',
                maxHeight: '300px',
                maxWidth: '300px',
                border: '2px solid var(--green)',
                borderRadius: 24,
                position: 'relative',
                boxShadow: '0 0 0 4000px rgba(0,0,0,0.5)',
                alignSelf: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {/* Laser scan line animation */}
                <div style={{
                  position: 'absolute',
                  width: '90%',
                  height: '2px',
                  background: '#a3e635',
                  boxShadow: '0 0 10px #a3e635',
                  animation: 'scan-anim 2s infinite ease-in-out'
                }}></div>
              </div>
              
              <div style={{ background: 'rgba(0,0,0,0.5)', flex: 1 }}></div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.5)', height: '15%' }}></div>
          </div>
        )}

        {/* Action Controls */}
        <div style={{
          position: 'absolute',
          bottom: 20,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          gap: 16,
          zIndex: 10
        }}>
          <button
            onClick={toggleFlash}
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: flashOn ? '#fff' : 'rgba(21, 29, 25, 0.85)',
              color: flashOn ? '#000' : '#fff',
              border: '1.5px solid #233029',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              cursor: 'pointer'
            }}
            title="Luz / Linterna"
          >
            <Icon name="alert" size={24} />
          </button>
        </div>

        {/* Error overlay */}
        {errorMsg && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 20, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 30,
            textAlign: 'center',
            zIndex: 100
          }}>
            <div style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16
            }}>
              <Icon name="x" size={32} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Error de Escáner</div>
            <p style={{ color: '#a4b3ad', fontSize: 14, lineHeight: 1.5, marginBottom: 24 }}>{errorMsg}</p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: 'var(--green)',
                color: '#fff',
                padding: '12px 24px',
                borderRadius: 10,
                fontWeight: 600,
                border: 0,
                fontSize: 14
              }}
            >
              Reintentar
            </button>
          </div>
        )}
      </div>

      {/* Bottom Scanned List */}
      <div style={{
        height: '35vh',
        background: '#151d19',
        borderTop: '1px solid #233029',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 20px',
        overflowY: 'auto'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          fontSize: 12,
          fontWeight: 600,
          color: '#7d8a83',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          <span>Enviados a PC (Session: {session})</span>
          <span>{scannedList.length} escaneos</span>
        </div>

        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
          {scannedList.length === 0 ? (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#7d8a83',
              fontSize: 13,
              gap: 8
            }}>
              <Icon name="barcode" size={24} />
              <span>Apunta la cámara a un código de barras para comenzar</span>
            </div>
          ) : (
            scannedList.map((item, index) => (
              <div
                key={index}
                style={{
                  padding: 12,
                  background: '#1e2823',
                  borderRadius: 10,
                  border: '1px solid #28372f',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  animation: index === 0 ? 'slide-down 0.25s ease-out' : 'none'
                }}
              >
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: 'rgba(163, 230, 53, 0.1)',
                  color: '#a3e635',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 'none'
                }}>
                  <Icon name="check" size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {item.nombre}
                  </div>
                  <div style={{ fontSize: 11, color: '#7d8a83', fontFamily: 'monospace', marginTop: 2 }}>
                    {item.sku}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#7d8a83' }}>
                  {item.hora}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Global Embedded CSS styles */}
      <style>{`
        @keyframes pulse {
          0% { opacity: 0.4; }
          50% { opacity: 1; }
          100% { opacity: 0.4; }
        }
        @keyframes scan-anim {
          0% { top: 5%; }
          50% { top: 95%; }
          100% { top: 5%; }
        }
        @keyframes slide-down {
          from { transform: translateY(-10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        /* Custom hide elements for html5-qrcode library to match premium design */
        #mobile-camera-reader video {
          object-fit: cover !important;
        }
        #mobile-camera-reader__header_message {
          display: none !important;
        }
      `}</style>
    </div>
  );
};
