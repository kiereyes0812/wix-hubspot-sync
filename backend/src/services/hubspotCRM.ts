import axios, { AxiosInstance } from 'axios';
import { hubspotOAuth } from './hubspotOAuth';
import { logger } from '../utils/logger';

export interface HubSpotContact {
  id: string;
  properties: Record<string, string | null>;
  createdAt: string;
  updatedAt: string;
}

export interface HubSpotContactInput {
  email?: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  company?: string;
  [key: string]: string | undefined;
}

// Standard HubSpot contact properties that always exist
const SAFE_PROPERTIES = new Set([
  'email', 'firstname', 'lastname', 'phone', 'company',
  'website', 'address', 'city', 'state', 'zip', 'country',
  'jobtitle', 'mobilephone', 'fax', 'notes_last_updated',
  'hs_language', 'lifecyclestage', 'lead_status',
]);

export class HubSpotCRMService {
  private getClient(accessToken: string): AxiosInstance {
    return axios.create({
      baseURL: 'https://api.hubapi.com',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 10_000,
    });
  }

  /**
   * Only send properties that are standard HubSpot fields.
   * Custom properties (wix_*) are skipped unless they've been
   * created in the HubSpot portal first.
   */
  private buildSafeProperties(
    properties: HubSpotContactInput,
  ): Record<string, string> {
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(properties)) {
      if (v !== undefined && v !== null && v !== '') {
        if (SAFE_PROPERTIES.has(k)) {
          payload[k] = v;
        }
      }
    }
    return payload;
  }

  async createContact(
    wixInstanceId: string,
    properties: HubSpotContactInput,
    syncId?: string,
  ): Promise<HubSpotContact> {
    const token = await hubspotOAuth.getValidAccessToken(wixInstanceId);
    const client = this.getClient(token);
    const safeProps = this.buildSafeProperties(properties);
    logger.info('Creating HubSpot contact', { email: '[REDACTED]' });
    const { data } = await client.post('/crm/v3/objects/contacts', {
      properties: safeProps,
    });
    logger.info('HubSpot contact created', { hubspotContactId: data.id });
    return data as HubSpotContact;
  }

  async updateContact(
    wixInstanceId: string,
    hubspotContactId: string,
    properties: HubSpotContactInput,
    syncId?: string,
  ): Promise<HubSpotContact> {
    const token = await hubspotOAuth.getValidAccessToken(wixInstanceId);
    const client = this.getClient(token);
    const safeProps = this.buildSafeProperties(properties);
    const { data } = await client.patch(
      `/crm/v3/objects/contacts/${hubspotContactId}`,
      { properties: safeProps },
    );
    logger.info('HubSpot contact updated', { hubspotContactId });
    return data as HubSpotContact;
  }

  /**
   * Search for contact by email, then create or update.
   */
  async upsertContactByEmail(
    wixInstanceId: string,
    properties: HubSpotContactInput,
    syncId?: string,
  ): Promise<{ contact: HubSpotContact; created: boolean }> {
    const email = properties.email;
    if (!email) throw new Error('email is required for upsert');

    const existing = await this.getContactByEmail(wixInstanceId, email);

    if (existing) {
      const updated = await this.updateContact(
        wixInstanceId, existing.id, properties, syncId,
      );
      return { contact: updated, created: false };
    } else {
      const created = await this.createContact(
        wixInstanceId, properties, syncId,
      );
      return { contact: created, created: true };
    }
  }

  async getContactByEmail(
    wixInstanceId: string,
    email: string,
  ): Promise<HubSpotContact | null> {
    const token = await hubspotOAuth.getValidAccessToken(wixInstanceId);
    const client = this.getClient(token);
    try {
      const { data } = await client.post('/crm/v3/objects/contacts/search', {
        filterGroups: [{
          filters: [{ propertyName: 'email', operator: 'EQ', value: email }],
        }],
        properties: ['email', 'firstname', 'lastname', 'phone', 'company'],
        limit: 1,
      });
      return data.results?.[0] || null;
    } catch {
      return null;
    }
  }

  async getContact(
    wixInstanceId: string,
    hubspotContactId: string,
  ): Promise<HubSpotContact | null> {
    const token = await hubspotOAuth.getValidAccessToken(wixInstanceId);
    const client = this.getClient(token);
    try {
      const { data } = await client.get(
        `/crm/v3/objects/contacts/${hubspotContactId}`,
        { params: { properties: 'email,firstname,lastname,phone,company' } },
      );
      return data as HubSpotContact;
    } catch (err: any) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  }

  async listProperties(
    wixInstanceId: string,
  ): Promise<Array<{ name: string; label: string; type: string }>> {
    const token = await hubspotOAuth.getValidAccessToken(wixInstanceId);
    const client = this.getClient(token);
    const { data } = await client.get('/crm/v3/properties/contacts');
    return (data.results || [])
      .filter((p: any) => !p.hidden)
      .map((p: any) => ({ name: p.name, label: p.label, type: p.type }));
  }

  async listForms(
    wixInstanceId: string,
  ): Promise<Array<{ id: string; name: string; portalId: string }>> {
    const token = await hubspotOAuth.getValidAccessToken(wixInstanceId);
    const client = this.getClient(token);
    try {
      const { data } = await client.get('/marketing/v3/forms');
      return (data.results || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        portalId: String(f.portalId || ''),
      }));
    } catch {
      return [];
    }
  }
}

export const hubspotCRM = new HubSpotCRMService();
