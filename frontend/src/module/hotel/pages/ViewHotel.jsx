import { useEffect, useRef } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"

export default function ViewHotel() {
  const { hotelId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const hasRedirectedRef = useRef(false)

  useEffect(() => {
    if (hasRedirectedRef.current) return

    // QR/link access: set reference immediately and land on Home.
    const hotelRef =
      searchParams.get("hotelRef") ||
      searchParams.get("hotelReference") ||
      searchParams.get("ref") ||
      searchParams.get("hotelId") ||
      hotelId
    if (hotelRef) {
      const existingName =
        sessionStorage.getItem("hotelReferenceName") ||
        localStorage.getItem("hotelReferenceName") ||
        ""

      // sessionStorage: used by cart/order payloads during current session
      sessionStorage.setItem("hotelReference", hotelRef)
      sessionStorage.setItem("hotelReferenceName", existingName)
      sessionStorage.setItem("isHotelOrder", "true")
      sessionStorage.setItem("hotelReferenceTimestamp", Date.now().toString())

      // localStorage: helps older flows (e.g. Pay-at-hotel toast) and keeps reference across app restarts
      localStorage.setItem("hotelReference", hotelRef)
      localStorage.setItem("hotelReferenceName", existingName)
    }

    hasRedirectedRef.current = true
    navigate("/", { replace: true })
  }, [hotelId, searchParams, navigate])

  return null
}
