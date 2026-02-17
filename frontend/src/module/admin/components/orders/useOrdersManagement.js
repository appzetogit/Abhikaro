import { useState, useMemo } from "react"
import { exportToCSV, exportToExcel, exportToPDF, exportToJSON } from "./ordersExportUtils"

export function useOrdersManagement(orders, statusKey, title) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isViewOrderOpen, setIsViewOrderOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [filters, setFilters] = useState({
    paymentStatus: "",
    deliveryType: "",
    minAmount: "",
    maxAmount: "",
    fromDate: "",
    toDate: "",
    restaurant: "",
  })
  const [visibleColumns, setVisibleColumns] = useState({
    si: true,
    orderId: true,
    orderDate: true,
    customer: true,
    restaurant: true,
    foodItems: true,
    totalAmount: true,
    paymentType: true,
    paymentCollectionStatus: true,
    orderStatus: true,
    actions: true,
  })

  // Get unique restaurants from orders
  const restaurants = useMemo(() => {
    return [...new Set(orders.map(o => o.restaurant))]
  }, [orders])

  // Apply search and filters
  const filteredOrders = useMemo(() => {
    let result = [...orders]

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(order => 
        order.orderId.toLowerCase().includes(query) ||
        order.customerName.toLowerCase().includes(query) ||
        order.restaurant.toLowerCase().includes(query) ||
        order.customerPhone.includes(query) ||
        order.totalAmount.toString().includes(query)
      )
    }

    // Apply filters
    if (filters.paymentStatus) {
      result = result.filter(order => {
        const orderStatus = order.paymentStatus
        const filterStatus = filters.paymentStatus
        return orderStatus === filterStatus || (filterStatus === 'Unpaid' && orderStatus === 'Pending')
      })
    }

    if (filters.deliveryType) {
      result = result.filter(order => order.deliveryType === filters.deliveryType)
    }

    if (filters.minAmount) {
      result = result.filter(order => order.totalAmount >= parseFloat(filters.minAmount))
    }

    if (filters.maxAmount) {
      result = result.filter(order => order.totalAmount <= parseFloat(filters.maxAmount))
    }

    if (filters.restaurant) {
      result = result.filter(order => order.restaurant === filters.restaurant)
    }

    // Helper function to parse date format "16 JUL 2025"
    const parseOrderDate = (dateStr) => {
      const months = {
        "JAN": "01", "FEB": "02", "MAR": "03", "APR": "04", "MAY": "05", "JUN": "06",
        "JUL": "07", "AUG": "08", "SEP": "09", "OCT": "10", "NOV": "11", "DEC": "12"
      }
      const parts = dateStr.split(" ")
      if (parts.length === 3) {
        const day = parts[0].padStart(2, "0")
        const month = months[parts[1].toUpperCase()] || "01"
        const year = parts[2]
        return new Date(`${year}-${month}-${day}`)
      }
      return new Date(dateStr)
    }

    if (filters.fromDate) {
      result = result.filter(order => {
        const orderDate = parseOrderDate(order.date)
        const fromDate = new Date(filters.fromDate)
        return orderDate >= fromDate
      })
    }

    if (filters.toDate) {
      result = result.filter(order => {
        const orderDate = parseOrderDate(order.date)
        const toDate = new Date(filters.toDate)
        toDate.setHours(23, 59, 59, 999) // Include entire day
        return orderDate <= toDate
      })
    }

    return result
  }, [orders, searchQuery, filters])

  const count = filteredOrders.length

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    return Object.values(filters).filter(value => value !== "").length
  }, [filters])

  const handleApplyFilters = () => {
    setIsFilterOpen(false)
  }

  const handleResetFilters = () => {
    setFilters({
      paymentStatus: "",
      deliveryType: "",
      minAmount: "",
      maxAmount: "",
      fromDate: "",
      toDate: "",
      restaurant: "",
    })
  }

  const handleExport = (format) => {
    const filename = title.toLowerCase().replace(/\s+/g, "_")
    switch (format) {
      case "csv":
        exportToCSV(filteredOrders, filename)
        break
      case "excel":
        exportToExcel(filteredOrders, filename)
        break
      case "pdf":
        exportToPDF(filteredOrders, filename)
        break
      case "json":
        exportToJSON(filteredOrders, filename)
        break
      default:
        break
    }
  }

  const handleViewOrder = (order) => {
    setSelectedOrder(order)
    setIsViewOrderOpen(true)
  }

  const handlePrintOrder = async (order) => {
    try {
      // Dynamic import of jsPDF and autoTable for instant PDF download
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')

      // Ensure a value is a single string for jsPDF (avoids array/object causing garbled output)
      const str = (v) => (v == null || v === '') ? '' : String(v)
      const num = (v) => (v != null && !Number.isNaN(Number(v))) ? Number(v) : 0
      const money = (v) => `Rs. ${num(v).toFixed(2)}`

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })

      // Add title
      doc.setFontSize(18)
      doc.setTextColor(30, 30, 30)
      doc.text('Order Invoice', 105, 20, { align: 'center' })

      // Order ID
      doc.setFontSize(12)
      doc.setTextColor(100, 100, 100)
      const orderId = str(order.orderId || order.id || order.subscriptionId || 'N/A')
      doc.text(str('Order ID: ' + orderId), 105, 28, { align: 'center' })

      // Date
      doc.setFontSize(10)
      const orderDate = order.date && order.time ? order.date + ', ' + order.time : str(order.date || new Date().toLocaleDateString())
      doc.text(str('Date: ' + orderDate), 105, 34, { align: 'center' })
      
      let startY = 45
      
      // Customer Information
      if (order.customerName || order.customerPhone || order.customerEmail) {
        doc.setFontSize(12)
        doc.setTextColor(30, 30, 30)
        doc.text('Customer Information', 14, startY)
        startY += 8
        
        doc.setFontSize(10)
        doc.setTextColor(60, 60, 60)
        if (order.customerName) {
          doc.text(str('Name: ' + order.customerName), 14, startY)
          startY += 6
        }
        if (order.customerPhone) {
          doc.text(str('Phone: ' + order.customerPhone), 14, startY)
          startY += 6
        }
        if (order.customerEmail) {
          doc.text(str('Email: ' + order.customerEmail), 14, startY)
          startY += 6
        }
        startY += 5
      }

      // Delivery Address
      const addr = order.address || {}
      const hasAddress = addr.street || addr.formattedAddress || addr.city || addr.address
      if (hasAddress) {
        doc.setFontSize(12)
        doc.setTextColor(30, 30, 30)
        doc.text('Delivery Address', 14, startY)
        startY += 8
        doc.setFontSize(10)
        doc.setTextColor(60, 60, 60)
        const addrParts = [
          addr.label,
          addr.street,
          addr.additionalDetails,
          addr.formattedAddress,
          addr.address,
          [addr.city, addr.state, addr.zipCode].filter(Boolean).join(', ')
        ].filter(Boolean)
        const addrStr = addrParts.join(', ') || 'N/A'
        const addrLines = doc.splitTextToSize(addrStr, 170)
        addrLines.forEach((line) => {
          doc.text(str(line), 14, startY)
          startY += 5
        })
        startY += 5
      }
      
      // Restaurant Information
      if (order.restaurant) {
        doc.setFontSize(12)
        doc.setTextColor(30, 30, 30)
        doc.text('Restaurant', 14, startY)
        startY += 8
        
        doc.setFontSize(10)
        doc.setTextColor(60, 60, 60)
        doc.text(str(order.restaurant), 14, startY)
        startY += 10
      }

      // Delivery Type
      if (order.deliveryType) {
        doc.setFontSize(10)
        doc.text(str('Delivery Type: ' + order.deliveryType), 14, startY)
        startY += 8
      }
      
      // Order Items Table (all cell values as strings to avoid garbled PDF output)
      if (order.items && Array.isArray(order.items) && order.items.length > 0) {
        const tableData = order.items.map((item) => {
          const qty = num(item.quantity) || 1
          const price = num(item.price)
          const rowTotal = qty * price
          const itemName = item.name || item.productName || item.itemName || 'Unknown Item'
          return [
            str(qty),
            str(itemName),
            money(price),
            money(rowTotal)
          ]
        })

        autoTable(doc, {
          startY: startY,
          head: [['Qty', 'Item Name', 'Price', 'Total']],
          body: tableData,
          theme: 'striped',
          headStyles: {
            fillColor: [59, 130, 246],
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 10
          },
          bodyStyles: {
            fontSize: 9,
            textColor: [30, 30, 30]
          },
          alternateRowStyles: {
            fillColor: [245, 247, 250]
          },
          styles: {
            cellPadding: 4,
            lineColor: [200, 200, 200],
            lineWidth: 0.5
          },
          columnStyles: {
            0: { cellWidth: 20, halign: 'center' },
            1: { cellWidth: 80 },
            2: { cellWidth: 35, halign: 'right' },
            3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
          },
          margin: { left: 14, right: 14 }
        })
        
        startY = doc.lastAutoTable.finalY + 10
      }

      // Bill breakdown (subtotal, discount, tax, delivery, total) - use str() so doc.text never gets an array
      doc.setFontSize(10)
      doc.setTextColor(60, 60, 60)
      if (order.totalItemAmount != null) {
        doc.text(str('Item Subtotal: ' + money(order.totalItemAmount)), 14, startY)
        startY += 6
      }
      if (order.itemDiscount != null && num(order.itemDiscount) > 0) {
        doc.text(str('Discount: -' + money(order.itemDiscount)), 14, startY)
        startY += 6
      }
      if (order.vatTax != null && num(order.vatTax) > 0) {
        doc.text(str('Taxes: ' + money(order.vatTax)), 14, startY)
        startY += 6
      }
      if (order.deliveryCharge != null && num(order.deliveryCharge) > 0) {
        doc.text(str('Delivery Charge: ' + money(order.deliveryCharge)), 14, startY)
        startY += 6
      }
      if (order.platformFee != null && num(order.platformFee) > 0) {
        doc.text(str('Platform Fee: ' + money(order.platformFee)), 14, startY)
        startY += 6
      }
      startY += 4

      // Total Amount
      if (order.totalAmount != null) {
        doc.setFontSize(14)
        doc.setTextColor(30, 30, 30)
        doc.setFont(undefined, 'bold')
        doc.text(str('Total Amount: ' + money(order.totalAmount)), 14, startY)
        startY += 8
      }

      // Payment Type & Status
      if (order.paymentType) {
        doc.setFontSize(10)
        doc.setTextColor(100, 100, 100)
        doc.setFont(undefined, 'normal')
        doc.text(str('Payment Type: ' + order.paymentType), 14, startY)
        startY += 6
      }
      if (order.paymentStatus) {
        doc.text(str('Payment Status: ' + order.paymentStatus), 14, startY)
        startY += 6
      }

      // Order Status
      if (order.orderStatus) {
        doc.text(str('Order Status: ' + order.orderStatus), 14, startY)
        startY += 6
      }

      // Order Note
      if (order.note && String(order.note).trim()) {
        doc.text(str('Order Note: ' + order.note), 14, startY)
        startY += 6
      }

      // Cancellation details (if cancelled)
      if (order.cancellationReason && String(order.cancellationReason).trim()) {
        doc.text(str('Cancellation Reason: ' + order.cancellationReason), 14, startY)
        startY += 6
      }

      // Delivery Partner (if assigned)
      if (order.deliveryPartnerName || order.deliveryPartnerPhone) {
        doc.text(str('Delivery Partner: ' + (order.deliveryPartnerName || 'N/A') + (order.deliveryPartnerPhone ? ' | ' + order.deliveryPartnerPhone : '')), 14, startY)
      }
      
      // Save the PDF instantly
      const filename = `Invoice_${orderId}_${new Date().toISOString().split("T")[0]}.pdf`
      doc.save(filename)
    } catch (error) {
      console.error("Error generating PDF invoice:", error)
      alert("Failed to download PDF invoice. Please try again.")
    }
  }

  const toggleColumn = (columnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }))
  }

  const resetColumns = () => {
    setVisibleColumns({
      si: true,
      orderId: true,
      orderDate: true,
      customer: true,
      restaurant: true,
      foodItems: true,
      totalAmount: true,
      paymentType: true,
      paymentCollectionStatus: true,
      orderStatus: true,
      actions: true,
    })
  }

  return {
    searchQuery,
    setSearchQuery,
    isFilterOpen,
    setIsFilterOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    isViewOrderOpen,
    setIsViewOrderOpen,
    selectedOrder,
    filters,
    setFilters,
    visibleColumns,
    filteredOrders,
    count,
    activeFiltersCount,
    restaurants,
    handleApplyFilters,
    handleResetFilters,
    handleExport,
    handleViewOrder,
    handlePrintOrder,
    toggleColumn,
    resetColumns,
  }
}

