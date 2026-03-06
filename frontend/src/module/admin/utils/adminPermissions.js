// Simple helpers to work with admin permissions on the frontend

const ADMIN_STORAGE_KEY = "admin_user";

export const getCurrentAdmin = () => {
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Failed to parse admin_user from localStorage:", error);
    return null;
  }
};

export const getAdminPermissions = () => {
  const admin = getCurrentAdmin();
  if (!admin) return [];
  if (admin.role === "super_admin") {
    // Super admin treated as full access on frontend – backend still enforces
    return ["*"];
  }
  return Array.isArray(admin.permissions) ? admin.permissions : [];
};

export const isSuperAdmin = () => {
  const admin = getCurrentAdmin();
  return admin?.role === "super_admin";
};

export const hasPermission = (permissionId) => {
  if (!permissionId) return true;
  const perms = getAdminPermissions();
  if (perms.includes("*")) return true;
  return perms.includes(permissionId);
};

export const hasAnyPermission = (permissionIds = []) => {
  if (!Array.isArray(permissionIds) || permissionIds.length === 0) return true;
  const perms = getAdminPermissions();
  if (perms.includes("*")) return true;
  return permissionIds.some((id) => perms.includes(id));
};

