import { useRef } from "react"
import { motion } from "framer-motion"
import { Switch } from "@/components/ui/switch"

export default function VegModeToggle({ 
  checked, 
  onCheckedChange,
  toggleRef 
}) {
  const vegModeToggleRef = useRef(null)
  const ref = toggleRef || vegModeToggleRef

  return (
    <motion.div
      ref={ref}
      className="flex flex-col items-center gap-0.5 sm:gap-1 lg:gap-1.5 flex-shrink-0 relative"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <div className="flex flex-col items-center">
        <span className="text-white text-[13px] sm:text-[11px] lg:text-sm font-black leading-none">ALWAYS</span>
        <span className="text-white text-[9.5px] sm:text-[10px] lg:text-xs font-black leading-none">VEG</span>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label="Toggle Veg Mode"
        className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-gray-300 w-9 h-4 sm:w-10 sm:h-5 lg:w-12 lg:h-6 shadow-lg [&_[data-slot=switch-thumb]]:bg-white [&_[data-slot=switch-thumb]]:h-3 [&_[data-slot=switch-thumb]]:w-3 sm:[&_[data-slot=switch-thumb]]:h-4 sm:[&_[data-slot=switch-thumb]]:w-4 lg:[&_[data-slot=switch-thumb]]:h-5 lg:[&_[data-slot=switch-thumb]]:w-5 [&_[data-slot=switch-thumb]]:data-[state=checked]:translate-x-5 sm:[&_[data-slot=switch-thumb]]:data-[state=checked]:translate-x-5 lg:[&_[data-slot=switch-thumb]]:data-[state=checked]:translate-x-6 [&_[data-slot=switch-thumb]]:data-[state=unchecked]:translate-x-0"
      />
    </motion.div>
  )
}
