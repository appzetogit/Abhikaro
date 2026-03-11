import { useEffect, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"

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

    // Legacy fix: only guard against unwanted redirect from food screen (/) to /dining.
    // Generic last-route handling is done globally, so we avoid any extra navigation here.
    const nav = performance.getEntriesByType?.("navigation")?.[0]
    const isReload = nav?.type === "reload" || nav?.type === "navigate"
    
    if (isReload && !hasPreventedRedirect.current) {
      const currentPath = location.pathname
      if (currentPath === "/" || currentPath === "/user" || currentPath.startsWith("/user/restaurants")) {
        hasPreventedRedirect.current = true
      }
    }

    // Store last food screen path for optional restoration logic elsewhere
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

  // Restore last path on mount if it was food screen and app redirected to /dining
  useEffect(() => {
    const lastPath = sessionStorage.getItem("user_lastPath")
    if (lastPath && (lastPath === "/" || lastPath === "/user") && location.pathname === "/dining") {
      navigate(lastPath, { replace: true })
      sessionStorage.removeItem("user_lastPath")
    }
  }, []) // Only run on mount

  return children
}
