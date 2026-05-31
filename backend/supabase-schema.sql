-- ============================================================
-- Wix ↔ HubSpot Sync — Supabase Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Wix Installations ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wix_installations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wix_site_id TEXT NOT NULL,
  wix_instance_id TEXT NOT NULL UNIQUE,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── HubSpot Connections ──────────────────────────────────────────────────────
-- Tokens are stored AES-256-GCM encrypted. Never returned to browser.
CREATE TABLE IF NOT EXISTS hubspot_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wix_instance_id TEXT NOT NULL UNIQUE,
  hubspot_portal_id TEXT NOT NULL,
  access_token_enc TEXT NOT NULL,   -- encrypted
  refresh_token_enc TEXT NOT NULL,  -- encrypted
  token_expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT NOT NULL DEFAULT '',
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hubspot_connections_instance 
  ON hubspot_connections(wix_instance_id);

CREATE INDEX IF NOT EXISTS idx_hubspot_connections_portal 
  ON hubspot_connections(hubspot_portal_id);

-- ─── Contact ID Mappings ──────────────────────────────────────────────────────
-- Maps Wix contact IDs ↔ HubSpot contact IDs per instance
CREATE TABLE IF NOT EXISTS contact_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wix_instance_id TEXT NOT NULL,
  wix_contact_id TEXT NOT NULL,
  hubspot_contact_id TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_source TEXT NOT NULL DEFAULT 'wix', -- 'wix' | 'hubspot' | 'form'
  last_sync_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(wix_instance_id, wix_contact_id),
  UNIQUE(wix_instance_id, hubspot_contact_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_mappings_wix 
  ON contact_mappings(wix_instance_id, wix_contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_mappings_hubspot 
  ON contact_mappings(wix_instance_id, hubspot_contact_id);

-- ─── Field Mappings ───────────────────────────────────────────────────────────
-- User-configurable field mapping rules
CREATE TABLE IF NOT EXISTS field_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wix_instance_id TEXT NOT NULL,
  wix_field TEXT NOT NULL,
  hubspot_property TEXT NOT NULL,
  sync_direction TEXT NOT NULL DEFAULT 'bidirectional', -- 'wix_to_hubspot' | 'hubspot_to_wix' | 'bidirectional'
  transform TEXT DEFAULT NULL, -- 'trim' | 'lowercase' | 'uppercase' | null
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_mappings_instance 
  ON field_mappings(wix_instance_id, is_active);

-- ─── Sync Events (Audit Log) ──────────────────────────────────────────────────
-- Used for deduplication, observability, and debugging
CREATE TABLE IF NOT EXISTS sync_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wix_instance_id TEXT NOT NULL,
  sync_id TEXT NOT NULL,            -- correlation ID (UUID)
  source TEXT NOT NULL,             -- 'wix' | 'hubspot' | 'form'
  event_type TEXT NOT NULL,         -- 'contact_created' | 'contact_updated' | 'form_submitted'
  entity_id TEXT NOT NULL,          -- contact ID or email
  status TEXT NOT NULL,             -- 'pending' | 'success' | 'failed' | 'skipped'
  error_message TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_events_instance_entity 
  ON sync_events(wix_instance_id, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_events_instance_status 
  ON sync_events(wix_instance_id, status, created_at DESC);

-- Auto-cleanup old sync events after 90 days (optional)
-- You can set up a Supabase cron job for this:
-- DELETE FROM sync_events WHERE created_at < NOW() - INTERVAL '90 days';

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Backend uses service_role key (bypasses RLS), so RLS is for extra protection
ALTER TABLE hubspot_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_events ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS — deny anon access to sensitive tables
CREATE POLICY "deny_anon_hubspot_connections" ON hubspot_connections
  FOR ALL TO anon USING (false);

CREATE POLICY "deny_anon_contact_mappings" ON contact_mappings
  FOR ALL TO anon USING (false);

-- ─── Default Field Mappings (inserted on first connection) ───────────────────
-- These are example defaults; user can modify via dashboard
-- INSERT INTO field_mappings (...) VALUES (...) — done via app code on onboarding
