/** JwtStrategy 注入到 request.user 的用户结构。 */
export type CurrentUserTenant = {
  membershipId: string;
  tenantId: string;
  tenantName: string;
  tenantCode: string;
  isDefault: boolean;
};

export type CurrentUserPayload = {
  id: string;
  tenantId: string | null;
  tenantName?: string | null;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  roles: string[];
  permissions: string[];
  tenants: CurrentUserTenant[];
  createdAt: Date;
  updatedAt: Date;
};
