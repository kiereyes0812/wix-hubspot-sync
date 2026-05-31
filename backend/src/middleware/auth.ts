import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

export interface AuthenticatedRequest extends Request {
  wixInstanceId?: string;
  wixSiteId?: string;
}

/**
 * Verifies the Wix instance token sent from the dashboard widget.
 * The Wix platform signs the instance token with your app secret.
 * We issue our own short-lived JWT after verification for stateless auth.
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET not configured');

    const payload = jwt.verify(token, secret) as {
      wixInstanceId: string;
      wixSiteId: string;
    };

    req.wixInstanceId = payload.wixInstanceId;
    req.wixSiteId = payload.wixSiteId;
    next();
  } catch (err) {
    logger.warn('Auth failure: invalid token', { path: req.path });
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Issues a session JWT after Wix instance verification.
 * Called once during dashboard init, then the JWT is used for subsequent calls.
 */
export function issueSessionToken(wixInstanceId: string, wixSiteId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');

  return jwt.sign(
    { wixInstanceId, wixSiteId },
    secret,
    { expiresIn: '1h' },
  );
}
