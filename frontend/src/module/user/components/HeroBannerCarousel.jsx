import { useState, useRef, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { Loader2 } from "lucide-react"
import OptimizedImage from "@/components/OptimizedImage"

export default function HeroBannerCarousel({ banners, loading }) {
  const navigate = useNavigate()
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    setCurrentIndex(0)
  }, [banners?.length])
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const touchEndX = useRef(0)
  const touchEndY = useRef(0)
  const isSwiping = useRef(false)
  const autoSlideIntervalRef = useRef(null)

  const bannerImages = banners?.map(b => b.imageUrl || b) || []

  // Auto-cycle hero banner images
  useEffect(() => {
    if (bannerImages.length === 0) return

    autoSlideIntervalRef.current = setInterval(() => {
      if (!isSwiping.current) {
        setCurrentIndex((prev) => (prev + 1) % bannerImages.length)
      }
    }, 10000) // Change every 10 seconds

    return () => {
      if (autoSlideIntervalRef.current) {
        clearInterval(autoSlideIntervalRef.current)
      }
    }
  }, [bannerImages.length])

  // Helper function to reset auto-slide timer
  const resetAutoSlide = useCallback(() => {
    if (autoSlideIntervalRef.current) {
      clearInterval(autoSlideIntervalRef.current)
    }
    if (bannerImages.length > 0) {
      autoSlideIntervalRef.current = setInterval(() => {
        if (!isSwiping.current) {
          setCurrentIndex((prev) => (prev + 1) % bannerImages.length)
        }
      }, 10000)
    }
  }, [bannerImages.length])

  // Swipe handlers for hero banner carousel
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    isSwiping.current = true
  }

  const handleTouchMove = (e) => {
    touchEndX.current = e.touches[0].clientX
    touchEndY.current = e.touches[0].clientY
  }

  const handleTouchEnd = () => {
    if (!isSwiping.current || bannerImages.length === 0) return

    const deltaX = touchEndX.current - touchStartX.current
    const deltaY = Math.abs(touchEndY.current - touchStartY.current)
    const minSwipeDistance = 50 // Minimum distance for a swipe

    // Check if it's a horizontal swipe (not vertical scroll)
    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > deltaY) {
      if (deltaX > 0) {
        // Swipe right - go to previous image
        setCurrentIndex((prev) => (prev - 1 + bannerImages.length) % bannerImages.length)
      } else {
        // Swipe left - go to next image
        setCurrentIndex((prev) => (prev + 1) % bannerImages.length)
      }
      // Reset auto-slide timer after manual swipe
      resetAutoSlide()
    }

    // Reset swipe state after a short delay
    setTimeout(() => {
      isSwiping.current = false
    }, 300)

    // Reset touch positions
    touchStartX.current = 0
    touchStartY.current = 0
    touchEndX.current = 0
    touchEndY.current = 0
  }

  // Mouse handlers for desktop drag support
  const handleMouseDown = (e) => {
    touchStartX.current = e.clientX
    touchStartY.current = e.clientY
    isSwiping.current = true
  }

  const handleMouseMove = (e) => {
    if (!isSwiping.current) return
    touchEndX.current = e.clientX
    touchEndY.current = e.clientY
  }

  const handleMouseUp = () => {
    if (!isSwiping.current || bannerImages.length === 0) return

    const deltaX = touchEndX.current - touchStartX.current
    const deltaY = Math.abs(touchEndY.current - touchStartY.current)
    const minSwipeDistance = 50

    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > deltaY) {
      if (deltaX > 0) {
        setCurrentIndex((prev) => (prev - 1 + bannerImages.length) % bannerImages.length)
      } else {
        setCurrentIndex((prev) => (prev + 1) % bannerImages.length)
      }
      // Reset auto-slide timer after manual swipe
      resetAutoSlide()
    }

    setTimeout(() => {
      isSwiping.current = false
    }, 300)

    touchStartX.current = 0
    touchStartY.current = 0
    touchEndX.current = 0
    touchEndY.current = 0
  }

  if (loading) {
    return (
      <div className="absolute top-0 md:top-16 lg:top-20 left-0 right-0 bottom-0 z-0 px-4 sm:px-6">
        <div className="w-full h-full bg-gray-100 dark:bg-gray-800 animate-pulse sm:rounded-2xl lg:rounded-3xl flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            <p className="text-sm text-gray-400">Loading banners...</p>
          </div>
        </div>
      </div>
    )
  }

  if (bannerImages.length === 0) {
    return <div className="absolute top-0 left-0 right-0 bottom-0 z-0 bg-white" />
  }

  return (
    <div
      className="absolute top-0 md:top-16 lg:top-20 left-0 right-0 bottom-0 z-0 cursor-grab active:cursor-grabbing overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <motion.div
        className="flex h-full"
        animate={{
          x: `-${currentIndex * 100}vw`
        }}
        transition={{
          duration: 0.6,
          ease: "easeInOut"
        }}
        style={{
          width: `${bannerImages.length * 100}vw`
        }}
      >
        {bannerImages.map((image, index) => {
          const bannerData = banners[index]
          const linkedRestaurants = bannerData?.linkedRestaurants || []
          const hasLinkedRestaurants = linkedRestaurants.length > 0

          const slideKey =
            (bannerData?.imageUrl && String(bannerData.imageUrl)) ||
            (typeof image === "string" ? image : "") ||
            `slide-${index}`

          return (
            <div
              key={`${slideKey}-${index}`}
              className="h-full flex-shrink-0 sm:px-4 lg:px-6"
              style={{ width: '100vw', cursor: hasLinkedRestaurants ? 'pointer' : 'default' }}
              onClick={() => {
                if (hasLinkedRestaurants) {
                  // Redirect to first linked restaurant
                  const firstRestaurant = linkedRestaurants[0]
                  const restaurantSlug = firstRestaurant.slug || firstRestaurant.restaurantId || firstRestaurant._id
                  navigate(`/restaurants/${restaurantSlug}`)
                }
              }}
            >
              <div className="relative h-full">
                <OptimizedImage
                  src={image}
                  alt={`Hero Banner ${index + 1}`}
                  className="w-full h-full sm:rounded-2xl lg:rounded-3xl shadow-md"
                  priority={index === 0}
                  sizes="100vw"
                  objectFit="cover"
                  placeholder="blur"
                />
                {/* Mask for old embedded logo text on banner (desktop only) */}
                <div className="pointer-events-none hidden md:block absolute top-6 left-1/2 -translate-x-1/2 w-28 h-10 bg-gradient-to-b from-[#fec9d3] to-transparent rounded-full" />
              </div>
            </div>
          )
        })}
      </motion.div>
    </div>
  )
}
