import { useEffect, useMemo, useState } from "react";
import { adminAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Lock,
  Eye,
  EyeOff,
  Save,
  Loader2,
  Shield,
  UserPlus,
  Users,
} from "lucide-react";
import { getCurrentAdmin } from "../utils/adminPermissions";

export default function AdminSettings() {
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  // Subadmin state
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [admins, setAdmins] = useState([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [permissionsCatalog, setPermissionsCatalog] = useState([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [adminFormSaving, setAdminFormSaving] = useState(false);
  const [adminForm, setAdminForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    role: "admin",
    isActive: true,
    permissions: [],
  });

  const groupedPermissions = useMemo(() => {
    const groups = {};
    permissionsCatalog.forEach((perm) => {
      const group = perm.group || "Other";
      if (!groups[group]) groups[group] = [];
      groups[group].push(perm);
    });
    return groups;
  }, [permissionsCatalog]);

  useEffect(() => {
    const admin = getCurrentAdmin();
    if (admin?.role === "super_admin") {
      setIsSuperAdmin(true);
      loadPermissionsCatalog();
      loadAdmins();
    }
  }, []);

  const loadPermissionsCatalog = async () => {
    try {
      setPermissionsLoading(true);
      const res = await adminAPI.getAdminPermissions();
      const data = res?.data?.data || res?.data;
      setPermissionsCatalog(data?.permissions || []);
    } catch (error) {
      console.error("Failed to load admin permissions catalog", error);
      toast.error("Failed to load permissions list");
    } finally {
      setPermissionsLoading(false);
    }
  };

  const loadAdmins = async () => {
    try {
      setAdminsLoading(true);
      const res = await adminAPI.getAdmins({ limit: 100 });
      const data = res?.data?.data || res?.data;
      setAdmins(data?.admins || []);
    } catch (error) {
      console.error("Failed to load admins", error);
      toast.error("Failed to load sub admins");
    } finally {
      setAdminsLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingAdmin(null);
    setAdminForm({
      name: "",
      email: "",
      password: "",
      phone: "",
      role: "admin",
      isActive: true,
      permissions: [],
    });
    setDialogOpen(true);
  };

  const openEditDialog = (admin) => {
    setEditingAdmin(admin);
    setAdminForm({
      name: admin.name || "",
      email: admin.email || "",
      password: "",
      phone: admin.phone || "",
      role: admin.role || "admin",
      isActive: admin.isActive !== false,
      permissions: Array.isArray(admin.permissions) ? admin.permissions : [],
    });
    setDialogOpen(true);
  };

  const handleAdminFormChange = (field, value) => {
    setAdminForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const togglePermission = (permissionId) => {
    setAdminForm((prev) => {
      const current = new Set(prev.permissions || []);
      if (current.has(permissionId)) {
        current.delete(permissionId);
      } else {
        current.add(permissionId);
      }
      return {
        ...prev,
        permissions: Array.from(current),
      };
    });
  };

  const toggleGroupPermissions = (groupPerms) => {
    const groupIds = groupPerms.map((p) => p.id);
    setAdminForm((prev) => {
      const current = new Set(prev.permissions || []);
      const allSelected = groupIds.every((id) => current.has(id));
      if (allSelected) {
        groupIds.forEach((id) => current.delete(id));
      } else {
        groupIds.forEach((id) => current.add(id));
      }
      return {
        ...prev,
        permissions: Array.from(current),
      };
    });
  };


  const handleAdminFormSubmit = async (e) => {
    e.preventDefault();
    try {
      setAdminFormSaving(true);
      const payload = {
        name: adminForm.name,
        email: adminForm.email,
        phone: adminForm.phone || undefined,
        role: adminForm.role,
        isActive: adminForm.isActive,
        permissions: adminForm.permissions,
      };
      if (!editingAdmin) {
        payload.password = adminForm.password;
        const res = await adminAPI.createAdmin(payload);
        const created = res?.data?.data?.admin || res?.data?.admin;
        if (created) {
          setAdmins((prev) => [created, ...prev]);
        }
        toast.success("Sub admin created successfully");
      } else {
        const res = await adminAPI.updateAdmin(editingAdmin._id, payload);
        const updated = res?.data?.data?.admin || res?.data?.admin;
        if (updated) {
          setAdmins((prev) =>
            prev.map((a) => (a._id === updated._id ? updated : a)),
          );
        }
        toast.success("Sub admin updated successfully");
      }
      setDialogOpen(false);
    } catch (error) {
      console.error("Failed to save sub admin", error);
      const msg =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to save sub admin";
      toast.error(msg);
    } finally {
      setAdminFormSaving(false);
    }
  };

  const handleToggleActive = async (admin) => {
    try {
      const res = await adminAPI.updateAdmin(admin._id, {
        isActive: !admin.isActive,
      });
      const updated = res?.data?.data?.admin || res?.data?.admin;
      if (updated) {
        setAdmins((prev) =>
          prev.map((a) => (a._id === updated._id ? updated : a)),
        );
      }
    } catch (error) {
      console.error("Failed to update status", error);
      toast.error("Failed to update sub admin status");
    }
  };

  const handleDeleteAdmin = async (admin) => {
    if (!window.confirm(`Delete sub admin ${admin.email}?`)) return;
    try {
      await adminAPI.deleteAdmin(admin._id);
      setAdmins((prev) => prev.filter((a) => a._id !== admin._id));
      toast.success("Sub admin deleted");
    } catch (error) {
      console.error("Failed to delete sub admin", error);
      const msg =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to delete sub admin";
      toast.error(msg);
    }
  };

  const handlePasswordChange = (field, value) => {
    setPasswordForm((prev) => ({
      ...prev,
      [field]: value,
    }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validatePasswordForm = () => {
    const newErrors = {};

    if (!passwordForm.currentPassword) {
      newErrors.currentPassword = "Current password is required";
    }

    if (!passwordForm.newPassword) {
      newErrors.newPassword = "New password is required";
    } else if (passwordForm.newPassword.length < 6) {
      newErrors.newPassword = "Password must be at least 6 characters long";
    }

    if (!passwordForm.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your new password";
    } else if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    if (passwordForm.currentPassword === passwordForm.newPassword) {
      newErrors.newPassword = "New password must be different from current password";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();

    if (!validatePasswordForm()) {
      return;
    }

    try {
      setSaving(true);
      await adminAPI.changePassword(
        passwordForm.currentPassword,
        passwordForm.newPassword
      );

      // Clear form
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      toast.success("Password changed successfully");
    } catch (error) {
      console.error("Error changing password:", error);
      const errorMessage =
        error?.response?.data?.message || "Failed to change password";
      
      // Set specific error for current password
      if (errorMessage.includes("current password") || errorMessage.includes("incorrect")) {
        setErrors({ currentPassword: errorMessage });
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Settings</h1>
        <p className="text-neutral-600 mt-1">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Password Change Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-neutral-700" />
            <CardTitle>Change Password</CardTitle>
          </div>
          <CardDescription>
            Update your password to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="currentPassword" className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Current Password
              </Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? "text" : "password"}
                  value={passwordForm.currentPassword}
                  onChange={(e) =>
                    handlePasswordChange("currentPassword", e.target.value)
                  }
                  placeholder="Enter your current password"
                  className={`h-11 pr-12 ${
                    errors.currentPassword ? "border-red-500" : ""
                  }`}
                  disabled={saving}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-800 transition-colors"
                  disabled={saving}
                >
                  {showCurrentPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.currentPassword && (
                <p className="text-sm text-red-600">{errors.currentPassword}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword" className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                New Password
              </Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    handlePasswordChange("newPassword", e.target.value)
                  }
                  placeholder="Enter your new password"
                  className={`h-11 pr-12 ${
                    errors.newPassword ? "border-red-500" : ""
                  }`}
                  disabled={saving}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-800 transition-colors"
                  disabled={saving}
                >
                  {showNewPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.newPassword && (
                <p className="text-sm text-red-600">{errors.newPassword}</p>
              )}
              <p className="text-xs text-neutral-500">
                Password must be at least 6 characters long
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Confirm New Password
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={passwordForm.confirmPassword}
                  onChange={(e) =>
                    handlePasswordChange("confirmPassword", e.target.value)
                  }
                  placeholder="Confirm your new password"
                  className={`h-11 pr-12 ${
                    errors.confirmPassword ? "border-red-500" : ""
                  }`}
                  disabled={saving}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-800 transition-colors"
                  disabled={saving}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-sm text-red-600">{errors.confirmPassword}</p>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-neutral-200">
              <Button
                type="submit"
                disabled={saving}
                className="bg-black text-white hover:bg-neutral-900 h-11 px-8"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Changing Password...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Change Password
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Sub Admin Management (super admin only) */}
      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-neutral-700" />
                <CardTitle>Sub Admin Management</CardTitle>
              </div>
              <Button size="sm" onClick={openCreateDialog}>
                <UserPlus className="w-4 h-4 mr-2" />
                Add Sub Admin
              </Button>
            </div>
            <CardDescription>
              Create and manage sub admins with restricted access using
              permissions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {adminsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 mr-2 animate-spin text-neutral-600" />
                <span className="text-neutral-600">Loading sub admins...</span>
              </div>
            ) : admins.length === 0 ? (
              <p className="text-sm text-neutral-600">
                No sub admins yet. Use &quot;Add Sub Admin&quot; to create one.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-neutral-500">
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 pr-4">Role</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Last Login</th>
                      <th className="py-2 pr-4">Permissions</th>
                      <th className="py-2 pr-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admins.map((admin) => (
                      <tr key={admin._id} className="border-b last:border-0">
                        <td className="py-2 pr-4 text-neutral-900">
                          {admin.name}
                        </td>
                        <td className="py-2 pr-4 text-neutral-700">
                          {admin.email}
                        </td>
                        <td className="py-2 pr-4 capitalize text-neutral-700">
                          {admin.role || "admin"}
                        </td>
                        <td className="py-2 pr-4">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(admin)}
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                              admin.isActive
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {admin.isActive ? "Active" : "Inactive"}
                          </button>
                        </td>
                        <td className="py-2 pr-4 text-neutral-500">
                          {admin.lastLogin
                            ? new Date(admin.lastLogin).toLocaleString()
                            : "—"}
                        </td>
                        <td className="py-2 pr-4 max-w-xs text-neutral-600">
                          {(admin.permissions || []).length === 0
                            ? "Default access"
                            : `${(admin.permissions || []).slice(0, 3).join(", ")}${
                                (admin.permissions || []).length > 3
                                  ? ` +${(admin.permissions || []).length - 3}`
                                  : ""
                              }`}
                        </td>
                        <td className="py-2 pr-0 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => openEditDialog(admin)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleDeleteAdmin(admin)}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add / Edit Sub Admin Dialog */}
      {isSuperAdmin && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-3xl sm:max-w-4xl p-0">
            <form
              onSubmit={handleAdminFormSubmit}
              className="flex h-full flex-col bg-white"
            >
              {/* Modal header */}
              <div className="border-b px-6 pt-5 pb-4">
                <DialogHeader className="space-y-1">
                  <DialogTitle className="text-lg font-semibold text-neutral-900">
                    {editingAdmin ? "Edit Sub Admin" : "Add Sub Admin"}
                  </DialogTitle>
                  <p className="text-sm text-neutral-500">
                    Define basic details and access permissions for this sub
                    admin.
                  </p>
                </DialogHeader>
              </div>

              {/* Modal body */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={adminForm.name}
                    onChange={(e) =>
                      handleAdminFormChange("name", e.target.value)
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={adminForm.email}
                    onChange={(e) =>
                      handleAdminFormChange("email", e.target.value)
                    }
                    required
                    disabled={!!editingAdmin}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone (optional)</Label>
                  <Input
                    value={adminForm.phone}
                    onChange={(e) =>
                      handleAdminFormChange("phone", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <select
                    className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
                    value={adminForm.role}
                    onChange={(e) =>
                      handleAdminFormChange("role", e.target.value)
                    }
                  >
                    <option value="admin">Admin</option>
                    <option value="moderator">Moderator</option>
                  </select>
                </div>
                  {!editingAdmin && (
                    <div className="space-y-2 md:col-span-2">
                      <Label>Password</Label>
                      <Input
                        type="password"
                        value={adminForm.password}
                        onChange={(e) =>
                          handleAdminFormChange("password", e.target.value)
                        }
                        required
                        minLength={6}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Permissions</Label>
                  <p className="text-xs text-neutral-500">
                    Select which pages and modules this sub admin can access. Only selected pages will be visible in their sidebar and accessible.
                  </p>
                  <div className="border rounded-md h-80 bg-neutral-50/60">
                    {permissionsLoading ? (
                      <div className="flex h-full items-center justify-center gap-2 text-neutral-600 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading permissions...
                      </div>
                    ) : (
                      <div className="h-80 overflow-y-auto p-4">
                        <div className="space-y-5">
                          {Object.entries(groupedPermissions).map(
                            ([groupName, perms]) => {
                              const allGroupSelected = perms.every((p) =>
                                adminForm.permissions.includes(p.id),
                              );
                              return (
                                <div
                                  key={groupName}
                                  className="space-y-2 border-b border-neutral-200/70 pb-4 last:border-b-0"
                                >
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-bold uppercase tracking-wide text-neutral-900">
                                      {groupName}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleGroupPermissions(perms)
                                      }
                                      className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                                    >
                                      {allGroupSelected
                                        ? "Deselect All"
                                        : "Select All"}
                                    </button>
                                  </div>
                                  <div className="grid gap-2.5 md:grid-cols-2">
                                    {perms.map((perm) => (
                                      <label
                                        key={perm.id}
                                        className="flex items-center gap-2.5 text-sm text-neutral-700 cursor-pointer select-none hover:text-neutral-900"
                                      >
                                        <Checkbox
                                          checked={adminForm.permissions.includes(
                                            perm.id,
                                          )}
                                          onCheckedChange={() =>
                                            togglePermission(perm.id)
                                          }
                                          className="w-4 h-4 border-2 border-neutral-300 rounded data-[state=checked]:bg-black data-[state=checked]:border-black flex items-center justify-center"
                                        />
                                        <span className="font-medium">
                                          {perm.label}
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              );
                            },
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={adminFormSaving}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={adminFormSaving}>
                  {adminFormSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

