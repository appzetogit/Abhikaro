import { useState, useEffect } from "react"
import { Settings, Save, Loader2, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"

export default function OrderSetting() {
  const [deliveryAssignmentMode, setDeliveryAssignmentMode] = useState("automatic")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Fetch current settings
  const fetchSettings = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getBusinessSettings()
      if (response.data?.success && response.data.data) {
        const mode = response.data.data.deliveryAssignmentMode || "automatic"
        setDeliveryAssignmentMode(mode)
      }
    } catch (error) {
      console.error("Error fetching order settings:", error)
      toast.error("Failed to load order settings")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  // Save settings
  const handleSave = async () => {
    try {
      setSaving(true)
      const response = await adminAPI.updateBusinessSettings({
        deliveryAssignmentMode,
      })

      if (response.data?.success) {
        toast.success("Order settings saved successfully")
      } else {
        toast.error(response.data?.message || "Failed to save settings")
      }
    } catch (error) {
      console.error("Error saving order settings:", error)
      toast.error(error.response?.data?.message || "Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      {/* Header Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
            <Settings className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Order Setting</h1>
            <p className="text-sm text-slate-600 mt-1">
              Configure delivery assignment mode for orders
            </p>
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-900 mb-2">
                  Delivery Assignment Mode
                </h2>
                <p className="text-sm text-slate-600 mb-6">
                  Choose how delivery partners are assigned to orders
                </p>

                {/* Toggle Switch */}
                <div className="flex items-center gap-4 p-6 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-lg font-semibold text-slate-900">
                        {deliveryAssignmentMode === "automatic" ? "Automatic" : "Manual"}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        deliveryAssignmentMode === "automatic"
                          ? "bg-green-100 text-green-800"
                          : "bg-blue-100 text-blue-800"
                      }`}>
                        {deliveryAssignmentMode === "automatic" ? "Active" : "Active"}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">
                      {deliveryAssignmentMode === "automatic" ? (
                        <>
                          Orders will be automatically assigned to nearby delivery partners when restaurant accepts the order.
                        </>
                      ) : (
                        <>
                          Orders will be available for manual assignment in the admin panel when restaurant accepts the order.
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setDeliveryAssignmentMode(
                        deliveryAssignmentMode === "automatic" ? "manual" : "automatic"
                      )
                    }}
                    className={`relative inline-flex h-11 w-20 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      deliveryAssignmentMode === "automatic"
                        ? "bg-green-600"
                        : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-9 w-9 transform rounded-full bg-white transition-transform ${
                        deliveryAssignmentMode === "automatic"
                          ? "translate-x-10"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Info Box */}
                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-blue-900 mb-2">
                        {deliveryAssignmentMode === "automatic" ? "Automatic Mode" : "Manual Mode"}
                      </h3>
                      <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                        {deliveryAssignmentMode === "automatic" ? (
                          <>
                            <li>When restaurant accepts an order, the system automatically finds nearby delivery partners</li>
                            <li>Delivery partners receive notification and can accept the order</li>
                            <li>First come first serve basis</li>
                            <li>No manual intervention required</li>
                          </>
                        ) : (
                          <>
                            <li>When restaurant accepts an order, it appears in the manual assignment page</li>
                            <li>Admin can view all pending orders and available delivery partners</li>
                            <li>Admin manually selects which delivery partner to assign to each order</li>
                            <li>Full control over order assignments</li>
                          </>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-200">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Settings
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
