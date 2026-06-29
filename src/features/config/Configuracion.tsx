import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Topbar } from '../../components/Topbar';
import { Icon } from '../../components/Icon';
import { LogoNegocio } from '../../components/LogoNegocio';
import { toast } from '../../lib/toast';
import { useConfig } from './ConfigContext';
import { listarImpresoras } from '../../lib/printing/qz';

/** Pantalla de Ajustes (solo admin): edita los datos de empresa de la tabla `configuracion`. */
export const Configuracion: React.FC = () => {
  const { config, recargar } = useConfig();
  const [form, setForm] = useState({
    razon_social: config.nombre,
    descripcion: config.descripcion,
    responsable: config.responsable,
    rfc: config.rfc,
    direccion: config.direccion,
    cp: config.cp,
    ciudad: config.ciudad,
    telefono: config.telefono,
    tel_pagare: config.telPagare,
    email: config.email,
    logo_url: config.logoUrl,
    moneda_simbolo: config.monedaSimbolo,
    moneda_iso: config.monedaIso,
    locale: config.locale,
    impresora_tickets: config.impresoraTickets,
    impresora_documentos: config.impresoraDocumentos,
    ancho_ticket: config.anchoTicket,
  });
  const [saving, setSaving] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [impresoras, setImpresoras] = useState<string[]>([]);
  const [qzMsg, setQzMsg] = useState('Conectando con QZ Tray…');

  const cargarImpresoras = async () => {
    setQzMsg('Conectando con QZ Tray…');
    const list = await listarImpresoras();
    setImpresoras(list);
    setQzMsg(list.length ? '' : 'QZ Tray no detectado. Instálalo/ábrelo en esta PC para elegir impresoras (sin él, se usa el diálogo del navegador).');
  };
  useEffect(() => { void cargarImpresoras(); }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const subirLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-seleccionar el mismo archivo
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Selecciona un archivo de imagen.'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('La imagen no debe pasar de 2 MB.'); return; }
    setSubiendoLogo(true);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('branding').upload(path, file, { upsert: true, cacheControl: '3600' });
      if (error) throw error;
      const { data } = supabase.storage.from('branding').getPublicUrl(path);
      setForm((f) => ({ ...f, logo_url: data.publicUrl }));
      toast.success('Logo subido. No olvides Guardar para aplicarlo.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir el logo.');
    } finally {
      setSubiendoLogo(false);
    }
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.razon_social.trim()) {
      toast.error('La razón social es obligatoria.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('configuracion')
        .update({ ...form, actualizado_en: new Date().toISOString() })
        .eq('id', 1);
      if (error) throw error;
      await recargar();
      toast.success('Configuración guardada.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar (¿tienes permisos de administrador?).');
    } finally {
      setSaving(false);
    }
  };

  // Helper de campo como FUNCIÓN inline (no componente) para no remontar los inputs
  // en cada render (lo que haría perder el foco al teclear).
  const campo = (label: string, k: keyof typeof form, area = false, ph = '') => (
    <div>
      <div className="label">{label}</div>
      {area ? (
        <textarea className="input" rows={2} value={form[k]} onChange={set(k)} placeholder={ph} style={{ resize: 'vertical' }} />
      ) : (
        <input className="input" value={form[k]} onChange={set(k)} placeholder={ph} />
      )}
    </div>
  );

  return (
    <>
      <Topbar title="Configuración" subtitle="Datos de la empresa y del sistema" />
      <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 820, margin: '0 auto', width: '100%' }}>
        <form onSubmit={guardar} className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
            <Icon name="settings" size={20} color="var(--green-2)" />
            <div className="h3" style={{ margin: 0 }}>Datos de la empresa</div>
          </div>

          {campo('Razón social / Nombre comercial *', 'razon_social')}
          {campo('Descripción (giro)', 'descripcion', true)}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {campo('Responsable', 'responsable')}
            {campo('RFC', 'rfc')}
          </div>

          {campo('Dirección', 'direccion', true)}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {campo('C.P.', 'cp')}
            {campo('Ciudad', 'ciudad')}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {campo('Teléfono', 'telefono')}
            {campo('Teléfono (pagaré)', 'tel_pagare')}
          </div>

          {campo('Email', 'email')}

          <div>
            <div className="label">Logo</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ width: 64, height: 64, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flex: 'none' }}>
                <LogoNegocio logoUrl={form.logo_url} nombre={form.razon_social || config.nombre} fontSize={22} radius={9} />
              </div>
              <label className="btn btn-secondary" style={{ cursor: subiendoLogo ? 'wait' : 'pointer' }}>
                <Icon name="plus" size={16} />
                {subiendoLogo ? 'Subiendo…' : 'Subir imagen'}
                <input type="file" accept="image/*" onChange={subirLogo} disabled={subiendoLogo} style={{ display: 'none' }} />
              </label>
              {form.logo_url && (
                <button type="button" className="btn btn-secondary" onClick={() => setForm((f) => ({ ...f, logo_url: '' }))}>
                  Quitar
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>PNG o JPG, máx 2 MB. Se sube a tu almacenamiento de Supabase.</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            {campo('Símbolo moneda', 'moneda_simbolo')}
            {campo('ISO moneda', 'moneda_iso')}
            {campo('Locale', 'locale')}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <Icon name="printer" size={18} color="var(--green-2)" />
            <div className="h3" style={{ margin: 0 }}>Impresión (QZ Tray)</div>
          </div>

          {impresoras.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span>{qzMsg}</span>
              <button type="button" className="btn btn-secondary" style={{ height: 30, padding: '0 12px', fontSize: 12 }} onClick={cargarImpresoras}>
                Reintentar conexión
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <div className="label">Impresora de tickets</div>
                <select className="input" value={form.impresora_tickets} onChange={set('impresora_tickets')}>
                  <option value="">(usar diálogo del navegador)</option>
                  {impresoras.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <div className="label">Impresora de documentos (PDF)</div>
                <select className="input" value={form.impresora_documentos} onChange={set('impresora_documentos')}>
                  <option value="">(usar diálogo del navegador)</option>
                  {impresoras.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
          )}
          <div style={{ maxWidth: 240 }}>
            <div className="label">Ancho de ticket</div>
            <select className="input" value={String(form.ancho_ticket)}
              onChange={(e) => setForm((f) => ({ ...f, ancho_ticket: Number(e.target.value) }))}>
              <option value="58">58 mm</option>
              <option value="80">80 mm</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Icon name="check" size={16} />
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>

        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="h3" style={{ margin: 0 }}>Información del sistema</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-2)' }}>
            <span style={{ color: 'var(--muted)' }}>Aplicación</span><span>{config.nombre} · Punto de Venta</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-2)' }}>
            <span style={{ color: 'var(--muted)' }}>Entorno</span>
            <span>{import.meta.env.PROD ? 'Producción' : 'Desarrollo'} ({import.meta.env.MODE})</span>
          </div>
        </div>
      </div>
    </>
  );
};
