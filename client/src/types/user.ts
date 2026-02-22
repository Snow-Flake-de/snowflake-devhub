export interface User {
  id: number;
  username: string;
  created_at: string;
  oidc_id?: string;
  role?: 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | 'USER' | 'READ_ONLY';
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  permissions?: string[];
  is_admin?: number | boolean;
  is_active?: number | boolean;
  force_password_reset?: boolean;
  last_login_at?: string;
}

export interface AuthResponse {
  token?: string;
  user?: User;
  pendingApproval?: boolean;
  message?: string;
  error?: string;
}

export interface AuthConfig {
  authRequired: boolean;
  allowNewAccounts: boolean;
  registrationMode?: 'OPEN' | 'APPROVAL' | 'CLOSED';
  hasUsers: boolean;
  disableAccounts: boolean;
  disableInternalAccounts: boolean;
  allowPasswordChanges: boolean;
  communityMode?: 'ON' | 'OFF';
  maintenanceMode?: 'ON' | 'OFF';
}
