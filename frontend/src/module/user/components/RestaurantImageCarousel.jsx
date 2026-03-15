import React, { useState, useRef, useMemo } from "react"
import OptimizedImage from "@/components/OptimizedImage"

export const RestaurantImageCarousel = React.memo(({ restaurant, priority = false }) => {
  const images = useMemo(() => restaurant.images || [restaurant.image], [restaurant])
  const [currentIndex, setCurrentIndex] = useState(0)
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)
  const isSwiping = useRef(false)

  if (!images || images.length === 0) {
    return (
      <div className="relative h-48 sm:h-56 md:h-60 lg:h-64 xl:h-72 w-full overflow-hidden rounded-t-md flex-shrink-0 bg-gray-200">
        <OptimizedImage
          src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop"
          alt={restaurant.name}
          className="w-full h-full rounded-t-2xl sm:rounded-t-3xl"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          objectFit="cover"
          placeholder="blur"
          priority={priority}
        />
      </div>
    )
  }

  // Handle touch events for swipe
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
    isSwiping.current = false
  }

  const handleTouchMove = (e) => {
    const currentX = e.touches[0].clientX
    const diff = touchStartX.current - currentX

    // If swipe distance is significant, mark as swiping
    if (Math.abs(diff) > 10) {
      isSwiping.current = true
    }
  }

  const handleTouchEnd = (e) => {
    if (!isSwiping.current) return

    touchEndX.current = e.changedTouches[0].clientX
    const diff = touchStartX.current - touchEndX.current
    const minSwipeDistance = 50 // Minimum distance for swipe

    if (Math.abs(diff) > minSwipeDistance) {
      if (diff > 0) {
        // Swipe left - next image
        setCurrentIndex((prev) => (prev + 1) % images.length)
      } else {
        // Swipe right - previous image
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)
      }
    }

    // Reset
    isSwiping.current = false
    touchStartX.current = 0
    touchEndX.current = 0
  }

  return (
    <div
      className="relative h-48 sm:h-56 md:h-60 lg:h-64 xl:h-72 w-full overflow-hidden rounded-t-2xl sm:rounded-t-3xl flex-shrink-0 group"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-110">
        <OptimizedImage
          src={images[currentIndex]}
          alt={`${restaurant.name} - Image ${currentIndex + 1}`}
          className="w-full h-full rounded-t-2xl sm:rounded-t-3xl"
          priority={priority && currentIndex === 0}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          objectFit="cover"
          placeholder="blur"
        />
      </div>

      {/* Image Indicators - only show if more than 1 image */}
      {images.length > 1 && (
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex items-center z-10 -space-x-2">
          {images.map((_, index) => (
            <button
              key={index}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setCurrentIndex(index)
              }}
              className="w-10 h-10 flex items-center justify-center focus:outline-none group/btn rounded-full"
              aria-label={`Go to image ${index + 1}`}
            >
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${index === currentIndex
                  ? "w-6 bg-white"
                  : "w-1.5 bg-white/50 group-hover/btn:bg-white/75"
                  }`}
              />
            </button>
          ))}
        </div>
      )}

      {/* Gradient Overlay on Hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      {/* Shine Effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full transition-transform duration-1000 group-hover:animate-shine" />
    </div>
  )
})

RestaurantImageCarousel.displayName = "RestaurantImageCarousel"
