import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Upload, Image as ImageIcon, Trash2, ChevronDown, ChevronUp, Power } from "lucide-react";
import api from "@/lib/api";
import { getModuleToken } from "@/lib/utils/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export default function AdvertiseBanner() {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Create form
  const [newIsActive, setNewIsActive] = useState(false);
  const [newStartAt, setNewStartAt] = useState("");
  const [newEndAt, setNewEndAt] = useState("");
  const [newImageFile, setNewImageFile] = useState(null);
  const [newImagePreview, setNewImagePreview] = useState("");

  // Existing banners list
  const [banners, setBanners] = useState([]);
  const [expanded, setExpanded] = useState(() => ({})); // id -> bool
  const [rowBusy, setRowBusy] = useState(() => ({})); // id -> bool

  const fileRef = useRef(null);

  const authConfig = useMemo(() => {
    const token = getModuleToken("admin");
    return token
      ? { headers: { Authorization: `Bearer ${token}` } }
      : {};
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get("/admin/advertise-banners", {
        ...authConfig,
        params: { placement: "order_placed" },
      });
      setBanners(res?.data?.data?.banners || []);
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to load advertise banner");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onPickFile = (file) => {
    if (!file) return;
    if (!file.type?.startsWith("image/")) {
      setError("Please upload an image file");
      return;
    }
    setError(null);
    setNewImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setNewImagePreview(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const onCreate = async () => {
    try {
      setCreating(true);
      setError(null);
      setSuccess(null);

      if (!newImageFile) {
        setError("Banner image is required");
        return;
      }

      const fd = new FormData();
      fd.append("placement", "order_placed");
      fd.append("isActive", String(newIsActive));
      fd.append("startAt", newStartAt || "");
      fd.append("endAt", newEndAt || "");
      fd.append("image", newImageFile);

      await api.post("/admin/advertise-banners", fd, authConfig);

      // Reset form
      setNewIsActive(false);
      setNewStartAt("");
      setNewEndAt("");
      setNewImageFile(null);
      setNewImagePreview("");
      if (fileRef.current) fileRef.current.value = "";

      setSuccess("Banner added");
      setTimeout(() => setSuccess(null), 3000);
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to add banner");
    } finally {
      setCreating(false);
    }
  };

  const toggleExpand = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const setBusy = (id, v) => setRowBusy((prev) => ({ ...prev, [id]: v }));

  const onToggleStatus = async (id) => {
    try {
      setBusy(id, true);
      setError(null);
      // Send an empty JSON body to avoid some middleware choking on `null`
      await api.patch(
        `/admin/advertise-banners/${encodeURIComponent(id)}/status`,
        {},
        authConfig,
      );
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to toggle status");
    } finally {
      setBusy(id, false);
    }
  };

  const onDelete = async (id) => {
    try {
      setBusy(id, true);
      setError(null);
      await api.delete(`/admin/advertise-banners/${encodeURIComponent(id)}`, authConfig);
      await load();
      setSuccess("Banner deleted");
      setTimeout(() => setSuccess(null), 2500);
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to delete banner");
    } finally {
      setBusy(id, false);
    }
  };

  const onSaveSchedule = async (id, startAt, endAt) => {
    try {
      setBusy(id, true);
      setError(null);
      const fd = new FormData();
      fd.append("startAt", startAt || "");
      fd.append("endAt", endAt || "");
      await api.patch(`/admin/advertise-banners/${encodeURIComponent(id)}`, fd, authConfig);
      await load();
      setSuccess("Schedule updated");
      setTimeout(() => setSuccess(null), 2500);
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to update schedule");
    } finally {
      setBusy(id, false);
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Advertise Banner</h1>
            <p className="text-sm text-slate-600 mt-1">
              This banner shows on the user “Order Placed” success screen.
            </p>
          </div>
        </div>

        {(error || success) && (
          <div className="mb-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-3 text-sm">
                {success}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Add New */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            {loading ? (
              <div className="flex items-center gap-2 text-slate-600">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Active</div>
                    <div className="text-xs text-slate-500">Turn on to show banner to users.</div>
                  </div>
                  <Switch checked={newIsActive} onCheckedChange={setNewIsActive} />
                </div>

                <details className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-800 select-none">
                    Schedule (Start / End Date)
                  </summary>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <Label>Start Date (optional)</Label>
                      <Input type="date" value={newStartAt} onChange={(e) => setNewStartAt(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date (optional)</Label>
                      <Input type="date" value={newEndAt} onChange={(e) => setNewEndAt(e.target.value)} />
                    </div>
                  </div>
                </details>

                <div className="space-y-2">
                  <Label>Banner Image</Label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onPickFile(e.target.files?.[0])}
                  />
                  <div className="flex items-center gap-3">
                    <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload
                    </Button>
                    <div className="text-xs text-slate-500">
                      Recommended: wide banner image, with your offer text inside the image.
                    </div>
                  </div>
                </div>

                <Button onClick={onCreate} disabled={creating}>
                  {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Add Banner
                </Button>
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <ImageIcon className="w-4 h-4 text-slate-700" />
              <div className="text-sm font-semibold text-slate-800">Preview</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
              {newImagePreview ? (
                <img
                  src={newImagePreview}
                  alt="Advertise banner preview"
                  className="w-full rounded-2xl shadow-md object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-12 text-slate-500">
                  <ImageIcon className="w-8 h-8 mb-2" />
                  <div className="text-sm font-medium">No image selected</div>
                  <div className="text-xs mt-1">Upload a banner to preview here.</div>
                </div>
              )}
              <div className="mt-4 text-xs text-slate-500">
                Placement: <span className="font-medium">Order Placed Screen</span>
              </div>
            </div>
          </div>
        </div>

        {/* Existing list */}
        <div className="mt-8">
          <div className="text-lg font-semibold text-slate-900 mb-3">Added Banners</div>
          {loading ? null : banners.length === 0 ? (
            <div className="text-sm text-slate-600">No banners added yet.</div>
          ) : (
            <div className="space-y-4">
              {banners.map((b) => {
                const id = b?._id;
                const isOpen = !!expanded[id];
                const busy = !!rowBusy[id];
                const start = b?.startAt ? String(b.startAt).slice(0, 10) : "";
                const end = b?.endAt ? String(b.endAt).slice(0, 10) : "";
                return (
                  <BannerRow
                    key={id}
                    banner={b}
                    isOpen={isOpen}
                    busy={busy}
                    onToggleOpen={() => toggleExpand(id)}
                    onToggleStatus={() => onToggleStatus(id)}
                    onDelete={() => onDelete(id)}
                    onSaveSchedule={(s, e) => onSaveSchedule(id, s, e)}
                    initialStart={start}
                    initialEnd={end}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BannerRow({
  banner,
  isOpen,
  busy,
  onToggleOpen,
  onToggleStatus,
  onDelete,
  onSaveSchedule,
  initialStart,
  initialEnd,
}) {
  const [startAt, setStartAt] = useState(initialStart || "");
  const [endAt, setEndAt] = useState(initialEnd || "");

  useEffect(() => {
    setStartAt(initialStart || "");
    setEndAt(initialEnd || "");
  }, [initialStart, initialEnd]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-28 h-16 rounded-lg overflow-hidden bg-slate-100 shrink-0">
            {banner?.imageUrl ? (
              <img src={banner.imageUrl} alt="banner" className="w-full h-full object-cover" loading="lazy" />
            ) : null}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate">
              {banner?.placement || "order_placed"}
            </div>
            <div className="text-xs text-slate-500">
              {banner?.isActive ? "Active" : "Inactive"}{(banner?.startAt || banner?.endAt) ? " • Scheduled" : ""}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={busy} onClick={onToggleStatus} title="Active/Inactive">
            <Power className="w-4 h-4 mr-2" />
            {banner?.isActive ? "Deactivate" : "Activate"}
          </Button>
          <Button variant="outline" onClick={onToggleOpen} disabled={busy} title="Schedule">
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onDelete} title="Delete">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {isOpen && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-semibold text-slate-800 mb-3">Schedule</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date (optional)</Label>
              <Input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Date (optional)</Label>
              <Input type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </div>
          </div>
          <div className="mt-4">
            <Button disabled={busy} onClick={() => onSaveSchedule(startAt, endAt)}>
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save Schedule
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

