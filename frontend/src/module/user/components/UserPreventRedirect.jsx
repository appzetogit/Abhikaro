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
  const initialPathRef = useRef(location.pathname)

  useEffect(() => {
    // Store initial pathname on mount
    if (!initialPathRef.current) {
      initialPathRef.current = location.pathname
    }

    // On refresh, ensure we stay on the current route
    // This prevents any unwanted redirects that might happen on page reload
    const nav = performance.getEntriesByType?.("navigation")?.[0]
    const isReload = nav?.type === "reload" || nav?.type === "navigate"
    
    if (isReload && !hasPreventedRedirect.current) {
      // If we're on the home page (/), ensure we stay there
      // Don't allow any redirects to /dining on refresh
      const currentPath = location.pathname
      if (currentPath === "/" || currentPath === "/user" || currentPath.startsWith("/user/restaurants")) {
        hasPreventedRedirect.current = true
        // Explicitly ensure we stay on the current route
        if (currentPath !== window.location.pathname) {
          navigate(currentPath, { replace: true })
        }
        console.log("Page refreshed on food screen, staying on:", currentPath)
      }
    }

    // Prevent navigation to /dining if we're on food screen
    const handleBeforeUnload = () => {
      const currentPath = window.location.pathname
      if (currentPath === "/" || currentPath === "/user") {
        sessionStorage.setItem("user_lastPath", currentPath)
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [location.pathname, navigate])

  // Restore last path on mount if it was food screen
  useEffect(() => {
    const lastPath = sessionStorage.getItem("user_lastPath")
    if (lastPath && (lastPath === "/" || lastPath === "/user") && location.pathname === "/dining") {
      navigate(lastPath, { replace: true })
      sessionStorage.removeItem("user_lastPath")
    }
  }, []) // Only run on mount

  return children
}
