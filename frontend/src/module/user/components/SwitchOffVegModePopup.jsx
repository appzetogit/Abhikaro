import { motion, AnimatePresence } from "framer-motion"
import { AlertCircle } from "lucide-react"

export default function SwitchOffVegModePopup({
  isOpen,
  onClose,
  onSwitchOff,
  onKeepUsing
}) {
  if (!isOpen) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-[9998] backdrop-blur-sm"
          />

          {/* Popup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{
              type: "spring",
              damping: 25,
              stiffness: 300,
              mass: 0.8
            }}
            className="fixed inset-0 z-[9999] flex dark:bg-[#lalala] dark:text-white items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white dark:bg-[#lalala] dark:text-white rounded-2xl shadow-2xl w-[85%] max-w-sm p-6">
              {/* Warning Icon */}
              <div className="flex justify-center mb-4">
                <div className="w-20 h-20 rounded-full bg-pink-100 flex items-center justify-center">
                  <AlertCircle className="w-20 h-20 text-white bg-red-500/90 rounded-full p-2" strokeWidth={2.5} />
                </div>
              </div>

              {/* Title */}
              <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">
                Switch off Veg Mode?
              </h2>

              {/* Description */}
              <p className="text-gray-600 text-center mb-6 text-sm">
                You'll see all restaurants, including those serving non-veg dishes
              </p>

              {/* Buttons */}
              <div className="space-y-3">
                <button
                  onClick={onSwitchOff}
                  className="w-full bg-transparent text-red-600 font-normal py-1 text-normal rounded-xl hover:bg-red-50 transition-colors text-base"
                >
                  Switch off
                </button>

                <button
                  onClick={onKeepUsing}
                  className="w-full text-gray-900 font-normal py-1 text-center rounded-xl hover:bg-gray-200 transition-colors text-base"
                >
                  Keep using this mode
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
