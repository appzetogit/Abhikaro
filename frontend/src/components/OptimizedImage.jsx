import React, { useState, useEffect, useRef, useMemo } from 'react'
import { BACKEND_ORIGIN } from '@/lib/api/config'

/**
 * OptimizedImage Component
 * 
 * Features:
 * - Lazy loading with Intersection Observer
 * - Responsive srcset for different screen sizes
 * - WebP/AVIF format support with fallback
 * - Blur placeholder (LQIP) for smooth loading
 * - Preloading for critical images
 * - Proper decoding and fetchpriority
 * - Error handling with fallback
 */
const OptimizedImage = React.memo(({
  src: rawSrc,
  alt,
  className = '',
  priority = false, // For above-the-fold images
  sizes = '100vw',
  objectFit = 'cover',
  placeholder = 'blur',
  blurDataURL,
  onLoad,
  onError,
  ...props
}) => {
  const src = useMemo(() => {
    if (!rawSrc || typeof rawSrc !== 'string' || rawSrc === '') return rawSrc
    if (rawSrc.startsWith('/uploads') && !rawSrc.startsWith('//') && !rawSrc.startsWith('data:')) {
      return `${BACKEND_ORIGIN}${rawSrc}`
    }
    return rawSrc
  }, [rawSrc])

  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [isInView, setIsInView] = useState(priority) // Start visible if priority
  const [forceVisible, setForceVisible] = useState(false)
  const imgRef = useRef(null)
  const observerRef = useRef(null)

  // When image source changes (carousel slide / fallback), clear previous load-error state.
  useEffect(() => {
    setIsLoaded(false)
    setHasError(false)
    setForceVisible(false)
    if (priority) {
      setIsInView(true)
    }
  }, [src, priority])

  // BFCache restore (back/forward) can leave <img> in a broken state; reset so URLs load again.
  useEffect(() => {
    const onPageShow = (e) => {
      if (!e?.persisted) return
      setHasError(false)
      setIsLoaded(false)
      setForceVisible(false)
      if (priority) {
        setIsInView(true)
      }
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [src, priority])

  // Check if image URL supports optimization (external URLs from known providers)
  const getOptimizationProvider = (imageSrc) => {
    if (!imageSrc || typeof imageSrc !== 'string' || imageSrc === '') return false
    if (imageSrc.startsWith('data:') || imageSrc.startsWith('/')) return false
    if (!/^https?:\/\//.test(imageSrc)) return false

    try {
      const host = new URL(imageSrc).hostname.toLowerCase()
      if (host.includes('cloudinary.com')) return 'cloudinary'
      if (host.includes('imagekit.io')) return 'imagekit'
    } catch (error) {
      return false
    }

    return false
  }

  const supportsOptimization = (imageSrc) => !!getOptimizationProvider(imageSrc)

  const getOptimizedImageUrl = (imageSrc, { width, quality = 80, format } = {}) => {
    const provider = getOptimizationProvider(imageSrc)
    if (!provider) return imageSrc

    if (provider === 'cloudinary') {
      // If URL already has transformations after /upload/, do not modify
      try {
        const url = new URL(imageSrc)
        const afterUpload = url.pathname.split('/upload/')[1]
        if (afterUpload && afterUpload.length > 0) {
          const firstSegment = afterUpload.split('/')[0]
          // Heuristic: if there is a comma or contains known flags, it's already transformed
          if (firstSegment.includes(',') || /(^|,)q_|(^|,)f_|(^|,)w_/.test(firstSegment)) {
            return imageSrc
          }
        }
      } catch (_) { /* ignore and continue */ }

      const transformParts = []
      if (format) {
        transformParts.push(`f_${format}`)
      } else {
        // Prefer auto format when not explicitly requested
        transformParts.push('f_auto')
      }
      if (quality) {
        transformParts.push(`q_${quality}`)
      } else {
        transformParts.push('q_auto')
      }
      if (width) transformParts.push(`w_${width}`)

      if (!transformParts.length || !imageSrc.includes('/upload/')) return imageSrc
      return imageSrc.replace('/upload/', `/upload/${transformParts.join(',')}/`)
    }

    if (provider === 'imagekit') {
      // If URL already has tr= params, skip
      if (imageSrc.includes('tr=')) return imageSrc
      const params = []
      if (width) params.push(`w-${width}`)
      if (quality) params.push(`q-${quality}`)
      if (format) {
        params.push(`f-${format}`)
      }
      if (!params.length) return imageSrc
      const separator = imageSrc.includes('?') ? '&' : '?'
      return `${imageSrc}${separator}tr=${params.join(',')}`
    }

    return imageSrc
  }

  // Generate responsive srcset
  const srcSet = useMemo(() => {
    if (!supportsOptimization(src)) return undefined
    const sizesArr = [400, 600, 800, 1200, 1600]
    return sizesArr
      .map(size => `${getOptimizedImageUrl(src, { width: size, quality: 80 })} ${size}w`)
      .join(', ')
  }, [src])

  // Generate WebP srcset
  const webPSrcSet = useMemo(() => {
    if (!supportsOptimization(src)) return undefined
    const sizesArr = [400, 600, 800, 1200, 1600]
    return sizesArr
      .map(size => `${getOptimizedImageUrl(src, { width: size, quality: 80, format: 'webp' })} ${size}w`)
      .join(', ')
  }, [src])

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority || isInView) return

    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setIsInView(true)
      return
    }

    if (!imgRef.current) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true)
            if (observerRef.current && imgRef.current) {
              observerRef.current.unobserve(imgRef.current)
            }
          }
        })
      },
      {
        rootMargin: '250px', // Start loading early for smoother mobile rendering
        threshold: 0.01
      }
    )

    observerRef.current.observe(imgRef.current)

    return () => {
      if (observerRef.current && imgRef.current) {
        observerRef.current.unobserve(imgRef.current)
      }
    }
  }, [priority, isInView])

  // Fallback: if observer callback doesn't fire on some webviews, force image load.
  useEffect(() => {
    if (priority || isInView) return
    const timer = setTimeout(() => setIsInView(true), 1200)
    return () => clearTimeout(timer)
  }, [priority, isInView, src])

  // Preload critical images once per URL to avoid many duplicate <link> tags.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (priority && src && !src.startsWith('data:')) {
      const preloadKey = '__abhi_preloaded_images__'
      const preloadedImages = window[preloadKey] || new Set()
      window[preloadKey] = preloadedImages
      if (preloadedImages.has(src)) return

      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = src
      link.fetchPriority = 'high'
      document.head.appendChild(link)
      preloadedImages.add(src)

      return () => {
        if (document.head.contains(link)) {
          document.head.removeChild(link)
        }
      }
    }
  }, [priority, src])

  // Ensure placeholder never blocks final image indefinitely if onLoad is delayed.
  useEffect(() => {
    if (!isInView || isLoaded || hasError) return
    const timer = setTimeout(() => setForceVisible(true), 1800)
    return () => clearTimeout(timer)
  }, [isInView, isLoaded, hasError])

  const handleLoad = (e) => {
    setIsLoaded(true)
    if (onLoad) onLoad(e)
  }

  const handleError = (e) => {
    setHasError(true)
    if (onError) onError(e)
  }

  // Default blur placeholder (tiny gray square)
  const defaultBlurDataURL = blurDataURL || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2U1ZTdlYiIvPjwvc3ZnPg=='

  // Don't render if src is empty or null
  if (!src || src === '') {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
          <span className="text-xs text-gray-400 dark:text-gray-600">Image unavailable</span>
        </div>
      </div>
    )
  }

  const imageSrc = hasError ? 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23e5e7eb" width="400" height="300"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="14" x="50%25" y="50%25" text-anchor="middle"%3EImage not found%3C/text%3E%3C/svg%3E' : src

  return (
    <div className={`relative overflow-hidden ${className}`} ref={imgRef}>
      {/* Blur Placeholder */}
      {isInView && placeholder === 'blur' && !isLoaded && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${defaultBlurDataURL})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(20px)',
            transform: 'scale(1.1)',
            opacity: isLoaded ? 0 : 1,
            transition: 'opacity 0.3s ease',
          }}
        />
      )}

      {/* Loading Skeleton */}
      {isInView && !isLoaded && !hasError && (
        <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700 animate-pulse" />
      )}

      {/* Actual Image */}
      {isInView && (
        <picture className="absolute inset-0 w-full h-full">
          {/* WebP source for modern browsers */}
          {webPSrcSet && (
            <source
              srcSet={webPSrcSet}
              sizes={sizes}
              type="image/webp"
            />
          )}

          {/* Fallback to original format */}
          <img
            src={imageSrc}
            srcSet={srcSet}
            sizes={supportsOptimization(imageSrc) ? sizes : undefined}
            alt={alt}
            className={`w-full h-full ${objectFit === 'cover' ? 'object-cover' : objectFit === 'contain' ? 'object-contain' : ''} ${priority || isLoaded || forceVisible ? 'opacity-100' : 'opacity-0'} ${!priority && 'transition-opacity duration-300'}`}
            loading={priority ? 'eager' : 'lazy'}
            decoding={priority ? 'sync' : 'async'}
            fetchPriority={priority ? 'high' : 'auto'}
            onLoad={handleLoad}
            onError={handleError}
            {...props}
          />
        </picture>
      )}

      {/* Error State */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
          <span className="text-xs text-gray-400 dark:text-gray-600">Image unavailable</span>
        </div>
      )}
    </div>
  )
})

export default OptimizedImage
