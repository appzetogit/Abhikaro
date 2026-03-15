import { motion, AnimatePresence } from "framer-motion"

export default function VegModePopup({
  isOpen,
  onClose,
  position,
  vegModeOption,
  onOptionChange,
  onApply,
  onMoreSettings
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
            className="fixed inset-0 bg-black/30 z-[9998] backdrop-blur-sm"
          />

          {/* Popup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{
              type: "spring",
              damping: 25,
              stiffness: 300,
              mass: 0.8
            }}
            className="fixed z-[9999] bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl p-4 w-[calc(100%-2rem)] max-w-xs"
            style={{
              top: `${position.top}px`,
              right: `${position.right}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pointer Triangle */}
            <div
              className="absolute -top-2 right-5 w-3 h-3 bg-white dark:bg-[#1a1a1a] transform rotate-45"
              style={{
                boxShadow: '-2px -2px 4px rgba(0,0,0,0.1)'
              }}
            />

            {/* Title */}
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-3">
              See veg dishes from
            </h3>

            {/* Radio Options */}
            <div className="space-y-2 mb-4">
              {/* All restaurants */}
              <label
                className="flex items-center gap-2.5 cursor-pointer p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                onClick={() => onOptionChange("all")}
              >
                <div className="relative flex items-center justify-center">
                  <input
                    type="radio"
                    name="vegModeOption"
                    value="all"
                    checked={vegModeOption === "all"}
                    onChange={() => onOptionChange("all")}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${vegModeOption === "all"
                    ? "border-green-600 dark:border-green-500 bg-green-600 dark:bg-green-500"
                    : "border-gray-300 dark:border-gray-600 bg-white dark:bg-[#2a2a2a]"
                    }`}>
                    {vegModeOption === "all" && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white dark:bg-white" />
                    )}
                  </div>
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  All restaurants
                </span>
              </label>

              {/* Pure Veg restaurants only */}
              <label
                className="flex items-center gap-2.5 cursor-pointer p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                onClick={() => onOptionChange("pure-veg")}
              >
                <div className="relative flex items-center justify-center">
                  <input
                    type="radio"
                    name="vegModeOption"
                    value="pure-veg"
                    checked={vegModeOption === "pure-veg"}
                    onChange={() => onOptionChange("pure-veg")}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${vegModeOption === "pure-veg"
                    ? "border-green-600 dark:border-green-500 bg-green-600 dark:bg-green-500"
                    : "border-gray-300 dark:border-gray-600 bg-white dark:bg-[#2a2a2a]"
                    }`}>
                    {vegModeOption === "pure-veg" && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white dark:bg-white" />
                    )}
                  </div>
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  Pure Veg restaurants only
                </span>
              </label>
            </div>

            {/* Apply Button */}
            <button
              onClick={onApply}
              className="w-full bg-green-600 text-white font-semibold py-2.5 rounded-xl hover:bg-green-700 transition-colors mb-2 text-sm"
            >
              Apply
            </button>

            {/* More settings link */}
            <button
              onClick={onMoreSettings}
              className="w-full text-green-600 dark:text-green-400 font-medium text-xs hover:text-green-700 dark:hover:text-green-500 transition-colors"
            >
              More settings
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
