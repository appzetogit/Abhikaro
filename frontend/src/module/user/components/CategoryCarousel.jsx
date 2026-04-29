import React from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { UtensilsCrossed, Loader2 } from "lucide-react"
import OptimizedImage from "@/components/OptimizedImage"
import offerImage from "@/assets/offerimage.png"

export default function CategoryCarousel({ 
  categories, 
  landingCategories, 
  loading,
  limit = 10,
  onShowAllClick 
}) {
  const navigate = useNavigate()
  const categoryScrollRef = React.useRef(null)
  
  const displayCategories = categories.length > 0 ? categories : landingCategories

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <motion.section
      className="space-y-1 sm:space-y-1.5 lg:space-y-2"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.5 }}
    >
      <div
        ref={categoryScrollRef}
        className="flex gap-3 sm:gap-4 lg:gap-5 xl:gap-6 overflow-x-auto overflow-y-visible scrollbar-hide scroll-smooth px-2 sm:px-3 lg:px-4 py-2 sm:py-3 lg:py-4"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          touchAction: "pan-x pan-y pinch-zoom",
          overflowY: "hidden",
        }}
      >
        {/* Offer Image - Static, Centered */}
        <motion.div
          className="flex-shrink-0 flex flex-col items-center gap-2 cursor-pointer group"
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          onClick={() => navigate("/under-250")}
        >
          <img
            src={offerImage}
            alt="Meals Under ₹200"
            className="w-16 h-16 sm:w-20 sm:h-20 object-contain"
          />
        </motion.div>

        {displayCategories.length > 0 ? (
          <>
            {/* Show only first N categories */}
            {displayCategories.slice(0, limit).map((category, index) => {
              const categoryData = categories.length > 0
                ? { name: category.name, image: category.image, slug: category.slug }
                : { name: category.label, image: category.imageUrl, slug: category.slug }

              const rowKey =
                (category.id && String(category.id)) ||
                (category._id && String(category._id)) ||
                `${categoryData.slug || categoryData.name || "cat"}-${index}`

              return (
                <motion.div
                  key={rowKey}
                  className="flex-shrink-0"
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 0.4,
                    delay: index * 0.05,
                    type: "spring",
                    stiffness: 100
                  }}
                  whileHover={{ scale: 1.05, y: -5 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Link 
                    to={`/category/${categoryData.slug || categoryData.name.toLowerCase().replace(/\s+/g, '-')}`} 
                    className="flex flex-col items-center gap-2 group"
                  >
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800 relative">
                      <OptimizedImage
                        src={categoryData.image}
                        alt={categoryData.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        sizes="(max-width: 640px) 64px, (max-width: 768px) 80px, 96px"
                        objectFit="cover"
                        placeholder="blur"
                        onError={() => { }}
                      />
                    </div>
                    <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 text-center whitespace-nowrap max-w-[80px] truncate">
                      {categoryData.name}
                    </span>
                  </Link>
                </motion.div>
              )
            })}
            {/* See All button - always show */}
            <motion.div
              key="see-all"
              className="flex-shrink-0"
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{
                duration: 0.4,
                delay: 0.1,
                type: "spring",
                stiffness: 100
              }}
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.95 }}
            >
              <div
                onClick={onShowAllClick}
                className="flex flex-col items-center gap-2 group cursor-pointer"
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800 relative bg-pink-100 dark:bg-pink-900/50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <UtensilsCrossed className="w-6 h-6 sm:w-8 sm:h-8 text-pink-600 dark:text-pink-400" />
                </div>
                <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 text-center whitespace-nowrap max-w-[80px] truncate">
                  See all
                </span>
              </div>
            </motion.div>
          </>
        ) : null}
      </div>
    </motion.section>
  )
}
