import React from 'react'
import { Skeleton } from "@/components/ui/skeleton"

const HomeSkeleton = () => {
  return (
    <div className="w-full bg-white dark:bg-[#0a0a0a] min-h-screen">
      {/* Header Skeleton */}
      <div className="pt-7 px-4 sm:px-6 lg:px-8 flex items-center gap-4">
        <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
        <Skeleton className="h-10 flex-grow rounded-xl" />
      </div>

      {/* Hero Banner Skeleton */}
      <div className="mt-8 px-4 sm:px-6 lg:px-8">
        <Skeleton className="w-full aspect-[2/1] md:aspect-[3/1] rounded-3xl" />
      </div>

      {/* Categories Skeleton */}
      <div className="mt-8 px-4 sm:px-6 lg:px-8">
        <div className="flex gap-4 overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 flex-shrink-0">
              <Skeleton className="w-16 h-16 sm:w-20 sm:h-20 rounded-full" />
              <Skeleton className="h-3 w-12 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Filters Skeleton */}
      <div className="mt-8 px-4 sm:px-6 lg:px-8 flex gap-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-lg" />
        ))}
      </div>

      {/* Restaurants Section Skeleton */}
      <div className="mt-10 px-4 sm:px-6 lg:px-8 space-y-6 pb-20">
        <Skeleton className="h-6 w-48 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="w-full aspect-[16/9] rounded-2xl" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-3/4 rounded" />
                <div className="flex justify-between items-center">
                  <Skeleton className="h-4 w-1/4 rounded" />
                  <Skeleton className="h-4 w-1/4 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default HomeSkeleton
