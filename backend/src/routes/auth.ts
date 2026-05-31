import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { hubspotOAuth } from '../services/hubspotOAuth';
import { requireAuth, issueSessionToken, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/auth/session
 * Exchanges a Wix instance token for a session JWT.
 * The frontend calls this on dashboard load.
 */
router.post('/session', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { instanceId, siteId } = req.body;

    if (!instanceId || !siteId) {
      res.status(400).json({ error: 'instanceId and siteId are required' });
      return;
    }

    // In production: verify the Wix instance token signature here
    // using your WIX_APP_SECRET before trusting instanceId
    const token = issueSessionToken(instanceId, siteId);

    res.json({ token, expiresIn: 3600 });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/hubspot/connect
 * Initiates HubSpot OAuth flow.
 */
router.get('/hubspot/connect', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const state = Buffer.from(JSON.stringify({
    wixInstanceId: req.wixInstanceId,
    nonce: uuidv4(),
  })).toString('base64url');

  const authUrl = hubspotOAuth.getAuthorizationUrl(state);
  res.json({ authUrl });
});

/**
 * GET /api/auth/hubspot/callback
 * HubSpot redirects here with the auth code.
 */
router.get('/hubspot/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      logger.warn('HubSpot OAuth denied', { error });
      res.redirect(`${process.env.FRONTEND_URL}?hubspot_error=${error}`);
      return;
    }

    if (!code || !state) {
      res.status(400).json({ error: 'Missing code or state' });
      return;
    }

    const stateData = JSON.parse(Buffer.from(state as string, 'base64url').toString());
    const { wixInstanceId } = stateData;

    await hubspotOAuth.exchangeCodeForTokens(code as string, wixInstanceId);

    // Redirect to dashboard with success
    res.redirect(`${process.env.FRONTEND_URL}?hubspot_connected=true`);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/hubspot/status
 * Returns connection status (no tokens returned).
 */
router.get('/hubspot/status', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const status = await hubspotOAuth.getConnectionStatus(req.wixInstanceId!);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/auth/hubspot/disconnect
 * Removes connection and purges stored tokens.
 */
router.delete('/hubspot/disconnect', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await hubspotOAuth.disconnect(req.wixInstanceId!);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
