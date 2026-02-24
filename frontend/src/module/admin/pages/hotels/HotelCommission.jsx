import { useState, useMemo, useEffect } from "react"
import {
  Search, Edit, Loader2, Building2, Percent, Wallet, TrendingUp, IndianRupee
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"

export default function HotelCommission() {
  const [searchQuery, setSearchQuery] = useState("")
  const [hotels, setHotels] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [editDialog, setEditDialog] = useState(null)
  const [stats, setStats] = useState({
    totalHotelCommission: 0,
    totalAdminHotelCommission: 0,
    totalCombinedCommission: 0,
    totalHotelWithdrawals: 0,
  })

  // Fetch hotels on component mount
  useEffect(() => {
    fetchHotels()
    fetchStats()
  }, [])

  const fetchHotels = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getHotels({
        limit: 1000,
        status: "active" // Only show active hotels
      })

      if (response.data && response.data.success && response.data.data) {
        const hotelsData = response.data.data.hotels || []
        setHotels(hotelsData)
      } else {
        setHotels([])
      }
    } catch (err) {
      console.error("Error fetching hotels:", err)
      toast.error("Failed to fetch hotels")
      setHotels([])
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await adminAPI.getHotelCommissionStats()
      if (response.data && response.data.success) {
        setStats(response.data.data)
      }
    } catch (err) {
      console.error("Error fetching hotel stats:", err)
    }
  }

  const filteredHotels = useMemo(() => {
    if (!searchQuery.trim()) {
      return hotels
    }

    const query = searchQuery.toLowerCase().trim()
    return hotels.filter(hotel =>
      hotel.hotelName?.toLowerCase().includes(query) ||
      hotel.hotelId?.toLowerCase().includes(query) ||
      hotel.email?.toLowerCase().includes(query) ||
      hotel.phone?.includes(query)
    )
  }, [hotels, searchQuery])

  const handleEdit = (hotel) => {
    setEditDialog({
      _id: hotel._id,
      hotelName: hotel.hotelName || "",
      hotelId: hotel.hotelId || "",
      commission: hotel.commission !== undefined ? hotel.commission : 0,
      adminCommission: hotel.adminCommission !== undefined ? hotel.adminCommission : 0,
    })
  }

  const handleUpdate = async () => {
    if (!editDialog) return

    const commission = parseFloat(editDialog.commission)
    const adminCommission = parseFloat(editDialog.adminCommission)

    if (isNaN(commission) || commission < 0 || commission > 100) {
      toast.error("Please enter a valid hotel commission percentage (0-100)")
      return
    }

    if (isNaN(adminCommission) || adminCommission < 0 || adminCommission > 100) {
      toast.error("Please enter a valid admin commission percentage (0-100)")
      return
    }

    // Check if total commission exceeds 100%
    if (commission + adminCommission > 100) {
      toast.error("Total commission (Hotel + Admin) cannot exceed 100%")
      return
    }

    try {
      setUpdating(true)
      await adminAPI.updateHotel(editDialog._id, {
        commission: commission,
        adminCommission: adminCommission
      })

      // Refresh the list
      await fetchHotels()

      toast.success(`Commissions updated successfully for ${editDialog.hotelName}`)
      setEditDialog(null)
    } catch (err) {
      console.error("Error updating commission:", err)
      toast.error(err.response?.data?.message || "Failed to update commission")
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hotel Commission</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage commission percentage for hotels (applied to orders from QR code scans)
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-lg">
            <Building2 className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Total Hotel Commission</p>
            <div className="flex items-center gap-1">
              <IndianRupee className="h-4 w-4 text-gray-900" />
              <p className="text-2xl font-bold text-gray-900">{(Number(stats.totalHotelCommission) || 0).toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-3 bg-green-50 rounded-lg">
            <Percent className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Total Admin Commission</p>
            <div className="flex items-center gap-1">
              <IndianRupee className="h-4 w-4 text-gray-900" />
              <p className="text-2xl font-bold text-gray-900">{(Number(stats.totalAdminHotelCommission) || 0).toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-3 bg-[#ff8100]/10 rounded-lg">
            <TrendingUp className="h-6 w-6 text-[#ff8100]" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Total Combined Earnings</p>
            <div className="flex items-center gap-1">
              <IndianRupee className="h-4 w-4 text-gray-900" />
              <p className="text-2xl font-bold text-gray-900">{(Number(stats.totalCombinedCommission) || 0).toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-3 bg-purple-50 rounded-lg">
            <Wallet className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Hotel Withdrawals</p>
            <div className="flex items-center gap-1">
              <IndianRupee className="h-4 w-4 text-gray-900" />
              <p className="text-2xl font-bold text-gray-900">
                {(Number(stats.totalHotelWithdrawals) || 0).toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search by hotel name, ID, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#ff8100]" />
        </div>
      )}

      {/* Hotels List */}
      {!loading && (
        <div className="bg-white rounded-lg shadow-sm border">
          {filteredHotels.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                No hotels found
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Hotel
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Hotel ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Hotel Commission
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Admin Commission
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Commission
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Earned (Hotel)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Earned (Admin)
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredHotels.map((hotel) => (
                    <tr key={hotel._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Building2 className="h-5 w-5 text-gray-400 mr-3" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {hotel.hotelName || "N/A"}
                            </div>
                            <div className="text-sm text-gray-500">
                              {hotel.email || "N/A"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {hotel.hotelId || "N/A"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Percent className="h-4 w-4 text-blue-400" />
                          <span className="text-sm font-medium text-blue-600">
                            {hotel.commission !== undefined && hotel.commission !== null
                              ? `${hotel.commission}%`
                              : "0%"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Percent className="h-4 w-4 text-green-400" />
                          <span className="text-sm font-medium text-green-600">
                            {hotel.adminCommission !== undefined && hotel.adminCommission !== null
                              ? `${hotel.adminCommission}%`
                              : "0%"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Percent className="h-4 w-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900">
                            {((hotel.commission || 0) + (hotel.adminCommission || 0)).toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <IndianRupee className="h-3.5 w-3.5 text-gray-900" />
                          <span className="text-sm font-semibold text-gray-900">
                            {(Number(hotel.earnings?.hotelCommission) || 0).toLocaleString('en-IN')}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <IndianRupee className="h-3.5 w-3.5 text-gray-700" />
                          <span className="text-sm font-medium text-gray-700">
                            {(Number(hotel.earnings?.adminCommission) || 0).toLocaleString('en-IN')}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleEdit(hotel)}
                          className="text-blue-600 hover:text-blue-900 p-2 hover:bg-blue-50 rounded"
                          title="Edit Commission"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit Commission Dialog */}
      <Dialog open={!!editDialog} onOpenChange={(open) => !open && setEditDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Hotel Commission</DialogTitle>
          </DialogHeader>

          {editDialog && (
            <div className="space-y-6 py-4">
              {/* Hotel Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-blue-900">{editDialog.hotelName}</p>
                <p className="text-xs text-blue-700 mt-1">ID: {editDialog.hotelId}</p>
              </div>

              {/* Commission Inputs */}
              <div className="space-y-4">
                {/* Hotel Commission */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <Label htmlFor="commission" className="text-sm font-semibold text-blue-900 block mb-2">
                    Hotel Commission (%) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="commission"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={editDialog.commission}
                    onChange={(e) => setEditDialog({ ...editDialog, commission: e.target.value })}
                    className="w-full h-11 text-base border-2 border-blue-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white"
                    placeholder="Enter hotel commission (0-100)"
                  />
                  <p className="text-xs text-blue-700 mt-2 leading-relaxed">
                    Percentage that hotel will receive from orders placed via QR code scans.
                  </p>
                </div>

                {/* Admin Commission */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <Label htmlFor="adminCommission" className="text-sm font-semibold text-green-900 block mb-2">
                    Admin Commission (%) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="adminCommission"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={editDialog.adminCommission}
                    onChange={(e) => setEditDialog({ ...editDialog, adminCommission: e.target.value })}
                    className="w-full h-11 text-base border-2 border-green-300 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 bg-white"
                    placeholder="Enter admin commission (0-100)"
                  />
                  <p className="text-xs text-green-700 mt-2 leading-relaxed">
                    Percentage that admin will receive from orders placed via QR code scans.
                  </p>
                </div>

                {/* Total Commission Display */}
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">Total Commission:</span>
                    <span className={`text-lg font-bold ${(parseFloat(editDialog.commission || 0) + parseFloat(editDialog.adminCommission || 0)) > 100
                      ? "text-red-600"
                      : (parseFloat(editDialog.commission || 0) + parseFloat(editDialog.adminCommission || 0)) === 100
                        ? "text-green-600"
                        : "text-gray-900"
                      }`}>
                      {(parseFloat(editDialog.commission || 0) + parseFloat(editDialog.adminCommission || 0)).toFixed(1)}%
                    </span>
                  </div>
                  {(parseFloat(editDialog.commission || 0) + parseFloat(editDialog.adminCommission || 0)) > 100 && (
                    <p className="text-xs text-red-600 mt-2">
                      ⚠️ Total commission cannot exceed 100%
                    </p>
                  )}
                  {(parseFloat(editDialog.commission || 0) + parseFloat(editDialog.adminCommission || 0)) < 100 && (
                    <p className="text-xs text-gray-500 mt-2">
                      Remaining: {(100 - (parseFloat(editDialog.commission || 0) + parseFloat(editDialog.adminCommission || 0))).toFixed(1)}%
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEditDialog(null)}
              className="px-6"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={
                updating ||
                !editDialog ||
                !editDialog.commission ||
                !editDialog.adminCommission ||
                parseFloat(editDialog.commission) < 0 ||
                parseFloat(editDialog.commission) > 100 ||
                parseFloat(editDialog.adminCommission) < 0 ||
                parseFloat(editDialog.adminCommission) > 100 ||
                (parseFloat(editDialog.commission || 0) + parseFloat(editDialog.adminCommission || 0)) > 100
              }
              className="bg-[#ff8100] hover:bg-[#ff8100]/90 px-6"
            >
              {updating ? "Updating..." : "Update Commissions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
