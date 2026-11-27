import 'express-session';

export interface SignedInUser {
  login: string;
  name: string | null;
  avatar: string;
}

declare module 'express-session' {
  interface SessionData {
    token?: string;
    tokenExpiresAt?: number;
    refreshToken?: string;
    user?: SignedInUser;
    oauthState?: string;
  }
}
