import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { getSupabaseClient } from '../utils/supabase';
import { hubspotCRM } from '../services/hubspotCRM';
import { logger } from '../utils/logger';

const router = Router();

// Default Wix contact fields available for mapping
const WIX_FIELDS = [
  { name: 'info.name.first', label: 'First Name' },
  { name: 'info.name.last', label: 'Last Name' },
  { name: 'info.emails.0.email', label: 'Email (Primary)' },
  { name: 'info.phones.0.phone', label: 'Phone (Primary)' },
  { name: 'info.company', label: 'Company' },
  { name: 'info.jobTitle', label: 'Job Title' },
  { name: 'info.addresses.0.city', label: 'City' },
  { name: 'info.addresses.0.country', label: 'Country' },
];

/**
 * GET /api/mapping/wix-fields
 * Returns available Wix contact fields.
 */
router.get('/wix-fields', requireAuth, (_req, res) => {
  res.json({ fields: WIX_FIELDS });
});

/**
 * GET /api/mapping/hubspot-properties
 * Returns HubSpot contact properties for mapping.
 */
router.get('/hubspot-properties', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const properties = await hubspotCRM.listProperties(req.wixInstanceId!);
    res.json({ properties });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/mapping
 * Gets all field mappings for this instance.
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const db = getSupabaseClient();
    const { data, error } = await db
      .from('field_mappings')
      .select('*')
      .eq('wix_instance_id', req.wixInstanceId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    res.json({ mappings: data || [] });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/mapping
 * Saves/replaces all field mappings for this instance.
 */
router.put('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { mappings } = req.body;

    if (!Array.isArray(mappings)) {
      res.status(400).json({ error: 'mappings must be an array' });
      return;
    }

    // Validate no duplicate HubSpot properties in same direction
    const seen = new Map<string, string>();
    for (const m of mappings) {
      const key = `${m.hubspot_property}:${m.sync_direction}`;
      if (seen.has(key) && m.sync_direction !== 'bidirectional') {
        res.status(400).json({
          error: `Duplicate HubSpot property mapping: ${m.hubspot_property}`,
        });
        return;
      }
      seen.set(key, m.hubspot_property);
    }

    const db = getSupabaseClient();

    // Delete existing and replace
    await db.from('field_mappings').delete().eq('wix_instance_id', req.wixInstanceId);

    if (mappings.length > 0) {
      const rows = mappings.map((m: any) => ({
        wix_instance_id: req.wixInstanceId,
        wix_field: m.wix_field,
        hubspot_property: m.hubspot_property,
        sync_direction: m.sync_direction || 'bidirectional',
        transform: m.transform || null,
        is_active: true,
      }));

      const { error } = await db.from('field_mappings').insert(rows);
      if (error) throw new Error(error.message);
    }

    logger.info('Field mappings saved', { wixInstanceId: req.wixInstanceId, count: mappings.length });
    res.json({ success: true, count: mappings.length });
  } catch (err) {
    next(err);
  }
});

export default router;
