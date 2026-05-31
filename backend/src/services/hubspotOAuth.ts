import { logger } from '../utils/logger';

export class HubSpotOAuthService {
  /**
   * Returns the private app access token from environment.
   * Tokens NEVER leave the backend.
   */
  async getValidAccessToken(wixInstanceId: string): Promise<string> {
    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    if (!token) {
      throw new Error('HUBSPOT_ACCESS_TOKEN not set in environment');
    }
    return token;
  }

  /**
   * Check connection status — private app is always connected if token exists.
   */
  async getConnectionStatus(wixInstanceId: string): Promise<{
    connected: boolean;
    portalId?: string;
    connectedAt?: string;
  }> {
    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    return {
      connected: !!token,
      portalId: 'private-app',
      connectedAt: new Date().toISOString(),
    };
  }

  /**
   * Disconnect — nothing to do for private app tokens.
   */
  async disconnect(wixInstanceId: string): Promise<void> {
    logger.info('HubSpot private app disconnect called (no-op)', { wixInstanceId });
  }

  /**
   * Not used for private apps — kept for interface compatibility.
   */
  getAuthorizationUrl(state: string): string {
    return '#not-applicable-private-app';
  }

  async exchangeCodeForTokens(code: string, wixInstanceId: string): Promise<{ portalId: string }> {
    throw new Error('OAuth not applicable for private app');
  }
}

export const hubspotOAuth = new HubSpotOAuthService();
