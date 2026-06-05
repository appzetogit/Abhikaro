// Export utility functions for hotels data

export const exportHotelsToPDF = async (hotels, filename = "hotels") => {
  if (!hotels || hotels.length === 0) {
    alert("No data to export")
    return
  }

  try {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    })

    // Add title
    doc.setFontSize(16)
    doc.text('Hotels Report', 14, 15)
    
    // Add export info
    doc.setFontSize(10)
    const exportDate = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
    doc.text(`Exported on: ${exportDate} | Total Records: ${hotels.length}`, 14, 22)

    // Prepare table data
    const tableData = hotels.map((hotel, index) => [
      index + 1,
      hotel.hotelId || hotel._id || "N/A",
      hotel.hotelName || "N/A",
      hotel.address || "N/A",
      hotel.email || "N/A",
      hotel.phone || "N/A",
      hotel.commission !== undefined ? `${hotel.commission}%` : "0%",
      hotel.isActive !== false ? "Active" : "Inactive"
    ])

    // Add table using autoTable
    autoTable(doc, {
      head: [["SI", "Hotel ID", "Hotel Name", "Address", "Email", "Phone", "Commission", "Status"]],
      body: tableData,
      startY: 28,
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [30, 41, 59], // Slate 800
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 12 }, // SI
        1: { cellWidth: 35 }, // Hotel ID
        2: { cellWidth: 40 }, // Hotel Name
        3: { cellWidth: 65 }, // Address
        4: { cellWidth: 45 }, // Email
        5: { cellWidth: 30 }, // Phone
        6: { cellWidth: 22 }, // Commission
        7: { cellWidth: 20 }, // Status
      },
      margin: { top: 28, left: 14, right: 14 },
    })

    // Save the PDF
    const fileTimestamp = new Date().toISOString().split("T")[0]
    doc.save(`${filename}_${fileTimestamp}.pdf`)
  } catch (error) {
    console.error("PDF export error:", error)
    alert("Failed to export PDF. Please try again.")
  }
}
