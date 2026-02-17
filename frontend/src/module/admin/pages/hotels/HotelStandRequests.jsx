import { useEffect, useState, useMemo } from "react";
import { adminAPI } from "@/lib/api";
import { Loader2, Search, Building2, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function HotelStandRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("requested"); // requested | approved | all
  const [approvingId, setApprovingId] = useState(null);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminAPI.getHotelStandRequests({
        status: statusFilter,
      });
      if (response.data?.success) {
        setRequests(response.data.data.requests || []);
      } else {
        setRequests([]);
      }
    } catch (err) {
      console.error("Error fetching hotel stand requests:", err);
      setError(
        err.response?.data?.message ||
          "Failed to fetch hotel stand requests. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filteredRequests = useMemo(() => {
    if (!searchQuery.trim()) return requests;
    const q = searchQuery.toLowerCase().trim();
    return requests.filter((hotel) => {
      return (
        hotel.hotelName?.toLowerCase().includes(q) ||
        hotel.email?.toLowerCase().includes(q) ||
        hotel.phone?.toLowerCase().includes(q) ||
        hotel.address?.toLowerCase().includes(q) ||
        hotel.hotelId?.toLowerCase().includes(q)
      );
    });
  }, [requests, searchQuery]);

  const handleApprove = async (id) => {
    if (!id) return;
    setApprovingId(id);
    try {
      const response = await adminAPI.approveHotelStandRequest(id);
      if (response.data?.success) {
        toast.success("Hotel stand request approved");
        // Update local state
        setRequests((prev) =>
          prev.map((h) =>
            h._id === id
              ? {
                  ...h,
                  standRequestStatus: "approved",
                  standApprovedAt:
                    response.data.data.hotel?.standApprovedAt || new Date().toISOString(),
                }
              : h,
          ),
        );
      } else {
        toast.error(
          response.data?.message || "Failed to approve stand request",
        );
      }
    } catch (err) {
      console.error("Error approving hotel stand request:", err);
      toast.error(
        err.response?.data?.message ||
          "Failed to approve stand request. Please try again.",
      );
    } finally {
      setApprovingId(null);
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hotel Stand Requests</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage hotel stand requests and approvals
          </p>
        </div>
      </div>

      {/* Tabs / Status filter */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setStatusFilter("requested")}
          className={`px-4 py-2 font-medium transition-colors ${
            statusFilter === "requested"
              ? "text-[#ff8100] border-b-2 border-[#ff8100]"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Requested
        </button>
        <button
          onClick={() => setStatusFilter("approved")}
          className={`px-4 py-2 font-medium transition-colors ${
            statusFilter === "approved"
              ? "text-[#ff8100] border-b-2 border-[#ff8100]"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Approved
        </button>
        <button
          onClick={() => setStatusFilter("all")}
          className={`px-4 py-2 font-medium transition-colors ${
            statusFilter === "all"
              ? "text-[#ff8100] border-b-2 border-[#ff8100]"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          All
        </button>
      </div>

      {/* Search */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search by hotel name, email, phone, address, or hotel ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#ff8100]" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Requests list */}
      {!loading && !error && (
        <div className="bg-white rounded-lg shadow-sm border">
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No hotel stand requests found</p>
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
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Address
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Request Info
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredRequests.map((hotel) => (
                    <tr key={hotel._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Building2 className="h-5 w-5 text-gray-400 mr-3" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {hotel.hotelName || "N/A"}
                            </div>
                            {hotel.hotelId && (
                              <div className="text-xs text-gray-500">
                                ID: {hotel.hotelId}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        <div className="space-y-1">
                          <div>{hotel.phone || "N/A"}</div>
                          <div className="text-xs text-gray-500">
                            {hotel.email || "N/A"}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 max-w-xs">
                        <div className="line-clamp-3">
                          {hotel.address || hotel.location?.formattedAddress || "N/A"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        <div className="space-y-1">
                          <div>
                            <span className="font-medium">Status:</span>{" "}
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                hotel.standRequestStatus === "approved"
                                  ? "bg-green-100 text-green-700"
                                  : hotel.standRequestStatus === "requested"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {hotel.standRequestStatus
                                ? hotel.standRequestStatus.charAt(0).toUpperCase() +
                                  hotel.standRequestStatus.slice(1)
                                : "None"}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            <span className="font-medium">Requested:</span>{" "}
                            {formatDateTime(hotel.standRequestedAt)}
                          </div>
                          {hotel.standApprovedAt && (
                            <div className="text-xs text-gray-500">
                              <span className="font-medium">Approved:</span>{" "}
                              {formatDateTime(hotel.standApprovedAt)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {hotel.standRequestStatus === "approved" ? (
                          <span className="inline-flex items-center text-green-600 gap-1">
                            <CheckCircle2 className="h-4 w-4" />
                            Approved
                          </span>
                        ) : (
                          <button
                            onClick={() => handleApprove(hotel._id)}
                            disabled={approvingId === hotel._id}
                            className="inline-flex items-center px-3 py-1 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {approvingId === hotel._id ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Approving...
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Approve
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
