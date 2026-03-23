import { useEffect, useMemo, useState } from "react";
import { Search, Eye, Loader2 } from "lucide-react";
import { adminAPI } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STATUS_OPTIONS = ["all", "new", "read", "resolved"];

export default function CustomerContactUs() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState(null);

  useEffect(() => {
    fetchMessages();
  }, [currentPage, searchQuery, statusFilter]);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const params = {
        page: currentPage,
        limit: 10,
        status: statusFilter !== "all" ? statusFilter : undefined,
        search: searchQuery.trim() || undefined,
      };
      Object.keys(params).forEach(
        (key) => params[key] === undefined && delete params[key],
      );

      const response = await adminAPI.getCustomerContactUsMessages(params);
      if (response.data?.success) {
        setMessages(response.data.data?.messages || []);
        setTotalPages(response.data.data?.pagination?.pages || 1);
      } else {
        setMessages([]);
        setTotalPages(1);
      }
    } catch (error) {
      setMessages([]);
      setTotalPages(1);
      toast.error(
        error.response?.data?.message || "Failed to load customer contact us",
      );
    } finally {
      setLoading(false);
    }
  };

  const filteredMessages = useMemo(() => messages, [messages]);

  const handleStatusChange = async (id, status) => {
    try {
      setUpdatingStatusId(id);
      const response = await adminAPI.updateCustomerContactUsMessageStatus(
        id,
        status,
      );
      if (response.data?.success) {
        setMessages((prev) =>
          prev.map((item) => (item._id === id ? { ...item, status } : item)),
        );
        toast.success("Status updated");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update status");
    } finally {
      setUpdatingStatusId(null);
    }
  };

  if (loading && messages.length === 0) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading customer contact messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">Customer Contact Us</h1>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
              {messages.length}
            </span>
          </div>
          <div className="flex gap-3">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status === "all"
                    ? "All Status"
                    : status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
            <div className="relative min-w-[250px]">
              <input
                type="text"
                placeholder="Search by name, phone, email"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Name</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Phone</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Email</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Message</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Status</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Date</th>
                <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-700 uppercase">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredMessages.length === 0 ? (
                <tr>
                  <td className="px-6 py-8 text-center text-slate-500" colSpan={7}>
                    No customer contact us records found
                  </td>
                </tr>
              ) : (
                filteredMessages.map((item) => (
                  <tr key={item._id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{item.name}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">{item.phone}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">{item.email}</td>
                    <td className="px-6 py-4 text-sm text-slate-700 max-w-[280px] truncate">{item.message}</td>
                    <td className="px-6 py-4">
                      <select
                        value={item.status}
                        disabled={updatingStatusId === item._id}
                        onChange={(e) => handleStatusChange(item._id, e.target.value)}
                        className="px-2 py-1 rounded-md border border-slate-300 text-xs bg-white"
                      >
                        <option value="new">New</option>
                        <option value="read">Read</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {new Date(item.createdAt).toLocaleString("en-IN")}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMessage(item);
                          setIsViewDialogOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium"
                      >
                        <Eye className="w-3 h-3" />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 rounded-md border border-slate-300 text-sm disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-sm text-slate-600">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 rounded-md border border-slate-300 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <DialogTitle className="text-xl font-bold text-slate-900">
              Customer Contact Detail
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Name</p>
                <p className="text-base font-medium text-slate-900">{selectedMessage?.name || "-"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</p>
                <p className="text-base font-medium text-slate-900">{selectedMessage?.phone || "-"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</p>
                <p className="text-base font-medium text-slate-900 break-all">{selectedMessage?.email || "-"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 capitalize">
                  {selectedMessage?.status || "-"}
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Message</p>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 whitespace-pre-wrap text-base text-slate-800 leading-relaxed min-h-[110px]">
                {selectedMessage?.message || "-"}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

