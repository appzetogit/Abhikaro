import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { MapPin, ArrowLeft, Save, X, Shapes, Search, Undo2, Info } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { getGoogleMapsApiKey } from "@/lib/utils/googleMapsApiKey"
import { Loader } from "@googlemaps/js-api-loader"

export default function AddZone() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEditMode = !!id && !window.location.pathname.includes('/view/')
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const polygonRef = useRef(null)
  const polylineRef = useRef(null)
  const pathMarkersRef = useRef([])
  const existingZonesPolygonsRef = useRef([])
  const autocompleteInputRef = useRef(null)
  const autocompleteRef = useRef(null)

  const [googleMapsApiKey, setGoogleMapsApiKey] = useState("")
  const [mapLoading, setMapLoading] = useState(true)
  const [loading, setLoading] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    country: "India",
    zoneName: "",
    unit: "kilometer",
  })

  const [coordinates, setCoordinates] = useState([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [locationSearch, setLocationSearch] = useState("")
  const [existingZones, setExistingZones] = useState([])

  // Keep synchronous refs to prevent stale state in map callbacks
  const isDrawingRef = useRef(false)
  const coordinatesRef = useRef([])

  useEffect(() => {
    isDrawingRef.current = isDrawing
  }, [isDrawing])

  useEffect(() => {
    coordinatesRef.current = coordinates
  }, [coordinates])

  useEffect(() => {
    fetchExistingZones()
    loadGoogleMaps()
    if (isEditMode && id) {
      fetchZone()
    }
  }, [id, isEditMode])

  // Center map on India when country is selected
  useEffect(() => {
    if (formData.country === "India" && mapInstanceRef.current) {
      const indiaCenter = { lat: 20.5937, lng: 78.9629 }
      mapInstanceRef.current.setCenter(indiaCenter)
      mapInstanceRef.current.setZoom(5)
    }
  }, [formData.country])

  // Initialize Places Autocomplete when map is loaded
  useEffect(() => {
    if (!mapLoading && mapInstanceRef.current && autocompleteInputRef.current && window.google?.maps?.places && !autocompleteRef.current) {
      const autocomplete = new window.google.maps.places.Autocomplete(autocompleteInputRef.current, {
        types: ['geocode', 'establishment'],
        componentRestrictions: { country: 'in' } // Restrict to India
      })

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace()
        if (place.geometry && place.geometry.location && mapInstanceRef.current) {
          const location = place.geometry.location
          mapInstanceRef.current.setCenter(location)
          mapInstanceRef.current.setZoom(15) // Zoom in when location is selected

          // Set the search input value
          setLocationSearch(place.formatted_address || place.name || "")
        }
      })

      autocompleteRef.current = autocomplete
    }
  }, [mapLoading])

  // Draw existing polygon when in edit mode and coordinates are loaded
  useEffect(() => {
    if (isEditMode && coordinates.length >= 3 && mapInstanceRef.current && window.google && !mapLoading) {
      setTimeout(() => {
        if (mapInstanceRef.current && window.google) {
          setIsDrawing(false)
          isDrawingRef.current = false
          drawExistingPolygon(window.google, mapInstanceRef.current, coordinates)
        }
      }, 300)
    }
  }, [isEditMode, mapLoading])

  const fetchExistingZones = async () => {
    try {
      const response = await adminAPI.getZones({ limit: 1000 })
      if (response.data?.success && response.data.data?.zones) {
        // Filter out the current zone if in edit mode
        const zones = isEditMode && id
          ? response.data.data.zones.filter(zone => zone._id !== id)
          : response.data.data.zones
        setExistingZones(zones)
      }
    } catch (error) {
      console.error("Error fetching existing zones:", error)
      setExistingZones([])
    }
  }

  const fetchZone = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getZoneById(id)
      if (response.data?.success && response.data.data?.zone) {
        const zoneData = response.data.data.zone
        setFormData({
          country: zoneData.country || "India",
          zoneName: zoneData.name || zoneData.zoneName || "",
          unit: zoneData.unit || "kilometer",
        })

        if (zoneData.coordinates && zoneData.coordinates.length > 0) {
          setCoordinates(zoneData.coordinates)
          coordinatesRef.current = zoneData.coordinates
        }
      }
    } catch (error) {
      console.error("Error fetching zone:", error)
      alert("Failed to load zone")
      navigate("/admin/zone-setup")
    } finally {
      setLoading(false)
    }
  }

  const loadGoogleMaps = async () => {
    try {
      const apiKey = await getGoogleMapsApiKey()
      setGoogleMapsApiKey(apiKey || "loaded")

      // Wait for Google Maps to be loaded from window if it's already loading
      let retries = 0
      const maxRetries = 50 // Wait up to 5 seconds (50 * 100ms)

      while (!window.google && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100))
        retries++
      }

      // If Google Maps is already loaded, use it directly
      if (window.google && window.google.maps) {
        initializeMap(window.google)
        return
      }

      // If Google Maps is not loaded yet and we have an API key, use Loader as fallback
      if (apiKey) {
        const loader = new Loader({
          apiKey: apiKey,
          version: "weekly",
          libraries: ["places", "geometry"]
        })

        const google = await loader.load()
        initializeMap(google)
      } else {
        setMapLoading(false)
      }
    } catch (error) {
      console.error("Error loading Google Maps:", error)
      setMapLoading(false)
    }
  }

  // Render the polyline or polygon based on current coordinates
  const renderZoneShape = (coords) => {
    if (!mapInstanceRef.current || !window.google?.maps) return

    const google = window.google
    const path = coords.map(c => ({
      lat: typeof c.latitude === "number" ? c.latitude : (c.lat || 0),
      lng: typeof c.longitude === "number" ? c.longitude : (c.lng || 0)
    }))

    if (coords.length < 3) {
      // Remove polygon if exists
      if (polygonRef.current) {
        polygonRef.current.setMap(null)
        polygonRef.current = null
      }

      // Draw polyline if 2 points
      if (coords.length === 2) {
        if (!polylineRef.current) {
          polylineRef.current = new google.maps.Polyline({
            path: path,
            strokeColor: "#9333ea",
            strokeOpacity: 0.9,
            strokeWeight: 3,
            zIndex: 2
          })
          polylineRef.current.setMap(mapInstanceRef.current)
        } else {
          polylineRef.current.setPath(path)
          if (!polylineRef.current.getMap()) {
            polylineRef.current.setMap(mapInstanceRef.current)
          }
        }
      } else if (polylineRef.current) {
        polylineRef.current.setMap(null)
        polylineRef.current = null
      }
    } else {
      // 3 or more points: draw / update polygon
      if (polylineRef.current) {
        polylineRef.current.setMap(null)
        polylineRef.current = null
      }

      if (!polygonRef.current) {
        polygonRef.current = new google.maps.Polygon({
          paths: path,
          strokeColor: "#9333ea",
          strokeOpacity: 0.9,
          strokeWeight: 2.5,
          fillColor: "#9333ea",
          fillOpacity: 0.35,
          clickable: false,
          zIndex: 2
        })
        polygonRef.current.setMap(mapInstanceRef.current)
      } else {
        polygonRef.current.setPaths(path)
        if (!polygonRef.current.getMap()) {
          polygonRef.current.setMap(mapInstanceRef.current)
        }
      }
    }
  }

  // Helper to create a draggable vertex marker
  const createVertexMarker = (latLng, index) => {
    if (!mapInstanceRef.current || !window.google?.maps) return null

    const google = window.google
    const marker = new google.maps.Marker({
      position: latLng,
      map: mapInstanceRef.current,
      draggable: true,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: index === 0 ? "#7e22ce" : "#9333ea",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
      },
      title: index === 0 ? `Point 1 (Start / Click to close)` : `Point ${index + 1} (Drag to move)`,
      zIndex: 1000 + index,
      cursor: "grab"
    })

    // On dragging vertex, update polygon shape live
    marker.addListener("drag", () => {
      const updatedCoords = pathMarkersRef.current.map(m => {
        const pos = m.getPosition()
        return {
          latitude: parseFloat(pos.lat().toFixed(6)),
          longitude: parseFloat(pos.lng().toFixed(6))
        }
      })
      renderZoneShape(updatedCoords)
    })

    // On drag end, update coordinates state
    marker.addListener("dragend", () => {
      const updatedCoords = pathMarkersRef.current.map(m => {
        const pos = m.getPosition()
        return {
          latitude: parseFloat(pos.lat().toFixed(6)),
          longitude: parseFloat(pos.lng().toFixed(6))
        }
      })
      coordinatesRef.current = updatedCoords
      setCoordinates(updatedCoords)
      renderZoneShape(updatedCoords)
    })

    // If drawing mode is active and user clicks point 1 (when >= 3 points), complete the zone
    marker.addListener("click", () => {
      if (isDrawingRef.current && index === 0 && coordinatesRef.current.length >= 3) {
        setIsDrawing(false)
        isDrawingRef.current = false
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setOptions({ draggableCursor: null })
        }
      }
    })

    return marker
  }

  // Add a new point to the zone
  const addPoint = (lat, lng) => {
    const newPoint = {
      latitude: parseFloat(lat.toFixed(6)),
      longitude: parseFloat(lng.toFixed(6))
    }

    const nextCoords = [...coordinatesRef.current, newPoint]
    coordinatesRef.current = nextCoords
    setCoordinates(nextCoords)

    // Add marker
    const marker = createVertexMarker(new window.google.maps.LatLng(lat, lng), nextCoords.length - 1)
    if (marker) {
      pathMarkersRef.current.push(marker)
    }

    renderZoneShape(nextCoords)
  }

  const initializeMap = (google) => {
    if (!mapRef.current) return

    // Initial location (India center)
    const initialLocation = { lat: 20.5937, lng: 78.9629 }

    const mapTypeControlStyle = google.maps?.MapTypeControlStyle?.HORIZONTAL_BAR ||
                                google.maps?.MapTypeControlStyle?.DEFAULT ||
                                undefined

    const terrainId = google.maps?.MapTypeId?.TERRAIN || "terrain"
    const roadmapId = google.maps?.MapTypeId?.ROADMAP || "roadmap"
    const satelliteId = google.maps?.MapTypeId?.SATELLITE || "satellite"

    const mapOptions = {
      center: initialLocation,
      zoom: 5,
      mapTypeId: terrainId,
      mapTypeControl: true,
      zoomControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      scrollwheel: true,
      gestureHandling: 'greedy',
      mapTypeControlOptions: {
        ...(mapTypeControlStyle ? { style: mapTypeControlStyle } : {}),
        position: google.maps?.ControlPosition?.TOP_RIGHT || undefined,
        mapTypeIds: [terrainId, roadmapId, satelliteId]
      }
    }

    const map = new google.maps.Map(mapRef.current, mapOptions)
    mapInstanceRef.current = map

    // Attach click listener for drawing zone points
    map.addListener("click", (e) => {
      if (!isDrawingRef.current) return
      const lat = e.latLng.lat()
      const lng = e.latLng.lng()
      addPoint(lat, lng)
    })

    setMapLoading(false)

    // If in edit mode and coordinates are already loaded, draw the polygon
    if (isEditMode && coordinatesRef.current.length >= 3) {
      setTimeout(() => {
        if (mapInstanceRef.current && window.google) {
          drawExistingPolygon(window.google, mapInstanceRef.current, coordinatesRef.current)
        }
      }, 300)
    }
  }

  // Draw existing zones on the map
  const drawExistingZonesOnMap = (google, map) => {
    if (!existingZones || existingZones.length === 0) return

    // Clear previous existing zone polygons
    existingZonesPolygonsRef.current.forEach(polygon => {
      if (polygon) polygon.setMap(null)
    })
    existingZonesPolygonsRef.current = []

    existingZones.forEach((zone) => {
      if (!zone.coordinates || zone.coordinates.length < 3) return

      // Convert coordinates to LatLng array
      const path = zone.coordinates.map(coord => {
        const lat = typeof coord === 'object' ? (coord.latitude || coord.lat) : null
        const lng = typeof coord === 'object' ? (coord.longitude || coord.lng) : null
        if (lat === null || lng === null) return null
        return new google.maps.LatLng(lat, lng)
      }).filter(Boolean)

      if (path.length < 3) return

      // Create polygon for existing zone with blue color
      const polygon = new google.maps.Polygon({
        paths: path,
        strokeColor: "#3b82f6",
        strokeOpacity: 0.6,
        strokeWeight: 2,
        fillColor: "#3b82f6",
        fillOpacity: 0.15,
        editable: false,
        draggable: false,
        clickable: true,
        zIndex: 1
      })

      polygon.setMap(map)
      existingZonesPolygonsRef.current.push(polygon)

      // Add info window on click
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="padding: 8px; font-family: sans-serif;">
            <strong style="color: #1e293b;">${zone.name || zone.zoneName || 'Unnamed Zone'}</strong><br/>
            <small style="color: #64748b;">Country: ${zone.country || 'N/A'}</small>
          </div>
        `
      })

      polygon.addListener('click', () => {
        infoWindow.setPosition(polygon.getPath().getAt(0))
        infoWindow.open(map)
      })
    })
  }

  // Redraw existing zones when zones data changes or map is ready
  useEffect(() => {
    if (!mapLoading && mapInstanceRef.current && existingZones.length > 0 && window.google) {
      drawExistingZonesOnMap(window.google, mapInstanceRef.current)
    }
  }, [existingZones, mapLoading])

  const drawExistingPolygon = (google, map, coords) => {
    if (!coords || coords.length < 3) return

    // Clear previous polygon and markers
    if (polygonRef.current) {
      polygonRef.current.setMap(null)
      polygonRef.current = null
    }
    if (polylineRef.current) {
      polylineRef.current.setMap(null)
      polylineRef.current = null
    }
    pathMarkersRef.current.forEach(marker => marker.setMap(null))
    pathMarkersRef.current = []

    // Convert coordinates to LatLng array & fit bounds
    const bounds = new google.maps.LatLngBounds()
    const path = []
    const markers = []

    coords.forEach((coord, index) => {
      const lat = typeof coord === 'object' ? (coord.latitude ?? coord.lat) : null
      const lng = typeof coord === 'object' ? (coord.longitude ?? coord.lng) : null
      if (lat !== null && lng !== null) {
        const latLng = new google.maps.LatLng(lat, lng)
        path.push(latLng)
        bounds.extend(latLng)

        const marker = createVertexMarker(latLng, index)
        if (marker) markers.push(marker)
      }
    })

    pathMarkersRef.current = markers

    if (path.length < 3) return

    // Create polygon
    const polygon = new google.maps.Polygon({
      paths: path,
      strokeColor: "#9333ea",
      strokeOpacity: 0.9,
      strokeWeight: 2.5,
      fillColor: "#9333ea",
      fillOpacity: 0.35,
      clickable: false,
      zIndex: 2
    })

    polygon.setMap(map)
    polygonRef.current = polygon

    // Fit map to polygon bounds
    map.fitBounds(bounds)
  }

  const toggleDrawingMode = () => {
    if (isDrawing) {
      // Stop drawing
      setIsDrawing(false)
      isDrawingRef.current = false
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setOptions({ draggableCursor: null })
      }
    } else {
      // Start drawing
      setIsDrawing(true)
      isDrawingRef.current = true
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setOptions({ draggableCursor: "crosshair" })
      }
    }
  }

  const undoLastPoint = () => {
    if (coordinatesRef.current.length === 0) return

    const nextCoords = coordinatesRef.current.slice(0, -1)
    coordinatesRef.current = nextCoords
    setCoordinates(nextCoords)

    // Remove last marker
    if (pathMarkersRef.current.length > 0) {
      const lastMarker = pathMarkersRef.current.pop()
      if (lastMarker) lastMarker.setMap(null)
    }

    renderZoneShape(nextCoords)
  }

  const clearDrawing = () => {
    if (polygonRef.current) {
      polygonRef.current.setMap(null)
      polygonRef.current = null
    }
    if (polylineRef.current) {
      polylineRef.current.setMap(null)
      polylineRef.current = null
    }
    pathMarkersRef.current.forEach(marker => marker.setMap(null))
    pathMarkersRef.current = []

    coordinatesRef.current = []
    setCoordinates([])
  }

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.zoneName?.trim()) {
      alert("Please enter a zone name")
      return
    }

    if (!formData.country) {
      alert("Please select a country")
      return
    }

    if (coordinates.length < 3) {
      alert("Please draw at least 3 points on the map to create a zone polygon")
      return
    }

    try {
      setLoading(true)

      const validCoordinates = coordinates.map(coord => ({
        latitude: parseFloat(coord.latitude ?? coord.lat),
        longitude: parseFloat(coord.longitude ?? coord.lng)
      }))

      const zoneData = {
        name: formData.zoneName.trim(),
        zoneName: formData.zoneName.trim(),
        country: formData.country,
        unit: formData.unit || "kilometer",
        coordinates: validCoordinates,
        isActive: true
      }

      if (isEditMode && id) {
        // Update existing zone
        await adminAPI.updateZone(id, zoneData)
        alert("Zone updated successfully!")
      } else {
        // Create new zone
        await adminAPI.createZone(zoneData)
        alert("Zone created successfully!")
      }
      navigate("/admin/zone-setup")
    } catch (error) {
      console.error("Error saving zone:", error)

      let errorMessage = "Failed to save zone. Please try again."
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error' || !error.response) {
        errorMessage = "Cannot connect to server. Please make sure the backend server is running."
      } else if (error.response) {
        errorMessage = error.response.data?.message ||
                       error.response.data?.error ||
                       error.message ||
                       `Server error: ${error.response.status}`
      } else if (error.message) {
        errorMessage = error.message
      }

      alert(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="p-4 lg:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate("/admin/zone-setup")}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {isEditMode ? "Edit Zone" : "Add New Zone"}
              </h1>
              <p className="text-sm text-slate-600">
                {isEditMode ? "Update delivery zone for customer" : "Create a delivery zone for customer"}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Panel - Form */}
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Zone Details</h2>

                <div className="space-y-4">
                  {/* Country Selection */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Country <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.country}
                      onChange={(e) => handleInputChange("country", e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="India">India</option>
                    </select>
                  </div>

                  {/* Zone Name */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Create Zone name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.zoneName}
                      onChange={(e) => handleInputChange("zoneName", e.target.value)}
                      placeholder="Enter zone name (e.g. City Central, West Area)"
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  {/* Select Unit */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Select Unit <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.unit}
                      onChange={(e) => handleInputChange("unit", e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="kilometer">Kilometers (km)</option>
                      <option value="miles">Miles (mi)</option>
                    </select>
                  </div>

                  {/* Guide info */}
                  <div className="p-4 bg-purple-50 border border-purple-100 rounded-lg text-xs text-purple-900 space-y-1.5">
                    <p className="font-semibold flex items-center gap-1.5">
                      <Info className="w-4 h-4 text-purple-600" />
                      How to draw a delivery zone:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 text-purple-800">
                      <li>Click <strong>Start Drawing</strong> and click on the map to set zone corners (minimum 3 points).</li>
                      <li>Drag any point marker to adjust boundary lines.</li>
                      <li>Click <strong>Stop Drawing</strong> or click the first point to finish.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel - Map */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Draw Zone on Map</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleDrawingMode}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all shadow-sm ${
                      isDrawing
                        ? "bg-red-600 text-white hover:bg-red-700 ring-2 ring-red-300 animate-pulse"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                  >
                    <Shapes className="w-4 h-4" />
                    <span>{isDrawing ? "Stop Drawing" : "Start Drawing"}</span>
                  </button>

                  {coordinates.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={undoLastPoint}
                        title="Undo last point"
                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
                      >
                        <Undo2 className="w-4 h-4" />
                        <span>Undo</span>
                      </button>
                      <button
                        type="button"
                        onClick={clearDrawing}
                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium"
                      >
                        <X className="w-4 h-4" />
                        <span>Clear</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Instructions banner while drawing */}
              {isDrawing && (
                <div className="mb-3 px-3.5 py-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between text-xs text-blue-900">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600"></span>
                    </span>
                    <span>
                      <strong>Drawing Mode Active:</strong> Click on map to add points ({coordinates.length} added). Drag markers to fine-tune.
                    </span>
                  </div>
                </div>
              )}

              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    ref={autocompleteInputRef}
                    type="text"
                    placeholder="Search location on map..."
                    value={locationSearch}
                    onChange={(e) => setLocationSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {coordinates.length > 0 && (
                  <p className="text-xs text-slate-600 mt-2 flex items-center gap-1.5">
                    <span>Points drawn:</span>
                    <span className="font-semibold px-2 py-0.5 bg-purple-100 text-purple-800 rounded-md">
                      {coordinates.length}
                    </span>
                    {coordinates.length < 3 ? (
                      <span className="text-amber-600 font-medium">({3 - coordinates.length} more point{3 - coordinates.length > 1 ? 's' : ''} needed to form a zone)</span>
                    ) : (
                      <span className="text-emerald-600 font-medium">✓ Valid zone polygon</span>
                    )}
                  </p>
                )}
              </div>

              <div className="relative" style={{ height: "550px" }}>
                <div ref={mapRef} className="w-full h-full rounded-lg" />

                {mapLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-100 rounded-lg">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                      <p className="text-slate-600 font-medium text-sm">Loading map...</p>
                    </div>
                  </div>
                )}

                {!googleMapsApiKey && !mapLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-100 rounded-lg">
                    <div className="text-center p-6">
                      <MapPin className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                      <p className="text-sm text-slate-600 font-medium">Google Maps API key not found</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => navigate("/admin/zone-setup")}
              className="px-6 py-2.5 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || coordinates.length < 3 || !formData.zoneName?.trim() || !formData.country}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{isEditMode ? "Update Zone" : "Save Zone"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
