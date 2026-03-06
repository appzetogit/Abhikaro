import { Navigate } from "react-router-dom"
import { hasPermission, hasAnyPermission } from "../utils/adminPermissions"

/**
 * ProtectedRoute
 * Props:
 * - requiredPermission: string (single permission id)
 * - anyOf: string[] (at least one of these permissions)
 */
export default function ProtectedRoute({
  children,
  requiredPermission,
  anyOf,
}) {
  const isAuthenticated = localStorage.getItem("admin_authenticated") === "true"

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />
  }

  // Permission checks (super admin handled inside helpers)
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/admin" replace />
  }

  if (Array.isArray(anyOf) && anyOf.length > 0 && !hasAnyPermission(anyOf)) {
    return <Navigate to="/admin" replace />
  }

  return children
}

