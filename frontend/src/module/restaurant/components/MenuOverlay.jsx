import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router-dom"
import {
  User,
  Utensils,
  Megaphone,
  Settings,
  Monitor,
  Plus,
  Grid3x3,
  Tag,
  FileText,
  MessageSquare,
  Shield,
  Globe,
  MessageCircle,
  CheckSquare,
  LogOut,
  LogIn,
  UserPlus
} from "lucide-react"
import { clearModuleAuth } from "@/lib/utils/auth"

export default function MenuOverlay({ showMenu, setShowMenu }) {
  // This UI has been intentionally removed.
  // Keep the component as a no-op to avoid touching many pages that still import it.
  return null
}

