import { useState, useMemo } from "react"
import { exportToExcel, exportToPDF } from "./ordersExportUtils"

export function useGenericTableManagement(data, title, searchFields = []) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isViewOrderOpen, setIsViewOrderOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [filters, setFilters] = useState({})
  const [visibleColumns, setVisibleColumns] = useState({})

  // Apply search
  const filteredData = useMemo(() => {
    let result = [...data]

    // Apply search query
    if (searchQuery.trim() && searchFields.length > 0) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(item => 
        searchFields.some(field => {
          const value = item[field]
          return value && value.toString().toLowerCase().includes(query)
        })
      )
    }

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return

      // Special handling for paymentStatus
      if (key === 'paymentStatus') {
        result = result.filter(item => {
          const order = item.originalOrder || item
          const orderStatus = order.paymentStatus
          return orderStatus === value || (value === 'Unpaid' && orderStatus === 'Pending')
        })
        return
      }

      // Special handling for deliveryType
      if (key === 'deliveryType') {
        result = result.filter(item => {
          const order = item.originalOrder || item
          return order.deliveryType === value
        })
        return
      }

      // Special handling for minAmount
      if (key === 'minAmount') {
        const minVal = parseFloat(value)
        result = result.filter(item => {
          const order = item.originalOrder || item
          const amt = order.pricing?.total ?? order.totalAmount ?? item.totalAmount ?? 0
          return parseFloat(amt) >= minVal
        })
        return
      }

      // Special handling for maxAmount
      if (key === 'maxAmount') {
        const maxVal = parseFloat(value)
        result = result.filter(item => {
          const order = item.originalOrder || item
          const amt = order.pricing?.total ?? order.totalAmount ?? item.totalAmount ?? 0
          return parseFloat(amt) <= maxVal
        })
        return
      }

      // Special handling for restaurant
      if (key === 'restaurant') {
        result = result.filter(item => {
          const order = item.originalOrder || item
          const rest = order.restaurant ?? item.restaurantName ?? item.restaurant ?? ''
          return rest === value
        })
        return
      }

      // Special handling for hotel
      if (key === 'hotel') {
        result = result.filter(item => {
          const order = item.originalOrder || item
          const h = order.hotelName ?? item.hotelName ?? item.hotel ?? ''
          return h === value
        })
        return
      }

      // Special handling for paymentType
      if (key === 'paymentType') {
        if (Array.isArray(value) && value.length > 0) {
          // Helper function to get standardized payment type display
          const getOrderPaymentTypeDisplay = (order) => {
            let paymentTypeDisplay = order.paymentType
            const rawMethod = (order.payment?.method || order.paymentMethod || '').toLowerCase()
            const isPayAtHotelMethod = rawMethod === 'pay_at_hotel'
            const isPayAtHotelRazorpay =
              isPayAtHotelMethod &&
              (order.payment?.razorpayOrderId || order.payment?.razorpayPaymentId)

            if (!paymentTypeDisplay) {
              if (rawMethod === 'cash' || rawMethod === 'cod') {
                paymentTypeDisplay = 'Cash on Delivery'
              } else if (rawMethod === 'wallet') {
                paymentTypeDisplay = 'Wallet'
              } else if (isPayAtHotelRazorpay) {
                paymentTypeDisplay = 'Pay at Hotel (Razorpay)'
              } else if (isPayAtHotelMethod) {
                paymentTypeDisplay = 'Pay at Hotel (Cash)'
              } else {
                paymentTypeDisplay = 'Online'
              }
            }
            
            if (rawMethod === 'wallet' && paymentTypeDisplay !== 'Wallet') {
              paymentTypeDisplay = 'Wallet'
            } else if (isPayAtHotelRazorpay && paymentTypeDisplay !== 'Pay at Hotel (Razorpay)') {
              paymentTypeDisplay = 'Pay at Hotel (Razorpay)'
            } else if (isPayAtHotelMethod && !isPayAtHotelRazorpay && !paymentTypeDisplay?.toLowerCase?.().startsWith('pay at hotel')) {
              paymentTypeDisplay = 'Pay at Hotel (Cash)'
            }
            
            return paymentTypeDisplay || 'Online'
          }

          result = result.filter(item => {
            const order = item.originalOrder || item
            const type = getOrderPaymentTypeDisplay(order)
            return value.some(filterType => {
              if (filterType === 'Pay at Hotel') {
                return type.toLowerCase().startsWith('pay at hotel')
              }
              return type === filterType
            })
          })
        }
        return
      }

      // Helper for parsing date formats
      const parseOrderDate = (dateVal) => {
        if (!dateVal) return new Date()
        const dateStr = String(dateVal).trim()
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

      // Special handling for fromDate
      if (key === 'fromDate') {
        const fromDate = new Date(value)
        fromDate.setHours(0, 0, 0, 0)
        result = result.filter(item => {
          const order = item.originalOrder || item
          const itemDateVal = order.createdAt ?? item.date ?? item.orderDate
          if (!itemDateVal) return true
          const orderDate = parseOrderDate(itemDateVal)
          return orderDate >= fromDate
        })
        return
      }

      // Special handling for toDate
      if (key === 'toDate') {
        const toDate = new Date(value)
        toDate.setHours(23, 59, 59, 999)
        result = result.filter(item => {
          const order = item.originalOrder || item
          const itemDateVal = order.createdAt ?? item.date ?? item.orderDate
          if (!itemDateVal) return true
          const orderDate = parseOrderDate(itemDateVal)
          return orderDate <= toDate
        })
        return
      }

      // Generic fallback for other fields (e.g. status, orderType, zone)
      result = result.filter(item => {
        const order = item.originalOrder || item
        const itemValue = order[key] ?? item[key]
        if (typeof value === 'string') {
          return itemValue === value || itemValue?.toString().toLowerCase() === value.toLowerCase()
        }
        return itemValue === value
      })
    })

    return result
  }, [data, searchQuery, filters, searchFields])

  const count = filteredData.length

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    return Object.values(filters).filter(value => {
      if (Array.isArray(value)) {
        return value.length > 0
      }
      return value !== "" && value !== null && value !== undefined
    }).length
  }, [filters])

  const handleApplyFilters = () => {
    setIsFilterOpen(false)
  }

  const handleResetFilters = () => {
    setFilters({})
  }

  const handleExport = async (format) => {
    const filename = title.toLowerCase().replace(/\s+/g, "_")
    switch (format) {
      case "excel":
        exportToExcel(filteredData, filename)
        break
      case "pdf":
        await exportToPDF(filteredData, filename)
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
      // Prefer full backend order if it's attached as originalOrder (e.g. in Order Detect Delivery),
      // otherwise fall back to the row object itself.
      const fullOrder = order?.originalOrder || order || {}

      // Helper formatters to keep output clean and avoid encoding issues (e.g. ₹ showing as ¹)
      const num = (v) => (v != null && !Number.isNaN(Number(v))) ? Number(v) : 0
      const money = (v) => `Rs. ${num(v).toFixed(2)}`

      // Dynamic import of jsPDF and autoTable for instant PDF download
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      
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
      const orderId = fullOrder.orderId || fullOrder.id || fullOrder.subscriptionId || 'N/A'
      doc.text(`Order ID: ${orderId}`, 105, 28, { align: 'center' })
      
      // Date
      doc.setFontSize(10)
      const orderDate = fullOrder.date && fullOrder.time
        ? `${fullOrder.date}, ${fullOrder.time}`
        : (fullOrder.date || new Date().toLocaleDateString())
      doc.text(`Date: ${orderDate}`, 105, 34, { align: 'center' })
      
      let startY = 45
      
      // Customer Information
      if (fullOrder.customerName || fullOrder.customerPhone) {
        doc.setFontSize(12)
        doc.setTextColor(30, 30, 30)
        doc.text('Customer Information', 14, startY)
        startY += 8
        
        doc.setFontSize(10)
        doc.setTextColor(60, 60, 60)
        if (fullOrder.customerName) {
          doc.text(`Name: ${fullOrder.customerName}`, 14, startY)
          startY += 6
        }
        if (fullOrder.customerPhone) {
          doc.text(`Phone: ${fullOrder.customerPhone}`, 14, startY)
          startY += 6
        }

        // Customer Address (from order.address)
        const addr = fullOrder.address || {}
        const hasAnyAddressField =
          addr.formattedAddress ||
          addr.street ||
          addr.address ||
          addr.city ||
          addr.state ||
          addr.zipCode

        // Main address line (without additionalDetails)
        if (hasAnyAddressField) {
          startY += 4
          doc.text('Address:', 14, startY)
          startY += 6

          const baseParts = [
            addr.formattedAddress || addr.address,
            addr.street,
            [addr.city, addr.state, addr.zipCode].filter(Boolean).join(', ')
          ].filter(Boolean)

          const addressText = baseParts.join(', ')
          const addressLines = doc.splitTextToSize(addressText, 170)
          addressLines.forEach((line) => {
            doc.text(String(line), 18, startY)
            startY += 5
          })
        }

        // Additional address line: ALWAYS show separately if user filled it
        if (addr.additionalDetails) {
          startY += 4
          doc.text('Additional Address:', 14, startY)
          startY += 6

          const additionalLines = doc.splitTextToSize(String(addr.additionalDetails), 170)
          additionalLines.forEach((line) => {
            doc.text(String(line), 18, startY)
            startY += 5
          })
        }

        startY += 4
      }
      
      // Restaurant Information
      if (fullOrder.restaurant) {
        doc.setFontSize(12)
        doc.setTextColor(30, 30, 30)
        doc.text('Restaurant', 14, startY)
        startY += 8
        
        doc.setFontSize(10)
        doc.setTextColor(60, 60, 60)
        doc.text(fullOrder.restaurant, 14, startY)
        startY += 6

        // Restaurant Address (if available from backend)
        if (fullOrder.restaurantAddress) {
          const restLines = doc.splitTextToSize(String(fullOrder.restaurantAddress), 170)
          restLines.forEach((line) => {
            doc.text(String(line), 14, startY)
            startY += 5
          })
        }

        startY += 6
      }
      
      // Order Items Table
      if (fullOrder.items && Array.isArray(fullOrder.items) && fullOrder.items.length > 0) {
        const tableData = fullOrder.items.map((item) => [
          item.quantity || 1,
          item.name || 'Unknown Item',
          money(item.price),
          money((item.quantity || 1) * (item.price || 0))
        ])
        
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
      
      // Total Amount
      if (fullOrder.totalAmount) {
        doc.setFontSize(14)
        doc.setTextColor(30, 30, 30)
        doc.setFont(undefined, 'bold')
        const totalAmount = typeof fullOrder.totalAmount === 'number' ? fullOrder.totalAmount.toFixed(2) : fullOrder.totalAmount
        doc.text(`Total Amount: ${money(totalAmount)}`, 14, startY)
        startY += 8
      }
      
      // Payment Status
      if (fullOrder.paymentStatus) {
        doc.setFontSize(10)
        doc.setTextColor(100, 100, 100)
        doc.setFont(undefined, 'normal')
        doc.text(`Payment Status: ${fullOrder.paymentStatus}`, 14, startY)
        startY += 6
      }
      
      // Order Status
      if (fullOrder.orderStatus) {
        doc.setFontSize(10)
        doc.text(`Order Status: ${fullOrder.orderStatus}`, 14, startY)
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

  const resetColumns = (defaultColumns) => {
    setVisibleColumns(defaultColumns || {})
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
    filteredData,
    count,
    activeFiltersCount,
    handleApplyFilters,
    handleResetFilters,
    handleExport,
    handleViewOrder,
    handlePrintOrder,
    toggleColumn,
    resetColumns,
  }
}

