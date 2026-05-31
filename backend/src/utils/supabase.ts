import { createClient, SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";
import { logger } from "../utils/logger";

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
  });

  logger.info("Supabase client initialized");
  return _client;
}

// ─── Database Schema Types ─────────────────────────────────────────────────────

export interface WixInstallation {
  id: string;
  wix_site_id: string;
  wix_instance_id: string;
  installed_at: string;
  updated_at: string;
}

export interface HubSpotConnection {
  id: string;
  wix_instance_id: string;
  hubspot_portal_id: string;
  // Tokens stored encrypted — never returned to browser
  access_token_enc: string;
  refresh_token_enc: string;
  token_expires_at: string;
  scopes: string;
  connected_at: string;
  updated_at: string;
}

export interface ContactMapping {
  id: string;
  wix_instance_id: string;
  wix_contact_id: string;
  hubspot_contact_id: string;
  last_synced_at: string;
  last_sync_source: "wix" | "hubspot" | "form";
  last_sync_id: string;
  created_at: string;
}

export interface FieldMapping {
  id: string;
  wix_instance_id: string;
  wix_field: string;
  hubspot_property: string;
  sync_direction: "wix_to_hubspot" | "hubspot_to_wix" | "bidirectional";
  transform: "none" | "trim" | "lowercase" | "uppercase" | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SyncEvent {
  id: string;
  wix_instance_id: string;
  sync_id: string;
  source: "wix" | "hubspot" | "form";
  event_type: "contact_created" | "contact_updated" | "form_submitted";
  entity_id: string;
  status: "pending" | "success" | "failed" | "skipped";
  error_message: string | null;
  created_at: string;
}
