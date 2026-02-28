import { useState, useRef, useEffect } from "react"
import { useNavigate, useParams, useLocation } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowLeft,
  Trash2,
  Check,
  ChevronDown,
  Edit as EditIcon,
  Plus,
  X,
  Camera,
  ThumbsUp,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Upload
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
// Removed getAllFoods and saveFood - now using menu API
import api from "@/lib/api"
import { restaurantAPI, uploadAPI } from "@/lib/api"
import { toast } from "sonner"

// Utility to detect if running in Flutter WebView
const isFlutterApp = () => {
  return typeof window !== 'undefined' && window.flutter_inappwebview
}

// Convert base64 string to File object
const base64ToFile = (base64, mimeType, fileName) => {
  // Remove data URL prefix if present
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64
  const byteCharacters = atob(base64Data)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  const blob = new Blob([byteArray], { type: mimeType || 'image/jpeg' })
  return new File([blob], fileName || `image_${Date.now()}.jpg`, { type: mimeType || 'image/jpeg' })
}

export default function ItemDetailsPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const location = useLocation()
  const isNewItem = id === "new"
  const groupId = location.state?.groupId
  const defaultCategory = location.state?.category || "Varieties"
  const fileInputRef = useRef(null)

  // Initialize state with empty values - will be populated from API
  const [itemData, setItemData] = useState(null) // Store the full item data for saving
  const [itemName, setItemName] = useState("")
  const [category, setCategory] = useState(defaultCategory)
  const [subCategory, setSubCategory] = useState("")
  const [servesInfo, setServesInfo] = useState("")
  const [itemSizeQuantity, setItemSizeQuantity] = useState("")
  const [itemSizeUnit, setItemSizeUnit] = useState("piece")
  const [itemDescription, setItemDescription] = useState("")
  const [foodType, setFoodType] = useState("Veg")
  const [basePrice, setBasePrice] = useState("0")
  const [preparationTime, setPreparationTime] = useState("")
  const [gst, setGst] = useState("5.0")
  const [isRecommended, setIsRecommended] = useState(false)
  const [isInStock, setIsInStock] = useState(true)
  const [weightPerServing, setWeightPerServing] = useState("")
  const [calorieCount, setCalorieCount] = useState("")
  const [proteinCount, setProteinCount] = useState("")
  const [carbohydrates, setCarbohydrates] = useState("")
  const [fatCount, setFatCount] = useState("")
  const [fibreCount, setFibreCount] = useState("")
  const [allergens, setAllergens] = useState("")
  const [showMoreNutrition, setShowMoreNutrition] = useState(false)
  const [selectedTags, setSelectedTags] = useState([])
  const [images, setImages] = useState([])
  const [imageFiles, setImageFiles] = useState(new Map()) // Track File objects by preview URL
  const [imageBase64Data, setImageBase64Data] = useState(new Map()) // Track base64 data for Flutter-selected images (key: previewUrl, value: {base64, mimeType, fileName})
  const [uploadingImages, setUploadingImages] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [touchStart, setTouchStart] = useState(null)
  const [touchEnd, setTouchEnd] = useState(null)
  const [direction, setDirection] = useState(0)
  const carouselRef = useRef(null)
  const [isCategoryPopupOpen, setIsCategoryPopupOpen] = useState(false)
  const [isServesPopupOpen, setIsServesPopupOpen] = useState(false)
  const [isItemSizePopupOpen, setIsItemSizePopupOpen] = useState(false)
  const [isGstPopupOpen, setIsGstPopupOpen] = useState(false)
  const [isTagsPopupOpen, setIsTagsPopupOpen] = useState(false)
  const [categories, setCategories] = useState([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [loadingItem, setLoadingItem] = useState(false)
  const [hasVariants, setHasVariants] = useState(false)
  const [variants, setVariants] = useState([]) // Array of variants: [{ id, name, price, stock }]

  const maxNameLength = 70
  const maxDescriptionLength = 1000
  const descriptionLength = itemDescription.length
  const minDescriptionLength = 5
  const nameLength = itemName.length

  // Fetch item data from menu API when editing
  useEffect(() => {
    const fetchItemData = async () => {
      // If itemData is already in location.state, use it
      if (location.state?.item) {
        const item = location.state.item
        // Store the full item data for saving
        setItemData(item)

        setItemName(item.name || "")
        setCategory(item.category || defaultCategory)
        setSubCategory(item.subCategory || item.category || "Starters")
        setServesInfo(item.servesInfo || "")
        setItemSizeQuantity(item.itemSizeQuantity || "")
        setItemSizeUnit(item.itemSizeUnit || "piece")
        setItemDescription(item.description || "")
        // Force to Veg in UI (platform is Veg-only now)
        setFoodType("Veg")
        setBasePrice(item.price?.toString() || "0")
        setPreparationTime(item.preparationTime || "")
        setGst(item.gst?.toString() || "5.0")
        setIsRecommended(item.isRecommended || false)
        setIsInStock(item.isAvailable !== false)
        setSelectedTags(item.tags || [])
        setImages(item.images && item.images.length > 0 ? item.images : (item.image ? [item.image] : []))

        // Load variants if they exist
        if (item.variations && Array.isArray(item.variations) && item.variations.length > 0) {
          setHasVariants(true)
          setVariants(item.variations.map((v) => ({
            id: v.id || `variant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: v.name || "",
            price: v.price || 0,
            stock: v.stock || "Unlimited",
          })))
        } else {
          setHasVariants(false)
          setVariants([])
        }

        // Parse nutrition data
        if (item.nutrition && Array.isArray(item.nutrition)) {
          item.nutrition.forEach(nut => {
            if (typeof nut === 'string') {
              if (nut.includes('Weight per serving')) {
                const match = nut.match(/(\d+)\s*grams?/i)
                if (match) setWeightPerServing(match[1])
              } else if (nut.includes('Calorie count')) {
                const match = nut.match(/(\d+)\s*Kcal/i)
                if (match) setCalorieCount(match[1])
              } else if (nut.includes('Protein count')) {
                const match = nut.match(/(\d+)\s*mg/i)
                if (match) setProteinCount(match[1])
              } else if (nut.includes('Carbohydrates')) {
                const match = nut.match(/(\d+)\s*mg/i)
                if (match) setCarbohydrates(match[1])
              } else if (nut.includes('Fat count')) {
                const match = nut.match(/(\d+)\s*mg/i)
                if (match) setFatCount(match[1])
              } else if (nut.includes('Fibre count')) {
                const match = nut.match(/(\d+)\s*mg/i)
                if (match) setFibreCount(match[1])
              }
            }
          })
        }

        // Set allergens
        if (item.allergies && Array.isArray(item.allergies) && item.allergies.length > 0) {
          setAllergens(item.allergies.join(", "))
        }
        return
      }

      // If no item in location.state but we have an id, fetch from menu API
      if (!isNewItem && id) {
        try {
          setLoadingItem(true)
          const menuResponse = await restaurantAPI.getMenu()
          const menu = menuResponse.data?.data?.menu
          const sections = menu?.sections || []

          // Find the item across all sections
          let foundItem = null
          const searchId = String(id).trim()
          for (const section of sections) {
            // Check items in section
            const item = section.items?.find(i => {
              const itemId = String(i.id || i._id || '').trim()
              return itemId === searchId || itemId === id
            })
            if (item) {
              foundItem = item
              break
            }
            // Check items in subsections
            if (section.subsections) {
              for (const subsection of section.subsections) {
                const subItem = subsection.items?.find(i => {
                  const itemId = String(i.id || i._id || '').trim()
                  return itemId === searchId || itemId === id
                })
                if (subItem) {
                  foundItem = subItem
                  break
                }
              }
              if (foundItem) break
            }
          }

          if (foundItem) {
            // Store the full item data for saving
            setItemData(foundItem)

            setItemName(foundItem.name || "")
            setCategory(foundItem.category || defaultCategory)
            setSubCategory(foundItem.subCategory || foundItem.category || "Starters")
            setServesInfo(foundItem.servesInfo || "")
            setItemSizeQuantity(foundItem.itemSizeQuantity || "")
            setItemSizeUnit(foundItem.itemSizeUnit || "piece")
            setItemDescription(foundItem.description || "")
            // Force to Veg in UI (platform is Veg-only now)
            setFoodType("Veg")
            setBasePrice(foundItem.price?.toString() || "0")
            setPreparationTime(foundItem.preparationTime || "")
            setGst(foundItem.gst?.toString() || "5.0")
            setIsRecommended(foundItem.isRecommended || false)
            setIsInStock(foundItem.isAvailable !== false)
            setSelectedTags(foundItem.tags || [])
            setImages(foundItem.images && foundItem.images.length > 0 ? foundItem.images : (foundItem.image ? [foundItem.image] : []))

            // Load variants if they exist
            if (foundItem.variations && Array.isArray(foundItem.variations) && foundItem.variations.length > 0) {
              setHasVariants(true)
              setVariants(foundItem.variations.map((v) => ({
                id: v.id || `variant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: v.name || "",
                price: v.price || 0,
                stock: v.stock || "Unlimited",
              })))
            } else {
              setHasVariants(false)
              setVariants([])
            }

            // Parse nutrition data
            if (foundItem.nutrition && Array.isArray(foundItem.nutrition)) {
              foundItem.nutrition.forEach(nut => {
                if (typeof nut === 'string') {
                  if (nut.includes('Weight per serving')) {
                    const match = nut.match(/(\d+)\s*grams?/i)
                    if (match) setWeightPerServing(match[1])
                  } else if (nut.includes('Calorie count')) {
                    const match = nut.match(/(\d+)\s*Kcal/i)
                    if (match) setCalorieCount(match[1])
                  } else if (nut.includes('Protein count')) {
                    const match = nut.match(/(\d+)\s*mg/i)
                    if (match) setProteinCount(match[1])
                  } else if (nut.includes('Carbohydrates')) {
                    const match = nut.match(/(\d+)\s*mg/i)
                    if (match) setCarbohydrates(match[1])
                  } else if (nut.includes('Fat count')) {
                    const match = nut.match(/(\d+)\s*mg/i)
                    if (match) setFatCount(match[1])
                  } else if (nut.includes('Fibre count')) {
                    const match = nut.match(/(\d+)\s*mg/i)
                    if (match) setFibreCount(match[1])
                  }
                }
              })
            }

            // Set allergens
            if (foundItem.allergies && Array.isArray(foundItem.allergies) && foundItem.allergies.length > 0) {
              setAllergens(foundItem.allergies.join(", "))
            }
          } else {
            toast.error("Item not found")
          }
        } catch (error) {
          console.error('Error fetching item data:', error)
          toast.error("Failed to load item data")
        } finally {
          setLoadingItem(false)
        }
      }
    }

    fetchItemData()
  }, [id, isNewItem, location.state, defaultCategory])

  // Fetch categories from restaurant-specific API and menu sections
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoadingCategories(true)

        // Fetch categories from RestaurantCategory model (created through restaurant app)
        const categoriesResponse = await restaurantAPI.getCategories()
        const restaurantCategories = categoriesResponse.data.success && categoriesResponse.data.data.categories
          ? categoriesResponse.data.data.categories.map(cat => ({
            id: cat._id || cat.id,
            name: cat.name,
            source: 'restaurant'
          }))
          : []

        // Fetch menu sections (categories created by admin through MenuAdd)
        const menuResponse = await restaurantAPI.getMenu()
        const menuSections = menuResponse.data.success && menuResponse.data.data.menu?.sections
          ? menuResponse.data.data.menu.sections.map(section => ({
            id: section.id || `section-${section.name}`,
            name: section.name,
            source: 'menu'
          }))
          : []

        // Combine both sources and remove duplicates (by name)
        const allCategories = [...restaurantCategories, ...menuSections]
        const uniqueCategories = []
        const seenNames = new Set()

        allCategories.forEach(cat => {
          const normalizedName = cat.name.toLowerCase().trim()
          if (!seenNames.has(normalizedName)) {
            seenNames.add(normalizedName)
            uniqueCategories.push(cat)
          }
        })

        // Sort by name
        uniqueCategories.sort((a, b) => a.name.localeCompare(b.name))

        console.log('Combined categories (restaurant + menu sections):', uniqueCategories)
        setCategories(uniqueCategories)
      } catch (error) {
        console.error('Error fetching categories:', error)
        // Show empty array on error - user can add categories
        setCategories([])
      } finally {
        setLoadingCategories(false)
      }
    }

    fetchCategories()
  }, [])

  // Serves info options
  const servesOptions = [
    "Serves eg. 1-2 people",
    "Serves eg. 2-3 people",
    "Serves eg. 3-4 people",
    "Serves eg. 4-5 people",
    "Serves eg. 5-6 people",
  ]

  // Item size unit options
  const itemSizeUnits = [
    "slices",
    "kg",
    "litre",
    "ml",
    "serves",
    "cms",
    "piece"
  ]

  // Item tags organized by categories
  const itemTagsCategories = [
    {
      category: "Speciality",
      tags: ["Freshly Frosted", "Pre Frosted", "Chef's Special"]
    },
    {
      category: "Spice Level",
      tags: ["Medium Spicy", "Very Spicy"]
    },
    {
      category: "Miscellaneous",
      tags: ["Gluten Free", "Sugar Free", "Jain"]
    },
    {
      category: "Dietary Restrictions",
      tags: ["Vegan"]
    }
  ]

  // Handler for Flutter camera callback - Same as Onboarding.jsx
  const handleFlutterCamera = () => {
    if (!window.flutter_inappwebview) {
      document.getElementById('image-upload-camera')?.click()
      return
    }

    window.flutter_inappwebview.callHandler('openCamera').then((result) => {
      if (result && result.success && result.base64) {
        const file = base64ToFile(
          result.base64,
          result.mimeType || 'image/jpeg',
          result.fileName || `camera_${Date.now()}.jpg`
        )

        // Create preview URL and store
        const previewUrl = URL.createObjectURL(file)
        const newImageFilesMap = new Map(imageFiles)
        newImageFilesMap.set(previewUrl, file)
        
        // Store base64 for upload
        const newBase64DataMap = new Map(imageBase64Data)
        newBase64DataMap.set(previewUrl, {
          base64: result.base64,
          mimeType: result.mimeType || 'image/jpeg',
          fileName: result.fileName || file.name
        })
        
        setImages(prev => [...prev, previewUrl])
        setImageFiles(newImageFilesMap)
        setImageBase64Data(newBase64DataMap)
        toast.success('Image captured successfully')
      }
    }).catch((error) => {
      console.error('Error calling Flutter openCamera:', error)
      toast.error('Failed to capture image from camera')
    })
  }

  // Handler for Flutter gallery callback - Same as Onboarding.jsx
  const handleFlutterGallery = () => {
    if (!window.flutter_inappwebview) {
      document.getElementById('image-upload-gallery')?.click()
      return
    }

    window.flutter_inappwebview.callHandler('openGallery').then((result) => {
      if (result && result.success && result.base64) {
        const file = base64ToFile(
          result.base64,
          result.mimeType || 'image/jpeg',
          result.fileName || `gallery_${Date.now()}.jpg`
        )

        // Create preview URL and store
        const previewUrl = URL.createObjectURL(file)
        const newImageFilesMap = new Map(imageFiles)
        newImageFilesMap.set(previewUrl, file)
        
        // Store base64 for upload
        const newBase64DataMap = new Map(imageBase64Data)
        newBase64DataMap.set(previewUrl, {
          base64: result.base64,
          mimeType: result.mimeType || 'image/jpeg',
          fileName: result.fileName || file.name
        })
        
        setImages(prev => [...prev, previewUrl])
        setImageFiles(newImageFilesMap)
        setImageBase64Data(newBase64DataMap)
        toast.success('Image selected successfully')
      }
    }).catch((error) => {
      console.error('Error calling Flutter openGallery:', error)
      toast.error('Failed to select image from gallery')
    })
  }

  const handleImageAdd = (e) => {
    const files = Array.from(e.target.files)

    // Validate file types
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    const validFiles = files.filter(file => {
      if (!allowedTypes.includes(file.type)) {
        toast.error(`${file.name}: Invalid file type. Please upload PNG, JPG, JPEG, or WEBP.`)
        return false
      }
      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024 // 5MB
      if (file.size > maxSize) {
        toast.error(`${file.name}: File size exceeds 5MB limit.`)
        return false
      }
      return true
    })

    if (validFiles.length === 0) return

    // Create preview URLs for display and map them to File objects
    const newImagePreviews = []
    const newImageFilesMap = new Map(imageFiles)

    validFiles.forEach(file => {
      const previewUrl = URL.createObjectURL(file)
      newImagePreviews.push(previewUrl)
      newImageFilesMap.set(previewUrl, file)
    })

    setImages([...images, ...newImagePreviews])
    setImageFiles(newImageFilesMap)

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleImageDelete = (index) => {
    if (index < 0 || index >= images.length) return

    // Confirm deletion
    if (!window.confirm('Are you sure you want to delete this image?')) {
      return
    }

    const imageToDelete = images[index]
    const newImages = images.filter((_, i) => i !== index)
    const newImageFilesMap = new Map(imageFiles)
    const newBase64DataMap = new Map(imageBase64Data)
    
    // Clean up blob URL and remove from maps
    if (imageToDelete && imageToDelete.startsWith('blob:')) {
      URL.revokeObjectURL(imageToDelete)
    }
    newImageFilesMap.delete(imageToDelete)
    newBase64DataMap.delete(imageToDelete)

    // Remove the file mapping and revoke the blob URL if it's a preview (new upload)
    if (imageToDelete && imageToDelete.startsWith('blob:')) {
      newImageFilesMap.delete(imageToDelete)
      URL.revokeObjectURL(imageToDelete)
      console.log('Deleted preview image (blob URL):', imageToDelete)
    } else if (imageToDelete && (imageToDelete.startsWith('http://') || imageToDelete.startsWith('https://'))) {
      // For already uploaded images, we need to remove from imageFiles map if it exists
      // Find and remove the file entry if it exists
      for (const [previewUrl, file] of newImageFilesMap.entries()) {
        // This shouldn't happen for HTTP URLs, but just in case
        if (previewUrl === imageToDelete) {
          newImageFilesMap.delete(previewUrl)
          URL.revokeObjectURL(previewUrl)
        }
      }
      console.log('Deleted uploaded image (HTTP URL):', imageToDelete)
    }

    setImages(newImages)
    setImageFiles(newImageFilesMap)
    // Also remove from base64 data map
    const newBase64DataMap = new Map(imageBase64Data)
    newBase64DataMap.delete(imageToDelete)
    setImageBase64Data(newBase64DataMap)

    // Adjust current image index after deletion
    if (newImages.length === 0) {
      setCurrentImageIndex(0)
    } else if (currentImageIndex >= newImages.length) {
      setCurrentImageIndex(newImages.length - 1)
    } else if (currentImageIndex > index) {
      // If we deleted an image before the current one, no need to change index
      // If we deleted the current one or after, index stays the same (shows next image)
    }

    toast.success('Image deleted successfully')
    console.log(`Image deleted. Remaining images: ${newImages.length}`)
  }

  // Swipe handlers
  const minSwipeDistance = 50

  const onTouchStart = (e) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return

    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe && images.length > 0) {
      setDirection(1)
      setCurrentImageIndex((prev) => (prev + 1) % images.length)
    }
    if (isRightSwipe && images.length > 0) {
      setDirection(-1)
      setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length)
    }
  }

  const goToNext = () => {
    setDirection(1)
    setCurrentImageIndex((prev) => (prev + 1) % images.length)
  }

  const goToPrevious = () => {
    setDirection(-1)
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length)
  }

  const handleCategorySelect = (catId, subCat) => {
    const selectedCategory = categories.find(c => c.id === catId)
    setCategory(selectedCategory.name)
    setSubCategory(subCat)
    setIsCategoryPopupOpen(false)
  }

  const handleServesSelect = (option) => {
    setServesInfo(option)
    setIsServesPopupOpen(false)
  }

  const handleItemSizeUnitSelect = (unit) => {
    setItemSizeUnit(unit)
    setIsItemSizePopupOpen(false)
  }

  const handleGstSelect = (gstValue) => {
    setGst(gstValue)
    setIsGstPopupOpen(false)
  }

  const handleTagToggle = (tag) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

  // Variant handlers
  const handleAddVariant = () => {
    const newVariant = {
      id: `variant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: "",
      price: 0,
      stock: "Unlimited",
    }
    setVariants([...variants, newVariant])
  }

  const handleRemoveVariant = (variantId) => {
    setVariants(variants.filter((v) => v.id !== variantId))
  }

  const handleUpdateVariant = (variantId, field, value) => {
    setVariants(variants.map((v) =>
      v.id === variantId ? { ...v, [field]: value } : v
    ))
  }

  const handleSave = async () => {
    if (!itemName.trim()) {
      toast.error("Please enter an item name")
      return
    }

    // Validate variants if enabled
    if (hasVariants) {
      if (variants.length === 0) {
        toast.error("Please add at least one variant")
        return
      }
      for (const variant of variants) {
        if (!variant.name || !variant.name.trim()) {
          toast.error("Please fill in variant name for all variants")
          return
        }
        if (!variant.price || variant.price <= 0) {
          toast.error("Please fill in valid price for all variants")
          return
        }
      }
    } else {
      if (!basePrice || parseFloat(basePrice) <= 0) {
        toast.error("Please enter a valid item price")
        return
      }
    }

    try {
      setUploadingImages(true)

      // Upload new images to Cloudinary
      const uploadedImageUrls = []

      // Separate existing URLs (already uploaded) from new files (blob URLs)
      const existingImageUrls = images.filter(img =>
        typeof img === 'string' &&
        (img.startsWith('http://') || img.startsWith('https://')) &&
        !img.startsWith('blob:')
      )

      console.log('Images state:', images)
      console.log('Existing image URLs (already uploaded):', existingImageUrls)
      console.log('Image files map:', imageFiles)

      // Upload new images to Cloudinary
      // For Flutter-selected images (with base64 data), use uploadBase64 API (more reliable)
      // For native file inputs, use uploadMedia API
      const filesToUpload = Array.from(imageFiles.entries()) // Get [previewUrl, file] pairs
      console.log('Files to upload:', filesToUpload.length, filesToUpload)

      if (filesToUpload.length > 0) {
        toast.info(`Uploading ${filesToUpload.length} image(s)...`)
        for (let i = 0; i < filesToUpload.length; i++) {
          const [previewUrl, file] = filesToUpload[i]
          const base64Data = imageBase64Data.get(previewUrl)
          
          try {
            let imageUrl = null
            
            // If base64 data exists (Flutter-selected image), use uploadBase64 API
            if (base64Data && base64Data.base64) {
              console.log(`📤 Uploading image ${i + 1}/${filesToUpload.length} via base64:`, {
                fileName: base64Data.fileName,
                mimeType: base64Data.mimeType,
                base64Length: base64Data.base64.length
              })
              
              try {
                const uploadResponse = await uploadAPI.uploadBase64(
                  base64Data.base64,
                  base64Data.mimeType,
                  base64Data.fileName,
                  { folder: 'appzeto/restaurant/menu-items' }
                )
                
                console.log(`📥 Base64 upload response for image ${i + 1}:`, {
                  success: uploadResponse?.data?.success,
                  hasData: !!uploadResponse?.data?.data,
                  hasUrl: !!(uploadResponse?.data?.data?.url || uploadResponse?.data?.url)
                })
                
                imageUrl = uploadResponse?.data?.data?.url || uploadResponse?.data?.url
                if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim() !== '') {
                  uploadedImageUrls.push(imageUrl)
                  console.log(`✅ Successfully uploaded image ${i + 1} via base64:`, imageUrl)
                } else {
                  console.error('❌ Base64 upload response missing URL:', uploadResponse)
                  throw new Error("Failed to get uploaded image URL from base64 upload response")
                }
              } catch (base64Error) {
                console.error(`❌ Base64 upload failed for image ${i + 1}, trying File upload as fallback:`, base64Error)
                // Fallback to File upload if base64 upload fails
                if (!file || !(file instanceof File)) {
                  throw new Error(`Base64 upload failed and no valid File object available: ${base64Error.message}`)
                }
                // Continue to File upload below
              }
            }
            
            // If base64 upload didn't happen or failed, use File upload
            if (!imageUrl && file) {
              console.log(`📤 Uploading image ${i + 1}/${filesToUpload.length} via File:`, {
                name: file.name,
                size: file.size,
                type: file.type
              })
              
              // Validate file before upload
              if (!file || !(file instanceof File)) {
                console.error(`❌ Invalid file object at index ${i}:`, file)
                throw new Error(`Invalid file object: ${file?.name || 'unknown'}`)
              }
              
              const uploadResponse = await uploadAPI.uploadMedia(file, {
                folder: 'appzeto/restaurant/menu-items'
              })
              
              console.log(`📥 File upload response for image ${i + 1}:`, {
                success: uploadResponse?.data?.success,
                hasData: !!uploadResponse?.data?.data,
                hasUrl: !!(uploadResponse?.data?.data?.url || uploadResponse?.data?.url)
              })
              
              imageUrl = uploadResponse?.data?.data?.url || uploadResponse?.data?.url
              if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim() !== '') {
                uploadedImageUrls.push(imageUrl)
                console.log(`✅ Successfully uploaded image ${i + 1} via File:`, imageUrl)
              } else {
                console.error('❌ File upload response missing URL:', uploadResponse)
                throw new Error("Failed to get uploaded image URL from file upload response")
              }
            }
            
            // If still no imageUrl, throw error
            if (!imageUrl) {
              throw new Error("Failed to upload image: No URL received from either base64 or file upload")
            }
            
          } catch (uploadError) {
            const fileName = base64Data?.fileName || file?.name || 'image'
            console.error(`❌ Error uploading image ${i + 1} (${fileName}):`, uploadError)
            console.error('Upload error details:', {
              message: uploadError.message,
              response: uploadError.response?.data,
              status: uploadError.response?.status,
              hasBase64: !!base64Data,
              hasFile: !!(file && file instanceof File)
            })
            
            // Show more detailed error message
            const errorMessage = uploadError.response?.data?.message 
              || uploadError.message 
              || 'Unknown error occurred'
            toast.error(`Failed to upload ${fileName}. ${errorMessage}`)
            setUploadingImages(false)
            return
          }
        }
        
        console.log(`✅ All ${filesToUpload.length} image(s) uploaded successfully`)
      } else {
        console.log('ℹ️ No new files to upload (all images are already uploaded URLs)')
      }

      // Combine existing URLs and newly uploaded URLs
      // Remove duplicates and filter out any empty strings
      const allImageUrls = [
        ...existingImageUrls,
        ...uploadedImageUrls
      ].filter((url, index, self) =>
        url &&
        typeof url === 'string' &&
        url.trim() !== '' &&
        self.indexOf(url) === index // Remove duplicates
      )

      // Debug: Log image URLs
      console.log('=== IMAGE UPLOAD SUMMARY ===')
      console.log('Existing image URLs:', existingImageUrls.length, existingImageUrls)
      console.log('Newly uploaded URLs:', uploadedImageUrls.length, uploadedImageUrls)
      console.log('Total image URLs to save:', allImageUrls.length, allImageUrls)
      console.log('All image URLs details:', allImageUrls.map((url, idx) => ({
        index: idx,
        url: url,
        isValid: url && typeof url === 'string' && url.trim() !== '' && (url.startsWith('http://') || url.startsWith('https://'))
      })))
      console.log('==========================')
      
      // CRITICAL: Ensure we have at least one valid image URL if images were uploaded
      if (images.length > 0 && allImageUrls.length === 0) {
        console.error('❌ ERROR: Images were added but no valid URLs to save!')
        console.error('Images state:', images)
        console.error('Image files map:', Array.from(imageFiles.entries()))
        toast.error('Failed to process images. Please try adding images again.')
        setUploadingImages(false)
        return
      }

      // Get current menu
      const menuResponse = await restaurantAPI.getMenu()
      let menu = menuResponse.data?.data?.menu
      let sections = menu?.sections || []

      // Prepare item data according to menu model
      // For editing, use the existing ID; for new items, generate a new ID
      // Ensure we use the ID from itemData if available, otherwise use the URL param id
      let itemId
      if (isNewItem) {
        itemId = `item-${Date.now()}-${Math.random()}`
      } else {
        // Try to get ID from itemData first (most reliable), then from URL param
        itemId = itemData?.id || id
        if (!itemId) {
          console.warn('No item ID found, generating new one')
          itemId = `item-${Date.now()}-${Math.random()}`
        }
        // Ensure ID is a string
        itemId = String(itemId)
      }

      console.log('Item ID for save:', itemId, 'From itemData:', itemData?.id, 'From URL:', id)

      // If editing, remove item from its current location (in case category changed or it's in a subsection)
      if (!isNewItem && itemId) {
        const searchId = String(itemId).trim()
        const urlId = String(id || '').trim()
        let itemRemoved = false

        for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
          const section = sections[sectionIndex]

          // Check items in section
          if (section.items && Array.isArray(section.items)) {
            const itemIndex = section.items.findIndex(item => {
              const itemIdStr = String(item.id || item._id || '').trim()
              // Try multiple ID formats
              return itemIdStr === searchId || itemIdStr === urlId ||
                String(item.id) === String(itemId) || String(item.id) === String(id)
            })
            if (itemIndex !== -1) {
              section.items.splice(itemIndex, 1)
              itemRemoved = true
              console.log(`Removed item from section: ${section.name}, item ID was: ${section.items[itemIndex]?.id}`)
              break
            }
          }

          // Check items in subsections
          if (!itemRemoved && section.subsections && Array.isArray(section.subsections)) {
            for (let subIndex = 0; subIndex < section.subsections.length; subIndex++) {
              const subsection = section.subsections[subIndex]
              if (subsection.items && Array.isArray(subsection.items)) {
                const subItemIndex = subsection.items.findIndex(item => {
                  const itemIdStr = String(item.id || item._id || '').trim()
                  // Try multiple ID formats
                  return itemIdStr === searchId || itemIdStr === urlId ||
                    String(item.id) === String(itemId) || String(item.id) === String(id)
                })
                if (subItemIndex !== -1) {
                  subsection.items.splice(subItemIndex, 1)
                  itemRemoved = true
                  console.log(`Removed item from subsection: ${subsection.name} in section: ${section.name}`)
                  break
                }
              }
            }
            if (itemRemoved) break
          }
        }

        if (!itemRemoved && !isNewItem) {
          console.warn(`Item with ID ${itemId} (URL: ${id}) not found in menu for removal. It will be added as new.`)
        }
      }

      // Find or create the category section
      let targetSection = sections.find(s => s.name === category)
      if (!targetSection) {
        // Create new section for this category
        targetSection = {
          id: `section-${Date.now()}`,
          name: category,
          items: [],
          subsections: [],
          isEnabled: true,
          order: sections.length
        }
        sections.push(targetSection)
      }

      // Ensure items array exists
      if (!targetSection.items) {
        targetSection.items = []
      }

      // Prepare nutrition data as strings (as per menu model)
      const nutritionStrings = []

      // Prepare variations array
      const variations = hasVariants && variants.length > 0
        ? variants.map((v) => ({
          id: String(v.id),
          name: v.name.trim(),
          price: parseFloat(v.price) || 0,
          stock: v.stock || "Unlimited",
        }))
        : []

      // Prepare item data according to menu model
      const itemDataToSave = {
        id: String(itemId), // Ensure ID is a string
        name: itemName.trim(),
        nameArabic: "",
        image: allImageUrls.length > 0 ? allImageUrls[0] : "",
        images: allImageUrls.length > 0 ? allImageUrls : [], // Multiple images support - all Cloudinary URLs (ensure it's always an array)
        // CRITICAL: Ensure images is always an array, never undefined or null
        category: category,
        rating: itemData?.rating || 0.0,
        reviews: itemData?.reviews || 0,
        price: hasVariants && variations.length > 0
          ? Math.min(...variations.map(v => v.price)) // Base price as minimum variant price
          : parseFloat(basePrice) || 0,
        preparationTime: preparationTime || "",
        stock: "Unlimited",
        discount: null,
        originalPrice: null,
        // Always save as Veg (platform is Veg-only)
        foodType: "Veg",
        availabilityTimeStart: "12:01 AM",
        availabilityTimeEnd: "11:57 PM",
        description: itemDescription.trim(),
        discountType: "Percent",
        discountAmount: 0.0,
        isAvailable: isInStock,
        isRecommended: isRecommended,
        variations: variations,
        tags: [],
        nutrition: nutritionStrings,
        allergies: [],
        photoCount: allImageUrls.length || 1,
        // Additional fields for complete item details
        subCategory: subCategory || "",
        servesInfo: "",
        itemSize: "",
        itemSizeQuantity: "",
        itemSizeUnit: "piece",
        gst: parseFloat(gst) || 0,
      }

      // Add or update item in target section
      // Since we already removed the item from its old location, we should always add it here
      // But check if it somehow still exists (shouldn't happen, but safety check)
      const existingItemIndex = targetSection.items.findIndex(item => {
        const itemIdStr = String(item.id || item._id || '').trim()
        return itemIdStr === String(itemId).trim()
      })

      if (existingItemIndex !== -1) {
        // Update existing item (shouldn't happen if removal worked, but handle it)
        console.log(`Updating existing item at index ${existingItemIndex} in section: ${targetSection.name}`)
        targetSection.items[existingItemIndex] = itemDataToSave
      } else {
        // Add new item (or re-add after removal)
        console.log(`Adding item to section: ${targetSection.name}`)
        targetSection.items.push(itemDataToSave)
      }

      // Update menu with new sections
      console.log('=== SAVING ITEM DATA ===')
      console.log('Item ID:', itemId, 'Is new item:', isNewItem)
      console.log('Item name:', itemDataToSave.name)
      console.log('Images array type:', Array.isArray(itemDataToSave.images) ? 'Array' : typeof itemDataToSave.images)
      console.log('Images array:', itemDataToSave.images)
      console.log('Images count:', itemDataToSave.images?.length)
      console.log('Image (single):', itemDataToSave.image)
      console.log('PhotoCount:', itemDataToSave.photoCount)
      console.log('All image URLs that should be saved:', allImageUrls)
      console.log('Full itemDataToSave:', JSON.stringify(itemDataToSave, null, 2))
      
      // CRITICAL: Verify images are being set correctly before saving
      if (!Array.isArray(itemDataToSave.images)) {
        console.error('❌ ERROR: itemDataToSave.images is not an array!', itemDataToSave.images)
        itemDataToSave.images = allImageUrls.length > 0 ? allImageUrls : []
      }
      if (itemDataToSave.images.length !== allImageUrls.length) {
        console.error('❌ ERROR: Images count mismatch!', {
          itemDataToSaveImages: itemDataToSave.images.length,
          allImageUrls: allImageUrls.length
        })
        itemDataToSave.images = allImageUrls
      }
      
      // Ensure image field is also set correctly
      if (allImageUrls.length > 0 && !itemDataToSave.image) {
        itemDataToSave.image = allImageUrls[0]
      }
      
      console.log('✅ Final itemDataToSave.images after validation:', itemDataToSave.images)
      console.log('✅ Final itemDataToSave.image after validation:', itemDataToSave.image)

      // Verify sections structure
      console.log('Sections being sent:', sections.length, 'sections')
      const itemSection = sections.find(s => s.items?.some(item => item.id === itemId))
      if (itemSection) {
        const itemInSection = itemSection.items.find(item => item.id === itemId)
        if (itemInSection) {
          console.log('Item in section before API call - images:', itemInSection.images, 'count:', itemInSection.images?.length)
        }
      }

      const updateResponse = await restaurantAPI.updateMenu({ sections })

      if (updateResponse.data?.success) {
        const imageCount = allImageUrls.length
        toast.success(
          isNewItem
            ? `Item created successfully with ${imageCount} image(s)`
            : `Item updated successfully with ${imageCount} image(s)`
        )
        // Small delay to ensure backend has processed the update
        await new Promise(resolve => setTimeout(resolve, 300))
        // Navigate back to HubMenu with replace to prevent back navigation issues
        navigate("/restaurant/hub-menu", { replace: true })
        // Trigger a page refresh event
        window.dispatchEvent(new CustomEvent('foodsChanged'))
      } else {
        console.error('Update failed:', updateResponse.data)
        toast.error(updateResponse.data?.message || "Failed to save item")
      }
    } catch (error) {
      console.error('Error saving menu:', error)
      if (error.code === 'ERR_NETWORK') {
        toast.error('Network error. Please check if backend server is running and try again.')
      } else {
        toast.error(error.response?.data?.message || error.message || "Failed to save item. Please try again.")
      }
    } finally {
      setUploadingImages(false)
    }
  }

  const handleDelete = () => {
    // Delete logic here
    console.log("Deleting item:", id)
    navigate(-1)
  }

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      <style>{`
        [data-slot="switch"][data-state="checked"] {
          background-color: #16a34a !important;
        }
        [data-slot="switch-thumb"][data-state="checked"] {
          background-color: #ffffff !important;
        }
      `}</style>
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1 rounded-full hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Item details</h1>
        </div>
      </div>


      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-24">
        {/* Image Carousel */}
        <div className="relative bg-white">
          {images.length > 0 ? (
            <div className="relative w-full h-80 overflow-hidden bg-gray-100">
              {/* Image container with swipe support */}
              <div
                ref={carouselRef}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                className="relative w-full h-full"
              >
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={currentImageIndex}
                    custom={direction}
                    initial={{ opacity: 0, x: direction > 0 ? 300 : -300 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: direction > 0 ? -300 : 300 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="absolute inset-0"
                  >
                    {images[currentImageIndex] ? (
                      <img
                        src={images[currentImageIndex]}
                        alt={`${itemName} - Image ${currentImageIndex + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                  </motion.div>
                </AnimatePresence>

                {/* Navigation arrows */}
                {images.length > 1 && (
                  <>
                    <button
                      onClick={goToPrevious}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-all z-10"
                    >
                      <ChevronLeft className="w-5 h-5 text-gray-900" />
                    </button>
                    <button
                      onClick={goToNext}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-all z-10"
                    >
                      <ChevronRight className="w-5 h-5 text-gray-900" />
                    </button>
                  </>
                )}

                {/* Delete image button */}
                <button
                  onClick={() => handleImageDelete(currentImageIndex)}
                  className="absolute top-4 right-4 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-all z-10"
                >
                  <Trash2 className="w-5 h-5 text-gray-900" />
                </button>

                {/* Image counter */}
                {images.length > 1 && (
                  <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full z-10">
                    <span className="text-white text-xs font-medium">
                      {currentImageIndex + 1} / {images.length}
                    </span>
                  </div>
                )}
              </div>

              {/* Carousel dots */}
              {images.length > 1 && (
                <div className="flex items-center justify-center gap-2 py-4 bg-white">
                  {images.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setDirection(index > currentImageIndex ? 1 : -1)
                        setCurrentImageIndex(index)
                      }}
                      className={`transition-all duration-300 rounded-full ${index === currentImageIndex
                        ? "w-8 h-2 bg-gray-900"
                        : "w-2 h-2 bg-gray-300 hover:bg-gray-400"
                        }`}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="relative w-full h-80 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <div className="text-center">
                <div className="w-20 h-20 bg-white/80 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
                  <Camera className="w-10 h-10 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-600">No images added yet</p>
                <p className="text-xs text-gray-500 mt-1">Tap the button below to add multiple images</p>
              </div>
            </div>
          )}

          {/* Add image buttons - redesigned to include Camera */}
          <div className="px-4 py-4 bg-white border-t border-gray-100 flex gap-3">
            {/* Gallery Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageAdd}
              className="hidden"
              id="image-upload-gallery"
            />
            <button
              type="button"
              onClick={() => {
                if (isFlutterApp()) {
                  handleFlutterGallery()
                } else {
                  document.getElementById('image-upload-gallery')?.click()
                }
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-300 text-gray-900 rounded-xl text-sm font-semibold cursor-pointer hover:bg-gray-50 transition-all shadow-sm active:scale-95"
            >
              <Upload className="w-4 h-4" />
              <span>Gallery</span>
            </button>

            {/* Camera Input */}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageAdd}
              className="hidden"
              id="image-upload-camera"
            />
            <button
              type="button"
              onClick={() => {
                if (isFlutterApp()) {
                  handleFlutterCamera()
                } else {
                  document.getElementById('image-upload-camera')?.click()
                }
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-xl text-sm font-semibold cursor-pointer hover:from-gray-800 hover:to-gray-700 transition-all shadow-md hover:shadow-lg active:scale-95"
            >
              <Camera className="w-4 h-4" />
              <span>Camera</span>
            </button>
          </div>
        </div>

        {/* Form Fields */}
        <div className="p-4 space-y-3">
          {/* Category Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Category
            </label>
            <button
              onClick={() => setIsCategoryPopupOpen(true)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-left flex items-center justify-between bg-white hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm text-gray-900">
                {category} ({subCategory})
              </span>
              <ChevronDown className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Item Name */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Item name
            </label>
            <div className="relative">
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                maxLength={maxNameLength}
                className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter item name"
              />
              <button className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100">
                <EditIcon className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="text-right mt-1">
              <span className="text-xs text-gray-500">
                {nameLength} / {maxNameLength}
              </span>
            </div>
          </div>


          {/* Item Description */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Item description
            </label>
            <div className="relative">
              <textarea
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                maxLength={maxDescriptionLength}
                rows={4}
                placeholder="Eg: Yummy veg paneer burger with a soft patty, veggies, cheese, and special sauce"
                className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              <button className="absolute right-3 top-3 p-1 rounded-full hover:bg-gray-100">
                <EditIcon className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className={`text-xs ${descriptionLength < minDescriptionLength ? "text-red-500" : "text-gray-500"}`}>
                {descriptionLength < minDescriptionLength ? "Min 5 characters required" : ""}
              </span>
              <span className="text-xs text-gray-500">
                {descriptionLength} / {maxDescriptionLength}
              </span>
            </div>
            {/* Dietary Options - only Veg */}
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => setFoodType("Veg")}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  foodType === "Veg"
                    ? "border-green-600 border-2 text-green-600"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {foodType === "Veg" && <Check className="w-4 h-4" />}
                <span>Veg</span>
              </button>
            </div>
          </div>

          {/* Variants Toggle */}
          <div>
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-gray-50">
              <div>
                <span className="text-sm font-medium text-gray-900">Enable Variants</span>
                <p className="text-xs text-gray-500 mt-1">
                  Add multiple sizes/prices (e.g., Small, Medium, Large)
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (hasVariants) {
                    // Disabling variants - clear variants array
                    setHasVariants(false)
                    setVariants([])
                  } else {
                    // Enabling variants - add first variant
                    setHasVariants(true)
                    setVariants([{
                      id: `variant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                      name: "",
                      price: 0,
                      stock: "Unlimited",
                    }])
                  }
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${hasVariants ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${hasVariants ? 'translate-x-6' : 'translate-x-1'
                    }`}
                />
              </button>
            </div>
          </div>

          {/* Variants Section */}
          {hasVariants && (
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-3">
                Variants
              </label>
              <div className="space-y-3">
                {variants.map((variant, index) => (
                  <div
                    key={variant.id}
                    className="p-4 border border-gray-200 rounded-lg bg-gray-50"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700">
                        Variant {index + 1}
                      </span>
                      {variants.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveVariant(variant.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Remove variant"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          Size/Name * (e.g., Small, Medium, Large)
                        </label>
                        <input
                          type="text"
                          value={variant.name}
                          onChange={(e) =>
                            handleUpdateVariant(variant.id, "name", e.target.value)
                          }
                          placeholder="e.g., Small, Medium, Large"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          Price (₹) *
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            value={variant.price}
                            onChange={(e) =>
                              handleUpdateVariant(variant.id, "price", parseFloat(e.target.value) || 0)
                            }
                            placeholder="Enter price"
                            className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            required
                          />
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-600">₹</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 text-gray-600 hover:text-blue-600"
                >
                  <Plus className="w-4 h-4" />
                  Add Another Variant
                </button>
              </div>
            </div>
          )}

          {/* Item Price */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              {hasVariants ? "Base Price (will be set to minimum variant price)" : "Item price"}
            </label>
            <div className="space-y-3">
              <div className="relative">
                <label className="block text-xs text-gray-600 mb-1">Base price</label>
                <div className="relative">
                  <input
                    type="text"
                    value={basePrice}
                    onChange={(e) => {
                      // Remove rupee symbol and any non-numeric characters except decimal point
                      const value = e.target.value.replace(/[₹\s,]/g, '').replace(/[^0-9.]/g, '')
                      // Allow only one decimal point
                      const parts = value.split('.')
                      const cleanedValue = parts.length > 2
                        ? parts[0] + '.' + parts.slice(1).join('')
                        : value
                      setBasePrice(cleanedValue)
                    }}
                    onFocus={(e) => {
                      // Remove rupee symbol when focused for easier editing
                      if (e.target.value.startsWith('₹')) {
                        e.target.value = e.target.value.replace(/₹\s*/g, '')
                      }
                    }}
                    placeholder="Enter price"
                    disabled={hasVariants}
                    className={`w-full pl-8 pr-12 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${hasVariants ? 'bg-gray-100 cursor-not-allowed' : 'bg-gray-50'
                      }`}
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-600">₹</span>
                  <button className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100">
                    <EditIcon className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                {hasVariants && (
                  <p className="text-xs text-gray-500 mt-1">
                    Base price will be set to minimum variant price
                  </p>
                )}
              </div>

              {/* Preparation Time */}
              <div className="relative">
                <label className="block text-xs text-gray-600 mb-1">Preparation Time</label>
                <div className="relative">
                  <select
                    value={preparationTime}
                    onChange={(e) => setPreparationTime(e.target.value)}
                    className="w-full pl-4 pr-10 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                  >
                    <option value="">Select timing</option>
                    <option value="10-20 mins">10-20 mins</option>
                    <option value="20-25 mins">20-25 mins</option>
                    <option value="25-35 mins">25-35 mins</option>
                    <option value="35-45 mins">35-45 mins</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
                </div>
              </div>
              {/* <div>
                <label className="block text-xs text-gray-600 mb-1">GST</label>
                <button
                  onClick={() => setIsGstPopupOpen(true)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-left flex items-center justify-between bg-white hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm text-gray-900">GST {gst}%</span>
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                </button>
              </div> */}
            </div>

          </div>

          {/* Recommend and In Stock */}
          <div className="flex items-center justify-between py-3 border-t border-gray-200">
            <button
              onClick={() => setIsRecommended(!isRecommended)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isRecommended
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
            >
              <ThumbsUp className="w-4 h-4" />
              <span>Recommend</span>
            </button>
            <div className="flex items-center gap-2">
              <Switch
                checked={isInStock}
                onCheckedChange={setIsInStock}
                className="data-[state=unchecked]:bg-gray-300"
              />
              <span className="text-sm text-gray-700">In stock</span>
            </div>
          </div>


        </div>
      </div>

      {/* Category Selection Popup */}
      <AnimatePresence>
        {isCategoryPopupOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCategoryPopupOpen(false)}
              className="fixed inset-0 bg-black/50 z-50"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-50 max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-900">Select category</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setIsCategoryPopupOpen(false)
                      navigate('/restaurant/menu-categories')
                    }}
                    className="p-2 rounded-lg bg-black text-white hover:bg-gray-800 transition-colors flex items-center gap-1.5"
                    title="Add Category"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-sm font-medium">Add</span>
                  </button>
                  <button
                    onClick={() => setIsCategoryPopupOpen(false)}
                    className="p-1 rounded-full hover:bg-gray-100"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {loadingCategories ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
                  </div>
                ) : categories.length === 0 ? (
                  <div className="text-center py-12 space-y-4">
                    <p className="text-sm text-gray-500">No categories available</p>
                    <button
                      onClick={() => {
                        setIsCategoryPopupOpen(false)
                        navigate('/restaurant/menu-categories')
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg font-semibold hover:bg-gray-800 transition-colors"
                    >
                      <Plus className="w-5 h-5" />
                      Add Category
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => handleCategorySelect(cat.id, cat.name)}
                        className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${category === cat.name
                          ? "bg-gray-900 text-white"
                          : "bg-gray-50 text-gray-900 hover:bg-gray-100"
                          }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>


      {/* GST Popup */}
      {/* <AnimatePresence>
        {isGstPopupOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsGstPopupOpen(false)}
              className="fixed inset-0 bg-black/50 z-50"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-50 max-h-[60vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-900">Select GST</h2>
                <button
                  onClick={() => setIsGstPopupOpen(false)}
                  className="p-1 rounded-full hover:bg-gray-100"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="space-y-2">
                  {gstOptions.map((gstValue) => (
                    <button
                      key={gstValue}
                      onClick={() => handleGstSelect(gstValue)}
                      className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                        gst === gstValue
                          ? "bg-gray-900 text-white"
                          : "bg-gray-50 text-gray-900 hover:bg-gray-100"
                      }`}
                    >
                      {gstValue}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence> */}


      {/* Bottom Sticky Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200  z-40">
        <div className={`flex gap-3 px-4 py-4 ${isNewItem ? 'justify-end' : ''}`}>
          {!isNewItem && (
            <button
              onClick={handleDelete}
              className="flex-1 py-3 px-4 border border-black rounded-lg text-sm font-semibold text-black bg-white hover:bg-gray-50 transition-colors"
            >
              Delete
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={uploadingImages}
            className={`${isNewItem ? 'w-full' : 'flex-1'} py-3 px-4 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${!uploadingImages
              ? "bg-black text-white hover:bg-black"
              : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
          >
            {uploadingImages ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
