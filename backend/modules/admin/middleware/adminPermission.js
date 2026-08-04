import { errorResponse } from '../../../shared/utils/response.js';
import { userHasAdminPermission } from '../../../shared/constants/adminPermissions.js';

/**
 * Require that the authenticated admin has ALL of the given permissions.
 * Super admins are always allowed.
 */
export const requirePermissions = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 401, 'Authentication required');
    }

    // Super admin bypass
    if (req.user.role === 'super_admin') {
      return next();
    }

    const userPerms = Array.isArray(req.user.permissions)
      ? req.user.permissions
      : [];

    const missing = requiredPermissions.filter(
      (perm) => !userHasAdminPermission(userPerms, perm),
    );

    if (missing.length > 0) {
      return errorResponse(
        res,
        403,
        'Access denied. Insufficient permissions.',
        { missingPermissions: missing },
      );
    }

    return next();
  };
};

/**
 * Require that the authenticated admin has AT LEAST ONE of the given permissions.
 * Super admins are always allowed.
 */
export const requireAnyPermission = (permissions = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 401, 'Authentication required');
    }

    // Super admin bypass
    if (req.user.role === 'super_admin') {
      return next();
    }

    const userPerms = Array.isArray(req.user.permissions)
      ? req.user.permissions
      : [];

    const hasAny = permissions.some((perm) =>
      userHasAdminPermission(userPerms, perm),
    );

    if (!hasAny) {
      return errorResponse(
        res,
        403,
        'Access denied. Insufficient permissions.',
        { requiredAnyOf: permissions },
      );
    }

    return next();
  };
};

export default { requirePermissions, requireAnyPermission };


