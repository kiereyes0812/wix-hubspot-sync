import { v4 as uuidv4 } from 'uuid';
import { getSupabaseClient } from '../utils/supabase';
import { hubspotCRM, HubSpotContactInput } from './hubspotCRM';
import { logger } from '../utils/logger';

type SyncSource = 'wix' | 'hubspot' | 'form';
type SyncDirection = 'wix_to_hubspot' | 'hubspot_to_wix' | 'bidirectional';
type Transform = 'none' | 'trim' | 'lowercase' | 'uppercase' | null;

interface FieldMapping {
  wix_field: string;
  hubspot_property: string;
  sync_direction: SyncDirection;
  transform: Transform;
}

interface WixContact {
  id: string;
  info?: {
    name?: { first?: string; last?: string };
    emails?: Array<{ tag: string; email: string }>;
    phones?: Array<{ tag: string; phone: string }>;
    [key: string]: any;
  };
  lastActivity?: string;
  updatedDate?: string;
  [key: string]: any;
}

const DEDUP_WINDOW_MS = parseInt(process.env.SYNC_DEDUP_WINDOW_MS || '30000');

export class SyncService {
  /**
   * ─── DEDUP / LOOP PREVENTION ──────────────────────────────────────────────
   * Before syncing, check if WE wrote to the target recently.
   * If we did, this event is our own echo — skip it.
   */
  private async isDuplicate(
    wixInstanceId: string,
    entityId: string,
    source: SyncSource,
  ): Promise<boolean> {
    const db = getSupabaseClient();
    const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();

    const { data } = await db
      .from('sync_events')
      .select('id, source')
      .eq('wix_instance_id', wixInstanceId)
      .eq('entity_id', entityId)
      .eq('status', 'success')
      .neq('source', source) // The event came from the OTHER side
      .gte('created_at', cutoff)
      .limit(1);

    if (data && data.length > 0) {
      logger.debug('Dedup: skipping echo event', { entityId, source });
      return true;
    }
    return false;
  }

  /**
   * Check idempotency: don't re-write identical values.
   */
  private applyTransform(value: string | undefined | null, transform: Transform): string | undefined {
    if (value == null) return undefined;
    const s = String(value);
    switch (transform) {
      case 'trim': return s.trim();
      case 'lowercase': return s.toLowerCase();
      case 'uppercase': return s.toUpperCase();
      default: return s;
    }
  }

  /**
   * Load field mappings for this instance.
   */
  private async getFieldMappings(wixInstanceId: string): Promise<FieldMapping[]> {
    const db = getSupabaseClient();
    const { data, error } = await db
      .from('field_mappings')
      .select('*')
      .eq('wix_instance_id', wixInstanceId)
      .eq('is_active', true);

    if (error) throw new Error(`Failed to load field mappings: ${error.message}`);
    return data || [];
  }

  /**
   * Get or create the contact ID mapping.
   */
  async getContactMapping(
    wixInstanceId: string,
    wixContactId?: string,
    hubspotContactId?: string,
  ): Promise<{ wixContactId: string; hubspotContactId: string } | null> {
    const db = getSupabaseClient();

    const query = db.from('contact_mappings').select('*').eq('wix_instance_id', wixInstanceId);
    if (wixContactId) query.eq('wix_contact_id', wixContactId);
    if (hubspotContactId) query.eq('hubspot_contact_id', hubspotContactId);

    const { data } = await query.single();
    if (!data) return null;

    return {
      wixContactId: data.wix_contact_id,
      hubspotContactId: data.hubspot_contact_id,
    };
  }

  private async upsertContactMapping(
    wixInstanceId: string,
    wixContactId: string,
    hubspotContactId: string,
    source: SyncSource,
    syncId: string,
  ): Promise<void> {
    const db = getSupabaseClient();
    await db.from('contact_mappings').upsert({
      wix_instance_id: wixInstanceId,
      wix_contact_id: wixContactId,
      hubspot_contact_id: hubspotContactId,
      last_synced_at: new Date().toISOString(),
      last_sync_source: source,
      last_sync_id: syncId,
    }, { onConflict: 'wix_instance_id,wix_contact_id' });
  }

  private async logSyncEvent(
    wixInstanceId: string,
    syncId: string,
    source: SyncSource,
    eventType: string,
    entityId: string,
    status: 'pending' | 'success' | 'failed' | 'skipped',
    errorMessage?: string,
  ): Promise<void> {
    const db = getSupabaseClient();
    await db.from('sync_events').insert({
      wix_instance_id: wixInstanceId,
      sync_id: syncId,
      source,
      event_type: eventType,
      entity_id: entityId,
      status,
      error_message: errorMessage || null,
    });
  }

  /**
   * ─── WIX → HUBSPOT ─────────────────────────────────────────────────────────
   * Called when a Wix contact is created or updated.
   */
  async syncWixToHubSpot(
    wixInstanceId: string,
    wixContact: WixContact,
  ): Promise<{ syncId: string; status: string }> {
    const syncId = uuidv4();
    const wixContactId = wixContact.id;

    logger.info('Sync Wix→HubSpot starting', { wixContactId, syncId });

    // ── Dedup check ──
    if (await this.isDuplicate(wixInstanceId, wixContactId, 'wix')) {
      await this.logSyncEvent(wixInstanceId, syncId, 'wix', 'contact_updated', wixContactId, 'skipped');
      return { syncId, status: 'skipped_dedup' };
    }

    await this.logSyncEvent(wixInstanceId, syncId, 'wix', 'contact_updated', wixContactId, 'pending');

    try {
      const fieldMappings = await this.getFieldMappings(wixInstanceId);

      // Build HubSpot payload from field mappings
      const hsProps: HubSpotContactInput = {};
      for (const mapping of fieldMappings) {
        if (mapping.sync_direction === 'hubspot_to_wix') continue;

        const rawValue = this.extractWixField(wixContact, mapping.wix_field);
        const value = this.applyTransform(rawValue, mapping.transform);
        if (value !== undefined) {
          hsProps[mapping.hubspot_property] = value;
        }
      }

      // Check if we already have a mapping
      const existing = await this.getContactMapping(wixInstanceId, wixContactId);

      let hubspotContactId: string;

      if (existing) {
        const updated = await hubspotCRM.updateContact(
          wixInstanceId,
          existing.hubspotContactId,
          hsProps,
          syncId,
        );
        hubspotContactId = updated.id;
      } else {
        // Try to find by email first
        const email = wixContact.info?.emails?.[0]?.email;
        if (email) {
          hsProps.email = email;
          const { contact } = await hubspotCRM.upsertContactByEmail(wixInstanceId, hsProps, syncId);
          hubspotContactId = contact.id;
        } else {
          const created = await hubspotCRM.createContact(wixInstanceId, hsProps, syncId);
          hubspotContactId = created.id;
        }
      }

      await this.upsertContactMapping(wixInstanceId, wixContactId, hubspotContactId, 'wix', syncId);
      await this.logSyncEvent(wixInstanceId, syncId, 'wix', 'contact_updated', wixContactId, 'success');

      logger.info('Sync Wix→HubSpot complete', { wixContactId, hubspotContactId, syncId });
      return { syncId, status: 'success' };
    } catch (err: any) {
      await this.logSyncEvent(wixInstanceId, syncId, 'wix', 'contact_updated', wixContactId, 'failed', err.message);
      logger.error('Sync Wix→HubSpot failed', { wixContactId, syncId, error: err.message });
      throw err;
    }
  }

  /**
   * ─── HUBSPOT → WIX ─────────────────────────────────────────────────────────
   * Called when a HubSpot webhook fires for contact change.
   */
  async syncHubSpotToWix(
    wixInstanceId: string,
    hubspotContactId: string,
    hubspotProperties: Record<string, any>,
    wixApiClient: any, // Injected Wix API client
  ): Promise<{ syncId: string; status: string }> {
    const syncId = uuidv4();

    logger.info('Sync HubSpot→Wix starting', { hubspotContactId, syncId });

    // ── Check if this update was triggered by US (avoid ping-pong) ──
    const syncSource = hubspotProperties['wix_sync_source'];
    const lastSyncId = hubspotProperties['wix_sync_id'];

    if (syncSource === 'wix') {
      logger.debug('Skipping HubSpot event caused by our own write', { hubspotContactId, lastSyncId });
      await this.logSyncEvent(wixInstanceId, syncId, 'hubspot', 'contact_updated', hubspotContactId, 'skipped');
      return { syncId, status: 'skipped_own_write' };
    }

    if (await this.isDuplicate(wixInstanceId, hubspotContactId, 'hubspot')) {
      await this.logSyncEvent(wixInstanceId, syncId, 'hubspot', 'contact_updated', hubspotContactId, 'skipped');
      return { syncId, status: 'skipped_dedup' };
    }

    await this.logSyncEvent(wixInstanceId, syncId, 'hubspot', 'contact_updated', hubspotContactId, 'pending');

    try {
      const fieldMappings = await this.getFieldMappings(wixInstanceId);
      const existing = await this.getContactMapping(wixInstanceId, undefined, hubspotContactId);

      // Build Wix contact payload from field mappings
      const wixProps: Record<string, any> = {};
      for (const mapping of fieldMappings) {
        if (mapping.sync_direction === 'wix_to_hubspot') continue;

        const rawValue = hubspotProperties[mapping.hubspot_property];
        const value = this.applyTransform(rawValue, mapping.transform);
        if (value !== undefined) {
          this.setWixField(wixProps, mapping.wix_field, value);
        }
      }

      if (existing && wixApiClient) {
        // Update existing Wix contact via Wix SDK
        await wixApiClient.contacts.updateContact(existing.wixContactId, wixProps);

        await this.upsertContactMapping(
          wixInstanceId,
          existing.wixContactId,
          hubspotContactId,
          'hubspot',
          syncId,
        );
      } else if (wixApiClient) {
        // Create new Wix contact
        const newContact = await wixApiClient.contacts.createContact(wixProps);
        await this.upsertContactMapping(
          wixInstanceId,
          newContact.contact?.id || newContact.id,
          hubspotContactId,
          'hubspot',
          syncId,
        );
      }

      await this.logSyncEvent(wixInstanceId, syncId, 'hubspot', 'contact_updated', hubspotContactId, 'success');
      logger.info('Sync HubSpot→Wix complete', { hubspotContactId, syncId });
      return { syncId, status: 'success' };
    } catch (err: any) {
      await this.logSyncEvent(wixInstanceId, syncId, 'hubspot', 'contact_updated', hubspotContactId, 'failed', err.message);
      logger.error('Sync HubSpot→Wix failed', { hubspotContactId, syncId, error: err.message });
      throw err;
    }
  }

  /**
   * ─── FORM SUBMISSION → HUBSPOT ────────────────────────────────────────────
   */
  async syncFormSubmission(
    wixInstanceId: string,
    formData: {
      email: string;
      name?: string;
      fields: Record<string, string>;
      attribution: {
        utm_source?: string;
        utm_medium?: string;
        utm_campaign?: string;
        utm_term?: string;
        utm_content?: string;
        page_url?: string;
        referrer?: string;
      };
    },
  ): Promise<{ syncId: string; hubspotContactId: string }> {
    const syncId = uuidv4();
    logger.info('Form submission sync starting', { syncId });

    await this.logSyncEvent(wixInstanceId, syncId, 'form', 'form_submitted', formData.email, 'pending');

    try {
      const nameParts = formData.name?.split(' ') || [];
      const hsProps: HubSpotContactInput = {
        email: formData.email,
        firstname: nameParts[0],
        lastname: nameParts.slice(1).join(' ') || undefined,
        ...formData.fields,
        // UTM attribution as HubSpot properties
        hs_analytics_source: formData.attribution.utm_source,
        hs_analytics_source_data_1: formData.attribution.utm_medium,
        hs_analytics_source_data_2: formData.attribution.utm_campaign,
        // Custom attribution properties
        wix_utm_term: formData.attribution.utm_term,
        wix_utm_content: formData.attribution.utm_content,
        wix_page_url: formData.attribution.page_url,
        wix_referrer: formData.attribution.referrer,
        wix_form_submitted_at: new Date().toISOString(),
        wix_sync_source: 'form',
        wix_sync_id: syncId,
      };

      const { contact } = await hubspotCRM.upsertContactByEmail(wixInstanceId, hsProps, syncId);

      await this.logSyncEvent(wixInstanceId, syncId, 'form', 'form_submitted', formData.email, 'success');
      logger.info('Form submission synced to HubSpot', { syncId, hubspotContactId: contact.id });

      return { syncId, hubspotContactId: contact.id };
    } catch (err: any) {
      await this.logSyncEvent(wixInstanceId, syncId, 'form', 'form_submitted', formData.email, 'failed', err.message);
      throw err;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private extractWixField(contact: WixContact, fieldPath: string): string | undefined {
    const parts = fieldPath.split('.');
    let current: any = contact;
    for (const part of parts) {
      if (current == null) return undefined;
      if (Array.isArray(current)) {
        current = current[0];
      }
      current = current[part];
    }
    return current != null ? String(current) : undefined;
  }

  private setWixField(obj: Record<string, any>, fieldPath: string, value: string): void {
    const parts = fieldPath.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }
}

export const syncService = new SyncService();
