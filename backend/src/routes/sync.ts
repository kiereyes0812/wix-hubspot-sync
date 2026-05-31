import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { syncService } from '../services/syncService';
import { getSupabaseClient } from '../utils/supabase';

const router = Router();

/**
 * POST /api/sync/wix-to-hubspot
 * Manually trigger sync for a specific Wix contact.
 */
router.post('/wix-to-hubspot', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { contact } = req.body;
    if (!contact?.id) {
      res.status(400).json({ error: 'contact.id is required' });
      return;
    }

    const result = await syncService.syncWixToHubSpot(req.wixInstanceId!, contact);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sync/form-submission
 * Called from Wix site when a form is submitted.
 */
router.post('/form-submission', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { email, name, fields, attribution } = req.body;

    if (!email) {
      res.status(400).json({ error: 'email is required' });
      return;
    }

    const result = await syncService.syncFormSubmission(req.wixInstanceId!, {
      email,
      name,
      fields: fields || {},
      attribution: attribution || {},
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sync/events
 * Returns recent sync events for the dashboard.
 */
router.get('/events', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const db = getSupabaseClient();
    const limit = Math.min(parseInt(req.query.limit as string || '50'), 100);

    const { data, error } = await db
      .from('sync_events')
      .select('*')
      .eq('wix_instance_id', req.wixInstanceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    res.json({ events: data || [] });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sync/contact-mappings
 * Lists all known Wix ↔ HubSpot contact ID pairs.
 */
router.get('/contact-mappings', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const db = getSupabaseClient();
    const { data, error } = await db
      .from('contact_mappings')
      .select('*')
      .eq('wix_instance_id', req.wixInstanceId)
      .order('last_synced_at', { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);
    res.json({ mappings: data || [] });
  } catch (err) {
    next(err);
  }
});

export default router;
