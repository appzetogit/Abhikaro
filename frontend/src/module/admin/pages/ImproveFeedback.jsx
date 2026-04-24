import { useEffect, useMemo, useState } from "react"
import { Eye, Folder, Loader2, Search, Settings, Trash2, MessageSquare } from "lucide-react"
import { toast } from "sonner"
import apiClient from "@/lib/api/axios"
import { API_ENDPOINTS } from "@/lib/api/config"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function ImproveFeedback() {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [feedbacks, setFeedbacks] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const [selected, setSelected] = useState(null)
  const [isViewOpen, setIsViewOpen] = useState(false)

  useEffect(() => {
    fetchFeedbacks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, currentPage, searchQuery])

  const fetchFeedbacks = async () => {
    try {
      setLoading(true)
      const params = {
        page: currentPage,
        limit: 10,
        status: statusFilter !== "all" ? statusFilter : undefined,
        search: searchQuery.trim() || undefined,
      }
      Object.keys(params).forEach((k) => params[k] === undefined && delete params[k])

      const res = await apiClient.get(API_ENDPOINTS.ADMIN.FEEDBACK, { params })
      if (res.data?.success) {
        setFeedbacks(res.data.data?.feedbacks || [])
        setTotalPages(res.data.data?.pagination?.pages || 1)
      } else {
        setFeedbacks([])
        setTotalPages(1)
      }
    } catch (e) {
      setFeedbacks([])
      setTotalPages(1)
      toast.error(e?.response?.data?.message || e?.message || "Failed to load improve feedback")
    } finally {
      setLoading(false)
    }
  }

  const filteredFeedbacks = useMemo(() => {
    if (!searchQuery.trim()) return feedbacks
    const q = searchQuery.toLowerCase().trim()
    return feedbacks.filter((f) => {
      return (
        f.userName?.toLowerCase()?.includes(q) ||
        f.userEmail?.toLowerCase()?.includes(q) ||
        f.message?.toLowerCase()?.includes(q)
      )
    })
  }, [feedbacks, searchQuery])

  const getStatusBadge = (status) => {
    const cfg = {
      unread: { label: "Unread", className: "bg-blue-100 text-blue-700" },
      read: { label: "Read", className: "bg-slate-100 text-slate-700" },
      replied: { label: "Replied", className: "bg-green-100 text-green-700" },
    }
    const s = cfg[status] || cfg.unread
    return <span className={`px-3 py-1 rounded-full text-xs font-medium ${s.className}`}>{s.label}</span>
  }

  const handleView = (f) => {
    setSelected(f)
    setIsViewOpen(true)
  }

  const handleToggleRead = async (id, currentStatus) => {
    try {
      const next = currentStatus === "unread" ? "read" : "unread"
      const url = `${API_ENDPOINTS.ADMIN.FEEDBACK}/${id}/status`
      const res = await apiClient.put(url, { status: next })
      if (res.data?.success) {
        toast.success("Status updated")
        fetchFeedbacks()
      } else {
        toast.error("Failed to update status")
      }
    } catch (e) {
      toast.error("Failed to update status")
    }
  }

  const handleDelete = async (id) => {
    if (!confirm("Delete this feedback?")) return
    try {
      const url = `${API_ENDPOINTS.ADMIN.FEEDBACK}/${id}`
      const res = await apiClient.delete(url)
      if (res.data?.success) {
        toast.success("Feedback deleted")
        fetchFeedbacks()
      } else {
        toast.error("Failed to delete feedback")
      }
    } catch (e) {
      toast.error("Failed to delete feedback")
    }
  }

  if (loading && feedbacks.length === 0) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-green-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading improve feedback...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-green-600" />
            <h1 className="text-2xl font-bold text-slate-900">Improve Feedback</h1>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
              {feedbacks.length}
            </span>
          </div>

          <div className="flex gap-3">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setCurrentPage(1)
              }}
              className="px-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
            >
              <option value="all">All Status</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
              <option value="replied">Replied</option>
            </select>

            <div className="relative flex-1 sm:flex-initial min-w-[250px]">
              <input
                type="text"
                placeholder="Search by name, email, message"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
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
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">SI</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Name</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Email</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Message</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center justify-center gap-2">
                    <span>Action</span>
                    <Settings className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {filteredFeedbacks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20">
                    <div className="flex flex-col items-center justify-center">
                      <div className="relative mb-6">
                        <div className="w-32 h-32 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center shadow-inner">
                          <div className="w-20 h-20 bg-white rounded-xl flex items-center justify-center shadow-md relative overflow-visible">
                            <Folder className="w-12 h-12 text-slate-400" />
                          </div>
                        </div>
                      </div>
                      <p className="text-lg font-semibold text-slate-700">No Improve Feedback Found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredFeedbacks.map((f, idx) => (
                  <tr key={f._id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-700">{(currentPage - 1) * 10 + idx + 1}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-slate-900">{f.userName || "N/A"}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-slate-700">{f.userEmail || "N/A"}</span>
                    </td>
                    <td className="px-6 py-4 max-w-md">
                      <span className="text-sm text-slate-700 line-clamp-2">{f.message || ""}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(f.status)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1.5 rounded text-slate-600 hover:bg-slate-100 transition-colors">
                            <Settings className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleView(f)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleRead(f._id, f.status)}>
                            Mark as {f.status === "unread" ? "Read" : "Unread"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(f._id)} className="text-red-600">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-700">
            <DialogTitle className="text-2xl font-bold text-slate-900 dark:text-white">
              Improve Feedback Details
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Feedback sent from the user “Send feedback” screen (not order feedback)
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="px-6 py-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Name</p>
                  <p className="text-sm font-semibold text-slate-900">{selected.userName || "N/A"}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Email</p>
                  <p className="text-sm font-semibold text-slate-900 break-all">{selected.userEmail || "N/A"}</p>
                </div>
              </div>

              <div className="bg-white rounded-lg p-4 border border-slate-200">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Message</p>
                <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{selected.message || ""}</p>
              </div>

              <div className="flex items-center justify-between">
                <div>{getStatusBadge(selected.status)}</div>
                <Button variant="outline" onClick={() => setIsViewOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

