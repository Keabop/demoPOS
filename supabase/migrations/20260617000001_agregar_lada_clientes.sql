-- Código de país (lada) del teléfono del cliente, para WhatsApp internacional.
-- Default '52' (México). Permite clientes con teléfono de EE.UU. (+1), etc.
-- El envío arma el número como lada + teléfono (10 dígitos).
alter table public.clientes add column if not exists lada text not null default '52';
