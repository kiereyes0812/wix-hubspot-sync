import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { hubspotCRM } from '../services/hubspotCRM';
import { getSupabaseClient } from '../utils/supabase';

const router = Router();

/**
 * GET /api/forms/hubspot
 * Lists HubSpot forms for the connected account.
 */
router.get('/hubspot', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const forms = await hubspotCRM.listForms(req.wixInstanceId!);
    res.json({ forms });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/forms/hubspot/:formId/embed
 * Returns embed code for a specific HubSpot form.
 */
router.get('/hubspot/:formId/embed', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const db = getSupabaseClient();
    const { data: conn } = await db
      .from('hubspot_connections')
      .select('hubspot_portal_id')
      .eq('wix_instance_id', req.wixInstanceId)
      .single();

    if (!conn) {
      res.status(404).json({ error: 'HubSpot not connected' });
      return;
    }

    const { formId } = req.params;
    const portalId = conn.hubspot_portal_id;

    const embedCode = `
<!-- HubSpot Form Embed -->
<script charset="utf-8" type="text/javascript" src="//js.hsforms.net/forms/embed/v2.js"></script>
<script>
  hbspt.forms.create({
    region: "na1",
    portalId: "${portalId}",
    formId: "${formId}",
    onFormSubmit: function($form) {
      // Capture UTM params from URL
      var urlParams = new URLSearchParams(window.location.search);
      var hiddenFields = {
        utm_source: urlParams.get('utm_source') || '',
        utm_medium: urlParams.get('utm_medium') || '',
        utm_campaign: urlParams.get('utm_campaign') || '',
        utm_term: urlParams.get('utm_term') || '',
        utm_content: urlParams.get('utm_content') || '',
        page_url: window.location.href,
        referrer: document.referrer
      };
      // HubSpot automatically captures these via hs_context
    }
  });
</script>
`.trim();

    res.json({ embedCode, portalId, formId });
  } catch (err) {
    next(err);
  }
});

export default router;
