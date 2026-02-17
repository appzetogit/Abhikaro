import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { 
  ArrowLeft, 
  Search, 
  Plus, 
  X, 
  Upload, 
  Loader2,
  Utensils,
  ChevronDown,
  ChevronRight,
  Save,
  Edit2,
  Trash2,
  Minus
} from "lucide-react"
import { adminAPI, restaurantAPI, uploadAPI } from "@/lib/api"
import { toast } from "sonner"

export default function MenuAdd() {
  const navigate = useNavigate()
  const [restaurants, setRestaurants] = useState([])
  const [adminCategories, setAdminCategories] = useState([])
  const [selectedRestaurant, setSelectedRestaurant] = useState(null)
  const [menu, setMenu] = useState(null)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [showAddDishModal, setShowAddDishModal] = useState(false)
  const [selectedSection, setSelectedSection] = useState(null)
  const [expandedSections, setExpandedSections] = useState({})
  const [saving, setSaving] = useState(false)
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [editingDish, setEditingDish] = useState(null) // { dish, section }
  const [deletingDish, setDeletingDish] = useState(false)
  const menuListRef = useRef(null)

  // Preparation time options
  const preparationTimeOptions = [
    "10-20 mins",
    "20-25 mins",
    "25-35 mins",
    "35-45 mins",
    "45-60 mins",
    "60+ mins"
  ]

  // Form data for new dish
  const [formData, setFormData] = useState({
    name: "",
    image: "",
    images: [],
    price: 0,
    foodType: "Veg",
    category: "",
    description: "",
    preparationTime: "",
    isAvailable: true,
    isRecommended: false,
    stock: true, // Stock toggle - true means in stock
    hasVariants: false, // Checkbox to enable variants
    variants: [], // Array of variants: [{ id, name, price, stock }]
  })

  // Fetch restaurants and admin categories (categories added by admin)
  useEffect(() => {
    fetchRestaurants()
    fetchAdminCategories()
  }, [])

  // Fetch menu when restaurant is selected
  useEffect(() => {
    if (selectedRestaurant) {
      fetchMenu()
    }
  }, [selectedRestaurant])

  const fetchRestaurants = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getRestaurants()
      if (response.data?.success) {
        const restaurantsData = response.data.data.restaurants || response.data.data || []
        setRestaurants(restaurantsData)
      }
    } catch (error) {
      console.error("Error fetching restaurants:", error)
      toast.error("Failed to load restaurants")
    } finally {
      setLoading(false)
    }
  }

  const fetchAdminCategories = async () => {
    try {
      const response = await adminAPI.getCategories({})
      if (response.data?.success && response.data?.data?.categories) {
        const active = (response.data.data.categories || []).filter(
          (c) => c.status === true || c.status === "true"
        )
        setAdminCategories(active)
      }
    } catch (error) {
      console.error("Error fetching admin categories:", error)
    }
  }

  const fetchMenu = async () => {
    if (!selectedRestaurant?._id) return
    
    try {
      setLoading(true)
      // Get menu by restaurant ID using admin API
      const response = await adminAPI.getRestaurantMenu(selectedRestaurant._id)
      if (response.data?.success) {
        setMenu(response.data.data.menu)
        // Initialize expanded sections
        const sections = response.data.data.menu?.sections || []
        const expanded = {}
        sections.forEach((section, index) => {
          expanded[section.id] = index < 3 // Expand first 3 sections by default
        })
        setExpandedSections(expanded)
      }
    } catch (error) {
      console.error("Error fetching menu:", error)
      toast.error("Failed to load menu")
      setMenu({ sections: [] })
    } finally {
      setLoading(false)
    }
  }

  const handleRestaurantSelect = (restaurant) => {
    setSelectedRestaurant(restaurant)
    setMenu(null)
    setTimeout(() => {
      menuListRef.current?.scrollIntoView({ behavior: "smooth" })
    }, 100)
  }

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }))
  }

  const handleAddDish = (section) => {
    setSelectedSection(section)
    setEditingDish(null)
    setFormData({
      name: "",
      image: "",
      images: [],
      price: 0,
      foodType: "Veg",
      category: section.name,
      description: "",
      preparationTime: "",
      isAvailable: true,
      isRecommended: false,
      stock: true,
      hasVariants: false,
      variants: [],
    })
    setShowNewCategoryInput(false)
    setNewCategoryName("")
    setShowAddDishModal(true)
  }

  // Global Add Dish (from header) - category user will choose in modal
  const handleAddDishGlobal = () => {
    setSelectedSection(null)
    setEditingDish(null)
    setFormData({
      name: "",
      image: "",
      images: [],
      price: 0,
      foodType: "Veg",
      category: "",
      description: "",
      preparationTime: "",
      isAvailable: true,
      isRecommended: false,
      stock: true,
      hasVariants: false,
      variants: [],
    })
    setShowNewCategoryInput(false)
    setNewCategoryName("")
    setShowAddDishModal(true)
  }

  // Variant management functions
  const handleAddVariant = () => {
    const newVariant = {
      id: `variant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: "",
      price: 0,
      stock: "Unlimited",
    }
    setFormData({
      ...formData,
      variants: [...formData.variants, newVariant],
    })
  }

  const handleRemoveVariant = (variantId) => {
    setFormData({
      ...formData,
      variants: formData.variants.filter((v) => v.id !== variantId),
    })
  }

  const handleUpdateVariant = (variantId, field, value) => {
    setFormData({
      ...formData,
      variants: formData.variants.map((v) =>
        v.id === variantId ? { ...v, [field]: value } : v
      ),
    })
  }

  const handleEditDish = (dish, section) => {
    setSelectedSection(section)
    setEditingDish({ dish, section })
    const hasVariants = Array.isArray(dish.variations) && dish.variations.length > 0
    setFormData({
      name: dish.name || "",
      image: dish.image || "",
      images: Array.isArray(dish.images) ? dish.images : (dish.image ? [dish.image] : []),
      price: dish.price || 0,
      foodType: dish.foodType || "Non-Veg",
      category: dish.category || section.name,
      description: dish.description || "",
      preparationTime: dish.preparationTime || "",
      isAvailable: dish.isAvailable !== false,
      isRecommended: dish.isRecommended || false,
      stock: dish.stock === "Unlimited" || dish.stock === 0 || dish.stock === "0" ? true : (typeof dish.stock === 'number' && dish.stock > 0),
      hasVariants: hasVariants,
      variants: hasVariants ? dish.variations.map((v) => ({
        id: v.id || `variant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: v.name || "",
        price: v.price || 0,
        stock: v.stock || "Unlimited",
      })) : [],
    })
    setShowNewCategoryInput(false)
    setNewCategoryName("")
    setShowAddDishModal(true)
  }

  const handleDeleteDish = async (dish, section) => {
    if (!confirm(`Are you sure you want to delete "${dish.name}"? This action cannot be undone.`)) {
      return
    }

    if (!selectedRestaurant?._id) {
      toast.error("Please select a restaurant")
      return
    }

    try {
      setDeletingDish(true)
      
      // Get current menu
      const currentMenu = menu || { sections: [] }
      
      // Remove item from section
      const updatedSections = currentMenu.sections.map(sec => {
        if (sec.id === section.id || sec.name === section.name) {
          return {
            ...sec,
            items: (sec.items || []).filter(item => String(item.id) !== String(dish.id))
          }
        }
        return sec
      })

      // Update menu via admin endpoint
      const updateResponse = await adminAPI.updateRestaurantMenu(selectedRestaurant._id, {
        sections: updatedSections
      })

      if (updateResponse.data?.success) {
        toast.success("Dish deleted successfully!")
        fetchMenu() // Refresh menu
      } else {
        toast.error("Failed to delete dish")
      }
    } catch (error) {
      console.error("Error deleting dish:", error)
      if (error.response?.status === 401 || error.response?.status === 403) {
        toast.error("You don't have permission to update this restaurant's menu. Please contact the developer to add an admin menu update endpoint.")
      } else {
        toast.error(error.response?.data?.message || "Failed to delete dish")
      }
    } finally {
      setDeletingDish(false)
    }
  }

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error("Please enter a category name")
      return
    }

    if (!selectedRestaurant?._id) {
      toast.error("Please select a restaurant first")
      return
    }

    try {
      setCreatingCategory(true)
      // Create new section in menu
      const currentMenu = menu || { sections: [] }
      const newSection = {
        id: `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: newCategoryName.trim(),
        items: [],
        subsections: [],
        isEnabled: true,
        order: currentMenu.sections.length,
      }

      const updatedSections = [...(currentMenu.sections || []), newSection]
      
      // Update menu with new section using admin endpoint
      const updateResponse = await adminAPI.updateRestaurantMenu(selectedRestaurant._id, {
        sections: updatedSections
      })

      if (updateResponse.data?.success) {
        toast.success("Category created successfully")
        setFormData({ ...formData, category: newCategoryName.trim() })
        setShowNewCategoryInput(false)
        setNewCategoryName("")
        fetchAdminCategories()
        fetchMenu() // Refresh menu to get new section
      } else {
        toast.error("Failed to create category")
      }
    } catch (error) {
      console.error("Error creating category:", error)
      // Check if it's an authentication error
      if (error.response?.status === 401 || error.response?.status === 403) {
        toast.error("You don't have permission to update this restaurant's menu. Please contact the developer to add an admin menu update endpoint.")
      } else {
        toast.error(error.response?.data?.message || "Failed to create category")
      }
    } finally {
      setCreatingCategory(false)
    }
  }

  const handleImageUpload = async (file) => {
    if (!file) return
    
    try {
      const response = await uploadAPI.uploadMedia(file, { folder: 'menu-items' })
      if (response.data?.success && response.data.data?.url) {
        const imageUrl = response.data.data.url
        setFormData(prev => ({
          ...prev,
          image: imageUrl,
          images: prev.images.length === 0 ? [imageUrl] : [...prev.images, imageUrl]
        }))
        toast.success("Image uploaded successfully")
      }
    } catch (error) {
      console.error("Error uploading image:", error)
      toast.error("Failed to upload image")
    }
  }


  const handleSaveDish = async () => {
    if (!formData.name) {
      toast.error("Please fill in dish name")
      return
    }

    if (!formData.hasVariants && (!formData.price || formData.price <= 0)) {
      toast.error("Please fill in dish price")
      return
    }

    if (formData.hasVariants && formData.variants.length === 0) {
      toast.error("Please add at least one variant")
      return
    }

    if (formData.hasVariants) {
      // Validate variants
      for (const variant of formData.variants) {
        if (!variant.name || !variant.name.trim()) {
          toast.error("Please fill in variant name for all variants")
          return
        }
        if (!variant.price || variant.price <= 0) {
          toast.error("Please fill in valid price for all variants")
          return
        }
      }
    }

    if (!formData.category) {
      toast.error("Please select or create a category")
      return
    }

    if (!selectedRestaurant?._id) {
      toast.error("Please select a restaurant")
      return
    }

    try {
      setSaving(true)
      
      // Prepare dish data
      const existingDish = editingDish ? editingDish.dish : null
      
      // Prepare variations array
      const variations = formData.hasVariants && formData.variants.length > 0
        ? formData.variants.map((v) => ({
            id: String(v.id),
            name: v.name.trim(),
            price: parseFloat(v.price) || 0,
            stock: v.stock || "Unlimited",
          }))
        : []

      const dishData = {
        id: editingDish ? editingDish.dish.id : Date.now().toString(),
        name: formData.name.trim(),
        nameArabic: existingDish?.nameArabic || "",
        image: formData.image || (formData.images?.[0] || ""),
        images: formData.images.length > 0 ? formData.images : (formData.image ? [formData.image] : []),
        price: formData.hasVariants && variations.length > 0 
          ? Math.min(...variations.map(v => v.price)) // Base price as minimum variant price
          : parseFloat(formData.price),
        stock: formData.stock ? "Unlimited" : 0,
        discount: existingDish?.discount || null,
        originalPrice: existingDish?.originalPrice || null,
        discountType: existingDish?.discountType || "Percent",
        discountAmount: existingDish?.discountAmount || 0,
        foodType: formData.foodType,
        category: formData.category,
        description: formData.description || "",
        availabilityTimeStart: existingDish?.availabilityTimeStart || "12:01 AM",
        availabilityTimeEnd: existingDish?.availabilityTimeEnd || "11:57 PM",
        isAvailable: formData.isAvailable !== false,
        isRecommended: formData.isRecommended || false,
        variations: variations,
        tags: existingDish?.tags || [],
        nutrition: existingDish?.nutrition || [],
        allergies: existingDish?.allergies || [],
        subCategory: existingDish?.subCategory || "",
        servesInfo: existingDish?.servesInfo || "",
        itemSize: existingDish?.itemSize || "",
        itemSizeQuantity: existingDish?.itemSizeQuantity || "",
        itemSizeUnit: existingDish?.itemSizeUnit || "piece",
        gst: existingDish?.gst || 0,
        preparationTime: formData.preparationTime || "",
        photoCount: formData.images.length || 1,
        rating: existingDish?.rating || 0,
        reviews: existingDish?.reviews || 0,
        approvalStatus: existingDish?.approvalStatus || 'approved',
        approvedAt: existingDish?.approvedAt || new Date(),
        requestedAt: existingDish?.requestedAt,
        approvedBy: existingDish?.approvedBy,
        rejectedAt: existingDish?.rejectedAt,
        rejectionReason: existingDish?.rejectionReason || "",
      }

      // Get current menu
      const currentMenu = menu || { sections: [] }
      
      let updatedSections = []
      
      if (editingDish) {
        // Editing existing dish - replace it
        updatedSections = currentMenu.sections.map(section => {
          if (section.id === editingDish.section.id || section.name === editingDish.section.name) {
            return {
              ...section,
              items: (section.items || []).map(item => 
                String(item.id) === String(editingDish.dish.id) ? dishData : item
              )
            }
          }
          return section
        })
      } else {
        // Adding new dish
        // Find section by name (category) and add item
        // If section doesn't exist, create it
        let sectionFound = false
        updatedSections = currentMenu.sections.map(section => {
          if (section.name === formData.category || section.id === selectedSection?.id) {
            sectionFound = true
            return {
              ...section,
              items: [...(section.items || []), dishData]
            }
          }
          return section
        })

        // If section not found, create new section
        if (!sectionFound) {
          const newSection = {
            id: `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: formData.category,
            items: [dishData],
            subsections: [],
            isEnabled: true,
            order: updatedSections.length,
          }
          updatedSections.push(newSection)
        }
      }

      // Update menu via admin endpoint
      try {
        const updateResponse = await adminAPI.updateRestaurantMenu(selectedRestaurant._id, {
          sections: updatedSections
        })

        if (updateResponse.data?.success) {
          toast.success(editingDish ? "Dish updated successfully!" : "Dish added successfully!")
          setShowAddDishModal(false)
          setEditingDish(null)
          fetchMenu() // Refresh menu
          // Reset form
          setFormData({
            name: "",
            image: "",
            images: [],
            price: 0,
            foodType: "Non-Veg",
            category: formData.category, // Keep selected category
            description: "",
            preparationTime: "",
            isAvailable: true,
            isRecommended: false,
            stock: true,
            hasVariants: false,
            variants: [],
          })
          setShowNewCategoryInput(false)
          setNewCategoryName("")
        } else {
          toast.error(editingDish ? "Failed to update dish" : "Failed to add dish")
        }
      } catch (apiError) {
        throw apiError
      }
    } catch (error) {
      console.error("Error saving dish:", error)
      // Check if it's an authentication error
      if (error.response?.status === 401 || error.response?.status === 403) {
        toast.error("You don't have permission to update this restaurant's menu. Please contact the developer to add an admin menu update endpoint.")
      } else {
        toast.error(error.response?.data?.message || "Failed to add dish")
      }
    } finally {
      setSaving(false)
    }
  }

  const filteredRestaurants = restaurants.filter((restaurant) => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      restaurant.name?.toLowerCase().includes(q) ||
      restaurant.ownerName?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Menu Add</h1>
            <p className="text-sm text-gray-600">Add dishes to restaurant menus</p>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-7xl mx-auto">
        {/* Restaurant Selection */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Restaurant</h2>
          
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search restaurants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Restaurant List */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
              {filteredRestaurants.map((restaurant) => (
                <button
                  key={restaurant._id || restaurant.id}
                  onClick={() => handleRestaurantSelect(restaurant)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    selectedRestaurant?._id === restaurant._id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="font-semibold text-gray-900">{restaurant.name}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Owner: {restaurant.ownerName || "N/A"}
                  </div>
                  {restaurant.location?.area && (
                    <div className="text-xs text-gray-500 mt-1">
                      {restaurant.location.area}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Menu Sections */}
        {selectedRestaurant && (
          <div id="menuList" ref={menuListRef} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Menu for {selectedRestaurant.name}
              </h2>
              <div className="flex items-center gap-3">
                {loading && (
                  <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
                )}
                <button
                  type="button"
                  onClick={handleAddDishGlobal}
                  className="inline-flex items-center px-3 py-1 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Dish
                </button>
              </div>
            </div>

            {menu && menu.sections && menu.sections.length > 0 ? (
              <div className="space-y-2">
                {menu.sections.map((section) => (
                  <div key={section.id} className="border border-gray-200 rounded-lg">
                    <button
                      onClick={() => toggleSection(section.id)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {expandedSections[section.id] ? (
                          <ChevronDown className="w-5 h-5 text-gray-600" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-600" />
                        )}
                        <Utensils className="w-5 h-5 text-gray-600" />
                        <span className="font-semibold text-gray-900">{section.name}</span>
                        <span className="text-sm text-gray-500">
                          ({section.items?.length || 0} items)
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAddDish(section)
                        }}
                        className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        Add Dish
                      </button>
                    </button>

                    {expandedSections[section.id] && (
                      <div className="px-4 pb-4 border-t border-gray-200">
                        <div className="mt-3 space-y-2">
                          {section.items && section.items.length > 0 ? (
                            section.items.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                              >
                                {item.image && (
                                  <img
                                    src={item.image}
                                    alt={item.name}
                                    className="w-16 h-16 object-cover rounded"
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-gray-900 truncate">{item.name}</div>
                                  <div className="text-sm text-gray-600">
                                    ₹{item.price} • {item.foodType}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-semibold text-gray-900">
                                    ₹{item.price}
                                  </div>
                                  <button
                                    onClick={() => handleEditDish(item, section)}
                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Edit"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteDish(item, section)}
                                    disabled={deletingDish}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                    title="Delete"
                                  >
                                    {deletingDish ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-4 h-4" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-center py-8 text-gray-500">
                              No dishes in this section
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                {loading ? (
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                ) : (
                  <>
                    <p className="mb-4">No menu sections found</p>
                    <p className="text-sm mb-6">Menu will be created when you add the first dish</p>
                    <button
                      onClick={() => {
                        setSelectedSection(null)
                        setEditingDish(null)
                        setFormData({
                          name: "",
                          image: "",
                          images: [],
                          price: 0,
                          foodType: "Non-Veg",
                          category: "",
                          description: "",
                          preparationTime: "",
                          isAvailable: true,
                          isRecommended: false,
                          stock: true,
                          hasVariants: false,
                          variants: [],
                        })
                        setShowNewCategoryInput(false)
                        setNewCategoryName("")
                        setShowAddDishModal(true)
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center gap-2 mx-auto"
                    >
                      <Plus className="w-4 h-4" />
                      Add First Dish
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {!selectedRestaurant && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Utensils className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Select a Restaurant
            </h3>
            <p className="text-gray-600">
              Choose a restaurant from the list above to view and manage its menu
            </p>
          </div>
        )}
      </div>

      {/* Add Dish Modal */}
      {showAddDishModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {editingDish ? "Edit Dish" : "Add Dish"}
              </h2>
              <button
                onClick={() => {
                  setShowAddDishModal(false)
                  setEditingDish(null)
                  // Reset form when closing
                  setFormData({
                    name: "",
                    image: "",
                    images: [],
                    price: 0,
                    foodType: "Non-Veg",
                    category: "",
                    description: "",
                    preparationTime: "",
                    isAvailable: true,
                    isRecommended: false,
                    stock: true,
                    hasVariants: false,
                    variants: [],
                  })
                  setShowNewCategoryInput(false)
                  setNewCategoryName("")
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Category Selection */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Category</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <select
                      value={formData.category}
                      onChange={(e) => {
                        if (e.target.value === "__new__") {
                          setShowNewCategoryInput(true)
                          setFormData({ ...formData, category: "" })
                        } else {
                          setFormData({ ...formData, category: e.target.value })
                          setShowNewCategoryInput(false)
                        }
                      }}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select Category</option>
                      {adminCategories.map((cat) => (
                        <option key={cat._id || cat.id} value={cat.name}>
                          {cat.name}
                        </option>
                      ))}
                      {menu?.sections?.filter(
                        (s) => !adminCategories.some((c) => (c.name || "").toLowerCase() === (s.name || "").toLowerCase())
                      ).map((section) => (
                        <option key={section.id} value={section.name}>
                          {section.name}
                        </option>
                      ))}
                      <option value="__new__">+ Create New Category</option>
                    </select>
                  </div>
                  {showNewCategoryInput && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="Enter new category name"
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onKeyPress={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            handleCreateCategory()
                          }
                        }}
                      />
                      <button
                        onClick={handleCreateCategory}
                        disabled={creatingCategory}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {creatingCategory ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                        Create
                      </button>
                      <button
                        onClick={() => {
                          setShowNewCategoryInput(false)
                          setNewCategoryName("")
                        }}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Basic Information */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Dish Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Item Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Describe the dish..."
                    />
                  </div>
                </div>
              </div>

              {/* Image Upload */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Image</h3>
                <div className="flex items-center gap-4">
                  {formData.image && (
                    <img
                      src={formData.image}
                      alt="Dish"
                      className="w-32 h-32 object-cover rounded-lg"
                    />
                  )}
                  <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
                    <Upload className="w-5 h-5" />
                    Upload Image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e.target.files[0])}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Variants Toggle */}
              <div>
                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-gray-50">
                  <div>
                    <span className="text-sm font-medium text-gray-700">Enable Variants</span>
                    <p className="text-xs text-gray-500 mt-1">
                      Add multiple sizes/prices (e.g., Small, Medium, Large)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (formData.hasVariants) {
                        // Disabling variants - clear variants array
                        setFormData({ ...formData, hasVariants: false, variants: [] })
                      } else {
                        // Enabling variants - add first variant
                        setFormData({
                          ...formData,
                          hasVariants: true,
                          variants: [{
                            id: `variant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            name: "",
                            price: 0,
                            stock: "Unlimited",
                          }],
                        })
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formData.hasVariants ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formData.hasVariants ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Variants Section */}
              {formData.hasVariants && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Variants</h3>
                  <div className="space-y-4">
                    {formData.variants.map((variant, index) => (
                      <div
                        key={variant.id}
                        className="p-4 border border-gray-200 rounded-lg bg-gray-50"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-gray-700">
                            Variant {index + 1}
                          </span>
                          {formData.variants.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveVariant(variant.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Remove variant"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Size/Name * (e.g., Small, Medium, Large)
                            </label>
                            <input
                              type="text"
                              value={variant.name}
                              onChange={(e) =>
                                handleUpdateVariant(variant.id, "name", e.target.value)
                              }
                              placeholder="e.g., Small, Medium, Large"
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Price (₹) *
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={variant.price}
                              onChange={(e) =>
                                handleUpdateVariant(variant.id, "price", e.target.value)
                              }
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              required
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={handleAddVariant}
                      className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 text-gray-600 hover:text-blue-600"
                    >
                      <Plus className="w-4 h-4" />
                      Add Another Variant
                    </button>
                  </div>
                </div>
              )}

              {/* Price & Food Type */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Price & Food Type</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {formData.hasVariants ? "Base Price (₹)" : "Price (₹) *"}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={formData.hasVariants}
                      required={!formData.hasVariants}
                    />
                    {formData.hasVariants && (
                      <p className="text-xs text-gray-500 mt-1">
                        Base price will be set to minimum variant price
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Food Type
                    </label>
                    <select
                      value={formData.foodType}
                      onChange={(e) => setFormData({ ...formData, foodType: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Veg">Veg</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Preparation Time */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Preparation Time</h3>
                <select
                  value={formData.preparationTime}
                  onChange={(e) => setFormData({ ...formData, preparationTime: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select timing</option>
                  {preparationTimeOptions.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </div>

              {/* Toggles */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Settings</h3>
                <div className="space-y-4">
                  {/* Stock Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-gray-700">Stock</span>
                      <p className="text-xs text-gray-500 mt-1">
                        {formData.stock ? "In Stock" : "Out of Stock"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, stock: !formData.stock })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        formData.stock ? 'bg-green-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          formData.stock ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Recommended Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-gray-700">Recommended</span>
                      <p className="text-xs text-gray-500 mt-1">
                        Show as recommended dish
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, isRecommended: !formData.isRecommended })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        formData.isRecommended ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          formData.isRecommended ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Available Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-gray-700">Available</span>
                      <p className="text-xs text-gray-500 mt-1">
                        Make dish available for ordering
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, isAvailable: !formData.isAvailable })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        formData.isAvailable ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          formData.isAvailable ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddDishModal(false)
                  setEditingDish(null)
                  // Reset form when canceling
                  setFormData({
                    name: "",
                    image: "",
                    images: [],
                    price: 0,
                    foodType: "Non-Veg",
                    category: "",
                    description: "",
                    preparationTime: "",
                    isAvailable: true,
                    isRecommended: false,
                    stock: true,
                    hasVariants: false,
                    variants: [],
                  })
                  setShowNewCategoryInput(false)
                  setNewCategoryName("")
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDish}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {editingDish ? "Update Dish" : "Save Dish"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
