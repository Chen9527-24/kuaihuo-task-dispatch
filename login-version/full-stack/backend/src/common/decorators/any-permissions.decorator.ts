import { SetMetadata } from '@nestjs/common';

/**
 * Grants access when the current user owns at least one of the declared permissions.
 * Use this only for narrowly scoped helper endpoints that serve more than one parent workflow.
 */
export const ANY_PERMISSIONS_KEY = 'anyPermissions';
export const AnyPermissions = (...permissions: string[]) => SetMetadata(ANY_PERMISSIONS_KEY, permissions);
