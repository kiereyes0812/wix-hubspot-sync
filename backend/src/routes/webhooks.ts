import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { syncService } from '../services/syncService';
import { logger } from '../utils/logger';
import { getSupabaseClient } from '../utils/supabase';

const router = Router();

/**
 * Verify HubSpot webhook signature.
 */
function verifyHubSpotSignature(req: Request): boolean {
  const secret = process.env.HUBSPOT_WEBHOOK_SECRET;
  if (!secret) return false;

  const signature = req.headers['x-hubspot-signature-v3'] as string;
  if (!signature) return false;

  const rawBody = req.body as Buffer;
  const timestamp = req.headers['x-hubspot-request-timestamp'] as string;
  const method = req.method.toUpperCase();
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  const payload = `${method}${url}${rawBody.toString()}${timestamp}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('base64');

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Verify Wix webhook signature.
 */
function verifyWixSignature(req: Request): boolean {
  const secret = process.env.WIX_WEBHOOK_SECRET;
  if (!secret) return true; // Skip in dev

  const signature = req.headers['x-wix-signature'] as string;
  if (!signature) return false;

  const rawBody = req.body as Buffer;
  const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * POST /api/webhooks/hubspot
 * Receives HubSpot CRM contact created/updated events.
 */
router.post('/hubspot', async (req: Request, res: Response, next: NextFunction) => {
  // Always respond 200 quickly to avoid HubSpot retries
  res.status(200).json({ received: true });

  try {
    if (!verifyHubSpotSignature(req)) {
      logger.warn('HubSpot webhook: invalid signature');
      return;
    }

    const events = JSON.parse((req.body as Buffer).toString());
    if (!Array.isArray(events)) return;

    for (const event of events) {
      const { objectId: hubspotContactId, propertyName, propertyValue, subscriptionType } = event;

      if (!['contact.creation', 'contact.propertyChange'].includes(subscriptionType)) {
        continue;
      }

      // Find which Wix instance owns this HubSpot portal
      const db = getSupabaseClient();
      const { data: conn } = await db
        .from('hubspot_connections')
        .select('wix_instance_id')
        .eq('hubspot_portal_id', String(event.portalId))
        .single();

      if (!conn) {
        logger.warn('HubSpot webhook: no matching Wix instance', { portalId: event.portalId });
        continue;
      }

      const properties: Record<string, any> = {};
      if (propertyName) properties[propertyName] = propertyValue;

      await syncService.syncHubSpotToWix(
        conn.wix_instance_id,
        String(hubspotContactId),
        properties,
        null, // Wix API client would be injected with proper credentials in production
      );
    }
  } catch (err: any) {
    logger.error('HubSpot webhook processing failed', { error: err.message });
  }
});

/**
 * POST /api/webhooks/wix
 * Receives Wix contact created/updated events (via Wix Automations or SPI).
 */
router.post('/wix', async (req: Request, res: Response, next: NextFunction) => {
  res.status(200).json({ received: true });

  try {
    if (!verifyWixSignature(req)) {
      logger.warn('Wix webhook: invalid signature');
      return;
    }

    const body = JSON.parse((req.body as Buffer).toString());
    const { instanceId, contact, eventType } = body;

    if (!instanceId || !contact?.id) {
      logger.warn('Wix webhook: missing instanceId or contact');
      return;
    }

    if (!['contact/created', 'contact/updated'].includes(eventType)) {
      return;
    }

    await syncService.syncWixToHubSpot(instanceId, contact);
  } catch (err: any) {
    logger.error('Wix webhook processing failed', { error: err.message });
  }
});

export default router;
