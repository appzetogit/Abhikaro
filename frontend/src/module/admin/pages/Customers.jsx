import { useState, useMemo, useEffect, useCallback } from "react"
import { Search, Download, ChevronDown, ChevronLeft, ChevronRight, Calendar, Eye, FileDown, FileSpreadsheet, FileText, Mail, Phone, MapPin, Package, DollarSign, Calendar as CalendarIcon, User, CheckCircle, XCircle, Pencil, Trash2, Wallet, IndianRupee, Clock3, Loader2 } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { exportCustomersToCSV, exportCustomersToExcel, exportCustomersToPDF } from "../components/customers/customersExportUtils"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import ViewOrderDialog from "../components/orders/ViewOrderDialog"

const getCachedCustomers = () => {
  try {
    const cached = sessionStorage.getItem("admin_customers_cache")
    return cached ? JSON.parse(cached) : []
  } catch {
    return []
  }
}

export default function Customers() {
  const [searchQuery, setSearchQuery] = useState("")
  const [customers, setCustomers] = useState(() => getCachedCustomers())
  const [loading, setLoading] = useState(() => getCachedCustomers().length === 0)
  const [totalCustomers, setTotalCustomers] = useState(() => getCachedCustomers().length)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 15
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [userDetails, setUserDetails] = useState(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [showUserDetails, setShowUserDetails] = useState(false)

  const [isEditOpen, setIsEditOpen] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editForm, setEditForm] = useState({
    id: "",
    name: "",
    email: "",
    phone: "",
    gender: "",
    dateOfBirth: "",
  })

  const [isWalletOpen, setIsWalletOpen] = useState(false)
  const [savingWallet, setSavingWallet] = useState(false)
  const [walletCustomer, setWalletCustomer] = useState(null)
  const [walletForm, setWalletForm] = useState({
    id: "",
    type: "addition",
    amount: "",
    reason: "",
  })

  // Wallet history dialog state
  const [isWalletHistoryOpen, setIsWalletHistoryOpen] = useState(false)
  const [walletHistoryLoading, setWalletHistoryLoading] = useState(false)
  const [walletHistoryItems, setWalletHistoryItems] = useState([])
  const [walletHistoryPage, setWalletHistoryPage] = useState(1)
  const [walletHistoryPages, setWalletHistoryPages] = useState(1)
  const [walletHistoryCustomer, setWalletHistoryCustomer] = useState(null)

  // Shared order view dialog state
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [isOrderViewOpen, setIsOrderViewOpen] = useState(false)
  const [viewOrderLoading, setViewOrderLoading] = useState(false)

  const openOrder = async (orderId) => {
    if (!orderId) return
    try {
      setViewOrderLoading(true)
      const res = await adminAPI.getOrderById(orderId)
      const found = res?.data?.data?.order || null
      if (found) {
        setSelectedOrder(found)
        setIsOrderViewOpen(true)
      } else {
        toast.error("Order details not found")
      }
    } catch (e) {
      console.error("Error opening order details:", e)
      toast.error("Failed to load order details")
    } finally {
      setViewOrderLoading(false)
    }
  }

  const formatCurrency = useCallback((amount) => {
    if (amount == null) return "₹0.00"
    return `₹${Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }, [])

  const getInitials = useCallback((name) => {
    const n = String(name || "").trim()
    if (!n) return "U"
    const parts = n.split(/\s+/).filter(Boolean)
    const first = parts[0]?.[0] || "U"
    const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : ""
    return (first + second).toUpperCase()
  }, [])

  const getOrderStatusPill = useCallback((status) => {
    const s = String(status || "").toLowerCase()
    if (s === "delivered") return "bg-emerald-50 text-emerald-700 border-emerald-200"
    if (s === "cancelled") return "bg-red-50 text-red-700 border-red-200"
    if (s === "out_for_delivery") return "bg-blue-50 text-blue-700 border-blue-200"
    if (s === "ready" || s === "preparing" || s === "confirmed") return "bg-amber-50 text-amber-700 border-amber-200"
    return "bg-slate-50 text-slate-700 border-slate-200"
  }, [])

  const userOrders = useMemo(() => {
    const orders = Array.isArray(userDetails?.orders) ? userDetails.orders : []
    const byKey = new Map()
    for (const o of orders) {
      const key = o?.orderId ?? o?.id ?? o?._id
      // If we can't determine a stable key, keep the item but don't let it collide
      const mapKey = key != null ? String(key) : `__idx_${byKey.size}`
      if (!byKey.has(mapKey)) byKey.set(mapKey, o)
    }
    return Array.from(byKey.values())
  }, [userDetails?.orders])

  const derivedTotalOrders = useMemo(() => {
    const apiCount = Number(userDetails?.totalOrders)
    if (Number.isFinite(apiCount)) return apiCount

    // Fallback (API didn't send totals): count delivered within available list
    return userOrders.reduce((acc, order) => {
      const status = String(order?.status || "").toLowerCase()
      return status === "delivered" ? acc + 1 : acc
    }, 0)
  }, [userDetails?.totalOrders, userOrders])

  const derivedDeliveredSpent = useMemo(() => {
    const apiAmount = Number(userDetails?.totalOrderAmount)
    if (Number.isFinite(apiAmount)) return apiAmount

    const sum = userOrders.reduce((acc, order) => {
      const status = String(order?.status || "").toLowerCase()
      if (status !== "delivered") return acc

      const raw =
        order?.total ??
        order?.totalAmount ??
        order?.grandTotal ??
        order?.payableAmount ??
        0

      const value = Number(raw)
      return acc + (Number.isFinite(value) ? value : 0)
    }, 0)
    return sum
  }, [userDetails?.totalOrderAmount, userOrders])

  // Wallet adjust OTP gate (admin phone)
  const [isWalletOtpOpen, setIsWalletOtpOpen] = useState(false)
  const [walletOtpCustomer, setWalletOtpCustomer] = useState(null)
  const [walletOtp, setWalletOtp] = useState("")
  const [walletOtpDestination, setWalletOtpDestination] = useState("")
  const [sendingWalletOtp, setSendingWalletOtp] = useState(false)
  const [verifyingWalletOtp, setVerifyingWalletOtp] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  const maskPhone = useCallback((value) => {
    if (value == null) return ""
    const digits = String(value).replace(/\D/g, "")
    if (!digits) return ""
    if (digits.length <= 4) return `******${digits}`
    return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`
  }, [])
  const [filters, setFilters] = useState({
    orderDate: "",
    joiningDate: "",
    status: "",
    sortBy: "",
    chooseFirst: "",
  })

  const filteredCustomers = useMemo(() => {
    let result = [...customers]

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(customer =>
        customer.name.toLowerCase().includes(query) ||
        customer.email.toLowerCase().includes(query) ||
        customer.phone.includes(query)
      )
    }

    // Filter by order date (if customer has order date field, otherwise skip)
    // Note: customersDummy doesn't have orderDate, so this is a placeholder for future implementation

    // Filter by joining date
    if (filters.joiningDate) {
      result = result.filter(customer => {
        // Parse joining date from format "17 Oct 2021"
        const customerDate = new Date(customer.joiningDate)
        const filterDate = new Date(filters.joiningDate)
        return customerDate.toDateString() === filterDate.toDateString()
      })
    }

    // Filter by status
    if (filters.status) {
      if (filters.status === "active") {
        result = result.filter(customer => customer.status === true)
      } else if (filters.status === "inactive") {
        result = result.filter(customer => customer.status === false)
      }
    }

    // Sort by options
    if (filters.sortBy) {
      if (filters.sortBy === "name-asc") {
        result.sort((a, b) => a.name.localeCompare(b.name))
      } else if (filters.sortBy === "name-desc") {
        result.sort((a, b) => b.name.localeCompare(a.name))
      } else if (filters.sortBy === "orders-asc") {
        result.sort((a, b) => a.totalOrder - b.totalOrder)
      } else if (filters.sortBy === "orders-desc") {
        result.sort((a, b) => b.totalOrder - a.totalOrder)
      }
    }

    // Limit results if "Choose First" is set
    if (filters.chooseFirst && parseInt(filters.chooseFirst) > 0) {
      result = result.slice(0, parseInt(filters.chooseFirst))
    }

    return result
  }, [customers, searchQuery, filters])

  // Reset page when search or filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, filters])

  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredCustomers.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredCustomers, currentPage, itemsPerPage])

  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage)

  const getPageNumbers = () => {
    const pages = []
    const range = 2 // Number of pages to show before and after current page

    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= currentPage - range && i <= currentPage + range)
      ) {
        pages.push(i)
      } else if (
        i === currentPage - range - 1 ||
        i === currentPage + range + 1
      ) {
        pages.push("...")
      }
    }

    // Remove duplicate ellipses
    return pages.filter((page, index) => {
      if (page === "...") {
        return pages[index - 1] !== "..."
      }
      return true
    })
  }

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }))
  }

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true)
      const params = {
        limit: 1000000, // Fetch all database users
        offset: 0,
        ...(searchQuery && { search: searchQuery }),
        ...(filters.status && { status: filters.status }),
        ...(filters.joiningDate && { joiningDate: filters.joiningDate }),
        ...(filters.sortBy && { sortBy: filters.sortBy }),
      }

      const response = await adminAPI.getUsers(params)
      const data = response?.data?.data || response?.data

      if (data?.users) {
        setCustomers(data.users)
        setTotalCustomers(data.total ?? data.users.length)
        try {
          if (!searchQuery && !filters.status && !filters.joiningDate && !filters.sortBy) {
            sessionStorage.setItem("admin_customers_cache", JSON.stringify(data.users))
          }
        } catch {}
      } else {
        setCustomers([])
        setTotalCustomers(0)
      }
    } catch (error) {
      console.error('Error fetching customers:', error)
      toast.error('Failed to load customers')
      setCustomers([])
      setTotalCustomers(0)
    } finally {
      setLoading(false)
    }
  }, [searchQuery, filters.status, filters.joiningDate, filters.sortBy])

  // Fetch customers from API on mount and when filters change
  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  // Refetch when page gains focus so order count/amount stay updated
  useEffect(() => {
    const onFocus = () => fetchCustomers()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchCustomers])

  useEffect(() => {
    if (!isWalletHistoryOpen || !walletHistoryCustomer?.id) return
    fetchWalletHistory(walletHistoryCustomer.id, 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWalletHistoryOpen, walletHistoryCustomer?.id])

  const handleToggleStatus = async (customerId) => {
    try {
      // Find customer
      const customer = customers.find(c => c.id === customerId)
      if (!customer) return

      const newStatus = !customer.status

      // Optimistically update UI
      setCustomers(customers.map(c =>
        c.id === customerId ? { ...c, status: newStatus } : c
      ))

      // Call API to update user status
      await adminAPI.updateUserStatus(customerId, newStatus)
      toast.success(`User ${newStatus ? 'activated' : 'deactivated'} successfully`)
    } catch (error) {
      console.error('Error updating status:', error)
      toast.error('Failed to update status')
      // Revert optimistic update
      setCustomers(customers.map(c =>
        c.id === customerId ? { ...c, status: !c.status } : c
      ))
    }
  }

  const handleViewDetails = async (customerId) => {
    try {
      setLoadingDetails(true)
      setShowUserDetails(true)
      setSelectedCustomer(customerId)

      const response = await adminAPI.getUserById(customerId, { ordersLimit: 2000 })
      const data = response?.data?.data || response?.data

      if (data?.user) {
        setUserDetails(data.user)
      } else {
        toast.error('Failed to load user details')
        setShowUserDetails(false)
      }
    } catch (error) {
      console.error('Error fetching user details:', error)
      toast.error('Failed to load user details')
      setShowUserDetails(false)
    } finally {
      setLoadingDetails(false)
    }
  }

  const openEdit = (customer) => {
    setEditForm({
      id: customer.id,
      name: customer.name === "N/A" ? "" : (customer.name || ""),
      email: customer.email === "N/A" ? "" : (customer.email || ""),
      phone: customer.phone === "N/A" ? "" : (customer.phone || ""),
      gender: customer.gender || "",
      dateOfBirth: customer.dateOfBirth ? String(customer.dateOfBirth).slice(0, 10) : "",
    })
    setIsEditOpen(true)
  }

  const handleSaveEdit = async () => {
    try {
      setSavingEdit(true)
      const payload = {
        name: editForm.name,
        email: editForm.email || null,
        phone: editForm.phone || null,
        gender: editForm.gender || null,
        dateOfBirth: editForm.dateOfBirth || null,
      }
      await adminAPI.updateUser(editForm.id, payload)
      toast.success("Customer updated")
      setIsEditOpen(false)
      fetchCustomers()
    } catch (error) {
      console.error("Error updating customer:", error)
      toast.error("Failed to update customer")
    } finally {
      setSavingEdit(false)
    }
  }

  const openWalletAdjust = (customer) => {
    setWalletCustomer(customer)
    setWalletForm({
      id: customer.id,
      type: "addition",
      amount: "",
      reason: "",
    })
    setIsWalletOpen(true)
  }

  const openWalletHistory = (customer) => {
    setWalletHistoryCustomer(customer)
    setWalletHistoryItems([])
    setWalletHistoryPage(1)
    setWalletHistoryPages(1)
    setIsWalletHistoryOpen(true)
  }

  const fetchWalletHistory = async (userId, p = 1) => {
    try {
      setWalletHistoryLoading(true)
      const res = await adminAPI.getUserWalletHistory(userId, {
        page: p,
        limit: 20,
        onlyAdjustments: false,
      })
      if (res?.data?.success) {
        const data = res.data.data || {}
        setWalletHistoryItems(data.transactions || [])
        const pg = data.pagination || {}
        setWalletHistoryPage(pg.page ?? p)
        setWalletHistoryPages(pg.pages ?? 1)
      } else {
        toast.error(res?.data?.message || "Failed to fetch wallet history")
      }
    } catch (err) {
      console.error("Error fetching wallet history:", err)
      toast.error(err?.response?.data?.message || "Failed to fetch wallet history")
    } finally {
      setWalletHistoryLoading(false)
    }
  }

  const closeWalletOtpDialog = useCallback(() => {
    setIsWalletOtpOpen(false)
    setWalletOtpCustomer(null)
    setWalletOtp("")
    setWalletOtpDestination("")
    setSendingWalletOtp(false)
    setVerifyingWalletOtp(false)
    setResendCooldown(0)
  }, [])

  const sendWalletAdjustOtp = useCallback(async () => {
    try {
      setSendingWalletOtp(true)
      const resp = await adminAPI.sendWalletAdjustOTP()
      const data = resp?.data?.data || resp?.data || {}

      const destinationRaw =
        data?.maskedPhone ||
        data?.phoneMasked ||
        data?.destinationMasked ||
        data?.phone ||
        data?.destination ||
        ""

      const masked = destinationRaw ? maskPhone(destinationRaw) : ""
      setWalletOtpDestination(masked)

      const nextCooldown =
        Number(data?.cooldownSeconds) ||
        Number(data?.resendCooldownSeconds) ||
        30
      setResendCooldown(Number.isFinite(nextCooldown) ? Math.max(0, nextCooldown) : 30)

      toast.success("OTP sent to your admin phone")
    } catch (error) {
      console.error("Error sending wallet adjust OTP:", error)
      toast.error(error?.response?.data?.message || "Failed to send OTP")
    } finally {
      setSendingWalletOtp(false)
    }
  }, [maskPhone])

  const openWalletAdjustWithOtpGate = useCallback(
    async (customer) => {
      setWalletOtpCustomer(customer)
      setIsWalletOtpOpen(true)
      setWalletOtp("")
      setWalletOtpDestination("")
      setVerifyingWalletOtp(false)
      await sendWalletAdjustOtp()
    },
    [sendWalletAdjustOtp],
  )

  const handleVerifyWalletOtp = useCallback(async () => {
    const otp = String(walletOtp || "").trim()
    if (!otp) {
      toast.error("Enter the OTP")
      return
    }
    if (otp.length < 6) {
      toast.error("Enter the 6-digit OTP")
      return
    }
    try {
      setVerifyingWalletOtp(true)
      await adminAPI.verifyWalletAdjustOTP(otp)
      toast.success("OTP verified")

      const customer = walletOtpCustomer
      closeWalletOtpDialog()
      if (customer) openWalletAdjust(customer)
    } catch (error) {
      console.error("Error verifying wallet adjust OTP:", error)
      toast.error(error?.response?.data?.message || "Invalid OTP")
    } finally {
      setVerifyingWalletOtp(false)
    }
  }, [walletOtp, walletOtpCustomer, closeWalletOtpDialog])

  // Resend cooldown ticker
  useEffect(() => {
    if (!isWalletOtpOpen) return
    if (!resendCooldown || resendCooldown <= 0) return
    const t = window.setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => window.clearInterval(t)
  }, [isWalletOtpOpen, resendCooldown])

  const handleAdjustWallet = async () => {
    try {
      setSavingWallet(true)
      const payload = {
        type: walletForm.type,
        amount: Number(walletForm.amount),
        reason: walletForm.reason,
      }
      const resp = await adminAPI.adjustUserWallet(walletForm.id, payload)
      const data = resp?.data?.data || resp?.data
      const newBalance = data?.wallet?.balance

      if (typeof newBalance === "number") {
        setCustomers(prev =>
          prev.map(c => (c.id === walletForm.id ? { ...c, walletBalance: newBalance } : c))
        )
      }

      toast.success("Wallet updated")
      setIsWalletOpen(false)
    } catch (error) {
      console.error("Error adjusting wallet:", error)
      toast.error(error?.response?.data?.message || "Failed to adjust wallet")
    } finally {
      setSavingWallet(false)
    }
  }

  const handleDeleteCustomer = async (customer) => {
    try {
      const ok = window.confirm(`Delete customer ${customer.name}? This cannot be undone.`)
      if (!ok) return

      await adminAPI.deleteUser(customer.id)
      toast.success("Customer deleted")
      fetchCustomers()
    } catch (error) {
      console.error("Error deleting customer:", error)
      toast.error(error?.response?.data?.message || "Failed to delete customer")
    }
  }

  const handleExport = (format) => {
    if (filteredCustomers.length === 0) {
      toast.error("No customers to export")
      return
    }

    const filename = "customers"
    try {
      switch (format) {
        case "csv":
          exportCustomersToCSV(filteredCustomers, filename)
          toast.success("CSV export started")
          break
        case "excel":
          exportCustomersToExcel(filteredCustomers, filename)
          toast.success("Excel export started")
          break
        case "pdf":
          exportCustomersToPDF(filteredCustomers, filename)
          toast.success("PDF download started")
          break
        default:
          toast.error("Invalid export format")
          break
      }
    } catch (error) {
      console.error("Export error:", error)
      toast.error("Failed to export customers")
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Filters Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Order Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={filters.orderDate}
                  onChange={(e) => handleFilterChange("orderDate", e.target.value)}
                  className="w-full px-4 py-2.5 pr-10 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Customer Joining Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={filters.joiningDate}
                  onChange={(e) => handleFilterChange("joiningDate", e.target.value)}
                  className="w-full px-4 py-2.5 pr-10 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Customer status
              </label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange("status", e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              >
                <option value="">Select Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Sort By
              </label>
              <select
                value={filters.sortBy}
                onChange={(e) => handleFilterChange("sortBy", e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              >
                <option value="">Select Customer Sorting Order</option>
                <option value="name-asc">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
                <option value="orders-asc">Orders (Low to High)</option>
                <option value="orders-desc">Orders (High to Low)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Choose First
              </label>
              <input
                type="number"
                value={filters.chooseFirst}
                onChange={(e) => handleFilterChange("chooseFirst", e.target.value)}
                placeholder="Ex: 100"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  // Filters are applied automatically via useMemo
                }}
                className="px-6 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all"
              >
                Apply Filters
              </button>
              <button
                onClick={() => {
                  setFilters({
                    orderDate: "",
                    joiningDate: "",
                    status: "",
                    sortBy: "",
                    chooseFirst: "",
                  })
                }}
                className="px-6 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
              >
                Reset Filters
              </button>
            </div>
            <div className="text-sm text-slate-600">
              {loading ? 'Loading...' : `Showing ${filteredCustomers.length} of ${totalCustomers} customers`}
            </div>
          </div>
        </div>

        {/* Customer List Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Customer list</h2>
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
                {filteredCustomers.length}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex-1 sm:flex-initial min-w-[200px]">
                <input
                  type="text"
                  placeholder="Ex: Search by name"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-all">
                    <Download className="w-4 h-4" />
                    <span className="text-black font-bold">Export</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
                  <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleExport("csv")} className="cursor-pointer">
                    <FileDown className="w-4 h-4 mr-2" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("excel")} className="cursor-pointer">
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export as Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("pdf")} className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2" />
                    Export as PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Sl</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Contact Information</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Total Order</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Total Order Amount</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Wallet Balance</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Joining Date</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Active/Inactive</th>
                  <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider min-w-[160px]">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center">
                      <div className="text-sm text-slate-500">Loading customers...</div>
                    </td>
                  </tr>
                ) : filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center">
                      <div className="text-sm text-slate-500">No customers found</div>
                    </td>
                  </tr>
                ) : (
                  paginatedCustomers.map((customer, index) => (
                    <tr key={customer.id || customer.sl} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs font-medium text-slate-700">{(currentPage - 1) * itemsPerPage + index + 1}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm">👤</span>
                          </div>
                          <span className="text-xs font-medium text-slate-900">{customer.name || ""}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          {customer.email && String(customer.email).trim().toLowerCase() !== "n/a" ? (
                            <span className="text-xs text-slate-700">{customer.email}</span>
                          ) : null}
                          {customer.phone && String(customer.phone).trim().toLowerCase() !== "n/a" ? (
                            <span className="text-[11px] text-slate-500">{customer.phone}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs text-slate-700">{customer.totalOrder || 0}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs font-medium text-slate-900">₹{Number(customer.totalOrderAmount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs font-medium text-slate-900">₹{Number(customer.walletBalance ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs text-slate-700">{customer.joiningDate}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleStatus(customer.id || customer.sl)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${customer.status ? "bg-blue-600" : "bg-slate-300"
                            }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${customer.status ? "translate-x-6" : "translate-x-1"
                              }`}
                          />
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center min-w-[160px]">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleViewDetails(customer.id || customer.sl)}
                            className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEdit(customer)}
                            className="p-1.5 rounded text-slate-700 hover:bg-slate-100 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openWalletHistory(customer)}
                            className="p-1.5 rounded text-slate-700 hover:bg-slate-100 transition-colors"
                            title="Wallet history"
                          >
                            <Clock3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openWalletAdjustWithOtpGate(customer)}
                            className="p-1.5 rounded text-emerald-700 hover:bg-emerald-50 transition-colors"
                            title="Adjust Wallet"
                          >
                            <Wallet className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteCustomer(customer)}
                            className="p-1.5 rounded text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 pt-6">
              <div className="text-xs md:text-sm text-slate-500">
                Showing <span className="font-semibold text-slate-900">{(currentPage - 1) * itemsPerPage + 1}</span> to{" "}
                <span className="font-semibold text-slate-900">
                  {Math.min(currentPage * itemsPerPage, filteredCustomers.length)}
                </span>{" "}
                of <span className="font-semibold text-slate-900">{filteredCustomers.length}</span> customers
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition-all cursor-pointer"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-1">
                  {getPageNumbers().map((page, idx) => (
                    page === "..." ? (
                      <span key={`ellipsis-${idx}`} className="px-3 py-1.5 text-xs font-semibold text-slate-400">
                        ...
                      </span>
                    ) : (
                      <button
                        key={`page-${page}`}
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${currentPage === page
                            ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                      >
                        {page}
                      </button>
                    )
                  ))}
                </div>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition-all cursor-pointer"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* User Details Modal */}
      <Dialog open={showUserDetails} onOpenChange={setShowUserDetails}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto mx-auto p-0">
          <DialogHeader>
            <div className="px-6 pt-5 pb-4 border-b border-slate-200 bg-white sticky top-0 z-10">
              <DialogTitle className="text-lg md:text-xl font-bold text-slate-900">User Details</DialogTitle>
              <p className="text-xs md:text-sm text-slate-500 mt-1">Customer profile, spend, and recent orders</p>
            </div>
          </DialogHeader>

          {loadingDetails ? (
            <div className="py-8 text-center">
              <div className="text-sm text-slate-500">Loading user details...</div>
            </div>
          ) : userDetails ? (
            <div className="space-y-4 px-6 py-5">
              {/* Profile Section */}
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-full bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {userDetails.profileImage ? (
                      <img src={userDetails.profileImage} alt={userDetails.name} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <span className="text-lg font-bold text-slate-700">{getInitials(userDetails.name)}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-bold text-slate-900">{userDetails.name}</h3>
                      {userDetails.isActive ? (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Mail className="w-4 h-4" />
                        <span>{userDetails.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Phone className="w-4 h-4" />
                        <span>{userDetails.phone}</span>
                        {userDetails.phoneVerified && (
                          <CheckCircle className="w-3 h-3 text-green-600" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <CalendarIcon className="w-4 h-4" />
                        <span>Joined: {userDetails.joiningDate}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <User className="w-4 h-4" />
                        <span>Signup: {userDetails.signupMethod || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Statistics Section */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-semibold text-slate-700">Total Orders</span>
                  </div>
                  <p className="text-xl font-bold text-blue-600">
                    {Number(userDetails.totalAllOrders ?? 0)}
                  </p>
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="w-4 h-4 text-green-600" />
                    <span className="text-xs font-semibold text-slate-700">Delivered Orders</span>
                  </div>
                  <p className="text-xl font-bold text-green-600">
                    {derivedTotalOrders}
                  </p>
                  <p className="text-xs font-semibold text-slate-600 mt-1">
                    {formatCurrency(derivedDeliveredSpent)}
                  </p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarIcon className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-semibold text-slate-700">Member Since</span>
                  </div>
                  <p className="text-base font-bold text-purple-600">{userDetails.joiningDate}</p>
                </div>
              </div>

              {/* Addresses Section */}
              {userDetails.addresses && userDetails.addresses.length > 0 && (
                <div>
                  <h4 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Addresses
                  </h4>
                  <div className="space-y-2">
                    {userDetails.addresses.map((address, index) => (
                      <div key={index} className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-slate-700">{address.label || 'Address'}</span>
                          {address.isDefault && (
                            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600">
                          {address.street}
                          {address.additionalDetails && `, ${address.additionalDetails}`}
                          {address.city && `, ${address.city}`}
                          {address.state && `, ${address.state}`}
                          {address.zipCode && ` - ${address.zipCode}`}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Orders Section */}
              {userDetails.orders && userDetails.orders.length > 0 && (
                <div>
                  <h4 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Recent Orders
                  </h4>
                  <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                    {userDetails.orders.map((order, index) => (
                      <div key={index} className="bg-white rounded-lg p-3 border border-slate-200 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{order.orderId}</p>
                          <p className="text-xs text-slate-600 truncate">{order.restaurantName || "Restaurant"}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {order.createdAt ? new Date(order.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : ""}
                          </p>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1 shrink-0">
                          <p className="text-sm font-semibold text-slate-900">{formatCurrency(order.total || 0)}</p>
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border capitalize ${getOrderStatusPill(order.status)}`}>
                            {String(order.status || "unknown").replace(/_/g, " ")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {userDetails.gender && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-slate-700 mb-1">Gender</p>
                    <p className="text-sm text-slate-600 capitalize">{userDetails.gender}</p>
                  </div>
                )}
                {userDetails.dateOfBirth && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-slate-700 mb-1">Date of Birth</p>
                    <p className="text-sm text-slate-600">
                      {new Date(userDetails.dateOfBirth).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <div className="text-sm text-slate-500">No user details available</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Customer Modal */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg mx-auto p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-200 bg-white">
            <DialogTitle className="text-base md:text-lg font-bold text-slate-900">
              Edit Customer
            </DialogTitle>
            <p className="text-xs md:text-sm text-slate-500 mt-1">
              Update customer profile details.
            </p>
          </DialogHeader>

          <div className="px-6 py-5">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs md:text-sm font-semibold text-slate-700">
                  Name
                </label>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Customer name"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs md:text-sm font-semibold text-slate-700">
                  Email
                </label>
                <input
                  value={editForm.email}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Email"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs md:text-sm font-semibold text-slate-700">
                  Phone
                </label>
                <input
                  value={editForm.phone}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Phone"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs md:text-sm font-semibold text-slate-700">
                    Gender
                  </label>
                  <select
                    value={editForm.gender}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, gender: e.target.value }))}
                    className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer-not-to-say">Prefer not to say</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs md:text-sm font-semibold text-slate-700">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={editForm.dateOfBirth}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, dateOfBirth: e.target.value }))}
                    className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 pb-5 pt-3 border-t border-slate-200 bg-white flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditOpen(false)}
              disabled={savingEdit}
              className="h-10"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveEdit}
              disabled={savingEdit}
              className="h-10 bg-blue-600 hover:bg-blue-700"
            >
              {savingEdit ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Wallet Adjust Modal */}
      <Dialog open={isWalletOpen} onOpenChange={setIsWalletOpen}>
        <DialogContent className="max-w-md bg-white rounded-xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-slate-200 bg-slate-50/80">
            <DialogTitle className="flex items-center gap-2 text-base md:text-lg">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <IndianRupee className="w-4 h-4" />
              </span>
              <span className="font-semibold text-slate-900">Adjust Wallet</span>
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 py-4 space-y-4">
            {walletCustomer && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs md:text-sm text-slate-700 flex items-center justify-between gap-3">
                <p className="font-semibold text-slate-900 truncate">
                  {walletCustomer.name || "Customer"}
                </p>
                <p className="text-[11px] md:text-xs text-slate-600">
                  Current:{" "}
                  <span className="font-semibold text-emerald-700">
                    ₹{Number(walletCustomer.walletBalance ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs md:text-sm font-medium text-slate-700">
                  Type
                </label>
                <select
                  value={walletForm.type}
                  onChange={(e) => setWalletForm((prev) => ({ ...prev, type: e.target.value }))}
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="addition">Add</option>
                  <option value="deduction">Deduct</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs md:text-sm font-medium text-slate-700">
                  Amount
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={walletForm.amount}
                  onChange={(e) => setWalletForm((prev) => ({ ...prev, amount: e.target.value }))}
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Ex: 100"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs md:text-sm font-medium text-slate-700">
                Reason <span className="text-slate-400">(optional)</span>
              </label>
              <textarea
                value={walletForm.reason}
                onChange={(e) => setWalletForm((prev) => ({ ...prev, reason: e.target.value }))}
                className="w-full min-h-[88px] px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="Reason / note"
              />
            </div>
          </div>

          <div className="px-6 pb-5 pt-3 border-t border-slate-200 bg-white flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsWalletOpen(false)
                setWalletCustomer(null)
              }}
              disabled={savingWallet}
              className="h-10"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAdjustWallet}
              disabled={savingWallet}
              className="h-10 bg-emerald-600 hover:bg-emerald-700"
            >
              {savingWallet ? "Saving..." : "Update Wallet"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Wallet Adjust OTP Lock Dialog */}
      <Dialog
        open={isWalletOtpOpen}
        onOpenChange={(open) => {
          if (open) setIsWalletOtpOpen(true)
          else closeWalletOtpDialog()
        }}
      >
        <DialogContent className="max-w-md bg-white rounded-xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-slate-200 bg-slate-50/80">
            <DialogTitle className="text-base md:text-lg font-semibold text-slate-900">
              Verify OTP to Adjust Wallet
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 py-4 space-y-3">
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs md:text-sm text-slate-700">
              <p className="font-semibold text-slate-900 truncate">
                {walletOtpCustomer?.name || "Customer"}
              </p>
              <p className="mt-1 text-[11px] md:text-xs text-slate-600">
                OTP sent to:{" "}
                <span className="font-semibold text-slate-900">
                  {walletOtpDestination || "your admin phone"}
                </span>
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs md:text-sm font-medium text-slate-700">
                OTP
              </label>
              <input
                value={walletOtp}
                onChange={(e) => setWalletOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter 6-digit OTP"
                className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                disabled={sendingWalletOtp || verifyingWalletOtp}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleVerifyWalletOtp()
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                className="h-9"
                onClick={sendWalletAdjustOtp}
                disabled={sendingWalletOtp || verifyingWalletOtp || resendCooldown > 0}
              >
                {sendingWalletOtp
                  ? "Sending..."
                  : resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : "Resend OTP"}
              </Button>
              <button
                type="button"
                className="text-xs text-slate-600 hover:text-slate-900 underline underline-offset-2 disabled:opacity-60"
                onClick={closeWalletOtpDialog}
                disabled={sendingWalletOtp || verifyingWalletOtp}
              >
                Cancel
              </button>
            </div>
          </div>

          <div className="px-6 pb-5 pt-3 border-t border-slate-200 bg-white flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={closeWalletOtpDialog}
              disabled={sendingWalletOtp || verifyingWalletOtp}
              className="h-10"
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={handleVerifyWalletOtp}
              disabled={sendingWalletOtp || verifyingWalletOtp || String(walletOtp).trim().length !== 6}
              className="h-10 bg-emerald-600 hover:bg-emerald-700"
            >
              {verifyingWalletOtp ? "Verifying..." : "Verify & Continue"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Wallet History Modal */}
      <Dialog
        open={isWalletHistoryOpen}
        onOpenChange={(open) => {
          if (open) setIsWalletHistoryOpen(true)
          else {
            setIsWalletHistoryOpen(false)
            setWalletHistoryCustomer(null)
            setWalletHistoryItems([])
          }
        }}
      >
        <DialogContent className="max-w-lg bg-white rounded-xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-slate-200 bg-slate-50/80">
            <DialogTitle className="flex items-center gap-2 text-base md:text-lg">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                <Clock3 className="w-4 h-4" />
              </span>
              <span className="font-semibold text-slate-900">Wallet History</span>
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 py-4 space-y-4">
            {walletHistoryCustomer && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs md:text-sm text-slate-700 flex items-center justify-between gap-3">
                <p className="font-semibold text-slate-900 truncate">
                  {walletHistoryCustomer.name || "Customer"}
                </p>
              </div>
            )}

            {walletHistoryLoading ? (
              <div className="py-10 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mx-auto mb-3" />
                <p className="text-slate-600 text-sm">Loading history…</p>
              </div>
            ) : walletHistoryItems.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-slate-700 font-semibold">No history</p>
                <p className="text-slate-500 text-sm">No wallet transactions found.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[380px] overflow-auto pr-1">
                {walletHistoryItems.map((t) => {
                  const when = t?.date ? new Date(t.date).toLocaleString("en-IN") : "—"
                  const rawType = String(t?.type || "").toLowerCase()
                  const isAdd = rawType === "addition"
                  const isRefund = rawType === "refund"
                  const isDeduct = rawType === "deduction"

                  let title = t.title || "Transaction"
                  let badgeClass = t.badgeClass || "bg-slate-100 text-slate-700 border-slate-200"

                  if (!t.title) {
                    if (isAdd) {
                      if (t.metadata?.adjustment === true) {
                        title = "Admin Credit"
                        badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200"
                      } else {
                        title = "Added to Wallet"
                        badgeClass = "bg-green-50 text-green-700 border-green-200"
                      }
                    } else if (isRefund) {
                      title = "Order Refund"
                      badgeClass = "bg-blue-50 text-blue-700 border-blue-200"
                    } else if (isDeduct) {
                      if (t.metadata?.adjustment === true) {
                        title = "Admin Debit"
                        badgeClass = "bg-rose-50 text-rose-700 border-rose-200"
                      } else if (t.orderId) {
                        title = "Paid for Order"
                        badgeClass = "bg-amber-50 text-amber-700 border-amber-200"
                      } else {
                        title = "Deducted"
                        badgeClass = "bg-rose-50 text-rose-700 border-rose-200"
                      }
                    }
                  }

                  const isPositive = isAdd || isRefund

                  return (
                    <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${badgeClass}`}>
                              {title}
                            </span>
                            {t.paymentMethod && t.paymentMethod !== "other" && (
                              <span className="text-[10px] font-semibold text-slate-500 uppercase">
                                • {t.paymentMethod}
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-medium text-slate-700 leading-normal">{t.description || "—"}</p>

                          {t.orderId && (
                            <div className="pt-1">
                              <button
                                type="button"
                                onClick={() => openOrder(t.orderId)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-all"
                              >
                                <Eye className="w-3.5 h-3.5 text-slate-500" />
                                View Order
                              </button>
                            </div>
                          )}

                          {t?.processedBy?.name && (
                            <p className="text-[10px] text-slate-500 font-medium">
                              By: <span className="font-semibold text-slate-700">{t.processedBy.name}</span>
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-bold ${t.isOrderActivity ? "text-slate-800" : isPositive ? "text-emerald-700" : "text-rose-700"}`}>
                            {t?.amount != null
                              ? t.isOrderActivity
                                ? formatCurrency(Number(t.amount))
                                : `${isPositive ? "+" : "−"}${formatCurrency(Math.abs(Number(t.amount)))}`
                              : "—"}
                          </p>
                          <p className="text-[10px] font-medium text-slate-400 mt-1">{when}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="px-6 pb-5 pt-3 border-t border-slate-200 bg-white flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={walletHistoryLoading || walletHistoryPage <= 1 || !walletHistoryCustomer?.id}
                onClick={() => {
                  const next = Math.max(1, walletHistoryPage - 1)
                  setWalletHistoryPage(next)
                  fetchWalletHistory(walletHistoryCustomer.id, next)
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={walletHistoryLoading || walletHistoryPage >= walletHistoryPages || !walletHistoryCustomer?.id}
                onClick={() => {
                  const next = Math.min(walletHistoryPages, walletHistoryPage + 1)
                  setWalletHistoryPage(next)
                  fetchWalletHistory(walletHistoryCustomer.id, next)
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
              <p className="text-xs text-slate-600 ml-2">
                Page {walletHistoryPage} of {walletHistoryPages}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-9"
              onClick={() => {
                setIsWalletHistoryOpen(false)
                setWalletHistoryCustomer(null)
                setWalletHistoryItems([])
              }}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Order Dialog */}
      <ViewOrderDialog
        isOpen={isOrderViewOpen}
        onOpenChange={setIsOrderViewOpen}
        order={selectedOrder}
        onPaymentApproved={fetchCustomers}
      />
    </div>
  )
}
