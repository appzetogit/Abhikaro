// CSS-only AnimatedPage - no GSAP dependency
import { useEffect, useRef } from "react"

export default function AnimatedPage({ children, className = "" }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Trigger animation on next frame
    requestAnimationFrame(() => {
      container.style.opacity = '1'
      container.style.transform = 'translateY(0)'
      container.style.transition = 'opacity 0.4s ease-out, transform 0.4s ease-out'
    })
  }, [])

  return (
    <div 
      ref={containerRef} 
      className={`${className} md:pb-0`}
      style={{ 
        opacity: 0, 
        transform: 'translateY(20px)',
      }}
    >
      {children}
    </div>
  )
}
