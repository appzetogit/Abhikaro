import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useCart } from "../context/CartContext"

export default function ReplaceCartDialog() {
  const {
    pendingCartReplacement,
    confirmCartReplacement,
    cancelCartReplacement,
  } = useCart()

  const isOpen = Boolean(pendingCartReplacement)
  const existingRestaurantName = pendingCartReplacement?.existingRestaurantName || "another restaurant"
  const incomingRestaurantName = pendingCartReplacement?.incomingRestaurantName || "this restaurant"

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && cancelCartReplacement()}>
      <DialogContent className="w-[90%] max-w-[360px] rounded-[22px] border-0 p-0 overflow-hidden shadow-[0_20px_45px_rgba(0,0,0,0.22)]" showCloseButton={false}>
        <button
          type="button"
          onClick={cancelCartReplacement}
          className="absolute right-4 top-4 text-gray-500 hover:text-gray-700 transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5 stroke-[2.4]" />
        </button>

        <div className="px-5 pt-9 pb-5 sm:px-6 sm:pt-10 sm:pb-6">
          <DialogTitle className="text-[34px] sm:text-[36px] leading-[1.06] font-extrabold text-gray-900 tracking-[-0.02em]">
            Replace cart item?
          </DialogTitle>
          <DialogDescription className="mt-3 text-[14px] sm:text-[15px] leading-[1.45] font-medium text-[#4b5563] max-w-[300px]">
            Your cart contains dishes from {existingRestaurantName}. Do you want to discard the selection and add dishes from {incomingRestaurantName}?
          </DialogDescription>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button
              type="button"
              onClick={cancelCartReplacement}
              variant="ghost"
              className="h-11 rounded-[13px] bg-[#f4e6d9] text-[#ff5a00] font-semibold text-[15px] tracking-[-0.01em] hover:bg-[#efddcd]"
            >
              No
            </Button>
            <Button
              type="button"
              onClick={confirmCartReplacement}
              className="h-11 rounded-[13px] bg-[#ff5a00] text-white font-semibold text-[15px] tracking-[-0.01em] hover:bg-[#ef5300]"
            >
              Replace
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
