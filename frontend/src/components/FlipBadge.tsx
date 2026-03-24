import React from "react"
import { Zap } from "lucide-react"

type FlipBadgeProps = {
  etaText?: string
  staggerMs?: number
  className?: string
}

export default function FlipBadge({
  etaText = "25-30 mins",
  staggerMs = 0,
  className = "",
}: FlipBadgeProps) {
  return (
    <div
      aria-live="polite"
      className={`recommendation-flip-badge h-3.5 sm:h-4 ${className}`}
    >
      <div
        className="recommendation-flip-inner h-full min-w-[84px] text-[10px] sm:text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
        style={{ animationDelay: `${staggerMs}ms` }}
      >
        <span className="recommendation-flip-face whitespace-nowrap">
          <Zap className="h-2.5 w-2.5 sm:h-3 sm:w-3 fill-current" />
          <span>Near &amp; Fast</span>
        </span>
        <span className="recommendation-flip-face recommendation-flip-back whitespace-nowrap">
          <Zap className="h-2.5 w-2.5 sm:h-3 sm:w-3 fill-current" />
          <span>{etaText}</span>
        </span>
      </div>
    </div>
  )
}
