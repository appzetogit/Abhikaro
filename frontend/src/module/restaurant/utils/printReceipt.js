import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { restaurantAPI } from "@/lib/api";

function getApiErrorMessage(err) {
  return (
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.message ||
    "Something went wrong"
  );
}

/**
 * Save a jsPDF document in a way that's more reliable on mobile/Safari.
 * - First tries `doc.save()` (normal download)
 * - Falls back to Blob + objectURL + `<a download>`
 * - Finally falls back to opening the PDF in a new tab (if download is blocked)
 */
export function savePdfWithFallback(doc, fileName = "document.pdf") {
  if (!doc) throw new Error("Missing PDF document");

  try {
    doc.save(fileName);
    return { method: "save" };
  } catch (e) {
    // continue to fallbacks
    console.warn("doc.save failed, using blob fallback:", e);
  }

  let url = null;
  try {
    const blob = doc.output("blob");
    url = URL.createObjectURL(blob);

    // Try a programmatic download first
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // If the browser blocks download, opening in a new tab often works (esp. iOS Safari)
    setTimeout(() => {
      try {
        window.open(url, "_blank", "noopener,noreferrer");
      } catch {
        // ignore
      }
    }, 50);

    // cleanup
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }, 30_000);

    return { method: "blob" };
  } catch (err) {
    if (url) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
    throw new Error(`Failed to download receipt: ${getApiErrorMessage(err)}`);
  }
}

/**
 * Generate and download an order receipt PDF for a given order id (string or Mongo _id).
 * Includes: order id, customer name, restaurant name, date, time, full address
 * (with additional address), ordered items, subtotal, taxes/charges, and total.
 */
export async function generateOrderReceiptPDF(orderIdOrMongoId) {
  if (!orderIdOrMongoId) {
    throw new Error("Missing order id");
  }

  // Fetch full order details
  let order = null;
  try {
    const response = await restaurantAPI.getOrderById(orderIdOrMongoId);
    order = response?.data?.data?.order;
  } catch (err) {
    throw new Error(getApiErrorMessage(err));
  }
  if (!order) {
    throw new Error("Order not found");
  }

  // Derive restaurant name with safe fallbacks
  const restaurantName =
    order.restaurantName ||
    order.restaurantId?.onboarding?.step1?.restaurantName ||
    order.restaurantId?.name ||
    "Restaurant";

  // Transform into a stable shape used for PDF
  const orderData = {
    id: order.orderId || order._id || "",
    status: (order.status || "").toUpperCase(),
    date: new Date(order.createdAt).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    }),
    time: new Date(order.createdAt).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
    restaurant: restaurantName,
    // Prefer formattedAddress for header display; fallback to composed street/city/state/zip
    address:
      order.address?.formattedAddress ||
      [order.address?.street, order.address?.city, order.address?.state, order.address?.zipCode || order.address?.pincode || order.address?.postalCode]
        .filter(Boolean)
        .join(", "),
    additionalAddress:
      order.address?.additionalDetails || order.address?.additionalAddress || "",
    customer: {
      name: order.userName || order.userId?.name || "Customer",
      phone: order.userPhone || order.userId?.phone || order.phone || "",
      email: order.userId?.email || order.email || "",
      location: `${order.address?.city || ""}${
        order.address?.state ? ", " + order.address.state : ""
      }`.trim(),
      distance: order.distance ?? null,
    },
    fullAddress: {
      street: order.address?.street || "",
      city: order.address?.city || "",
      state: order.address?.state || "",
      zipCode:
        order.address?.zipCode ||
        order.address?.pincode ||
        order.address?.postalCode ||
        "",
      formattedAddress: order.address?.formattedAddress || "",
    },
    items:
      order.items?.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        type: item.isVeg ? "Veg" : "Non-Veg",
      })) || [],
    billing: {
      itemSubtotal: order.pricing?.subtotal || 0,
      taxes:
        (order.pricing?.tax || 0) +
        (order.pricing?.deliveryFee || 0) +
        (order.pricing?.platformFee || 0) +
        (order.pricing?.packagingCharges || 0),
      total: order.pricing?.total || 0,
      paymentStatus: (() => {
        const s = (order.payment?.status || "").toLowerCase();
        const method = (order.payment?.method || "").toLowerCase();
        const isDelivered = (order.status || "").toLowerCase() === "delivered";
        const isCod = method === "cash" || method === "cod";
        if (isDelivered) return "PAID";
        if (s === "completed") return "PAID";
        if (s === "failed") return "FAILED";
        if (s === "refunded") return "REFUNDED";
        if (s === "processing") return "PROCESSING";
        if (isCod) return "COD";
        return "PENDING";
      })(),
    },
  };

  // Build PDF
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(orderData.restaurant, pageWidth / 2, y, { align: "center" });
  y += 7;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  if (orderData.address) {
    doc.text(orderData.address, pageWidth / 2, y, { align: "center" });
    y += 15;
  } else {
    y += 12;
  }

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("ORDER RECEIPT", pageWidth / 2, y, { align: "center" });
  y += 10;

  doc.setLineWidth(0.5);
  doc.line(15, y, pageWidth - 15, y);
  y += 10;

  // Order info
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Order ID:", 15, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(orderData.id || "N/A", 50, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.text("Date & Time:", 15, y);
  doc.setFont("helvetica", "normal");
  doc.text(`${orderData.date}, ${orderData.time}`, 50, y);
  y += 7;
  // Intentionally omit status from receipt per requirement
  y += 3;

  // Customer
  doc.setLineWidth(0.5);
  doc.line(15, y, pageWidth - 15, y);
  y += 8;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("CUSTOMER DETAILS", 15, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Name:", 15, y);
  doc.setFont("helvetica", "normal");
  doc.text(orderData.customer.name || "N/A", 50, y);
  y += 6;

  if (orderData.customer.phone) {
    doc.setFont("helvetica", "bold");
    doc.text("Phone:", 15, y);
    doc.setFont("helvetica", "normal");
    doc.text(orderData.customer.phone, 50, y);
    y += 6;
  }

  if (orderData.customer.email) {
    doc.setFont("helvetica", "bold");
    doc.text("Email:", 15, y);
    doc.setFont("helvetica", "normal");
    doc.text(orderData.customer.email, 50, y);
    y += 6;
  }

  doc.setFont("helvetica", "bold");
  doc.text("Delivery Address:", 15, y);
  doc.setFont("helvetica", "normal");
  y += 6;

  // Prefer formattedAddress for the delivery address section, prefix with additionalAddress if provided
  let fullAddress = "";
  if (orderData.fullAddress.formattedAddress) {
    fullAddress = [
      orderData.additionalAddress || null,
      orderData.fullAddress.formattedAddress,
    ]
      .filter(Boolean)
      .join(", ");
  } else {
    const parts = [];
    if (orderData.additionalAddress) parts.push(orderData.additionalAddress);
    if (orderData.fullAddress.street) parts.push(orderData.fullAddress.street);
    if (orderData.fullAddress.city) parts.push(orderData.fullAddress.city);
    if (orderData.fullAddress.state) parts.push(orderData.fullAddress.state);
    if (orderData.fullAddress.zipCode) parts.push(orderData.fullAddress.zipCode);
    fullAddress =
      parts.length > 0 ? parts.join(", ") : orderData.customer.location || "N/A";
  }
  const addrLines = doc.splitTextToSize(fullAddress, pageWidth - 50);
  doc.text(addrLines, 50, y);
  y += addrLines.length * 6 + 4;

  // Items
  doc.setLineWidth(0.5);
  doc.line(15, y, pageWidth - 15, y);
  y += 8;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("ITEM DETAILS", 15, y);
  y += 5;

  const itemsTableData = orderData.items.map((it) => [
    `${it.quantity}x`,
    it.name,
    it.type || "-",
    `Rs. ${it.price}`,
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Qty", "Item Name", "Type", "Price"]].
      filter(Boolean),
    body: itemsTableData,
    theme: "grid",
    headStyles: { fillColor: [55, 65, 81], textColor: [255, 255, 255], fontSize: 10, fontStyle: "bold" },
    bodyStyles: { fontSize: 9 },
    margin: { left: 15, right: 15 },
  });
  y = doc.lastAutoTable.finalY + 10;

  // Billing
  doc.setLineWidth(0.5);
  doc.line(15, y, pageWidth - 15, y);
  y += 8;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("BILL DETAILS", 15, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Item Subtotal:", 15, y);
  doc.text(`Rs. ${orderData.billing.itemSubtotal}`, pageWidth - 15, y, {
    align: "right",
  });
  y += 6;

  doc.text("Taxes & Charges:", 15, y);
  doc.text(`Rs. ${orderData.billing.taxes}`, pageWidth - 15, y, {
    align: "right",
  });
  y += 6;

  doc.setLineDash([2, 2]);
  doc.line(15, y, pageWidth - 15, y);
  y += 6;
  doc.setLineDash([]);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Total Bill:", 15, y);
  doc.text(`Rs. ${orderData.billing.total}`, pageWidth - 15, y, {
    align: "right",
  });
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Payment Status: ${orderData.billing.paymentStatus}`, 15, y);

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 20;
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(100, 100, 100);
  doc.text(
    "Thank you for your business!",
    pageWidth / 2,
    footerY,
    { align: "center" }
  );
  doc.text(
    `Generated on: ${new Date().toLocaleString()}`,
    pageWidth / 2,
    footerY + 5,
    { align: "center" }
  );
  doc.setTextColor(0, 0, 0);

  // Save
  const fileName = `Order_Receipt_${orderData.id}.pdf`;
  savePdfWithFallback(doc, fileName);
}

export default generateOrderReceiptPDF;

