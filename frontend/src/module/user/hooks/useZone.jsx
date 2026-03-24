import { useState, useEffect, useCallback, useRef } from 'react'
import { zoneAPI } from '@/lib/api'

/**
 * Hook to detect and manage user's zone based on location
 * Automatically detects zone when location is available
 */
export function useZone(location) {
  const ZONE_REFRESH_DISTANCE_METERS = 200
  const [zoneId, setZoneId] = useState(null)
  const [zoneStatus, setZoneStatus] = useState('loading') // 'loading' | 'IN_SERVICE' | 'OUT_OF_SERVICE'
  const [zone, setZone] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const prevCoordsRef = useRef({ latitude: null, longitude: null })

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  const isAbortLikeError = (err) => {
    if (!err) return false
    return (
      err.name === 'AbortError' ||
      err.name === 'CanceledError' ||
      err.code === 'ERR_CANCELED' ||
      err.code === 'ECONNABORTED' ||
      err.message === 'Request aborted'
    )
  }

  // Detect zone when location is available
  const detectZone = useCallback(async (lat, lng) => {
    if (!lat || !lng) {
      setZoneStatus('OUT_OF_SERVICE')
      setZoneId(null)
      setZone(null)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const response = await zoneAPI.detectZone(lat, lng)

      if (response.data?.success) {
        const data = response.data.data

        if (data.status === 'IN_SERVICE' && data.zoneId) {
          setZoneId(data.zoneId)
          setZone(data.zone)
          setZoneStatus('IN_SERVICE')

          // Store in localStorage for persistence
          localStorage.setItem('userZoneId', data.zoneId)
          localStorage.setItem('userZone', JSON.stringify(data.zone))
        } else {
          // OUT_OF_SERVICE
          setZoneId(null)
          setZone(null)
          setZoneStatus('OUT_OF_SERVICE')
          localStorage.removeItem('userZoneId')
          localStorage.removeItem('userZone')
        }
      } else {
        throw new Error(response.data?.message || 'Failed to detect zone')
      }
    } catch (err) {
      if (isAbortLikeError(err)) {
        // Ignore abort/cancel noise from transient polling/navigation races.
        return
      }
      console.error('Error detecting zone:', err)
      setError(err.response?.data?.message || err.message || 'Failed to detect zone')
      setZoneStatus('OUT_OF_SERVICE')
      setZoneId(null)
      setZone(null)

      // Try to use cached zone if available
      const cachedZoneId = localStorage.getItem('userZoneId')
      if (cachedZoneId) {
        const cachedZone = localStorage.getItem('userZone')
        setZoneId(cachedZoneId)
        setZone(cachedZone ? JSON.parse(cachedZone) : null)
        setZoneStatus('IN_SERVICE')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-detect zone when location changes
  useEffect(() => {
    const lat = location?.latitude
    const lng = location?.longitude

    const hasPrevCoords =
      prevCoordsRef.current.latitude !== null &&
      prevCoordsRef.current.longitude !== null
    const coordsChanged = !hasPrevCoords || calculateDistance(
      prevCoordsRef.current.latitude,
      prevCoordsRef.current.longitude,
      lat || 0,
      lng || 0
    ) >= ZONE_REFRESH_DISTANCE_METERS

    if (lat && lng) {
      // Only detect zone if coordinates changed significantly
      if (coordsChanged) {
        prevCoordsRef.current = { latitude: lat, longitude: lng }
        detectZone(lat, lng)
      }
    } else {
      // Try to use cached zone if location not available
      const cachedZoneId = localStorage.getItem('userZoneId')
      if (cachedZoneId) {
        const cachedZone = localStorage.getItem('userZone')
        setZoneId(cachedZoneId)
        setZone(cachedZone ? JSON.parse(cachedZone) : null)
        setZoneStatus('IN_SERVICE')
      } else {
        setZoneStatus('OUT_OF_SERVICE')
        setZoneId(null)
        setZone(null)
      }
    }
  }, [location?.latitude, location?.longitude, detectZone])

  // Manual refresh zone
  const refreshZone = useCallback(() => {
    const lat = location?.latitude
    const lng = location?.longitude
    if (lat && lng) {
      detectZone(lat, lng)
    }
  }, [location?.latitude, location?.longitude, detectZone])

  return {
    zoneId,
    zone,
    zoneStatus,
    loading,
    error,
    isInService: zoneStatus === 'IN_SERVICE',
    isOutOfService: zoneStatus === 'OUT_OF_SERVICE',
    refreshZone
  }
}
