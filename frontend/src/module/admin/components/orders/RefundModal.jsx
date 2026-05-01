import { useState, useEffect } from "react"
import { Wallet } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export default function RefundModal({ isOpen, onOpenChange, order, onConfirm, isProcessing }) {
  const [refundAmount, setRefundAmount] = useState("")
  const [error, setError] = useState("")

  // Set default refund amount when order changes
  useEffect(() => {
    if (order && isOpen) {
      const defaultAmount = order.totalAmount || 0
      setRefundAmount(defaultAmount.toString())
      setError("")
    }
  }, [order, isOpen])

  const handleAmountChange = (e) => {
    const value = e.target.value
    // Allow only numbers and decimal point
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setRefundAmount(value)
      setError("")
    }
  }

  const handleConfirm = () => {
    const amount = parseFloat(refundAmount)
    const maxAmount = order?.totalAmount || 0

    if (!refundAmount || refundAmount.trim() === "") {
      setError("Enter refund amount")
      return
    }

    if (isNaN(amount) || amount <= 0) {
      setError("Enter Valid amount")
      return
    }

    if (amount > maxAmount) {
      setError(`Total Refund Amount (₹${maxAmount.toFixed(2)}) is not greater than order total`)
      return
    }

    onConfirm(amount)
  }

  const handleClose = () => {
    if (!isProcessing) {
      setRefundAmount("")
      setError("")
      onOpenChange(false)
    }
  }

  if (!order) return null

  const maxAmount = order.totalAmount || 0

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl font-semibold tracking-tight text-slate-900">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-purple-50 text-purple-700 ring-1 ring-purple-100">
                <Wallet className="h-4.5 w-4.5" />
              </span>
              Wallet Refund
            </DialogTitle>
            <DialogDescription className="mt-1 text-slate-600">
              <span className="mr-2">Order ID</span>
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {order.orderId}
              </span>
            </DialogDescription>
          </DialogHeader>
        </div>
        
        <div className="px-6 pb-6 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">
              Refund amount
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                ₹
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={refundAmount}
                onChange={handleAmountChange}
                placeholder="0.00"
                disabled={isProcessing}
                className={`w-full pl-8 pr-4 py-3 rounded-xl border bg-white text-base font-semibold tracking-tight text-slate-900 shadow-sm transition focus:outline-none focus:ring-4 ${
                  error
                    ? "border-red-300 focus:border-red-500 focus:ring-red-100"
                    : "border-slate-200 focus:border-purple-500 focus:ring-purple-100"
                } ${isProcessing ? "bg-slate-50 cursor-not-allowed opacity-90" : ""}`}
              />
            </div>
            <div className="flex items-start justify-between gap-3">
              {error ? (
                <p className="text-sm text-red-600">{error}</p>
              ) : (
                <span className="text-sm text-slate-500">Enter the amount to credit to wallet.</span>
              )}
              <span className="text-xs text-slate-500 whitespace-nowrap mt-0.5">
                Max: ₹{maxAmount.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isProcessing}
            className="h-10 rounded-xl bg-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isProcessing || !refundAmount || parseFloat(refundAmount) <= 0}
            className="h-10 rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
          >
            {isProcessing ? "Processing..." : "Refund"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
