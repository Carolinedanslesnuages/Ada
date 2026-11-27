import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { CONFIG, type Config } from '../config.js';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

@Injectable()
export class GithubOAuthService {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  get callbackUrl(): string {
    return `${this.config.INTERFACE_URL}/api/auth/github/callback`;
  }

  authorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.GITHUB_CLIENT_ID,
      redirect_uri: this.callbackUrl,
      state: state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /** New token from the renewal token (GitHub App tokens: 8 h, renewal: 6 months). */
  async refresh(renewalToken: string): Promise<Required<Pick<TokenResponse, 'access_token'>> & TokenResponse> {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.config.GITHUB_CLIENT_ID,
        client_secret: this.config.GITHUB_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: renewalToken,
      }),
    });
    const data = (await response.json()) as TokenResponse;
    if (!response.ok || !data.access_token) {
      throw new UnauthorizedException(data.error_description ?? 'Renouvellement du jeton GitHub refusé');
    }
    return { ...data, access_token: data.access_token };
  }

  async exchangeCode(code: string): Promise<Required<Pick<TokenResponse, 'access_token'>> & TokenResponse> {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.config.GITHUB_CLIENT_ID,
        client_secret: this.config.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: this.callbackUrl,
      }),
    });
    const data = (await response.json()) as TokenResponse;
    if (!response.ok || !data.access_token) {
      throw new UnauthorizedException(data.error_description ?? 'Connexion GitHub refusée');
    }
    return { ...data, access_token: data.access_token };
  }
}
