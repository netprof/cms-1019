/** PasswordHash is backend-only and never appears in any of these models. */
export interface AppUser {
  pkid: number;
  userId: string;
  userName: string;
  isActive: boolean;
  /** API `datetime` with no timezone suffix (UTC); append 'Z' before display. */
  passwordUpdatedTime: string | null;
  roleCount: number;
  roleIds: string[];
}

export interface AppUserRequest {
  userId: string;
  userName: string;
  isActive: boolean;
  roleIds: string[];
}

export interface AppUserQuery {
  keyword?: string | null;
  isActive?: boolean | null;
  roleId?: string | null;
  passwordUpdatedFrom?: string | null;
  passwordUpdatedTo?: string | null;
}

export interface AppRoleLookup {
  roleId: string;
  roleName: string;
}
