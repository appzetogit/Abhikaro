import { useEffect, useState, useMemo, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Activity, ArrowUpRight, ShoppingBag, CreditCard, Truck, Receipt, DollarSign, Store, UserCheck, Package, UserCircle, Clock, CheckCircle, Plus, QrCode } from "lucide-react"
import { adminAPI } from "@/lib/api"

export default function AdminHome() {
  const navigate = useNavigate()
  const [zones, setZones] = useState([])
  const [selectedZone, setSelectedZone] = useState("all")
  const [selectedPeriod, setSelectedPeriod] = useState("overall")
  const [customRange, setCustomRange] = useState({ start: "", end: "" })
  const [isLoading, setIsLoading] = useState(true)
  const [dashboardData, setDashboardData] = useState(null)
  const filtersRequestRef = useRef({ zone: "all", timeFilter: "overall", startDate: "", endDate: "" })
  const debounceRef = useRef(null)

  // Fetch zones for zone filter (once)
  useEffect(() => {
    const fetchZones = async () => {
      try {
        const zonesResponse = await adminAPI.getZones({ limit: 1000, isActive: true })
        if (zonesResponse.data?.success && zonesResponse.data?.data) {
          setZones(zonesResponse.data.data.zones || zonesResponse.data.data || [])
        }
      } catch (error) {
        console.error('❌ Error fetching zones:', error)
      }
    }

    fetchZones()
  }, [])

  // Fetch dashboard stats when filters change (single combined request, debounced)
  useEffect(() => {
    const fetchFilteredStats = async () => {
      try {
        setIsLoading(true)
        const params = {
          zone: selectedZone === "all" ? "all" : selectedZone,
          timeFilter: selectedPeriod,
        }

        if (selectedPeriod === "custom" && customRange.start && customRange.end) {
          params.startDate = customRange.start
          params.endDate = customRange.end
        }

        // Skip request if params are unchanged (prevents duplicate refresh)
        const key = JSON.stringify(params)
        const lastKey = JSON.stringify(filtersRequestRef.current)
        if (key === lastKey && dashboardData) {
          setIsLoading(false)
          return
        }
        filtersRequestRef.current = params

        const response = await adminAPI.getDashboardStats(params)
        if (response.data?.success && response.data?.data) {
          setDashboardData(response.data.data)
        } else {
          console.error('❌ Invalid response format:', response.data)
        }
      } catch (error) {
        console.error('❌ Error fetching dashboard stats:', error)
      } finally {
        setIsLoading(false)
      }
    }

    // Guard: for custom period, wait until both dates are selected
    if (selectedPeriod === "custom" && (!customRange.start || !customRange.end)) {
      return
    }

    // Debounce to avoid multiple rapid requests
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      fetchFilteredStats()
    }, 250)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [selectedZone, selectedPeriod, customRange.start, customRange.end])

  // Get order stats from real data
  const getOrderStats = () => {
    if (!dashboardData?.orders?.byStatus) {
      return [
        { label: "Delivered", value: 0, color: "#0ea5e9" },
        { label: "Cancelled", value: 0, color: "#ef4444" },
        { label: "Refunded", value: 0, color: "#f59e0b" },
        { label: "Pending", value: 0, color: "#10b981" },
      ]
    }

    const byStatus = dashboardData.orders.byStatus
    return [
      { label: "Delivered", value: byStatus.delivered || 0, color: "#0ea5e9" },
      { label: "Cancelled", value: byStatus.cancelled || 0, color: "#ef4444" },
      { label: "Refunded", value: 0, color: "#f59e0b" }, // Refunded not tracked separately
      { label: "Pending", value: byStatus.pending || 0, color: "#10b981" },
    ]
  }

  // Get monthly data from real data
  const getMonthlyData = () => {
    if (!dashboardData?.monthlyData || dashboardData.monthlyData.length === 0) {
      // Return empty data structure if no data
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      return monthNames.map(month => ({ month, commission: 0, revenue: 0, orders: 0 }))
    }

    // Use real monthly data from backend
    return dashboardData.monthlyData.map(item => ({
      month: item.month,
      commission: item.commission || 0,
      revenue: item.revenue || 0,
      orders: item.orders || 0
    }))
  }

  const orderStats = useMemo(() => getOrderStats(), [dashboardData])
  const monthlyData = useMemo(() => getMonthlyData(), [dashboardData])

  // Calculate totals from real data
  const revenueTotal = dashboardData?.revenue?.total || 0
  const commissionTotal = dashboardData?.commission?.total || 0
  const ordersTotal = dashboardData?.orders?.total || 0
  const platformFeeTotal = dashboardData?.platformFee?.total || 0
  const deliveryFeeTotal = dashboardData?.deliveryFee?.total || 0
  const gstTotal = dashboardData?.gst?.total || 0
  // Total revenue = Commission + Platform Fee + Delivery Fee + GST
  const totalAdminEarnings = commissionTotal + platformFeeTotal + deliveryFeeTotal + gstTotal

  // Additional stats
  const totalRestaurants = dashboardData?.restaurants?.total || 0
  const pendingRestaurantRequests = dashboardData?.restaurants?.pendingRequests || 0
  const totalDeliveryBoys = dashboardData?.deliveryBoys?.total || 0
  const pendingDeliveryBoyRequests = dashboardData?.deliveryBoys?.pendingRequests || 0
  const totalFoods = dashboardData?.foods?.total || 0
  const totalAddons = dashboardData?.addons?.total || 0
  const totalCustomers = dashboardData?.customers?.total || 0
  const pendingOrders = dashboardData?.orderStats?.pending || 0
  const completedOrders = dashboardData?.orderStats?.completed || 0

  const pieData = orderStats.map((item) => ({
    name: item.label,
    value: item.value,
    fill: item.color,
  }))

  const activityFeed = []

  return (
    <div className="px-4 pb-10 lg:px-6 pt-4">
      <div className="relative overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-[0_30px_120px_-60px_rgba(0,0,0,0.28)]">
        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-full bg-white px-4 py-2 text-sm text-neutral-700 ring-1 ring-neutral-200">
              <span className="h-3 w-3 animate-ping rounded-full bg-neutral-800/70" />
              Updating metrics...
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4 border-b border-neutral-200 bg-linear-to-br from-white via-neutral-50 to-neutral-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Admin Overview</p>
              <h1 className="text-2xl font-semibold text-neutral-900">Operations Command</h1>
            </div>

          </div>
          <div className="flex flex-wrap gap-3">
            <Select value={selectedZone} onValueChange={setSelectedZone}>
              <SelectTrigger className="min-w-[160px] border-neutral-300 bg-white text-neutral-900">
                <SelectValue placeholder="All zones" />
              </SelectTrigger>
              <SelectContent className="border-neutral-200 bg-white text-neutral-900">
                <SelectItem value="all">All zones</SelectItem>
                {zones.map((zone) => (
                  <SelectItem key={zone._id} value={zone.name}>
                    {zone.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="min-w-[140px] border-neutral-300 bg-white text-neutral-900">
                <SelectValue placeholder="Time Filter" />
              </SelectTrigger>
              <SelectContent className="border-neutral-200 bg-white text-neutral-900">
                <SelectItem value="overall">Overall</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This week</SelectItem>
                <SelectItem value="month">This month</SelectItem>
                <SelectItem value="year">This year</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Active filter indicator & custom range inputs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-6 py-3 text-xs text-neutral-600">
          <div className="rounded-full bg-white px-3 py-1 shadow-sm ring-1 ring-neutral-200">
            <span className="font-medium text-neutral-800">Active filters:</span>{" "}
            <span className="ml-1">
              Zone: {selectedZone === "all" ? "All" : selectedZone} | Time:{" "}
              {selectedPeriod === "overall"
                ? "Overall"
                : selectedPeriod === "today"
                ? "Today"
                : selectedPeriod === "week"
                ? "This Week"
                : selectedPeriod === "month"
                ? "This Month"
                : selectedPeriod === "year"
                ? "This Year"
                : customRange.start && customRange.end
                ? `Custom (${customRange.start} → ${customRange.end})`
                : "Custom"}
            </span>
          </div>

          {selectedPeriod === "custom" && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] font-medium text-neutral-700">
                From
              </label>
              <input
                type="date"
                value={customRange.start}
                onChange={(e) =>
                  setCustomRange((prev) => ({ ...prev, start: e.target.value }))
                }
                className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-xs text-neutral-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-800/70"
              />
              <label className="text-[11px] font-medium text-neutral-700">
                To
              </label>
              <input
                type="date"
                value={customRange.end}
                onChange={(e) =>
                  setCustomRange((prev) => ({ ...prev, end: e.target.value }))
                }
                className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-xs text-neutral-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-800/70"
              />
            </div>
          )}
        </div>

        <div className="space-y-6 px-6 py-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Gross revenue"
              value={`₹${revenueTotal.toLocaleString("en-IN")}`}
              helper="Rolling 12 months"
              icon={<ShoppingBag className="h-5 w-5 text-emerald-600" />}
              accent="bg-emerald-200/40"
            />
            <MetricCard
              title="Commission earned"
              value={`₹${commissionTotal.toLocaleString("en-IN")}`}
              helper="Restaurant commission"
              icon={<ArrowUpRight className="h-5 w-5 text-indigo-600" />}
              accent="bg-indigo-200/40"
            />
            <MetricCard
              title="Orders processed"
              value={ordersTotal.toLocaleString("en-IN")}
              helper="Fulfilled & billed"
              icon={<Activity className="h-5 w-5 text-amber-600" />}
              accent="bg-amber-200/40"
            />
            <MetricCard
              title="Platform fee"
              value={`₹${platformFeeTotal.toLocaleString("en-IN")}`}
              helper="Total platform fees"
              icon={<CreditCard className="h-5 w-5 text-purple-600" />}
              accent="bg-purple-200/40"
            />
            <MetricCard
              title="Delivery fee"
              value={`₹${deliveryFeeTotal.toLocaleString("en-IN")}`}
              helper="Total delivery fees"
              icon={<Truck className="h-5 w-5 text-blue-600" />}
              accent="bg-blue-200/40"
            />
            <MetricCard
              title="GST"
              value={`₹${gstTotal.toLocaleString("en-IN")}`}
              helper="Total GST collected"
              icon={<Receipt className="h-5 w-5 text-orange-600" />}
              accent="bg-orange-200/40"
            />
            <MetricCard
              title="Total revenue"
              value={`₹${totalAdminEarnings.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              helper={`Commission ₹${commissionTotal.toFixed(2)} + Platform ₹${platformFeeTotal.toFixed(2)} + Delivery ₹${deliveryFeeTotal.toFixed(2)} + GST ₹${gstTotal.toFixed(2)}`}
              icon={<DollarSign className="h-5 w-5 text-green-600" />}
              accent="bg-green-200/40"
            />
            <MetricCard
              title="Total restaurants"
              value={totalRestaurants.toLocaleString("en-IN")}
              helper="All registered restaurants"
              icon={<Store className="h-5 w-5 text-blue-600" />}
              accent="bg-blue-200/40"
              onClick={() => navigate("/admin/restaurants")}
            />
            <MetricCard
              title="Restaurant request pending"
              value={pendingRestaurantRequests.toLocaleString("en-IN")}
              helper="Awaiting approval"
              icon={<UserCheck className="h-5 w-5 text-orange-600" />}
              accent="bg-orange-200/40"
              onClick={() => navigate("/admin/restaurants/joining-request")}
            />
            <MetricCard
              title="Total delivery boy"
              value={totalDeliveryBoys.toLocaleString("en-IN")}
              helper="All delivery partners"
              icon={<Truck className="h-5 w-5 text-indigo-600" />}
              accent="bg-indigo-200/40"
              onClick={() => navigate("/admin/delivery-partners")}
            />
            <MetricCard
              title="Delivery boy request pending"
              value={pendingDeliveryBoyRequests.toLocaleString("en-IN")}
              helper="Awaiting verification"
              icon={<Clock className="h-5 w-5 text-yellow-600" />}
              accent="bg-yellow-200/40"
              onClick={() => navigate("/admin/delivery-partners/join-request")}
            />
            <MetricCard
              title="Total foods"
              value={totalFoods.toLocaleString("en-IN")}
              helper="Active menu items"
              icon={<Package className="h-5 w-5 text-purple-600" />}
              accent="bg-purple-200/40"
              onClick={() => navigate("/admin/foods")}
            />
            <MetricCard
              title="Hotel QR Commission"
              value={`₹${(dashboardData?.qrCommission?.total || 0).toLocaleString("en-IN")}`}
              helper="From QR Orders"
              icon={<QrCode className="h-5 w-5 text-pink-600" />}
              accent="bg-pink-200/40"
              onClick={() => navigate("/admin/hotels")}
            />
            <MetricCard
              title="Total customers"
              value={totalCustomers.toLocaleString("en-IN")}
              helper="Registered users"
              icon={<UserCircle className="h-5 w-5 text-cyan-600" />}
              accent="bg-cyan-200/40"
              onClick={() => navigate("/admin/customers")}
            />
            <MetricCard
              title="Pending orders"
              value={pendingOrders.toLocaleString("en-IN")}
              helper="Orders awaiting processing"
              icon={<Clock className="h-5 w-5 text-red-600" />}
              accent="bg-red-200/40"
              onClick={() => navigate("/admin/orders/pending")}
            />
            <MetricCard
              title="Completed orders"
              value={completedOrders.toLocaleString("en-IN")}
              helper="Successfully delivered"
              icon={<CheckCircle className="h-5 w-5 text-emerald-600" />}
              accent="bg-emerald-200/40"
              onClick={() => navigate("/admin/orders/delivered")}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2 border-neutral-200 bg-white">
              <CardHeader className="flex flex-col gap-2 border-b border-neutral-200 pb-4">
                <CardTitle className="text-lg text-neutral-900">Revenue trajectory</CardTitle>
                <p className="text-sm text-neutral-500">
                  Commission and gross revenue with {selectedPeriod === "today" ? "hourly" : selectedPeriod === "year" ? "monthly" : "daily"} order volume
                </p>
              </CardHeader>
              <CardContent className="pt-4">
                {monthlyData && monthlyData.length > 0 ? (
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={monthlyData}>
                      <defs>
                        <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="comFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a855f7" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" stroke="#6b7280" />
                      <YAxis stroke="#6b7280" />
                      <Tooltip
                        contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12 }}
                        labelStyle={{ color: "#111827" }}
                        itemStyle={{ color: "#111827" }}
                      />
                      <Legend />
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          stroke="#0ea5e9"
                          fillOpacity={1}
                          fill="url(#revFill)"
                          name="Gross revenue"
                        />
                        <Area
                          type="monotone"
                          dataKey="commission"
                          stroke="#a855f7"
                          fillOpacity={1}
                          fill="url(#comFill)"
                          name="Commission"
                        />
                        <Bar
                          dataKey="orders"
                          fill="#ef4444"
                          radius={[6, 6, 0, 0]}
                          name="Orders"
                          barSize={10}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-80 items-center justify-center text-sm text-neutral-500">
                    No data available for the selected filters
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-neutral-200 bg-white">
              <CardHeader className="flex items-center justify-between border-b border-neutral-200 pb-4">
                <div>
                  <CardTitle className="text-lg text-neutral-900">Order mix</CardTitle>
                  <p className="text-sm text-neutral-500">Distribution by state</p>
                </div>
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700">
                  {orderStats.reduce((s, o) => s + o.value, 0)} orders
                </span>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={4}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={index} fill={entry.fill} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12 }}
                        labelStyle={{ color: "#111827" }}
                        itemStyle={{ color: "#111827" }}
                      />
                      <Legend
                        formatter={(value) => <span style={{ color: "#111827", fontSize: 12 }}>{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {orderStats.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                        <p className="text-sm text-neutral-800">{item.label}</p>
                      </div>
                      <p className="text-sm font-semibold text-neutral-900">{item.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="border-neutral-200 bg-white">
              <CardHeader className="flex items-center justify-between border-b border-neutral-200 pb-4">
                <CardTitle className="text-lg text-neutral-900">Momentum snapshot</CardTitle>
                <span className="text-xs text-neutral-500">No data available</span>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData.slice(-6)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" stroke="#6b7280" />
                      <YAxis stroke="#6b7280" />
                      <Tooltip
                        contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12 }}
                        labelStyle={{ color: "#111827" }}
                        itemStyle={{ color: "#111827" }}
                      />
                      <Legend />
                      <Bar dataKey="orders" fill="#0ea5e9" radius={[8, 8, 0, 0]} name="Orders" />
                      <Bar dataKey="commission" fill="#a855f7" radius={[8, 8, 0, 0]} name="Commission" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ title, value, helper, icon, accent, onClick }) {
  return (
    <Card
      className={`overflow-hidden border-neutral-200 bg-white p-0 ${onClick ? "cursor-pointer transition-shadow hover:shadow-md" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <CardContent className="relative flex flex-col gap-2 px-4 pb-4 pt-4">
        <div className={`absolute inset-0 ${accent} `} />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">{title}</p>
            <p className="text-2xl font-semibold text-neutral-900">{value}</p>
            <p className="text-xs text-neutral-500">{helper}</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-100 ring-1 ring-neutral-200">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
