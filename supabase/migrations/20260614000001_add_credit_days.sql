-- Migración para añadir campos de días de crédito configurable
ALTER TABLE clientes ADD COLUMN dias_credito INTEGER DEFAULT 30 NOT NULL;
ALTER TABLE ventas ADD COLUMN plazo_dias INTEGER DEFAULT 30 NOT NULL;
