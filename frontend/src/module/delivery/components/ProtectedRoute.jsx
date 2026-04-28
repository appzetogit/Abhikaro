import { Navigate, useLocation, useNavigate } from "react-router-dom"
import { useEffect, useMemo, useState } from "react"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import { deliveryAPI } from "@/lib/api"
import Loader from "@/components/Loader"

function getRequiredSignupStep(deliveryUser) {
  if (!deliveryUser) return "details"

  const needsDetails =
    !deliveryUser.name ||
    deliveryUser.name === "Delivery Partner" ||
    !deliveryUser.email ||
    !deliveryUser.location?.city ||
    !deliveryUser.vehicle?.number ||
    !deliveryUser.vehicle?.model ||
    !deliveryUser.documents?.pan?.number ||
    !deliveryUser.documents?.aadhar?.number

  if (needsDetails) return "details"

  const needsDocuments =
    !deliveryUser.documents?.aadhar?.document ||
    !deliveryUser.documents?.pan?.document ||
    !deliveryUser.documents?.drivingLicense?.document ||
    !deliveryUser.profileImage?.url

  if (needsDocuments) return "documents"

  return null
}

export default function ProtectedRoute({ children }) {
  // Check if user is authenticated using proper token validation
  const isAuthenticated = isModuleAuthenticated("delivery")
  const location = useLocation()
  const navigate = useNavigate()
  const [checkingSignup, setCheckingSignup] = useState(true)

  const path = location.pathname || ""
  const isSignupRoute = useMemo(() => path.startsWith("/delivery/signup"), [path])

  if (!isAuthenticated) {
    return <Navigate to="/delivery/sign-in" replace />
  }

  useEffect(() => {
    if (!isAuthenticated) return
    if (isSignupRoute) {
      setCheckingSignup(false)
      return
    }

    let cancelled = false

    const run = async () => {
      try {
        // Cache to avoid refetching on every route render
        const cached = sessionStorage.getItem("delivery_signup_step")
        if (cached && cached !== "unknown") {
          if (cached === "details") {
            navigate("/delivery/signup/details", { replace: true })
          } else if (cached === "documents") {
            navigate("/delivery/signup/documents", { replace: true })
          }
          return
        }

        sessionStorage.setItem("delivery_signup_step", "unknown")
        const res = await deliveryAPI.getCurrentDelivery()
        const user = res?.data?.data?.user
        const step = getRequiredSignupStep(user)
        sessionStorage.setItem("delivery_signup_step", step || "complete")

        if (step === "details") {
          navigate("/delivery/signup/details", { replace: true })
        } else if (step === "documents") {
          navigate("/delivery/signup/documents", { replace: true })
        }
      } catch {
        // If this fails, fall back to allowing render; auth interceptor will handle true 401s.
        sessionStorage.setItem("delivery_signup_step", "unknown")
      } finally {
        if (!cancelled) setCheckingSignup(false)
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, isSignupRoute, navigate])

  if (!isSignupRoute && checkingSignup) {
    return <Loader />
  }

  return children
}

