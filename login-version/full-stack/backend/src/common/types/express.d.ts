import type { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: Pick<User, 'id' | 'username' | 'displayName' | 'status'> & {
        roles: string[];
        permissions: string[];
      };
    }
  }
}

export {};
