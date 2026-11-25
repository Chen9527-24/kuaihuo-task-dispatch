import { defineStore } from 'pinia';
import * as authApi from '@/api/modules/auth';
import * as usersApi from '@/api/modules/users';
import { ApiError, clearAuthToken, setAuthContextVersion, setAuthToken, setTenantId } from '@/api/core/http';
import { normalizeAuthTenants, normalizeAuthUser } from '@/api/normalizers';
import { AUTH_STORAGE_KEY, SAVED_AUTH_ACCOUNTS_STORAGE_KEY } from '@/constants/storage';
import type { AuthTenant, AuthUser, SavedAuthAccount } from '@/types/auth';
import { defaultAuthUser } from '@/types/auth';

let profileRequest: Promise<void> | null = null;
const MAX_SAVED_ACCOUNTS = 5;

interface AuthState {
  token: string;
  refreshToken: string;
  user: AuthUser;
  tenants: AuthTenant[];
  tenantId: string;
  tenantName: string;
  pendingTenantId: string;
  postLoginRedirect: string;
  profileLoaded: boolean;
  /** Incrementing it invalidates all in-flight data responses from the old context. */
  contextVersion: number;
  /** Opens the existing tenant chooser after a user explicitly asks to switch. */
  manualTenantSelectionOpen: boolean;
  savedAccounts: SavedAuthAccount[];
}

interface PersistedAuthState {
  token: string;
  refreshToken: string;
  user: AuthUser;
  tenants: AuthTenant[];
  tenantId: string;
  tenantName: string;
}

const defaultState: Omit<AuthState, 'user' | 'tenants' | 'savedAccounts'> = {
  token: '',
  refreshToken: '',
  tenantId: '',
  tenantName: '',
  pendingTenantId: '',
  postLoginRedirect: '/task-management',
  profileLoaded: false,
  contextVersion: 0,
  manualTenantSelectionOpen: false
};

function loadState(): AuthState {
  if (typeof localStorage === 'undefined') {
    return createEmptyState();
  }

  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return createEmptyState();

    const parsed = JSON.parse(raw) as Partial<PersistedAuthState>;
    if (typeof parsed.token !== 'string' || typeof parsed.tenantId !== 'string' || !parsed.token.trim() || !parsed.tenantId.trim()) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return createEmptyState();
    }

    return {
      ...createEmptyState(),
      token: parsed.token.trim(),
      refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken.trim() : '',
      user: parsed.user ? { ...defaultAuthUser, ...parsed.user } : { ...defaultAuthUser },
      tenants: Array.isArray(parsed.tenants) ? parsed.tenants : [],
      tenantId: parsed.tenantId.trim(),
      tenantName: typeof parsed.tenantName === 'string' ? parsed.tenantName.trim() : '',
      pendingTenantId: parsed.tenantId.trim(),
      profileLoaded: false
    };
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return createEmptyState();
  }
}

function createEmptyState(): AuthState {
  return {
    ...defaultState,
    user: { ...defaultAuthUser },
    tenants: [],
    savedAccounts: []
  };
}

function loadSavedAccounts(): SavedAuthAccount[] {
  if (typeof localStorage === 'undefined') return [];

  try {
    const raw = localStorage.getItem(SAVED_AUTH_ACCOUNTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => normalizeSavedAccount(item))
      .filter((item): item is SavedAuthAccount => Boolean(item))
      .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
      .slice(0, MAX_SAVED_ACCOUNTS);
  } catch {
    localStorage.removeItem(SAVED_AUTH_ACCOUNTS_STORAGE_KEY);
    return [];
  }
}

function normalizeSavedAccount(value: unknown): SavedAuthAccount | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const account = stringValue(record.account);
  const refreshToken = stringValue(record.refreshToken);
  const tenantId = stringValue(record.tenantId);
  if (!account || !refreshToken || !tenantId) return null;

  const userId = stringValue(record.userId);
  return {
    key: stringValue(record.key) || userId || account,
    userId,
    account,
    name: stringValue(record.name) || account,
    avatar: stringValue(record.avatar) || (stringValue(record.name) || account).slice(0, 1).toUpperCase(),
    avatarUrl: stringValue(record.avatarUrl),
    role: stringValue(record.role),
    tenantId,
    tenantName: stringValue(record.tenantName),
    tenants: Array.isArray(record.tenants) ? (record.tenants as AuthTenant[]) : [],
    refreshToken,
    lastUsedAt: stringValue(record.lastUsedAt) || new Date(0).toISOString()
  };
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => createEmptyState(),
  getters: {
    hasToken: (state) => Boolean(state.token),
    hasTenant: (state) => Boolean(state.tenantId),
    isLoggedIn: (state) => Boolean(state.token && state.tenantId),
    requiresTenantSelection: (state) => Boolean(state.token && !state.tenantId && state.tenants.length > 1),
    isTenantDialogVisible(): boolean {
      return this.requiresTenantSelection || this.manualTenantSelectionOpen;
    },
    isPlatformAdmin: (state) => state.user.roles.some((role) => ['admin', 'super_admin', 'platform_admin'].includes(role)),
    currentSavedAccountKey: (state) => state.user.id || state.user.account
  },
  actions: {
    hydrate() {
      const loaded = loadState();
      Object.assign(this, loaded, { savedAccounts: loadSavedAccounts() });
      setAuthContextVersion(this.contextVersion);

      if (this.token && this.tenantId) {
        setAuthToken(this.token);
        setTenantId(this.tenantId);
        this.pendingTenantId = this.tenantId;
        // Seamlessly migrate pre-account-switch browser sessions to the new safe list.
        this.saveCurrentAccount();
      } else {
        clearAuthToken();
      }
    },
    persist() {
      if (typeof localStorage === 'undefined') return;

      if (!this.token || !this.tenantId) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        return;
      }

      const payload: PersistedAuthState = {
        token: this.token,
        refreshToken: this.refreshToken,
        user: this.user,
        tenants: this.tenants,
        tenantId: this.tenantId,
        tenantName: this.tenantName
      };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
    },
    async login(payload: { account: string; password: string; remember?: boolean }) {
      const loginResult = await authApi.login({
        username: payload.account.trim(),
        password: payload.password
      });

      // Do not activate a tenant until the existing single/multi-tenant flow confirms it.
      this.applyLoginResult(loginResult);

      const tenants = loginResult.tenants.length ? loginResult.tenants : await this.fetchTenantCandidates();
      if (!tenants.length) {
        this.reset();
        throw new Error('当前账号未绑定租户，无法登录，请联系管理员处理');
      }

      this.tenants = tenants;
      this.pendingTenantId = pickDefaultTenantId(tenants);

      if (tenants.length === 1) {
        await this.selectTenant(tenants[0].tenantId);
      }
    },
    async fetchCurrentUserProfile(force = false) {
      if (!this.isLoggedIn) {
        this.reset();
        return;
      }

      if (this.profileLoaded && !force) return;

      if (profileRequest && !force) {
        await profileRequest;
        return;
      }

      profileRequest = (async () => {
        const profilePayload = await authApi.getCurrentUser();
        this.user = normalizeAuthUser(profilePayload, undefined, this.user);
        const nextTenants = normalizeAuthTenants(profilePayload, this.tenants);
        if (nextTenants.length) {
          this.tenants = nextTenants;
          this.syncSelectedTenant();
        }
        this.profileLoaded = true;
        this.saveCurrentAccount();
        this.persist();
      })();

      try {
        await profileRequest;
      } finally {
        profileRequest = null;
      }
    },
    async bootstrap() {
      if (!this.isLoggedIn || this.profileLoaded) return;

      try {
        await this.fetchCurrentUserProfile();
      } catch (error) {
        this.reset();
        throw error;
      }
    },
    async logout() {
      const activeKey = this.currentSavedAccountKey;
      try {
        if (this.refreshToken) {
          await authApi.logout({ refreshToken: this.refreshToken });
        }
      } finally {
        if (activeKey) this.removeSavedAccount(activeKey);
        this.reset();
      }
    },
    async logoutAll() {
      const sessions = [...this.savedAccounts];
      await Promise.allSettled(
        sessions
          .filter((item) => item.refreshToken)
          .map((item) => authApi.logout({ refreshToken: item.refreshToken }))
      );
      this.savedAccounts = [];
      this.persistSavedAccounts();
      this.reset();
    },
    async updateProfile(payload: Partial<AuthUser>) {
      const displayName = (payload.name ?? this.user.name).trim();
      const avatarUrl = payload.avatarUrl ?? this.user.avatarUrl;

      await usersApi.updateMyProfile({
        displayName,
        avatarUrl
      });

      this.user = {
        ...this.user,
        ...payload,
        name: displayName,
        avatar: displayName.slice(0, 1).toUpperCase() || this.user.avatar,
        avatarUrl
      };
      this.saveCurrentAccount();
    },
    reset() {
      this.token = '';
      this.refreshToken = '';
      this.profileLoaded = false;
      this.user = { ...defaultAuthUser };
      this.tenants = [];
      this.tenantId = '';
      this.tenantName = '';
      this.pendingTenantId = '';
      this.postLoginRedirect = '/task-management';
      this.manualTenantSelectionOpen = false;
      this.advanceAuthContext();
      clearAuthToken();
      profileRequest = null;
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    },
    setUser(user: Partial<AuthUser>) {
      this.user = {
        ...this.user,
        ...user
      };
    },
    setPostLoginRedirect(path: string) {
      this.postLoginRedirect = path || '/task-management';
    },
    consumePostLoginRedirect() {
      const path = this.postLoginRedirect || '/task-management';
      this.postLoginRedirect = '/task-management';
      return path;
    },
    setPendingTenant(tenantId: string) {
      this.pendingTenantId = tenantId;
    },
    openTenantSwitcher() {
      if (this.tenants.length <= 1) {
        throw new Error('当前账号只绑定一个可用租户');
      }
      this.pendingTenantId = this.tenantId || pickDefaultTenantId(this.tenants);
      this.manualTenantSelectionOpen = true;
    },
    closeTenantSwitcher() {
      if (!this.requiresTenantSelection) {
        this.manualTenantSelectionOpen = false;
      }
    },
    async selectTenant(tenantId?: string) {
      const nextTenantId = (tenantId ?? this.pendingTenantId).trim();
      if (!nextTenantId) {
        throw new Error('请选择租户后再继续');
      }
      if (!this.hasToken) {
        throw new Error('登录状态已失效，请重新登录');
      }
      if (!this.tenants.some((item) => item.tenantId === nextTenantId)) {
        throw new Error('当前账号未绑定该租户，不能切换');
      }

      const loginResult = await authApi.switchTenant({ tenantId: nextTenantId });
      this.applyLoginResult(loginResult, nextTenantId);
      this.tenants = loginResult.tenants.length ? loginResult.tenants : this.tenants;
      this.pendingTenantId = nextTenantId;
      this.syncSelectedTenant();
      this.manualTenantSelectionOpen = false;
      await this.fetchCurrentUserProfile(true);
    },
    /**
     * Restores a remembered account with its own rotating refresh token and its
     * own last tenant. No password is ever kept by the browser.
     */
    async switchSavedAccount(key: string): Promise<{ requiresTenantSelection: boolean }> {
      const target = this.savedAccounts.find((item) => item.key === key);
      if (!target) throw new Error('已保存账号不存在，请重新登录');
      if (target.key === this.currentSavedAccountKey && this.isLoggedIn) {
        return { requiresTenantSelection: false };
      }

      try {
        const loginResult = await authApi.refreshLoginToken({
          refreshToken: target.refreshToken,
          tenantId: target.tenantId
        });
        this.applyLoginResult(loginResult, target.tenantId);
        this.tenants = loginResult.tenants.length ? loginResult.tenants : target.tenants;
        this.pendingTenantId = target.tenantId;
        this.syncSelectedTenant();
        this.manualTenantSelectionOpen = false;
        await this.fetchCurrentUserProfile(true);
        return { requiresTenantSelection: false };
      } catch (error) {
        if (!(error instanceof ApiError) || ![401, 403].includes(error.status)) {
          throw error;
        }

        // The account may still be valid while its remembered tenant was removed,
        // disabled, expired, or unbound. Retry without tenant so the backend can
        // restore a remaining valid membership. Only remove the saved session if
        // that second validation fails as well.
        try {
          const fallbackResult = await authApi.refreshLoginToken({ refreshToken: target.refreshToken });
          const candidates = fallbackResult.tenants.length ? fallbackResult.tenants : target.tenants;
          if (!candidates.length) throw new Error('当前账号未绑定可用租户');

          this.applyLoginResult(fallbackResult);
          this.tenants = candidates;
          this.pendingTenantId = pickDefaultTenantId(candidates);

          if (candidates.length === 1) {
            await this.selectTenant(candidates[0].tenantId);
            return { requiresTenantSelection: false };
          }

          this.manualTenantSelectionOpen = true;
          return { requiresTenantSelection: true };
        } catch (fallbackError) {
          if (fallbackError instanceof ApiError && [401, 403].includes(fallbackError.status)) {
            this.removeSavedAccount(target.key);
            throw new Error('该保存账号的登录状态已失效，请重新输入账号密码登录');
          }
          throw fallbackError;
        }
      }
    },
    removeSavedAccount(key: string) {
      this.savedAccounts = this.savedAccounts.filter((item) => item.key !== key);
      this.persistSavedAccounts();
    },
    applyLoginResult(
      result: {
        accessToken: string;
        refreshToken: string;
        userPayload?: unknown;
        tenants: AuthTenant[];
      },
      selectedTenantId = ''
    ) {
      this.token = result.accessToken;
      this.refreshToken = result.refreshToken;
      this.profileLoaded = false;
      this.tenants = result.tenants.length ? result.tenants : this.tenants;
      this.pendingTenantId = selectedTenantId || this.pendingTenantId;

      if (result.userPayload) {
        this.user = normalizeAuthUser(result.userPayload, undefined, this.user);
      }

      setAuthToken(this.token);

      if (selectedTenantId) {
        this.tenantId = selectedTenantId;
        this.syncSelectedTenant();
        this.postLoginRedirect = '/task-management';
        this.advanceAuthContext();
        this.saveCurrentAccount();
      } else {
        const hadActiveContext = Boolean(this.tenantId);
        this.tenantId = '';
        this.tenantName = '';
        setTenantId('');
        // Adding/switching to a multi-tenant account must immediately discard
        // former account data before the tenant chooser appears.
        if (hadActiveContext) this.advanceAuthContext();
      }

      this.persist();
    },
    async fetchTenantCandidates() {
      const profilePayload = await authApi.getCurrentUser();
      const nextTenants = normalizeAuthTenants(profilePayload);
      this.user = normalizeAuthUser(profilePayload, undefined, this.user);
      return nextTenants;
    },
    syncSelectedTenant() {
      const selected = this.tenants.find((item) => item.tenantId === this.tenantId);
      this.tenantName = selected?.tenantName ?? '';
      setTenantId(this.tenantId);
    },
    saveCurrentAccount() {
      if (!this.refreshToken || !this.tenantId || !this.user.account) return;
      const key = this.user.id || this.user.account;
      if (!key) return;

      const record: SavedAuthAccount = {
        key,
        userId: this.user.id,
        account: this.user.account,
        name: this.user.name,
        avatar: this.user.avatar,
        avatarUrl: this.user.avatarUrl,
        role: this.user.role,
        tenantId: this.tenantId,
        tenantName: this.tenantName,
        tenants: this.tenants,
        refreshToken: this.refreshToken,
        lastUsedAt: new Date().toISOString()
      };
      this.savedAccounts = [record, ...this.savedAccounts.filter((item) => item.key !== key)].slice(0, MAX_SAVED_ACCOUNTS);
      this.persistSavedAccounts();
    },
    persistSavedAccounts() {
      if (typeof localStorage === 'undefined') return;
      if (!this.savedAccounts.length) {
        localStorage.removeItem(SAVED_AUTH_ACCOUNTS_STORAGE_KEY);
        return;
      }
      localStorage.setItem(SAVED_AUTH_ACCOUNTS_STORAGE_KEY, JSON.stringify(this.savedAccounts));
    },
    advanceAuthContext() {
      this.contextVersion += 1;
      setAuthContextVersion(this.contextVersion);
    }
  }
});

function pickDefaultTenantId(tenants: AuthTenant[]) {
  return tenants.find((item) => item.isDefault)?.tenantId ?? tenants[0]?.tenantId ?? '';
}
