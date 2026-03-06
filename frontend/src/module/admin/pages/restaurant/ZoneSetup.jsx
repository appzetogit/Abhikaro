import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { MapPin, Plus, Search, Edit, Trash2, Eye, Map, Users } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { Switch } from "@/components/ui/switch"
import { isSuperAdmin } from "../../utils/adminPermissions"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"

export default function ZoneSetup() {
  const navigate = useNavigate()
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [deliveryAssignmentMode, setDeliveryAssignmentMode] = useState("automatic")
  const [modeLoading, setModeLoading] = useState(false)
  const [modeSaving, setModeSaving] = useState(false)
  const [canManageAssignment, setCanManageAssignment] = useState(false)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selectedZone, setSelectedZone] = useState(null)
  const [deliveryPartners, setDeliveryPartners] = useState([])
  const [deliveryLoading, setDeliveryLoading] = useState(false)
  const [deliverySearch, setDeliverySearch] = useState("")
  const [updatingPartnerId, setUpdatingPartnerId] = useState(null)

  const isZoneModeOn = deliveryAssignmentMode === "manual"

  useEffect(() => {
    fetchZones()
    setCanManageAssignment(isSuperAdmin())
    fetchAssignmentMode()
  }, [])

  const fetchZones = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getZones()
      if (response.data?.success && response.data.data?.zones) {
        setZones(response.data.data.zones)
      }
    } catch (error) {
      console.error("Error fetching zones:", error)
      setZones([])
    } finally {
      setLoading(false)
    }
  }

  const fetchAssignmentMode = async () => {
    try {
      setModeLoading(true)
      const response = await adminAPI.getBusinessSettings()
      if (response.data?.success && response.data.data) {
        const mode = response.data.data.deliveryAssignmentMode || "automatic"
        setDeliveryAssignmentMode(mode)
      }
    } catch (error) {
      console.error("Error fetching delivery assignment mode:", error)
    } finally {
      setModeLoading(false)
    }
  }

  const handleToggleAssignmentMode = async (checked) => {
    const newMode = checked ? "manual" : "automatic"
    try {
      setModeSaving(true)
      setDeliveryAssignmentMode(newMode)
      const response = await adminAPI.updateBusinessSettings({
        deliveryAssignmentMode: newMode,
      })
      if (response.data?.success) {
        toast.success(
          newMode === "manual"
            ? "Zone-based delivery enabled. Only riders assigned to a zone will get orders."
            : "Nearest-delivery-boy mode enabled. Orders will go to nearby riders.",
        )
      }
    } catch (error) {
      console.error("Error updating delivery assignment mode:", error)
      toast.error(
        error?.response?.data?.message ||
          "Failed to update delivery assignment mode",
      )
    } finally {
      setModeSaving(false)
    }
  }


  const handleDeleteZone = async (zoneId) => {
    if (!window.confirm("Are you sure you want to delete this zone?")) {
      return
    }
    try {
      await adminAPI.deleteZone(zoneId)
      alert("Zone deleted successfully!")
      fetchZones()
    } catch (error) {
      console.error("Error deleting zone:", error)
      alert(error.response?.data?.message || "Failed to delete zone")
    }
  }

   const openAssignDialog = async (zone) => {
     if (!isZoneModeOn) {
       toast.error("Zone-based Delivery ON karo tab hi delivery boys assign kar sakte ho.")
       return
     }
    setSelectedZone(zone)
    setAssignDialogOpen(true)
    try {
      setDeliveryLoading(true)
      const response = await adminAPI.getDeliveryPartners({
        page: 1,
        limit: 100,
        isActive: true,
        includeAvailability: true,
      })
      const list =
        response.data?.data?.deliveryPartners ||
        response.data?.deliveryPartners ||
        []

      const zoneId = (zone._id || zone.id || "").toString()

      const enhanced = list.map((partner) => {
        const zones =
          partner.availability?.zones ||
          partner.fullData?.availability?.zones ||
          []
        const hasZone = zones.some(
          (z) => z && z.toString && z.toString() === zoneId,
        )
        return {
          ...partner,
          isAssignedToZone: hasZone,
        }
      })

      setDeliveryPartners(enhanced)
    } catch (error) {
      console.error("Error loading delivery partners for zone:", error)
      toast.error(
        error?.response?.data?.message ||
          "Failed to load delivery boys for this zone",
      )
      setDeliveryPartners([])
    } finally {
      setDeliveryLoading(false)
    }
  }

  const closeAssignDialog = () => {
    setAssignDialogOpen(false)
    setSelectedZone(null)
    setDeliveryPartners([])
    setDeliverySearch("")
    setUpdatingPartnerId(null)
  }

  const handleAssignPartnerToZone = async (partnerId) => {
    if (!selectedZone) return
    const zoneId = (selectedZone._id || selectedZone.id || "").toString()
    try {
      setUpdatingPartnerId(partnerId)
      await adminAPI.updateDeliveryPartnerZone(partnerId, zoneId)

      setDeliveryPartners((prev) =>
        prev.map((p) =>
          p._id === partnerId
            ? {
                ...p,
                isAssignedToZone: true,
              }
            : p,
        ),
      )
      toast.success("Delivery boy assigned to zone")
    } catch (error) {
      console.error("Error assigning delivery partner to zone:", error)
      toast.error(
        error?.response?.data?.message ||
          "Failed to assign delivery boy to zone",
      )
    } finally {
      setUpdatingPartnerId(null)
    }
  }

  const filteredDeliveryPartners = deliveryPartners.filter((p) => {
    if (!deliverySearch.trim()) return true
    const q = deliverySearch.toLowerCase()
    return (
      p.name?.toLowerCase().includes(q) ||
      p.phone?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q)
    )
  })

  const filteredZones = zones.filter(zone =>
    zone.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    zone.serviceLocation?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="p-2 lg:p-3 bg-slate-50 min-h-screen">
      <div className="w-full mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div className="flex items-center gap-3 mb-4 md:mb-0">
            <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Service Zone Setup</h1>
              <p className="text-sm text-slate-600">Manage service zones for user,delivery,restaurants</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {canManageAssignment && (
              <div className="flex flex-col items-end gap-1 mr-2">
                <div className="flex items-center gap-2 text-xs text-slate-700">
                  <span>Zone-based Delivery</span>
                  <Switch
                    checked={deliveryAssignmentMode === "manual"}
                    onCheckedChange={handleToggleAssignmentMode}
                    disabled={modeLoading || modeSaving}
                  />
                </div>
                <p className="text-[11px] text-slate-500 max-w-xs text-right">
                   {isZoneModeOn
                    ? "ON: Orders go only to delivery boys assigned to the restaurant’s zone."
                    : "OFF: Orders go to the nearest available delivery boys."}
                </p>
              </div>
            )}
            <button
              onClick={() => navigate("/admin/zone-setup/map")}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Map className="w-5 h-5" />
              <span>View Map</span>
            </button>
            <button
              onClick={() => navigate("/admin/zone-setup/add")}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              <span>Add Zone</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search zones by name or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Zones List */}
        {loading ? (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-slate-600">Loading zones...</p>
          </div>
        ) : filteredZones.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center">
            <MapPin className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No zones found</h3>
            <p className="text-slate-600 mb-6">
              {searchQuery ? "Try adjusting your search query" : "Create your first delivery zone to get started"}
            </p>
            {!searchQuery && (
              <button
                onClick={() => navigate("/admin/zone-setup/add")}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>Add Zone</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredZones.map((zone) => (
              <div
                key={zone._id || zone.id}
                className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-900 mb-1">{zone.name || "Unnamed Zone"}</h3>
                    <p className="text-sm text-slate-600">{zone.serviceLocation || "N/A"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/admin/zone-setup/view/${zone._id || zone.id}`)}
                      className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="View"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => navigate(`/admin/zone-setup/edit/${zone._id || zone.id}`)}
                      className="p-2 text-slate-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteZone(zone._id || zone.id)}
                      className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Unit:</span>
                    <span className="font-medium text-slate-900">{zone.unit || "km"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Status:</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      zone.isActive ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-800"
                    }`}>
                      {zone.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {zone.coordinates && zone.coordinates.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Points:</span>
                      <span className="font-medium text-slate-900">{zone.coordinates.length}</span>
                    </div>
                  )}
                   {canManageAssignment && (
                    <div className="pt-3 mt-2 border-t border-slate-100 flex justify-end">
                      <button
                        type="button"
                         onClick={() => openAssignDialog(zone)}
                         disabled={!isZoneModeOn}
                         className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                           isZoneModeOn
                             ? "border-slate-300 text-slate-700 hover:bg-slate-50"
                             : "border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed"
                         }`}
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Assign Delivery Boys</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {canManageAssignment && (
        <Dialog
          open={assignDialogOpen}
          onOpenChange={(open) =>
            open ? setAssignDialogOpen(true) : closeAssignDialog()
          }
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-lg font-semibold text-slate-900">
                Assign Delivery Boys
                {selectedZone ? ` – ${selectedZone.name || "Zone"}` : ""}
              </DialogTitle>
              <p className="text-sm text-slate-600">
                Choose which delivery boys should receive orders for this zone
                when zone-based delivery is enabled.
              </p>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  Total delivery boys:{" "}
                  <span className="font-medium text-slate-700">
                    {deliveryPartners.length}
                  </span>
                </div>
                <Input
                  placeholder="Search by name or phone..."
                  value={deliverySearch}
                  onChange={(e) => setDeliverySearch(e.target.value)}
                  className="max-w-xs h-9"
                />
              </div>

              <div className="border rounded-lg bg-white max-h-80 overflow-y-auto">
                {deliveryLoading ? (
                  <div className="flex items-center justify-center py-10 text-sm text-slate-600">
                    <span className="mr-2">
                      <div className="h-4 w-4 border-b-2 border-slate-500 rounded-full animate-spin" />
                    </span>
                    Loading delivery boys...
                  </div>
                ) : filteredDeliveryPartners.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-600">
                    No delivery boys found. Approve or create delivery partners first.
                  </div>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50 text-left text-slate-500">
                        <th className="py-2 px-3 font-medium">Delivery Boy</th>
                        <th className="py-2 px-3 hidden md:table-cell font-medium">
                          Phone
                        </th>
                        <th className="py-2 px-3 font-medium text-center">
                          Assigned to this zone
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDeliveryPartners.map((partner) => (
                        <tr key={partner._id} className="border-b last:border-0">
                          <td className="py-2 px-3">
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-900">
                                {partner.name || "N/A"}
                              </span>
                              <span className="text-xs text-slate-500 md:hidden">
                                {partner.phone || partner.email || ""}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-3 hidden md:table-cell text-slate-700">
                            {partner.phone || "N/A"}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() =>
                                handleAssignPartnerToZone(partner._id)
                              }
                              disabled={
                                partner.isAssignedToZone ||
                                updatingPartnerId === partner._id
                              }
                              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border ${
                                partner.isAssignedToZone
                                  ? "border-green-200 bg-green-50 text-green-700"
                                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              <Checkbox
                                checked={partner.isAssignedToZone}
                                className="w-3.5 h-3.5 border-2 border-slate-300 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 mr-1"
                                readOnly
                              />
                              {partner.isAssignedToZone
                                ? "Assigned"
                                : updatingPartnerId === partner._id
                                ? "Assigning..."
                                : "Assign"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={closeAssignDialog}
                  className="px-4 py-2 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
