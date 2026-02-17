import { useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"

/**
 * On full page reload (refresh), redirect restaurant user to the orders screen (/restaurant).
 * Does nothing on client-side navigation or when already on /restaurant or onboarding.
 */
export default function RestaurantRedirectToOrders({ children }) {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const nav = performance.getEntriesByType?.("navigation")?.[0]
    const isReload = nav?.type === "reload"
    const pathname = location.pathname

    if (
      isReload &&
      pathname !== "/restaurant" &&
      pathname.startsWith("/restaurant") &&
      !pathname.startsWith("/restaurant/onboarding")
    ) {
      navigate("/restaurant", { replace: true })
    }
  }, [])

  return children
}
