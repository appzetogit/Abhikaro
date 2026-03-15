import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"

const placeholders = [
  "Search \"burger\"",
  "Search \"biryani\"",
  "Search \"pizza\"",
  "Search \"desserts\"",
  "Search \"chinese\"",
  "Search \"thali\"",
  "Search \"momos\"",
  "Search \"dosa\""
]

export default function SearchBar({ 
  value, 
  onChange, 
  onFocus, 
  onClose,
  isSearchOpen 
}) {
  const navigate = useNavigate()
  const [placeholderIndex, setPlaceholderIndex] = useState(0)

  // Animated placeholder cycling
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % placeholders.length)
    }, 2000) // Change placeholder every 2 seconds

    return () => clearInterval(interval)
  }, [])

  if (isSearchOpen) return null

  return (
    <motion.div
      className="flex-1 relative"
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <div className="relative bg-white dark:bg-[#1a1a1a] rounded-xl lg:rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 p-1 sm:p-1.5 lg:p-2 transition-all duration-300 hover:shadow-xl">
        <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
          <Search className="h-4 w-4 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-green-600 flex-shrink-0 ml-2 sm:ml-3 lg:ml-4" strokeWidth={2.5} />
          <div className="flex-1 relative">
            <div className="relative w-full">
              <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={onFocus}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && value.trim()) {
                    navigate(`/user/search?q=${encodeURIComponent(value.trim())}`)
                    onClose()
                    onChange("")
                  }
                }}
                aria-label="Search restaurants and food"
                className="pl-0 pr-2 h-8 sm:h-9 lg:h-11 w-full bg-white dark:bg-[#1a1a1a] border-0 text-sm sm:text-base lg:text-lg font-semibold text-gray-700 dark:text-white focus-visible:ring-0 focus-visible:ring-offset-0 rounded-full placeholder:text-gray-500 dark:placeholder:text-gray-400"
              />
              {/* Animated placeholder */}
              {!value && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none h-5 lg:h-6 overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={placeholderIndex}
                      initial={{ y: 16, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -16, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="text-sm sm:text-base lg:text-lg font-semibold text-gray-500 dark:text-gray-400 inline-block"
                    >
                      {placeholders[placeholderIndex]}
                    </motion.span>
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
