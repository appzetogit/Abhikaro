import { useState, useEffect, useMemo } from "react";
import {
  Ticket,
  Search,
  Plus,
  Edit2,
  Trash2,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Percent,
  IndianRupee,
  Layers,
  X,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import { adminAPI } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const DAYS_OF_WEEK = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

export default function AdminPromoCodes() {
  const [promoCodes, setPromoCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all', 'active', 'inactive', 'expired'
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, expired: 0 });

  // Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    code: "",
    title: "",
    description: "",
    discountType: "percentage", // 'percentage' | 'flat'
    discountValue: "",
    minOrderAmount: "0",
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    validDays: [],
    usageLimitPerUser: "1",
    totalUsageLimit: "0",
    isActive: true,
  });

  const fetchPromoCodes = async () => {
    try {
      setLoading(true);
      const params = {
        search: searchQuery.trim() || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      };
      const response = await adminAPI.getPromoCodes(params);
      if (response?.data?.success) {
        setPromoCodes(response.data.data.promoCodes || []);
        if (response.data.data.stats) {
          setStats(response.data.data.stats);
        }
      }
    } catch (err) {
      console.error("Error fetching promo codes:", err);
      toast.error(err?.response?.data?.message || "Failed to load promo codes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromoCodes();
  }, [statusFilter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPromoCodes();
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleOpenCreateModal = () => {
    setEditingPromo(null);
    setFormData({
      code: "",
      title: "",
      description: "",
      discountType: "percentage",
      discountValue: "",
      minOrderAmount: "0",
      startDate: new Date().toISOString().split("T")[0],
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      validDays: [],
      usageLimitPerUser: "1",
      totalUsageLimit: "0",
      isActive: true,
    });
    setIsDialogOpen(true);
  };

  const handleOpenEditModal = (promo) => {
    setEditingPromo(promo);
    setFormData({
      code: promo.code || "",
      title: promo.title || "",
      description: promo.description || "",
      discountType: promo.discountType || "percentage",
      discountValue: String(promo.discountValue ?? ""),
      minOrderAmount: String(promo.minOrderAmount ?? 0),
      startDate: promo.startDate ? new Date(promo.startDate).toISOString().split("T")[0] : "",
      endDate: promo.endDate ? new Date(promo.endDate).toISOString().split("T")[0] : "",
      validDays: Array.isArray(promo.validDays) ? promo.validDays : [],
      usageLimitPerUser: String(promo.usageLimitPerUser ?? 1),
      totalUsageLimit: String(promo.totalUsageLimit ?? 0),
      isActive: promo.isActive !== false,
    });
    setIsDialogOpen(true);
  };

  const handleToggleDay = (dayKey) => {
    setFormData((prev) => {
      const exists = prev.validDays.includes(dayKey);
      if (exists) {
        return { ...prev, validDays: prev.validDays.filter((d) => d !== dayKey) };
      } else {
        return { ...prev, validDays: [...prev.validDays, dayKey] };
      }
    });
  };

  const handleSelectAllDays = () => {
    setFormData((prev) => ({
      ...prev,
      validDays: prev.validDays.length === 7 ? [] : DAYS_OF_WEEK.map((d) => d.key),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.code.trim()) {
      toast.error("Promo code is required");
      return;
    }
    if (!formData.title.trim()) {
      toast.error("Promo title is required");
      return;
    }
    if (!formData.discountValue || Number(formData.discountValue) <= 0) {
      toast.error("Valid discount value is required");
      return;
    }
    if (formData.discountType === "percentage" && Number(formData.discountValue) > 100) {
      toast.error("Percentage discount cannot exceed 100%");
      return;
    }
    if (!formData.startDate || !formData.endDate) {
      toast.error("Start and end dates are required");
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        code: formData.code.trim().toUpperCase(),
        title: formData.title.trim(),
        description: formData.description.trim(),
        discountType: formData.discountType,
        discountValue: Number(formData.discountValue),
        minOrderAmount: Number(formData.minOrderAmount || 0),
        startDate: formData.startDate,
        endDate: formData.endDate,
        validDays: formData.validDays,
        usageLimitPerUser: Number(formData.usageLimitPerUser || 0),
        totalUsageLimit: Number(formData.totalUsageLimit || 0),
        isActive: formData.isActive,
      };

      if (editingPromo) {
        await adminAPI.updatePromoCode(editingPromo._id, payload);
        toast.success("Promo code updated successfully");
      } else {
        await adminAPI.createPromoCode(payload);
        toast.success("Promo code created successfully");
      }

      setIsDialogOpen(false);
      fetchPromoCodes();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save promo code");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    try {
      await adminAPI.togglePromoCodeStatus(id);
      toast.success(`Promo code ${!currentStatus ? "activated" : "deactivated"}`);
      setPromoCodes((prev) =>
        prev.map((item) => (item._id === id ? { ...item, isActive: !currentStatus } : item))
      );
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update status");
    }
  };

  const handleDelete = async (id, code) => {
    if (!confirm(`Are you sure you want to delete promo code '${code}'?`)) {
      return;
    }
    try {
      await adminAPI.deletePromoCode(id);
      toast.success("Promo code deleted");
      setPromoCodes((prev) => prev.filter((item) => item._id !== id));
      setStats((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to delete promo code");
    }
  };

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`Copied '${code}' to clipboard`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const isExpired = (endDate) => {
    if (!endDate) return false;
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    return new Date() > end;
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Title & Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
              <Ticket className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Admin Promo Codes</h1>
              <p className="text-xs md:text-sm text-slate-500">
                Create & manage platform discount promo codes subsidized from Admin commission.
              </p>
            </div>
          </div>
          <Button
            onClick={handleOpenCreateModal}
            className="bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create Promo Code
          </Button>
        </div>

        {/* Stats Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Total Codes</p>
              <p className="text-xl font-bold text-slate-900">{stats.total}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="p-3 bg-green-50 text-green-600 rounded-lg">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Active</p>
              <p className="text-xl font-bold text-green-600">{stats.active}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="p-3 bg-slate-100 text-slate-600 rounded-lg">
              <XCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Inactive</p>
              <p className="text-xl font-bold text-slate-700">{stats.inactive}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Expired</p>
              <p className="text-xl font-bold text-amber-600">{stats.expired}</p>
            </div>
          </div>
        </div>

        {/* Filter Bar & Search */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
            {/* Search Input */}
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by code, title, description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-full md:w-auto overflow-x-auto">
              {[
                { id: "all", label: "All" },
                { id: "active", label: "Active" },
                { id: "inactive", label: "Inactive" },
                { id: "expired", label: "Expired" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                    statusFilter === tab.id
                      ? "bg-white text-orange-600 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Promo Codes Table / List */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-orange-600 mb-2" />
              <p className="text-sm text-slate-500">Loading promo codes...</p>
            </div>
          ) : promoCodes.length === 0 ? (
            <div className="p-12 text-center">
              <Ticket className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-base font-semibold text-slate-700">No promo codes found</p>
              <p className="text-sm text-slate-400 mt-1">
                {searchQuery || statusFilter !== "all"
                  ? "Try changing your search or filter criteria"
                  : "Click 'Create Promo Code' to add your first platform discount code."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Promo Code & Title</th>
                    <th className="px-6 py-4">Discount</th>
                    <th className="px-6 py-4">Validity</th>
                    <th className="px-6 py-4">Applicable Days</th>
                    <th className="px-6 py-4">Usage</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {promoCodes.map((promo) => {
                    const expired = isExpired(promo.endDate);
                    return (
                      <tr key={promo._id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Promo Code & Title */}
                        <td className="px-6 py-4">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="px-2.5 py-1 bg-orange-50 text-orange-700 font-mono font-bold text-xs rounded border border-orange-200 flex items-center gap-1">
                                  {promo.code}
                                  <button
                                    type="button"
                                    onClick={() => handleCopyCode(promo.code)}
                                    className="hover:text-orange-900 transition-colors"
                                  >
                                    {copiedCode === promo.code ? (
                                      <Check className="w-3 h-3 text-green-600" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </span>
                              </div>
                              <p className="font-semibold text-slate-900 mt-1">{promo.title}</p>
                              {promo.description && (
                                <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                                  {promo.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Discount */}
                        <td className="px-6 py-4">
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 text-sm font-bold text-slate-900">
                              {promo.discountType === "percentage" ? (
                                <>
                                  <Percent className="w-3.5 h-3.5 text-blue-600" />
                                  {promo.discountValue}% OFF
                                </>
                              ) : (
                                <>
                                  <IndianRupee className="w-3.5 h-3.5 text-green-600" />
                                  ₹{promo.discountValue} FLAT OFF
                                </>
                              )}
                            </span>
                            {promo.minOrderAmount > 0 ? (
                              <p className="text-xs text-slate-500">Above ₹{promo.minOrderAmount}</p>
                            ) : (
                              <p className="text-xs text-slate-400">All order amounts</p>
                            )}
                          </div>
                        </td>

                        {/* Date Validity */}
                        <td className="px-6 py-4">
                          <div className="text-xs space-y-1">
                            <div className="flex items-center gap-1.5 text-slate-700">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <span>
                                {new Date(promo.startDate).toLocaleDateString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-700">
                              <span className="text-slate-400 text-[10px] uppercase font-semibold">To:</span>
                              <span className={expired ? "text-amber-600 font-semibold" : ""}>
                                {new Date(promo.endDate).toLocaleDateString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Day-of-Week Validity */}
                        <td className="px-6 py-4">
                          {!promo.validDays || promo.validDays.length === 0 || promo.validDays.length === 7 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                              All Days
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {promo.validDays.map((day) => (
                                <span
                                  key={day}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 capitalize"
                                >
                                  {day.slice(0, 3)}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* Usage Limit & Stats */}
                        <td className="px-6 py-4">
                          <div className="text-xs space-y-1">
                            <p className="font-semibold text-slate-800">
                              Used: <span className="text-orange-600">{promo.timesUsed || 0}</span>
                              {promo.totalUsageLimit > 0 ? ` / ${promo.totalUsageLimit}` : " times"}
                            </p>
                            <p className="text-slate-500 text-[11px]">
                              {promo.usageLimitPerUser > 0
                                ? `${promo.usageLimitPerUser} per user`
                                : "Unlimited / user"}
                            </p>
                          </div>
                        </td>

                        {/* Status Toggle & Badge */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={promo.isActive && !expired}
                              disabled={expired}
                              onCheckedChange={() => handleToggleStatus(promo._id, promo.isActive)}
                            />
                            <span
                              className={`text-xs font-semibold ${
                                expired
                                  ? "text-amber-600"
                                  : promo.isActive
                                  ? "text-green-600"
                                  : "text-slate-400"
                              }`}
                            >
                              {expired ? "Expired" : promo.isActive ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleOpenEditModal(promo)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit Promo"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(promo._id, promo.code)}
                              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete Promo"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Modal Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white p-6 rounded-2xl">
          <DialogHeader className="border-b border-slate-100 pb-4">
            <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Ticket className="w-5 h-5 text-orange-600" />
              {editingPromo ? "Edit Promo Code" : "Create New Promo Code"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Admin promo code discount is subsidized 100% by Admin from platform commission without reducing restaurant earnings.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5 pt-2">
            {/* Promo Code & Title */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700 uppercase">
                  Promo Code <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder="e.g. WELCOME50"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value.toUpperCase() })
                  }
                  required
                  className="font-mono uppercase font-bold tracking-wider"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700 uppercase">
                  Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder="e.g. 50% Flat Discount"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 uppercase">
                Description (Optional)
              </Label>
              <Input
                placeholder="e.g. Get 20% discount on orders above ₹200"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            {/* Discount Type, Value & Applicable Min Order */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700 uppercase">
                  Discount Type
                </Label>
                <select
                  value={formData.discountType}
                  onChange={(e) => setFormData({ ...formData, discountType: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="flat">Flat Amount (₹)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700 uppercase">
                  Discount Value <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max={formData.discountType === "percentage" ? "100" : undefined}
                    step="any"
                    placeholder={formData.discountType === "percentage" ? "e.g. 20" : "e.g. 50"}
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    {formData.discountType === "percentage" ? "%" : "₹"}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700 uppercase">
                  Applicable Above (₹)
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={formData.minOrderAmount}
                    onChange={(e) => setFormData({ ...formData, minOrderAmount: e.target.value })}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    ₹
                  </span>
                </div>
                <p className="text-[10px] text-slate-500">Default 0 (valid on all cart totals)</p>
              </div>
            </div>

            {/* Date Range Validity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700 uppercase">
                  Start Date <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700 uppercase">
                  End Date <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  required
                />
              </div>
            </div>

            {/* Day of the Week Restriction */}
            <div className="space-y-2 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-semibold text-slate-800 uppercase">
                    Applicable Days of Week
                  </Label>
                  <p className="text-[11px] text-slate-500">
                    Leave all unchecked to make promo code valid on all days.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSelectAllDays}
                  className="text-xs font-semibold text-orange-600 hover:text-orange-700"
                >
                  {formData.validDays.length === 7 ? "Deselect All" : "Select All Days"}
                </button>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {DAYS_OF_WEEK.map((day) => {
                  const isSelected = formData.validDays.includes(day.key);
                  return (
                    <button
                      key={day.key}
                      type="button"
                      onClick={() => handleToggleDay(day.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        isSelected
                          ? "bg-orange-600 text-white shadow-sm"
                          : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Usage Limits */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700 uppercase">
                  Usage Limit Per User
                </Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="1 (0 for unlimited)"
                  value={formData.usageLimitPerUser}
                  onChange={(e) =>
                    setFormData({ ...formData, usageLimitPerUser: e.target.value })
                  }
                />
                <p className="text-[10px] text-slate-500">0 means unlimited per customer</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700 uppercase">
                  Total Redemptions Limit
                </Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0 (0 for unlimited)"
                  value={formData.totalUsageLimit}
                  onChange={(e) =>
                    setFormData({ ...formData, totalUsageLimit: e.target.value })
                  }
                />
                <p className="text-[10px] text-slate-500">0 means no overall limit</p>
              </div>
            </div>

            {/* Active Toggle Switch */}
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <p className="text-sm font-semibold text-slate-900">Enable Promo Code</p>
                <p className="text-xs text-slate-500">
                  Allow users to see and redeem this promo code in their cart
                </p>
              </div>
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-orange-600 hover:bg-orange-700 text-white min-w-[120px]"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : editingPromo ? (
                  "Update Promo"
                ) : (
                  "Create Promo"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
