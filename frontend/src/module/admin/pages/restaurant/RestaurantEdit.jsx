import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { adminAPI, uploadAPI } from "../../../../lib/api";
import {
  ArrowLeft,
  Loader2,
  Save,
  User,
  MapPin,
  Phone,
  Mail,
  Clock,
  FileText,
  Upload,
  Image as ImageIcon,
  X,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { formatRestaurantId } from "@/lib/utils/formatId";

export default function RestaurantEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [restaurant, setRestaurant] = useState(null);

  const [form, setForm] = useState({
    name: "",
    panNumber: "",
    nameOnPan: "",
    isActive: true,
    ownerName: "",
    ownerPhone: "",
    ownerEmail: "",
    addressLine1: "",
    addressLine2: "",
    area: "",
    city: "",
    cuisines: "",
    openingTime: "",
    closingTime: "",
    gstNumber: "",
    fssaiNumber: "",
    fssaiExpiry: "",
    gstRegistered: false,
    bankAccountHolderName: "",
    bankAccountNumber: "",
    bankIfscCode: "",
  });

  const [documents, setDocuments] = useState({
    pan: { existing: null, file: null, remove: false },
    gst: { existing: null, file: null, remove: false },
    fssai: { existing: null, file: null, remove: false },
  });
  const restaurantId = useMemo(() => id, [id]);

  const loadRestaurant = async () => {
    if (!restaurantId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await adminAPI.getRestaurantById(restaurantId);
      if (!res?.data?.success || !res.data.data?.restaurant) {
        throw new Error("Failed to load restaurant details");
      }
      const data = res.data.data.restaurant;
      setRestaurant(data);

      const step1 = data.onboarding?.step1 || {};
      const step2 = data.onboarding?.step2 || {};
      const step3 = data.onboarding?.step3 || {};

      setForm({
        name: step1.restaurantName || data.name || "",
        panNumber: step3.pan?.panNumber || "",
        nameOnPan: step3.pan?.nameOnPan || "",
        isActive: data.isActive !== false,
        ownerName: step1.ownerName || data.ownerName || "",
        ownerPhone:
          step1.ownerPhone || data.ownerPhone || data.phone || "",
        ownerEmail:
          step1.ownerEmail || data.ownerEmail || data.email || "",
        addressLine1:
          data.location?.addressLine1 ||
          step1.location?.addressLine1 ||
          "",
        addressLine2:
          data.location?.addressLine2 ||
          step1.location?.addressLine2 ||
          "",
        area:
          data.location?.area ||
          step1.location?.area ||
          "",
        city:
          data.location?.city ||
          step1.location?.city ||
          "",
        cuisines:
          Array.isArray(data.cuisines) && data.cuisines.length > 0
            ? data.cuisines.join(", ")
            : Array.isArray(step2.cuisines) &&
              step2.cuisines.length > 0
            ? step2.cuisines.join(", ")
            : "",
        openingTime:
          data.deliveryTimings?.openingTime ||
          step2.deliveryTimings?.openingTime ||
          "",
        closingTime:
          data.deliveryTimings?.closingTime ||
          step2.deliveryTimings?.closingTime ||
          "",
        gstNumber: step3.gst?.gstNumber || "",
        fssaiNumber: step3.fssai?.registrationNumber || "",
        fssaiExpiry: step3.fssai?.expiryDate || "",
        gstRegistered:
          typeof step3.gst?.isRegistered === "boolean"
            ? step3.gst.isRegistered
            : !!step3.gst?.gstNumber,
        bankAccountHolderName:
          step3.bank?.accountHolderName || "",
        bankAccountNumber: step3.bank?.accountNumber || "",
        bankIfscCode: step3.bank?.ifscCode || "",
      });

      setDocuments({
        pan: {
          existing: step3.pan?.image || null,
          file: null,
          remove: false,
        },
        gst: {
          existing: step3.gst?.image || null,
          file: null,
          remove: false,
        },
        fssai: {
          existing: step3.fssai?.image || null,
          file: null,
          remove: false,
        },
      });
    } catch (err) {
      console.error("Error loading restaurant for edit:", err);
      setError(err.message || "Failed to load restaurant details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRestaurant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const handleChange = (field) => (e) => {
    const value =
      e?.target?.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleDocumentFileChange = (key) => (e) => {
    const file = e.target.files?.[0] || null;
    setDocuments((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        file,
        remove: false,
      },
    }));
    e.target.value = "";
  };

  const handleDocumentRemove = (key) => {
    setDocuments((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        file: null,
        remove: true,
      },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!restaurantId) return;

    // Basic required validations
    if (!form.name.trim()) {
      toast.error("Restaurant name is required");
      return;
    }
    if (!form.ownerName.trim()) {
      toast.error("Owner name is required");
      return;
    }
    if (!form.city.trim()) {
      toast.error("City is required");
      return;
    }

    // Format validations
    const phone = form.ownerPhone.trim();
    if (phone && (!/^\d{10}$/.test(phone))) {
      toast.error("Owner phone must be a valid 10 digit number");
      return;
    }

    const email = form.ownerEmail.trim();
    if (
      email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      toast.error("Owner email is not valid");
      return;
    }

    const cuisinesArray = form.cuisines
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    // Prepare document images (upload if needed)
    let panImageData = documents.pan.existing;
    let gstImageData = documents.gst.existing;
    let fssaiImageData = documents.fssai.existing;

    try {
      if (documents.pan.remove) {
        panImageData = null;
      } else if (documents.pan.file) {
        const res = await uploadAPI.uploadMedia(documents.pan.file, {
          folder: "restaurant/pan",
        });
        const d = res?.data?.data || res?.data;
        panImageData = d ? { url: d.url, publicId: d.publicId } : null;
      }

      if (documents.gst.remove) {
        gstImageData = null;
      } else if (documents.gst.file) {
        const res = await uploadAPI.uploadMedia(documents.gst.file, {
          folder: "restaurant/gst",
        });
        const d = res?.data?.data || res?.data;
        gstImageData = d ? { url: d.url, publicId: d.publicId } : null;
      }

      if (documents.fssai.remove) {
        fssaiImageData = null;
      } else if (documents.fssai.file) {
        const res = await uploadAPI.uploadMedia(documents.fssai.file, {
          folder: "restaurant/fssai",
        });
        const d = res?.data?.data || res?.data;
        fssaiImageData = d ? { url: d.url, publicId: d.publicId } : null;
      }
    } catch (err) {
      console.error("Error uploading document:", err);
      toast.error(
        err?.message || "Failed to upload one or more documents",
      );
      return;
    }

    const payload = {
      name: form.name.trim(),
      isActive: form.isActive,
      ownerName: form.ownerName.trim(),
      ownerPhone: form.ownerPhone.trim() || null,
      ownerEmail: form.ownerEmail.trim() || null,
      cuisines: cuisinesArray,
      location: {
        ...(restaurant?.location || {}),
        addressLine1: form.addressLine1.trim() || null,
        addressLine2: form.addressLine2.trim() || null,
        area: form.area.trim() || null,
        city: form.city.trim() || null,
      },
      deliveryTimings: {
        ...(restaurant?.deliveryTimings || {}),
        openingTime: form.openingTime || null,
        closingTime: form.closingTime || null,
      },
      onboarding: {
        ...(restaurant?.onboarding || {}),
        step1: {
          ...(restaurant?.onboarding?.step1 || {}),
          panNumber: form.panNumber.trim() || null,
          nameOnPan: form.nameOnPan.trim() || null,
          restaurantName: form.name.trim(),
          ownerName: form.ownerName.trim(),
          ownerPhone: phone || null,
          ownerEmail: email || null,
          location: {
            ...(restaurant?.onboarding?.step1?.location || {}),
            addressLine1: form.addressLine1.trim() || null,
            addressLine2: form.addressLine2.trim() || null,
            area: form.area.trim() || null,
            city: form.city.trim() || null,
          },
        },
        step2: {
          ...(restaurant?.onboarding?.step2 || {}),
          cuisines: cuisinesArray,
          deliveryTimings: {
            ...(restaurant?.onboarding?.step2?.deliveryTimings || {}),
            openingTime: form.openingTime || null,
            closingTime: form.closingTime || null,
          },
        },
        step3: {
          ...(restaurant?.onboarding?.step3 || {}),
          pan: {
            ...(restaurant?.onboarding?.step3?.pan || {}),
            panNumber: form.panNumber.trim() || null,
            nameOnPan: form.nameOnPan.trim() || null,
            image: panImageData,
          },
          gst: {
            ...(restaurant?.onboarding?.step3?.gst || {}),
            gstNumber: form.gstNumber.trim() || null,
            isRegistered: !!form.gstRegistered,
            legalName: restaurant?.onboarding?.step3?.gst?.legalName,
            address: restaurant?.onboarding?.step3?.gst?.address,
            image: gstImageData,
          },
          fssai: {
            ...(restaurant?.onboarding?.step3?.fssai || {}),
            registrationNumber: form.fssaiNumber.trim() || null,
            expiryDate: form.fssaiExpiry || null,
            image: fssaiImageData,
          },
          bank: {
            ...(restaurant?.onboarding?.step3?.bank || {}),
            accountHolderName: form.bankAccountHolderName.trim() || null,
            accountNumber: form.bankAccountNumber.trim() || null,
            ifscCode: form.bankIfscCode.trim() || null,
          },
        },
      },
    };

    try {
      setSaving(true);
      const res = await adminAPI.updateRestaurant(restaurantId, payload);
      if (!res?.data?.success) {
        throw new Error(res?.data?.message || "Failed to update restaurant");
      }
      toast.success("Restaurant updated successfully");
      navigate("/admin/restaurants");
    } catch (err) {
      console.error("Error saving restaurant:", err);
      toast.error(err.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-sm text-slate-700 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Restaurants List</span>
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Edit Restaurant
              </h1>
              {restaurant && (
                <p className="text-sm text-slate-500 mt-1">
                  ID: {formatRestaurantId(restaurant.restaurantId) || restaurant._id}
                </p>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <span className="ml-3 text-slate-600">
                Loading restaurant details...
              </span>
            </div>
          ) : error ? (
            <div className="py-10 text-center">
              <p className="text-red-600 font-semibold mb-2">
                Failed to load restaurant
              </p>
              <p className="text-slate-500 text-sm mb-4">
                {error}
              </p>
              {restaurantId && (
                <button
                  type="button"
                  onClick={loadRestaurant}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={loading}
                >
                  <Loader2
                    className={`w-4 h-4 ${
                      loading ? "animate-spin" : ""
                    }`}
                  />
                  <span>
                    {loading ? "Retrying..." : "Retry loading"}
                  </span>
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-8">
              <section>
                <h2 className="text-lg font-semibold text-slate-900 mb-4">
                  Basic Details
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Restaurant Name *
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={handleChange("name")}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-6 md:mt-0">
                    <span className="text-xs font-medium text-slate-600">
                      Status
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          isActive: !prev.isActive,
                        }))
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                        form.isActive ? "bg-green-500" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          form.isActive ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                    <span className="text-xs text-slate-600">
                      {form.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-500" />
                  Owner Information
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Owner Name *
                    </label>
                    <input
                      type="text"
                      value={form.ownerName}
                      onChange={handleChange("ownerName")}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Owner Phone
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        value={form.ownerPhone}
                        onChange={handleChange("ownerPhone")}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Owner Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={form.ownerEmail}
                        onChange={handleChange("ownerEmail")}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-500" />
                  Location
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Address Line 1
                    </label>
                    <input
                      type="text"
                      value={form.addressLine1}
                      onChange={handleChange("addressLine1")}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Address Line 2
                    </label>
                    <input
                      type="text"
                      value={form.addressLine2}
                      onChange={handleChange("addressLine2")}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Area / Zone
                    </label>
                    <input
                      type="text"
                      value={form.area}
                      onChange={handleChange("area")}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={handleChange("city")}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-slate-900 mb-4">
                  Cuisine & Timings
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Cuisines (comma separated)
                    </label>
                    <input
                      type="text"
                      value={form.cuisines}
                      onChange={handleChange("cuisines")}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        Opening Time
                      </label>
                      <input
                        type="text"
                        value={form.openingTime}
                        onChange={handleChange("openingTime")}
                        placeholder="e.g. 10:00 AM"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        Closing Time
                      </label>
                      <input
                        type="text"
                        value={form.closingTime}
                        onChange={handleChange("closingTime")}
                        placeholder="e.g. 11:00 PM"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-500" />
                  Compliance Documents & KYC
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-slate-800">
                      PAN Details
                    </h3>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        PAN Number
                      </label>
                      <input
                        type="text"
                        value={form.panNumber}
                        onChange={handleChange("panNumber")}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Name on PAN
                      </label>
                      <input
                        type="text"
                        value={form.nameOnPan}
                        onChange={handleChange("nameOnPan")}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        PAN Document
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-md bg-slate-100 flex items-center justify-center overflow-hidden">
                          {documents.pan.file || documents.pan.existing ? (
                            (() => {
                              const src =
                                documents.pan.file
                                  ? URL.createObjectURL(documents.pan.file)
                                  : documents.pan.existing?.url ||
                                    documents.pan.existing;
                              return src ? (
                                <img
                                  src={src}
                                  alt="PAN"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <ImageIcon className="w-4 h-4 text-slate-400" />
                              );
                            })()
                          ) : (
                            <ImageIcon className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                        <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-300 text-xs font-medium text-slate-700 bg-white cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload / Change</span>
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={handleDocumentFileChange("pan")}
                          />
                        </label>
                        {(documents.pan.file ||
                          documents.pan.existing) && (
                          <button
                            type="button"
                            onClick={() => handleDocumentRemove("pan")}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-200 text-xs text-red-600 bg-red-50"
                          >
                            <X className="w-3 h-3" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      GST Number
                    </label>
                    <input
                      type="text"
                      value={form.gstNumber}
                      onChange={handleChange("gstNumber")}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      GST Registered
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            gstRegistered: !prev.gstRegistered,
                          }))
                        }
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                          form.gstRegistered
                            ? "bg-green-500"
                            : "bg-slate-300"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            form.gstRegistered
                              ? "translate-x-6"
                              : "translate-x-1"
                          }`}
                        />
                      </button>
                      <span className="text-xs text-slate-600">
                        {form.gstRegistered ? "Yes" : "No"}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      FSSAI Registration Number
                    </label>
                    <input
                      type="text"
                      value={form.fssaiNumber}
                      onChange={handleChange("fssaiNumber")}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      FSSAI Expiry Date
                    </label>
                    <input
                      type="date"
                      value={form.fssaiExpiry || ""}
                      onChange={handleChange("fssaiExpiry")}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      GST Certificate
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-slate-100 flex items-center justify-center overflow-hidden">
                        {documents.gst.file || documents.gst.existing ? (
                          (() => {
                            const src =
                              documents.gst.file
                                ? URL.createObjectURL(documents.gst.file)
                                : documents.gst.existing?.url ||
                                  documents.gst.existing;
                            return src ? (
                              <img
                                src={src}
                                alt="GST"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="w-4 h-4 text-slate-400" />
                            );
                          })()
                        ) : (
                          <ImageIcon className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                      <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-300 text-xs font-medium text-slate-700 bg-white cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload / Change</span>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={handleDocumentFileChange("gst")}
                        />
                      </label>
                      {(documents.gst.file ||
                        documents.gst.existing) && (
                        <button
                          type="button"
                          onClick={() => handleDocumentRemove("gst")}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-200 text-xs text-red-600 bg-red-50"
                        >
                          <X className="w-3 h-3" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      FSSAI Certificate
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-slate-100 flex items-center justify-center overflow-hidden">
                        {documents.fssai.file || documents.fssai.existing ? (
                          (() => {
                            const src =
                              documents.fssai.file
                                ? URL.createObjectURL(documents.fssai.file)
                                : documents.fssai.existing?.url ||
                                  documents.fssai.existing;
                            return src ? (
                              <img
                                src={src}
                                alt="FSSAI"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="w-4 h-4 text-slate-400" />
                            );
                          })()
                        ) : (
                          <ImageIcon className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                      <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-300 text-xs font-medium text-slate-700 bg-white cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload / Change</span>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={handleDocumentFileChange("fssai")}
                        />
                      </label>
                      {(documents.fssai.file ||
                        documents.fssai.existing) && (
                        <button
                          type="button"
                          onClick={() => handleDocumentRemove("fssai")}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-200 text-xs text-red-600 bg-red-50"
                        >
                          <X className="w-3 h-3" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Note: You can upload or replace PAN, GST and FSSAI documents
                  here. Changes will be stored in the restaurant&apos;s
                  onboarding data.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-slate-500" />
                  Bank Details
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      value={form.bankAccountHolderName}
                      onChange={handleChange("bankAccountHolderName")}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Account Number
                    </label>
                    <input
                      type="text"
                      value={form.bankAccountNumber}
                      onChange={handleChange("bankAccountNumber")}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      value={form.bankIfscCode}
                      onChange={handleChange("bankIfscCode")}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                    />
                  </div>
                </div>
              </section>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => navigate("/admin/restaurants")}
                  className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

