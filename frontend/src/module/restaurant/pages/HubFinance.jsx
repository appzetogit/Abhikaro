import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Bell, Menu, ChevronDown, Calendar, Download, ArrowRight, FileText, Wallet, X, Lock, ChevronLeft, ChevronRight } from "lucide-react"
import BottomNavOrders from "../components/BottomNavOrders"
import { restaurantAPI } from "@/lib/api"
import { toast } from "sonner"

export default function HubFinance() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState("payouts")
  const [selectedDateRange, setSelectedDateRange] = useState(() => {
    const today = new Date()
    today.setHours(23, 59, 59, 999)

    // Default to "This week" (Monday to Sunday) based on today's date
    const currentDay = today.getDay()
    const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1
    const thisWeekStart = new Date(today)
    thisWeekStart.setDate(today.getDate() - daysFromMonday)
    thisWeekStart.setHours(0, 0, 0, 0)
    const thisWeekEnd = new Date(thisWeekStart)
    thisWeekEnd.setDate(thisWeekStart.getDate() + 6)
    thisWeekEnd.setHours(23, 59, 59, 999)

    const formatDateForDisplay = (date) => {
      const day = date.getDate()
      const month = date.toLocaleString('en-US', { month: 'short' })
      const year = date.getFullYear().toString().slice(-2)
      return `${day} ${month}'${year}`
    }

    return `${formatDateForDisplay(thisWeekStart)} - ${formatDateForDisplay(thisWeekEnd)}`
  })
  const [filterType, setFilterType] = useState('all')
  const [customStartDate, setCustomStartDate] = useState(() => {
    const today = new Date()
    const currentDay = today.getDay()
    const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1
    const thisWeekStart = new Date(today)
    thisWeekStart.setDate(today.getDate() - daysFromMonday)
    return thisWeekStart.toISOString().split('T')[0]
  })
  const [customEndDate, setCustomEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })
  const [showDownloadMenu, setShowDownloadMenu] = useState(false)
  const [showDateRangePicker, setShowDateRangePicker] = useState(false)
  const downloadMenuRef = useRef(null)
  const dateRangePickerRef = useRef(null)
  const getCacheKey = useCallback(() => {
    try {
      const stored = localStorage.getItem("restaurant_user")
      if (stored) {
        const user = JSON.parse(stored)
        const restId = user.restaurantId || user._id || 'default'
        return `hub_finance_summary_${restId}`
      }
    } catch (e) {}
    return `hub_finance_summary_default`
  }, [])

  const [financeData, setFinanceData] = useState(() => {
    try {
      const cached = localStorage.getItem(`${getCacheKey()}_finance`)
      return cached ? JSON.parse(cached) : null
    } catch (e) {
      return null
    }
  })
  const [loading, setLoading] = useState(() => {
    try {
      const cached = localStorage.getItem(`${getCacheKey()}_finance`)
      return cached ? false : true
    } catch (e) {
      return true
    }
  })
  const [pastCyclesData, setPastCyclesData] = useState(null)
  const [loadingPastCycles, setLoadingPastCycles] = useState(false)
  const [restaurantData, setRestaurantData] = useState(null)
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false)
  const [withdrawalAmount, setWithdrawalAmount] = useState('')
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false)
  const [withdrawWindow, setWithdrawWindow] = useState(() => {
    try {
      const cached = localStorage.getItem(`${getCacheKey()}_withdraw_window`)
      return cached ? JSON.parse(cached) : { allowed: true, message: "" }
    } catch (e) {
      return { allowed: true, message: "" }
    }
  })
  const [walletSummary, setWalletSummary] = useState(() => {
    try {
      const cached = localStorage.getItem(`${getCacheKey()}_wallet_summary`)
      return cached ? JSON.parse(cached) : null
    } catch (e) {
      return null
    }
  })
  const [currentPage, setCurrentPage] = useState(1)

  const fetchFinanceData = useCallback(async () => {
    const key = getCacheKey()
    try {
      const cached = localStorage.getItem(`${key}_finance`)
      if (!cached) {
        setLoading(true)
      }
      const response = await restaurantAPI.getFinance()
      if (response.data?.success && response.data?.data) {
        setFinanceData(response.data.data)
        try {
          localStorage.setItem(`${key}_finance`, JSON.stringify(response.data.data))
        } catch (e) {}
      }
    } catch (error) {
      if (error.response?.status !== 401) {
        console.error('❌ Error fetching finance data:', error)
      }
    } finally {
      setLoading(false)
    }
  }, [getCacheKey])

  const fetchWithdrawWindow = useCallback(async () => {
    const key = getCacheKey()
    try {
      const res = await restaurantAPI.getWallet()
      const wallet =
        res?.data?.data?.wallet || res?.data?.wallet || res?.data?.data || null
      const nextWindow = {
        allowed: wallet?.withdrawAllowed ?? true,
        message: wallet?.withdrawMessage || "",
      }
      setWithdrawWindow(nextWindow)
      setWalletSummary(wallet || null)
      
      try {
        localStorage.setItem(`${key}_withdraw_window`, JSON.stringify(nextWindow))
        if (wallet) {
          localStorage.setItem(`${key}_wallet_summary`, JSON.stringify(wallet))
        }
      } catch (e) {}
    } catch (error) {
      // If wallet API fails, don't block page; just fall back to allowing withdraw
      setWithdrawWindow((prev) => ({
        ...prev,
        allowed: true,
      }))
      setWalletSummary(null)
      if (import.meta.env.DEV) {
        console.error("Error fetching restaurant wallet withdraw window:", error)
      }
    }
  }, [getCacheKey])

  // Fetch finance data and wallet in parallel on mount
  useEffect(() => {
    Promise.all([fetchFinanceData(), fetchWithdrawWindow()])
  }, [fetchFinanceData, fetchWithdrawWindow])

  // Fetch restaurant data for header display
  useEffect(() => {
    // Use restaurant data from financeData if available, otherwise fetch separately
    if (financeData?.restaurant) {
      // Ensure onboarding data is prioritized when setting restaurantData
      const restaurant = financeData.restaurant
      setRestaurantData({
        // Prefer onboarding.step1.restaurantName if available (more accurate)
        name: restaurant.onboarding?.step1?.restaurantName || restaurant.name,
        restaurantId: restaurant.restaurantId || restaurant._id,
        address: restaurant.location?.address || restaurant.location?.formattedAddress || restaurant.address || '',
        onboarding: restaurant.onboarding // Include onboarding data for header display
      })
    } else {
      const fetchRestaurantData = async () => {
        try {
          const response = await restaurantAPI.getRestaurantByOwner()
          const data = response?.data?.data?.restaurant || response?.data?.restaurant || response?.data?.data
          if (data) {
            setRestaurantData({
              // Prefer onboarding.step1.restaurantName if available (more accurate)
              name: data.onboarding?.step1?.restaurantName || data.name,
              restaurantId: data.restaurantId || data._id,
              address: data.location?.address || data.location?.formattedAddress || data.address || '',
              onboarding: data.onboarding // Include onboarding data for header display
            })
          }
        } catch (error) {
          // Suppress 401 errors as they're handled by axios interceptor
          if (error.response?.status !== 401) {
            console.error('❌ Error fetching restaurant data:', error)
          }
        }
      }
      fetchRestaurantData()
    }
  }, [financeData])

  // Format restaurant ID to REST###### format (e.g., REST005678)
  const formatRestaurantId = (restaurantId) => {
    if (!restaurantId) return ''
    
    // Extract numeric part from the end (e.g., "REST-1768762345335-5678" -> "5678")
    const strId = String(restaurantId)
    const numericMatch = strId.match(/(\d+)$/)
    
    if (numericMatch) {
      const numericPart = numericMatch[1]
      // Take last 6 digits and pad with zeros if needed
      const lastDigits = numericPart.slice(-6).padStart(6, '0')
      return `REST${lastDigits}`
    }
    
    // Fallback: if no numeric part found, use original
    return strId
  }

  // Get current cycle dates from API response or use default
  const currentCycleDates = useMemo(() => {
    if (financeData?.currentCycle) {
      return {
        start: financeData.currentCycle.start.day,
        end: financeData.currentCycle.end.day,
        month: financeData.currentCycle.start.month,
        year: financeData.currentCycle.start.year
      }
    }
    return {
      start: "15",
      end: "21",
      month: "Dec",
      year: "25"
    }
  }, [financeData])

  const withdrawAllowed = withdrawWindow.allowed
  const withdrawMessage = withdrawWindow.message

  const cycleEarnings = financeData?.currentCycle?.estimatedPayout ?? 0
  const withdrawableBalance = walletSummary?.totalBalance ?? financeData?.currentCycle?.withdrawableBalance ?? cycleEarnings

  // Pagination for Orders History
  const ITEMS_PER_PAGE = 15;
  const totalOrdersCount = pastCyclesData?.orders?.length || 0;
  const totalPages = Math.ceil(totalOrdersCount / ITEMS_PER_PAGE) || 1;
  const paginatedOrders = useMemo(() => {
    if (!pastCyclesData?.orders) return [];
    // Sort by date descending (latest first)
    const sorted = [...pastCyclesData.orders].sort((a, b) => {
      const dateA = new Date(a.deliveredAt || a.createdAt);
      const dateB = new Date(b.deliveredAt || b.createdAt);
      return dateB - dateA;
    });
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return sorted.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [pastCyclesData, currentPage]);
  // Compute lifetime earnings as balance + withdrawn (math identity: earned = balance + withdrawn)
  // This avoids race conditions where /finance and /wallet return different snapshots of wallet.totalEarned
  const lifetimeEarnings = walletSummary
    ? (walletSummary.totalBalance ?? 0) + (walletSummary.totalWithdrawn ?? 0)
    : 0


  // Unused helper functions removed

  // Fetch past cycles data when date range or filter changes
  const fetchPastCyclesData = async (options = {}) => {
    try {
      setLoadingPastCycles(true)
      let response
      if (options.all) {
        response = await restaurantAPI.getFinance({ all: 'true' })
      } else if (options.startDate && options.endDate) {
        const startISO = new Date(options.startDate).toISOString().split('T')[0]
        const endISO = new Date(options.endDate).toISOString().split('T')[0]
        response = await restaurantAPI.getFinance({
          startDate: startISO,
          endDate: endISO
        })
      } else {
        setPastCyclesData(null)
        return
      }

      if (response.data?.success && response.data?.data?.pastCycles) {
        const pc = response.data.data.pastCycles
        setPastCyclesData(pc)
        setCurrentPage(1)
        
        // Dynamically update selectedDateRange for display and reports
        if (pc.dateRange?.start && pc.dateRange?.end) {
          const formatPart = (part) => `${part.day} ${part.month}'${part.year}`
          setSelectedDateRange(`${formatPart(pc.dateRange.start)} - ${formatPart(pc.dateRange.end)}`)
        } else if (options.all) {
          setSelectedDateRange('All Time')
        }
      } else {
        setPastCyclesData(null)
      }
    } catch (error) {
      if (error.response?.status !== 401) {
        console.error('❌ Error fetching past cycles data:', error)
      }
      setPastCyclesData(null)
    } finally {
      setLoadingPastCycles(false)
    }
  }

  // Fetch past cycles data on mount and when filters/dates change
  useEffect(() => {
    if (filterType === 'all') {
      fetchPastCyclesData({ all: true })
    } else if (filterType === 'date_wise') {
      if (customStartDate && customEndDate) {
        const start = new Date(customStartDate)
        const end = new Date(customEndDate)
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          fetchPastCyclesData({ startDate: customStartDate, endDate: customEndDate })
        }
      } else {
        setPastCyclesData(null)
      }
    }
  }, [filterType, customStartDate, customEndDate])


  // Prepare report data from real finance data
  const getReportData = () => {
    // Prefer onboarding.step1.restaurantName if available (more accurate)
    const restaurantName = financeData?.restaurant?.onboarding?.step1?.restaurantName
      || financeData?.restaurant?.name
      || "Restaurant"
    const restaurantId = financeData?.restaurant?.restaurantId || "N/A"
    const currentCycle = financeData?.currentCycle || {}
    
    // Get all orders (current cycle + past cycles) without duplicates
    const allOrders = []
    const seenOrderIds = new Set()
    
    // Add current cycle orders
    if (financeData?.currentCycle?.orders && financeData.currentCycle.orders.length > 0) {
      financeData.currentCycle.orders.forEach(order => {
        const id = order.orderId || order._id?.toString()
        if (id && !seenOrderIds.has(id)) {
          seenOrderIds.add(id)
          allOrders.push({
            ...order,
            cycle: 'Current Cycle'
          })
        }
      })
    }
    
    // Add past cycles orders
    if (pastCyclesData?.orders && pastCyclesData.orders.length > 0) {
      pastCyclesData.orders.forEach(order => {
        const id = order.orderId || order._id?.toString()
        if (id && !seenOrderIds.has(id)) {
          seenOrderIds.add(id)
          allOrders.push({
            ...order,
            cycle: 'Past Cycle'
          })
        }
      })
    }

    // Sort all orders descending (latest first)
    allOrders.sort((a, b) => {
      const dateA = new Date(a.deliveredAt || a.createdAt);
      const dateB = new Date(b.deliveredAt || b.createdAt);
      return dateB - dateA;
    });
    
    return {
      restaurantName,
      restaurantId,
      dateRange: selectedDateRange,
      currentCycle: {
        start: currentCycleDates.start,
        end: currentCycleDates.end,
        month: currentCycleDates.month,
        year: currentCycleDates.year,
        estimatedPayout: `₹${(currentCycle.estimatedPayout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        orders: currentCycle.totalOrders || 0,
        payoutDate: currentCycle.payoutDate ? new Date(currentCycle.payoutDate).toLocaleDateString('en-IN') : "-"
      },
      pastCycles: pastCyclesData,
      allOrders: allOrders
    }
  }

  // Generate HTML content for the report
  const generateHTMLContent = (reportData) => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Finance Report - ${reportData.dateRange}</title>
        <meta charset="UTF-8">
        <style>
          body { 
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
            margin: 0; 
            padding: 20px;
            width: 190mm;
            box-sizing: border-box;
            color: #334155;
            background-color: #ffffff;
            -webkit-print-color-adjust: exact;
          }
          .header-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 20px;
            margin-bottom: 25px;
          }
          .restaurant-info h1 {
            margin: 0;
            font-size: 22px;
            color: #0f172a;
            font-weight: 800;
          }
          .restaurant-info p {
            margin: 4px 0 0 0;
            font-size: 13px;
            color: #64748b;
            font-weight: 500;
          }
          .report-meta {
            text-align: right;
          }
          .report-meta h2 {
            margin: 0;
            font-size: 18px;
            color: #0f172a;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .report-meta p {
            margin: 4px 0 0 0;
            font-size: 11px;
            color: #64748b;
          }
          .section {
            margin-bottom: 25px;
          }
          .section-title {
            font-size: 14px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 12px;
            color: #0f172a;
          }
          .orders-table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            margin-top: 10px;
          }
          .orders-table th, .orders-table td {
            word-wrap: break-word;
            word-break: break-all;
            white-space: normal;
          }
          .orders-table th {
            background-color: #0f172a;
            color: #ffffff;
            padding: 10px 8px;
            text-align: left;
            font-weight: bold;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border: 1px solid #1e293b;
          }
          .orders-table th.num-col, .orders-table td.num-col {
            text-align: right;
          }
          .orders-table td {
            padding: 9px 8px;
            border: 1px solid #e2e8f0;
            font-size: 10px;
            color: #334155;
          }
          .orders-table tr:nth-child(even) {
            background-color: #f8fafc;
          }
          .orders-table tr.total-row {
            background-color: #f0fdf4 !important;
            font-weight: bold;
            color: #166534;
          }
          .orders-table tr.total-row td {
            border: 1px solid #bbf7d0;
            font-size: 11px;
            color: #166534;
          }
          .footer {
            margin-top: 35px;
            padding-top: 15px;
            border-top: 1px solid #e2e8f0;
            text-align: center;
            font-size: 10px;
            color: #94a3b8;
          }
          @media print {
            body { margin: 0; }
            .orders-table { page-break-inside: auto; }
            .orders-table tr { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header-container">
          <div class="restaurant-info">
            <h1>${reportData.restaurantName}</h1>
            <p>ID: ${reportData.restaurantId}</p>
          </div>
          <div class="report-meta">
            <h2>Finance Report</h2>
            <p>Period: ${reportData.dateRange}</p>
            <p>Generated: ${new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</p>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Detailed Order Wise Report</div>
          ${reportData.allOrders && reportData.allOrders.length > 0 ? `
            <table class="orders-table">
              <thead>
                <tr>
                  <th style="width: 6%;">S.No.</th>
                  <th style="width: 22%;">Order ID</th>
                  <th style="width: 14%;">Order Date</th>
                  <th style="width: 35%;">Food Items</th>
                  <th class="num-col" style="width: 11%;">Subtotal</th>
                  <th class="num-col" style="width: 12%;">Earning</th>
                </tr>
              </thead>
              <tbody>
                ${reportData.allOrders.map((order, index) => {
                  const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN') : (order.deliveredAt ? new Date(order.deliveredAt).toLocaleDateString('en-IN') : 'N/A')
                  const foodItems = order.foodNames || (order.items && order.items.map(item => item.name).join(', ')) || 'N/A'
                  const subtotal = order.orderTotal || 0
                  const earning = order.payout || 0
                  
                  return `
                    <tr>
                      <td>${index + 1}</td>
                      <td>${order.orderId || 'N/A'}</td>
                      <td>${orderDate}</td>
                      <td>${foodItems}</td>
                      <td class="num-col">₹${subtotal.toFixed(2)}</td>
                      <td class="num-col" style="font-weight: 600; color: #0f172a;">₹${earning.toFixed(2)}</td>
                    </tr>
                  `
                }).join('')}
              </tbody>
              <tfoot>
                <tr class="total-row">
                  <td colspan="4" style="text-align: right; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; border-right: none;">Total Summary:</td>
                  <td class="num-col">₹${reportData.allOrders.reduce((sum, order) => sum + (order.orderTotal || 0), 0).toFixed(2)}</td>
                  <td class="num-col">₹${reportData.allOrders.reduce((sum, order) => sum + (order.payout || 0), 0).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          ` : `
          <div class="info-row">
            <span class="info-label">Status:</span>
              <span class="info-value">No orders available</span>
          </div>
          `}
        </div>

        <div class="footer">
          <p>This is an auto-generated report. For detailed information, please visit the Finance section.</p>
          <p>Total Orders: ${reportData.allOrders?.length || 0} | Total Earnings: ₹${reportData.allOrders?.reduce((sum, order) => sum + (order.payout || 0), 0).toFixed(2) || '0.00'}</p>
        </div>
      </body>
      </html>
    `
  }

  // Download Invoice PDF - For Invoices & Taxes section
  const downloadInvoice = async (type = 'current') => {
    try {
      const reportData = getReportData()
      const htmlContent = generateHTMLContent(reportData)
      
      console.log('📄 Generating Invoice PDF...')
      
      // Create a temporary hidden iframe to render HTML properly
      const iframe = document.createElement('iframe')
      iframe.style.position = 'absolute'
      iframe.style.left = '-9999px'
      iframe.style.top = '0'
      iframe.style.width = '210mm'
      iframe.style.height = '297mm'
      iframe.style.border = 'none'
      document.body.appendChild(iframe)
      
      // Write HTML to iframe
      iframe.contentDocument.open()
      iframe.contentDocument.write(htmlContent)
      iframe.contentDocument.close()
      
      // Wait for iframe content to load
      await new Promise((resolve) => {
        if (iframe.contentDocument.readyState === 'complete') {
          resolve()
        } else {
          iframe.contentWindow.onload = resolve
          setTimeout(resolve, 1000)
        }
      })
      
      await new Promise(resolve => setTimeout(resolve, 500))
      
      const html2canvas = (await import('html2canvas')).default
      const { default: jsPDF } = await import('jspdf')
    
      const iframeBody = iframe.contentDocument.body
      
      const canvas = await html2canvas(iframeBody, {
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: iframeBody.scrollWidth,
        height: iframeBody.scrollHeight
      })
      
      document.body.removeChild(iframe)
    
      const imgWidth = 210
      const pageHeight = 297
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      
      const pdf = new jsPDF('p', 'mm', 'a4')
      let heightLeft = imgHeight
      let position = 0
      
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
      
      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }
      
      const fileName = type === 'current' 
        ? `invoice-current-cycle-${new Date().toISOString().split("T")[0]}.pdf`
        : `invoice-${reportData.dateRange.replace(/\s+/g, '-').replace(/'/g, '')}_${new Date().toISOString().split("T")[0]}.pdf`
      
      pdf.save(fileName)
      console.log('✅ Invoice downloaded successfully!')
    } catch (error) {
      console.error('❌ Error downloading invoice:', error)
      alert(`Failed to download invoice: ${error.message}`)
    }
  }

  // Download PDF report - Direct download without print dialog
  const downloadPDF = async () => {
    try {
      setShowDownloadMenu(false)
      
    const reportData = getReportData()
    const htmlContent = generateHTMLContent(reportData)
    
      console.log('📄 Generating PDF...')
      
      // Create a temporary hidden iframe to render HTML properly
      const iframe = document.createElement('iframe')
      iframe.style.position = 'absolute'
      iframe.style.left = '-9999px'
      iframe.style.top = '0'
      iframe.style.width = '210mm'
      iframe.style.height = '297mm'
      iframe.style.border = 'none'
      document.body.appendChild(iframe)
      
      // Write HTML to iframe
      iframe.contentDocument.open()
      iframe.contentDocument.write(htmlContent)
      iframe.contentDocument.close()
      
      // Wait for iframe content to load
      await new Promise((resolve) => {
        if (iframe.contentDocument.readyState === 'complete') {
          resolve()
        } else {
          iframe.contentWindow.onload = resolve
          setTimeout(resolve, 1000) // Fallback timeout
        }
      })
      
      // Wait a bit more for styles to apply
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Import html2canvas and jsPDF dynamically
      console.log('📦 Loading libraries...')
      const html2canvas = (await import('html2canvas')).default
      const { default: jsPDF } = await import('jspdf')
    
      // Get the body element from iframe
      const iframeBody = iframe.contentDocument.body
      
      console.log('🎨 Converting to canvas...')
      // Convert HTML to canvas
      const canvas = await html2canvas(iframeBody, {
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: iframeBody.scrollWidth,
        height: iframeBody.scrollHeight
      })
      
      console.log('✅ Canvas created:', canvas.width, 'x', canvas.height)
      
      // Remove temporary iframe
      document.body.removeChild(iframe)
    
      // Calculate PDF dimensions
      const imgWidth = 210 // A4 width in mm
      const pageHeight = 297 // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      
      console.log('📐 PDF dimensions:', imgWidth, 'x', imgHeight, 'mm')
      
      // Create PDF
      const pdf = new jsPDF('p', 'mm', 'a4')
      let heightLeft = imgHeight
      let position = 0
      
      // Add first page
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
      
      // Add additional pages if content is longer than one page
      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }
      
      // Download PDF
      const fileName = `finance-report-${reportData.dateRange.replace(/\s+/g, '-').replace(/'/g, '')}_${new Date().toISOString().split("T")[0]}.pdf`
      console.log('💾 Downloading PDF:', fileName)
      pdf.save(fileName)
      console.log('✅ PDF downloaded successfully!')
    } catch (error) {
      console.error('❌ Error downloading PDF:', error)
      console.error('Error details:', error.stack)
      alert(`Failed to download PDF: ${error.message}. Please check console for details.`)
    setShowDownloadMenu(false)
    }
  }

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target)) {
        setShowDownloadMenu(false)
      }
      if (dateRangePickerRef.current && !dateRangePickerRef.current.contains(event.target)) {
        setShowDateRangePicker(false)
      }
    }
    
    if (showDownloadMenu || showDateRangePicker) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDownloadMenu, showDateRangePicker])

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Navbar */}
      <div className="sticky bg-white top-0 z-40 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0 flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="text-lg font-bold text-gray-900 truncate">
                  {restaurantData?.onboarding?.step1?.restaurantName 
                    || financeData?.restaurant?.onboarding?.step1?.restaurantName
                    || restaurantData?.name 
                    || financeData?.restaurant?.name 
                    || "Restaurant"}
                </p>
                <ChevronDown className="w-4 h-4 text-gray-600 flex-shrink-0" />
              </div>
              <p className="text-xs text-gray-600 mt-0.5">
                {(() => {
                  const restaurantId = restaurantData?.restaurantId || financeData?.restaurant?.restaurantId
                  const address = restaurantData?.address || financeData?.restaurant?.address || ''
                  const parts = []
                  if (restaurantId) {
                    const formattedId = formatRestaurantId(restaurantId)
                    parts.push(`ID: ${formattedId}`)
                  }
                  if (address) {
                    const shortAddress = address.length > 40 ? address.substring(0, 40) + '...' : address
                    parts.push(shortAddress)
                  }
                  return parts.length > 0 ? parts.join(' • ') : 'Loading...'
                })()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <button
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              onClick={() => navigate("/restaurant/withdrawal-history")}
              title="Withdrawal History"
            >
              <Wallet className="w-5 h-5 text-gray-700" />
            </button>
            <button
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              onClick={() => navigate("/restaurant/notifications")}
            >
              <Bell className="w-5 h-5 text-gray-700" />
            </button>
            <button
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              onClick={() => navigate("/restaurant/explore")}
            >
              <Menu className="w-5 h-5 text-gray-700" />
            </button>
          </div>
        </div>
      </div>



      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-28">
        {activeTab === "payouts" && (
          <div className="space-y-6">
            {/* Current cycle */}
            <div>
              <h2 className="text-base font-bold text-gray-900 mb-3">Current cycle</h2>
              <div className="bg-white rounded-lg p-4">
                {loading ? (
                  <div className="py-8 text-center text-gray-500">Loading...</div>
                ) : (
                  <>
                    <p className="text-xs text-gray-600 mb-1">Available to withdraw</p>
                    <p className="text-4xl font-bold text-gray-900 mb-2">
                      ₹{Number(withdrawableBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <p className="text-sm text-gray-600">
                        {financeData?.currentCycle?.totalOrders || 0} {financeData?.currentCycle?.totalOrders === 1 ? 'order' : 'orders'}
                      </p>
                      <p className="text-sm text-gray-600">
                        Total earning: <span className="font-semibold text-gray-900">₹{Number(lifetimeEarnings || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </p>
                    </div>
                    {Number(withdrawableBalance || 0) > 0 && (
                      <button
                        onClick={() => {
                          if (!withdrawAllowed) return
                          setShowWithdrawalModal(true)
                        }}
                        disabled={!withdrawAllowed}
                        className={`w-full py-3 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 mt-4 transition-colors ${
                          withdrawAllowed
                            ? "bg-black text-white hover:bg-gray-800"
                            : "bg-gray-200 text-gray-500 cursor-not-allowed"
                        }`}
                      >
                        {withdrawAllowed ? (
                          <>
                            <Wallet className="h-5 w-5" />
                            Withdraw
                          </>
                        ) : (
                          <>
                            <Lock className="h-5 w-5" />
                            Withdraw (Locked)
                          </>
                        )}
                      </button>
                    )}
                    {!withdrawAllowed && withdrawMessage && (
                      <p className="mt-2 text-xs text-gray-500">
                        {withdrawMessage}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Orders History */}
            <div>
              <h2 className="text-base font-bold text-gray-900 mb-3">Orders History</h2>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1 relative" ref={dateRangePickerRef}>
                    <button 
                      onClick={() => setShowDateRangePicker(!showDateRangePicker)}
                      className="w-full bg-white rounded-lg px-4 py-3 flex items-center justify-between border border-gray-200 hover:border-gray-300 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-600" />
                        <span className="text-sm font-semibold text-gray-900">
                          {filterType === 'all' ? 'All' : `Date Wise: ${selectedDateRange}`}
                        </span>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${showDateRangePicker ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {/* Date Range Picker Dropdown */}
                    <AnimatePresence>
                      {showDateRangePicker && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden"
                        >
                          <div className="py-1">
                            <button
                              onClick={() => {
                                setFilterType('all')
                                setShowDateRangePicker(false)
                              }}
                              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors text-sm font-medium flex items-center justify-between ${filterType === 'all' ? 'text-black bg-gray-50/50' : 'text-gray-700'}`}
                            >
                              <span>All</span>
                              {filterType === 'all' && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                            </button>
                            <button
                              onClick={() => {
                                setFilterType('date_wise')
                                setShowDateRangePicker(false)
                              }}
                              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors text-sm font-medium flex items-center justify-between ${filterType === 'date_wise' ? 'text-black bg-gray-50/50' : 'text-gray-700'}`}
                            >
                              <span>Date Wise</span>
                              {filterType === 'date_wise' && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="relative" ref={downloadMenuRef}>
                    <button 
                      onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                      className="bg-black text-white rounded-lg px-4 py-3 flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span className="text-sm font-medium">Get report</span>
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    
                    <AnimatePresence>
                      {showDownloadMenu && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -10 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 z-50 min-w-[180px]"
                        >
                          <button
                            onClick={downloadPDF}
                            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <div className="w-6 h-6 rounded-md bg-red-50 flex items-center justify-center">
                              <FileText className="w-4 h-4 text-red-600" />
                            </div>
                            <span>Download PDF</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                {/* Custom Date Picker inputs */}
                <AnimatePresence>
                  {filterType === 'date_wise' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, scale: 0.95 }}
                      animate={{ opacity: 1, height: 'auto', scale: 1 }}
                      exit={{ opacity: 0, height: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center overflow-hidden"
                    >
                      <div className="w-full sm:flex-1">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">From Date</label>
                        <input 
                          type="date" 
                          value={customStartDate} 
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="w-full bg-gray-50 hover:bg-gray-100/70 focus:bg-white border border-gray-200 focus:border-black rounded-lg px-3 py-2 text-sm text-gray-900 outline-none transition-all cursor-pointer font-medium"
                        />
                      </div>
                      <div className="w-full sm:flex-1">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">To Date</label>
                        <input 
                          type="date" 
                          value={customEndDate} 
                          min={customStartDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="w-full bg-gray-50 hover:bg-gray-100/70 focus:bg-white border border-gray-200 focus:border-black rounded-lg px-3 py-2 text-sm text-gray-900 outline-none transition-all cursor-pointer font-medium"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                {loadingPastCycles ? (
                  <div className="bg-white rounded-lg p-4">
                    <p className="text-sm text-gray-600 text-center">Loading orders...</p>
                  </div>
                ) : !pastCyclesData ? (
                  <div className="bg-white rounded-lg p-6 text-center text-gray-500 font-medium">
                    No orders found.
                  </div>
                ) : (
                  <>
                    {/* Show past cycles orders if available */}
                    {pastCyclesData && paginatedOrders && paginatedOrders.length > 0 ? (
                      <>
                        <div className="bg-white rounded-lg p-4 space-y-3">
                          {paginatedOrders.map((order, index) => {
                            const serialNumber = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;
                            const dateStr = new Date(order.deliveredAt || order.createdAt).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true
                            });
                            
                            return (
                              <div key={order.orderId || index} className="border-b border-gray-150 pb-3 pt-1 last:border-b-0 last:pb-0">
                                <div className="flex justify-between items-start">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                      <p className="text-xs font-bold text-gray-900">
                                        {serialNumber}. {order.isDining ? 'Booking' : 'Order'}: {order.orderId || 'N/A'}
                                      </p>
                                      {order.isDining && (
                                        <span className="px-1.5 py-0.5 bg-teal-50 text-teal-700 text-[10px] font-semibold rounded-full">
                                          Dining
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-gray-400 font-medium mb-1">
                                      {dateStr}
                                    </p>
                                    <p className="text-[11px] text-gray-500 leading-relaxed max-w-[180px] sm:max-w-md">
                                      {order.foodNames || (order.items && order.items.map(item => item.name).join(', ')) || 'N/A'}
                                    </p>
                                  </div>
                                  
                                  <div className="text-right ml-4 shrink-0 flex flex-col items-end justify-center self-center">
                                    <p className="text-sm font-bold text-gray-900">
                                      ₹{Math.round(order.orderTotal)} <span className="text-xs font-extrabold text-emerald-600">(+₹{Number(order.payout || 0).toFixed(2)})</span>
                                    </p>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">
                                      Earning
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-gray-200 mt-3">
                            <button
                              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                              disabled={currentPage === 1}
                              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors ${
                                currentPage === 1
                                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                  : "bg-gray-50 text-gray-700 hover:bg-gray-100 active:bg-gray-200 cursor-pointer"
                              }`}
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                              Prev
                            </button>
                            
                            <span className="text-xs font-bold text-gray-700">
                              Page {currentPage} of {totalPages}
                            </span>
                            
                            <button
                              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                              disabled={currentPage === totalPages}
                              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors ${
                                currentPage === totalPages
                                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                  : "bg-gray-50 text-gray-700 hover:bg-gray-100 active:bg-gray-200 cursor-pointer"
                              }`}
                            >
                              Next
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="bg-white rounded-lg p-6 text-center text-gray-500 font-medium">
                        No orders found for the selected period.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "invoices" && (
          <div className="space-y-6">
            <h2 className="text-base font-bold text-gray-900 mb-3">Invoices & Taxes</h2>
            {loading ? (
              <div className="bg-white rounded-lg p-6 text-center text-gray-500">Loading...</div>
            ) : (
              <div className="space-y-4">

                {pastCyclesData?.orders?.length > 0 && (
                  <div className="bg-white rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-700 mb-2">Selected period</p>
                        <p className="text-lg font-bold text-gray-900">
                          ₹{(pastCyclesData.orders || []).reduce((sum, o) => sum + (Number(o.payout) || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {pastCyclesData.orders?.length ?? 0} orders in selected range. Tax as per applicable laws.
                        </p>
                      </div>
                      <button
                        onClick={() => downloadInvoice('past')}
                        className="ml-4 p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors shrink-0"
                        title="Download Invoice"
                      >
                        <Download className="w-5 h-5 text-gray-700" />
                      </button>
                    </div>
                  </div>
                )}
                {!financeData?.currentCycle && !loading && (
                  <div className="bg-white rounded-lg p-6 text-center text-gray-500">
                    No invoice data available. Complete orders to see payouts and tax summary here.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Withdrawal Modal */}
      <AnimatePresence>
        {showWithdrawalModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setShowWithdrawalModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Withdraw Amount</h2>
                  <button
                    onClick={() => {
                      setShowWithdrawalModal(false)
                      setWithdrawalAmount('')
                    }}
                    className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
                
                <div className="mb-4">
                  <p className="text-sm text-gray-600 mb-1">
                    Available to withdraw: <span className="font-semibold text-gray-900">₹{Number(withdrawableBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </p>
                  <p className="text-xs text-gray-500 mb-2">
                    Total earning: ₹{Number(lifetimeEarnings || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Enter Amount to Withdraw
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={withdrawalAmount}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\s/g, '').replace(/[^0-9.]/g, '')
                      const num = parseFloat(v)
                      const valid = v === '' || v === '.' || v.endsWith('.') || (!Number.isNaN(num) && num >= 0 && num <= 999999)
                      if (valid) setWithdrawalAmount(v)
                    }}
                    placeholder="0.00"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none"
                  />
                  {withdrawalAmount && parseFloat(withdrawalAmount) > Number(withdrawableBalance || 0) && (
                    <p className="text-sm text-red-600 mt-1">Amount cannot exceed available balance</p>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowWithdrawalModal(false)
                      setWithdrawalAmount('')
                    }}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      const amount = Number(withdrawalAmount?.replace?.(/,/g, '')) || parseFloat(withdrawalAmount)
                      if (!Number.isFinite(amount) || amount <= 0) {
                        alert('Please enter a valid amount')
                        return
                      }
                      const maxAllowed = Number(withdrawableBalance || 0)
                      if (amount > maxAllowed) {
                        alert('Amount cannot exceed available balance')
                        return
                      }
                      
                      try {
                        setSubmittingWithdrawal(true)
                        const response = await restaurantAPI.createWithdrawalRequest(amount)
                        if (response.data?.success) {
                          toast.success('Withdrawal request submitted successfully!')
                          setShowWithdrawalModal(false)
                          setWithdrawalAmount('')
                          await fetchFinanceData()
                          await fetchWithdrawWindow()
                        } else {
                          const msg = response.data?.message || 'Failed to submit withdrawal request'
                          toast.error(msg)
                        }
                      } catch (error) {
                        console.error('Error submitting withdrawal request:', error)
                        const status = error.response?.status
                        const msg =
                          error.response?.data?.message ||
                          error.message ||
                          'Failed to submit withdrawal request. Please try again.'
                        if (status === 409) {
                          toast.error(msg)
                          setShowWithdrawalModal(false)
                          await fetchWithdrawWindow()
                        } else {
                          toast.error(msg)
                        }
                      } finally {
                        setSubmittingWithdrawal(false)
                      }
                    }}
                    disabled={submittingWithdrawal || !withdrawalAmount || parseFloat(withdrawalAmount) <= 0 || parseFloat(withdrawalAmount) > Number(withdrawableBalance || 0)}
                    className="flex-1 px-4 py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {submittingWithdrawal ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <BottomNavOrders />
    </div>
  )
}
