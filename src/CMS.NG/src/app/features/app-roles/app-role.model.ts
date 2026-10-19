export interface AppRole {
  pkid: number;
  roleId: string;
  roleName: string;
  permissionLevel: number;
  description: string | null;
  userCount: number;
  userIds: string[];
}

export interface AppRoleRequest {
  roleId: string;
  roleName: string;
  permissionLevel: number;
  description: string | null;
  userIds: string[];
}

export interface AppRoleQuery {
  keyword?: string | null;
  minPermissionLevel?: number | null;
  maxPermissionLevel?: number | null;
}

export interface AppUserLookup {
  userId: string;
  userName: string;
}
