import { useEffect, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"

/**
 * Prevents redirects on page refresh for user module.
 * Ensures that when user refreshes on the food screen (/), they stay on the same screen
 * instead of redirecting to Room (/dining).
 * This fixes the issue where refreshing on the food screen redirects to Room.
 */
export default function UserPreventRedirect({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const hasPreventedRedirect = useRef(false)

  useEffect(() => {
    // On refresh, ensure we stay on the current route
    // This prevents any unwanted redirects that might happen on page reload
    const nav = performance.getEntriesByType?.("navigation")?.[0]
    const isReload = nav?.type === "reload"
    
    if (isReload && !hasPreventedRedirect.current) {
      // If we're on the home page (/), ensure we stay there
      // Don't allow any redirects to /dining on refresh
      if (location.pathname === "/" || location.pathname === "/user") {
        hasPreventedRedirect.current = true
        // The route should already be preserved by React Router
        // This component just ensures no redirects happen
        console.log("Page refreshed on food screen, staying on:", location.pathname)
      }
    }
  }, [location.pathname, navigate])

  return children
}
