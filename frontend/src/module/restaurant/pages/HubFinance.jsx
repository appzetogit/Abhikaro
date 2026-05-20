import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Bell, Menu, ChevronDown, Calendar, Download, ArrowRight, FileText, Wallet, X, Lock } from "lucide-react"
import BottomNavOrders from "../components/BottomNavOrders"
import { restaurantAPI } from "@/lib/api"
import { toast } from "sonner"

export default function HubFinance() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get("tab")
    return tabParam === "invoices" ? "invoices" : "payouts"
  })
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
  const [financeData, setFinanceData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pastCyclesData, setPastCyclesData] = useState(null)
  const [loadingPastCycles, setLoadingPastCycles] = useState(false)
  const [restaurantData, setRestaurantData] = useState(null)
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false)
  const [withdrawalAmount, setWithdrawalAmount] = useState('')
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false)
  const [withdrawWindow, setWithdrawWindow] = useState({
    allowed: true,
    message: "",
  })
  const [walletSummary, setWalletSummary] = useState(null)

  const fetchFinanceData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await restaurantAPI.getFinance()
      if (response.data?.success && response.data?.data) {
        setFinanceData(response.data.data)
      }
    } catch (error) {
      if (error.response?.status !== 401) {
        console.error('❌ Error fetching finance data:', error)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchWithdrawWindow = useCallback(async () => {
    try {
      const res = await restaurantAPI.getWallet()
      const wallet =
        res?.data?.data?.wallet || res?.data?.wallet || res?.data?.data || null
      setWithdrawWindow({
        allowed: wallet?.withdrawAllowed ?? true,
        message: wallet?.withdrawMessage || "",
      })
      setWalletSummary(wallet || null)
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
  }, [])

  // Fetch finance data on mount
  useEffect(() => {
    fetchFinanceData()
    fetchWithdrawWindow()
  }, [fetchFinanceData, fetchWithdrawWindow])

  // Refetch when switching to Invoices & Taxes tab so data is up to date
  useEffect(() => {
    if (activeTab === 'invoices') {
      fetchFinanceData()
    }
  }, [activeTab, fetchFinanceData])

  useEffect(() => {
    const handleVisibility = () => { if (document.visibilityState === 'visible') fetchFinanceData() }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [fetchFinanceData])

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
  const withdrawableBalance = financeData?.currentCycle?.withdrawableBalance ?? cycleEarnings
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
    
    // Get all orders (current cycle + past cycles)
    const allOrders = []
    
    // Add current cycle orders
    if (financeData?.currentCycle?.orders && financeData.currentCycle.orders.length > 0) {
      financeData.currentCycle.orders.forEach(order => {
        allOrders.push({
          ...order,
          cycle: 'Current Cycle'
        })
      })
    }
    
    // Add past cycles orders
    if (pastCyclesData?.orders && pastCyclesData.orders.length > 0) {
      pastCyclesData.orders.forEach(order => {
        allOrders.push({
          ...order,
          cycle: 'Past Cycle'
        })
      })
    }
    
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
            font-family: Arial, sans-serif; 
            margin: 20px; 
            color: #333;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #000;
            padding-bottom: 20px;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            color: #000;
          }
          .header p {
            margin: 5px 0;
            font-size: 12px;
            color: #666;
          }
          .section {
            margin-bottom: 25px;
          }
          .section-title {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 15px;
            color: #000;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px dashed #ccc;
          }
          .info-label {
            font-weight: 600;
            color: #333;
          }
          .info-value {
            color: #000;
            font-weight: 600;
          }
          .current-cycle {
            background-color: #f9f9f9;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
          }
          .payout-amount {
            font-size: 32px;
            font-weight: bold;
            color: #000;
            margin: 10px 0;
          }
          .orders-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          .orders-table th {
            background-color: #f5f5f5;
            padding: 10px;
            text-align: left;
            border: 1px solid #ddd;
            font-weight: bold;
            font-size: 11px;
          }
          .orders-table td {
            padding: 8px;
            border: 1px solid #ddd;
            font-size: 11px;
          }
          .orders-table tr:nth-child(even) {
            background-color: #f9f9f9;
          }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ccc;
            text-align: center;
            font-size: 11px;
            color: #666;
          }
          @media print {
            body { margin: 0; }
            .current-cycle { page-break-inside: avoid; }
            .orders-table { page-break-inside: auto; }
            .orders-table tr { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Finance Report</h1>
          <p>${reportData.restaurantName}</p>
          <p>ID: ${reportData.restaurantId}</p>
          <p>Generated on: ${new Date().toLocaleString('en-IN')}</p>
        </div>

        <div class="section">
          <div class="section-title">Current Cycle</div>
          <div class="current-cycle">
            <p style="font-size: 12px; color: #666; margin: 0 0 5px 0;">
              Est. payout (${reportData.currentCycle.start} - ${reportData.currentCycle.end} ${reportData.currentCycle.month})
            </p>
            <div class="payout-amount">${reportData.currentCycle.estimatedPayout}</div>
            <p style="font-size: 14px; color: #666; margin: 5px 0;">${reportData.currentCycle.orders} orders</p>
            <div class="info-row">
              <div>
                <p class="info-label" style="font-size: 11px; margin: 5px 0;">Payout for</p>
                <p style="margin: 0; font-weight: 600;">${reportData.currentCycle.start} - ${reportData.currentCycle.end} ${reportData.currentCycle.month}'${reportData.currentCycle.year}</p>
              </div>
              <div style="text-align: right;">
                <p class="info-label" style="font-size: 11px; margin: 5px 0;">Payout date</p>
                <p style="margin: 0; font-weight: 600;">${reportData.currentCycle.payoutDate}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Detailed Order Wise Report</div>
          ${reportData.allOrders && reportData.allOrders.length > 0 ? `
            <table class="orders-table">
              <thead>
                <tr>
                  <th>Cycle</th>
                  <th>Order ID</th>
                  <th>Order Date</th>
                  <th>Food Items</th>
                  <th>Item Qty</th>
                  <th>Order Amount</th>
                  <th>Restaurant Earning/Profit</th>
                </tr>
              </thead>
              <tbody>
                ${reportData.allOrders.map(order => {
                  const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN') : (order.deliveredAt ? new Date(order.deliveredAt).toLocaleDateString('en-IN') : 'N/A')
                  const foodItems = order.foodNames || (order.items && order.items.map(item => item.name).join(', ')) || 'N/A'
                  const itemQuantities = order.items ? order.items.map(item => (item.quantity || 1).toString()).join(', ') : 'N/A'
                  const orderAmount = order.totalAmount || order.orderTotal || order.amount || 0
                  const earning = order.payout || order.restaurantEarning || 0
                  
                  return `
                    <tr>
                      <td>${order.cycle || 'N/A'}</td>
                      <td>${order.orderId || 'N/A'}</td>
                      <td>${orderDate}</td>
                      <td>${foodItems}</td>
                      <td>${itemQuantities}</td>
                      <td>₹${orderAmount.toFixed(2)}</td>
                      <td>₹${earning.toFixed(2)}</td>
                    </tr>
                  `
                }).join('')}
              </tbody>
              <tfoot>
                <tr style="background-color: #e8f5e9; font-weight: bold;">
                  <td colspan="5" style="text-align: right;">Total Earnings:</td>
                  <td colspan="2">₹${reportData.allOrders.reduce((sum, order) => sum + (order.payout || order.restaurantEarning || 0), 0).toFixed(2)}</td>
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
          <p>Total Orders: ${reportData.allOrders?.length || 0} | Total Earnings: ₹${reportData.allOrders?.reduce((sum, order) => sum + (order.payout || order.restaurantEarning || 0), 0).toFixed(2) || '0.00'}</p>
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

      {/* Primary Navigation Tabs */}
      <div className="px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("payouts")}
            className={`flex-1 py-3 px-4 rounded-full font-medium text-sm transition-colors ${
              activeTab === "payouts"
                ? "bg-black text-white"
                : "bg-white text-gray-600 border border-gray-300"
            }`}
          >
            Payouts
          </button>
          <button
            onClick={() => setActiveTab("invoices")}
            className={`flex-1 py-3 px-4 rounded-full font-medium text-sm transition-colors ${
              activeTab === "invoices"
                ? "bg-black text-white"
                : "bg-white text-gray-600 border border-gray-300"
            }`}
          >
            Invoices & Taxes
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
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
                {loadingPastCycles || !pastCyclesData ? (
                  <div className="bg-white rounded-lg p-4">
                    <p className="text-sm text-gray-600 text-center">Loading orders...</p>
                  </div>
                ) : (
                  <>
                    {/* Show past cycles orders if available */}
                    {pastCyclesData && pastCyclesData.orders && pastCyclesData.orders.length > 0 ? (
                      <div className="bg-white rounded-lg p-4 space-y-3">
                        {pastCyclesData.orders.map((order, index) => (
                          <div key={order.orderId || index} className="border-b border-gray-200 pb-3 last:border-b-0 last:pb-0">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="text-sm font-semibold text-gray-900">
                                    {order.isDining ? 'Booking ID' : 'Order ID'}: {order.orderId || 'N/A'}
                                  </p>
                                  {order.isDining && (
                                    <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-xs font-medium rounded">
                                      Dining
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-600">
                                  {order.foodNames || (order.items && order.items.map(item => item.name).join(', ')) || 'N/A'}
                                </p>
                              </div>
                              <div className="text-right ml-4">
                                <p className="text-sm font-bold text-gray-900">
                                  ₹{(order.payout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Earning
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
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
                {financeData?.currentCycle && (
                  <div className="bg-white rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-700 mb-1">Current cycle</p>
                        <p className="text-2xl font-bold text-gray-900">
                          ₹{(financeData.currentCycle.estimatedPayout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {financeData.currentCycle.totalOrders ?? 0} orders • Payout includes applicable deductions. Tax liability as per local laws.
                        </p>
                      </div>
                      <button
                        onClick={() => downloadInvoice('current')}
                        className="ml-4 p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors shrink-0"
                        title="Download Invoice"
                      >
                        <Download className="w-5 h-5 text-gray-700" />
                      </button>
                    </div>
                  </div>
                )}
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
