import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, X, Pencil, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useProfile } from "../../context/ProfileContext"
import { userAPI } from "@/lib/api"
import { toast } from "sonner"
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import dayjs from 'dayjs'

// Gender options
const genderOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
]

// Load profile data from localStorage
const loadProfileFromStorage = () => {
  try {
    // Legacy key used by this screen
    const legacy = localStorage.getItem('user_profile')
    if (legacy) return JSON.parse(legacy)

    // Modern keys used by ProfileContext (preferred on refresh)
    const modern =
      sessionStorage.getItem("user_user") ||
      localStorage.getItem("user_user") ||
      sessionStorage.getItem("userProfile") ||
      localStorage.getItem("userProfile")
    if (modern) return JSON.parse(modern)
  } catch (error) {
    console.error('Error loading profile from localStorage:', error)
  }
  return null
}

// Save profile data to localStorage
const saveProfileToStorage = (data) => {
  try {
    localStorage.setItem('user_profile', JSON.stringify(data))
  } catch (error) {
    console.error('Error saving profile to localStorage:', error)
  }
}

export default function EditProfile() {
  const navigate = useNavigate()
  const { userProfile, updateUserProfile } = useProfile()
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    if (typeof document === "undefined") return
    const el = document.documentElement
    const update = () => setIsDarkMode(el.classList.contains("dark"))
    update()
    const obs = new MutationObserver(update)
    obs.observe(el, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [])

  // Load from localStorage or use context
  const storedProfile = loadProfileFromStorage()
  // Merge so context wins over stale legacy storage
  const initialProfile = { ...(storedProfile || {}), ...(userProfile || {}) }

  const initialFormData = {
    name: initialProfile.name ?? "",
    mobile: initialProfile.mobile ?? initialProfile.phone ?? "",
    email: initialProfile.email ?? "",
    gender: initialProfile.gender ?? "",
  }

  const [formData, setFormData] = useState(initialFormData)
  const [initialData] = useState(initialFormData)
  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [profileImage, setProfileImage] = useState(initialProfile?.profileImage || "")
  const [imagePreview, setImagePreview] = useState(initialProfile?.profileImage || "")
  const fileInputRef = useRef(null)

  // Update form data when profile changes
  useEffect(() => {
    const storedProfile = loadProfileFromStorage()
    const profile = { ...(storedProfile || {}), ...(userProfile || {}) }
    const newFormData = {
      name: profile.name ?? "",
      mobile: profile.mobile ?? profile.phone ?? "",
      email: profile.email ?? "",
      gender: profile.gender ?? "",
    }
    setFormData(newFormData)

    // Update profile image
    if (profile.profileImage) {
      setProfileImage(profile.profileImage)
      setImagePreview(profile.profileImage)
    }
  }, [userProfile])

  // Get avatar initial
  const avatarInitial = formData.name?.charAt(0).toUpperCase() || 'A'

  // Check if form has changes
  useEffect(() => {
    const currentData = JSON.stringify(formData)
    const savedData = JSON.stringify(initialData)
    setHasChanges(currentData !== savedData)
  }, [formData, initialData])

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleClear = (field) => {
    setFormData(prev => ({
      ...prev,
      [field]: ""
    }))
  }

  // Process image file (extracted for reuse)
  const processImageFile = async (file) => {
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size should be less than 5MB')
      return
    }

    // Show preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result)
    }
    reader.readAsDataURL(file)

    // Upload to server
    try {
      setIsUploadingImage(true)
      const response = await userAPI.uploadProfileImage(file)
      const imageUrl = response?.data?.data?.profileImage || response?.data?.profileImage

      if (imageUrl) {
        setProfileImage(imageUrl)
        setImagePreview(imageUrl)
        toast.success('Profile image uploaded successfully')

        // Update context
        updateUserProfile({ profileImage: imageUrl })

        // Persist for this screen's legacy storage key too (prevents refresh revert)
        saveProfileToStorage({
          ...(storedProfile || {}),
          ...(userProfile || {}),
          name: formData.name,
          phone: formData.mobile,
          email: formData.email,
          gender: formData.gender,
          profileImage: imageUrl,
        })

        // Dispatch event to refresh profile
        window.dispatchEvent(new Event("userAuthChanged"))
      }
    } catch (error) {
      console.error('Error uploading image:', error)
      const msg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'Failed to upload image'
      toast.error(msg)
      // Revert preview
      setImagePreview(profileImage)
    } finally {
      setIsUploadingImage(false)
    }
  }

  const handleRemoveProfilePhoto = async () => {
    try {
      setIsUploadingImage(true)
      // Clear on backend (if supported) + update local state
      const response = await userAPI.updateProfile({ profileImage: null })
      const updatedUser = response?.data?.data?.user || response?.data?.user || null
      const cleared = {
        ...(updatedUser || {}),
        profileImage: "",
      }
      setProfileImage("")
      setImagePreview("")
      updateUserProfile(cleared)
      saveProfileToStorage({
        name: cleared.name ?? formData.name,
        phone: cleared.phone ?? formData.mobile,
        email: cleared.email ?? formData.email,
        profileImage: "",
        gender: cleared.gender ?? formData.gender,
      })
      window.dispatchEvent(new Event("userAuthChanged"))
      toast.success("Profile photo removed")
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        "Failed to remove profile photo"
      toast.error(msg)
    } finally {
      setIsUploadingImage(false)
    }
  }

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    await processImageFile(file)
    // Allow re-uploading the same file again (camera often returns same filename)
    try {
      e.target.value = ""
    } catch {
      // ignore
    }
  }

  const handleUpdate = async () => {
    if (isSaving) return

    try {
      setIsSaving(true)

      // Prepare data for API
      const updateData = {
        name: formData.name,
        email: formData.email || undefined,
        phone: formData.mobile || undefined,
        gender: formData.gender || undefined,
        // Include profileImage in update; allow explicit clearing by sending null.
        profileImage: profileImage === "" ? null : (profileImage || undefined),
      }

      // Call API to update profile
      const response = await userAPI.updateProfile(updateData)
      const updatedUser = response?.data?.data?.user || response?.data?.user

      if (updatedUser) {
        // Update context with all fields including profileImage
        updateUserProfile({
          ...updatedUser,
          phone: updatedUser.phone || formData.mobile,
          profileImage: updatedUser.profileImage || profileImage,
        })

        // Save to localStorage with complete data
        saveProfileToStorage({
          name: updatedUser.name || formData.name,
          phone: updatedUser.phone || formData.mobile,
          email: updatedUser.email || formData.email,
          profileImage: updatedUser.profileImage || profileImage,
          gender: updatedUser.gender || formData.gender,
        })

        // Dispatch event to refresh profile from API
        window.dispatchEvent(new Event("userAuthChanged"))

        toast.success('Profile updated successfully')

        // Navigate back
        navigate("/user/profile")
      }
    } catch (error) {
      console.error('Error updating profile:', error)
      toast.error(error?.response?.data?.message || 'Failed to update profile')
    } finally {
      setIsSaving(false)
    }
  }

  const handleMobileChange = () => {
    // Navigate to mobile change page or show modal
    console.log('Change mobile clicked')
  }

  const handleEmailChange = () => {
    // Navigate to email change page or show modal
    console.log('Change email clicked')
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a]">
      {/* Header */}
      <div className="bg-white dark:bg-[#1a1a1a] sticky top-0 z-10 border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto flex items-center gap-3 px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 pt-8 pb-4 md:pt-9 md:pb-5 lg:pt-10 lg:pb-6">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors flex-shrink-0"
          >
            <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-white" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Your Profile</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 py-6 sm:py-8 md:py-10 lg:py-12 space-y-6 md:space-y-8 lg:space-y-10">
        {/* Avatar Section */}
        <div className="flex justify-center">
          <div className="relative">
            <Avatar className="h-24 w-24 bg-blue-400 border-0">
              {imagePreview && (
                <AvatarImage
                  src={imagePreview}
                  alt={formData.name || 'User'}
                />
              )}
              <AvatarFallback className="bg-blue-400 text-white text-3xl font-semibold">
                {avatarInitial}
              </AvatarFallback>
            </Avatar>
            {/* Edit Icon - with camera/gallery options */}
            <div className="absolute bottom-0 right-0 flex gap-2">
              <button
                onClick={() => {
                  try {
                    if (fileInputRef.current) fileInputRef.current.value = ""
                  } catch {
                    // ignore
                  }
                  fileInputRef.current?.click()
                }}
                disabled={isUploadingImage}
                className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center shadow-lg border-2 border-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Choose from gallery"
              >
                {isUploadingImage ? (
                  <Loader2 className="h-4 w-4 text-white animate-spin" />
                ) : (
                  <Pencil className="h-4 w-4 text-white" />
                )}
              </button>
              <button
                type="button"
                onClick={handleRemoveProfilePhoto}
                disabled={isUploadingImage || !imagePreview}
                className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg border-2 border-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${imagePreview ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-400 hover:bg-gray-400'}`}
                title="Remove photo"
              >
                <Trash2 className="h-4 w-4 text-white" />
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageSelect}
              className="hidden"
            />
          </div>
        </div>

        {/* Form Card */}
        <Card className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-sm border-0 dark:border-gray-800">
          <CardContent className="p-4 sm:p-5 md:p-6 lg:p-8 space-y-4 md:space-y-5 lg:space-y-6">
            {/* Name Field */}
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-sm font-medium text-gray-700 dark:text-white">
                Name
              </Label>
              <div className="relative">
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="pr-10 h-12 text-base border border-gray-300 dark:border-gray-700 focus:border-green-600 focus:ring-1 focus:ring-green-600 rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white"
                  placeholder="Name"
                />
                {formData.name && (
                  <button
                    type="button"
                    onClick={() => handleClear('name')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Mobile Field */}
            <div className="space-y-1.5">
              <Label htmlFor="mobile" className="text-sm font-medium text-gray-700 dark:text-white">
                Mobile
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="mobile"
                  type="tel"
                  value={formData.mobile}
                  onChange={(e) => handleChange('mobile', e.target.value)}
                  className="flex-1 h-12 text-base border border-gray-300 dark:border-gray-700 focus:border-green-600 focus:ring-1 focus:ring-green-600 rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white"
                  placeholder="Mobile"
                />
              </div>
            </div>

            {/* Email Field */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-white">
                Email
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  disabled={!!(userProfile?.email || userProfile?.signupMethod === 'email')}
                  readOnly={!!(userProfile?.email || userProfile?.signupMethod === 'email')}
                  className="flex-1 h-12 text-base border border-gray-300 dark:border-gray-700 focus:border-green-600 focus:ring-1 focus:ring-green-600 rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
                  placeholder="Email"
                />
              </div>
              {(userProfile?.email || userProfile?.signupMethod === 'email') && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Email address cannot be changed
                </p>
              )}
            </div>

            {/* Gender Field */}
            <div className="space-y-1.5">
              <Label htmlFor="gender" className="text-sm font-medium text-gray-700 dark:text-white">
                Gender
              </Label>
              <Select
                value={formData.gender || ""}
                onValueChange={(value) => handleChange('gender', value)}
              >
                <SelectTrigger className="h-12 text-base border border-gray-300 dark:border-gray-700 focus:border-green-600 focus:ring-1 focus:ring-green-600 rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white">
                  <SelectValue placeholder="Gender" />
                </SelectTrigger>
                <SelectContent>
                  {genderOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Update Profile Button */}
        <Button
          onClick={handleUpdate}
          disabled={!hasChanges || isSaving || isUploadingImage}
          className={`w-full h-14 rounded-xl font-semibold text-base transition-all ${hasChanges && !isSaving && !isUploadingImage
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
        >
          {isSaving ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Update profile'
          )}
        </Button>
      </div>
    </div>
  )
}
