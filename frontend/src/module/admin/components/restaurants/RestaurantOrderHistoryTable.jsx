import { useMemo, useState, useEffect } from "react"
import { Eye, Printer, ArrowUpDown, Loader2 } from "lucide-react"

const currency = (n) => {
  const num = Number(n) || 0
  return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function RestaurantOrderHistoryTable({
  loading = false,
  orders = [],
  onViewOrder,
  onPrintOrder,
}) {
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 15
  const totalPages = Math.ceil((orders?.length || 0) / itemsPerPage) || 1

  useEffect(() => {
    setCurrentPage(1)
  }, [orders?.length])

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    const end = start + itemsPerPage
    return (orders || []).slice(start, end)
  }, [orders, currentPage])

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 py-16 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
      </div>
    )
  }

  if (!loading && (!orders || orders.length === 0)) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 py-16 text-center text-slate-600">
        No orders found for the selected restaurant and filters.
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                <div className="flex items-center gap-1.5">
                  <span>SI</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Order ID</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Date/Time</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Payment</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">Total</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">Restaurant</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">Admin</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {paginated.map((o, idx) => (
              <tr key={o.id || o.orderId}>
                <td className="px-4 py-3 text-sm text-slate-700">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                <td className="px-4 py-3 text-sm font-medium text-slate-900">{o.orderId}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{o.date}{o.time ? `, ${o.time}` : ""}</td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-800">{o.paymentType || "Online"}</span>
                    {o.paymentStatus && <span className={`text-xs ${o.paymentStatus === "Paid" ? "text-emerald-600" : "text-amber-600"}`}>{o.paymentStatus}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-right font-semibold text-slate-900">{currency(o.totalAmount ?? o.earnings?.orderTotal)}</td>
                <td className="px-4 py-3 text-sm text-right text-slate-800">{currency(o.earnings?.restaurantEarning)}</td>
                <td className="px-4 py-3 text-sm text-right text-slate-800">{currency(o.earnings?.adminEarning)}</td>
                <td className="px-4 py-3 text-sm">
                  <span className="inline-flex px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
                    {o.orderStatus || o.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => onViewOrder?.(o)}
                      className="p-1.5 rounded text-orange-600 hover:bg-orange-50"
                      title="View details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onPrintOrder?.(o)}
                      className="p-1.5 rounded text-blue-600 hover:bg-blue-50"
                      title="Print order"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Showing <span className="font-semibold">{(currentPage - 1) * itemsPerPage + 1}</span>–
            <span className="font-semibold">{Math.min(currentPage * itemsPerPage, orders.length)}</span> of{" "}
            <span className="font-semibold">{orders.length}</span> orders
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

