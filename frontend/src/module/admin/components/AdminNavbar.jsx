import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Menu,
  User,
  ChevronDown,
  LogOut,
  Settings,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { adminAPI } from "@/lib/api";
import { clearModuleAuth } from "@/lib/utils/auth";
import { getCachedSettings, loadBusinessSettings } from "@/lib/utils/businessSettings";

export default function AdminNavbar({ onMenuClick }) {
  const navigate = useNavigate();
  const [adminData, setAdminData] = useState(null);
  const [businessSettings, setBusinessSettings] = useState(null);

  // Load admin data from localStorage
  useEffect(() => {
    const loadAdminData = () => {
      try {
        const adminUserStr = localStorage.getItem('admin_user');
        if (adminUserStr) {
          const adminUser = JSON.parse(adminUserStr);
          setAdminData(adminUser);
        }
      } catch (error) {
        console.error('Error loading admin data:', error);
      }
    };

    loadAdminData();

    // Listen for auth changes
    const handleAuthChange = () => {
      loadAdminData();
    };
    window.addEventListener('adminAuthChanged', handleAuthChange);

    return () => {
      window.removeEventListener('adminAuthChanged', handleAuthChange);
    };
  }, []);

  // Load business settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await loadBusinessSettings();
        if (settings) {
          setBusinessSettings(settings);
        } else {
          // Try to get from cache
          const cached = getCachedSettings();
          if (cached) {
            setBusinessSettings(cached);
          }
        }
      } catch (error) {
        console.warn('Error loading business settings in navbar:', error);
      }
    };

    loadSettings();

    // Listen for business settings updates
    const handleSettingsUpdate = () => {
      loadSettings();
    };
    window.addEventListener('businessSettingsUpdated', handleSettingsUpdate);

    return () => {
      window.removeEventListener('businessSettingsUpdated', handleSettingsUpdate);
    };
  }, []);

  // Handle logout
  const handleLogout = async () => {
    try {
      // Call backend logout API to clear refresh token cookie
      try {
        await adminAPI.logout();
      } catch (apiError) {
        // Continue with logout even if API call fails (network issues, etc.)
        console.warn("Logout API call failed, continuing with local cleanup:", apiError);
      }

      // Clear admin authentication data from localStorage
      clearModuleAuth('admin');
      localStorage.removeItem('admin_accessToken');
      localStorage.removeItem('admin_authenticated');
      localStorage.removeItem('admin_user');

      // Clear sessionStorage if any
      sessionStorage.removeItem('adminAuthData');

      // Dispatch auth change event to notify other components
      window.dispatchEvent(new Event('adminAuthChanged'));

      // Navigate to admin login page
      navigate('/admin/login', { replace: true });
    } catch (error) {
      // Even if there's an error, we should still clear local data and logout
      console.error("Error during logout:", error);

      // Clear local data anyway
      clearModuleAuth('admin');
      localStorage.removeItem('admin_accessToken');
      localStorage.removeItem('admin_authenticated');
      localStorage.removeItem('admin_user');
      sessionStorage.removeItem('adminAuthData');
      window.dispatchEvent(new Event('adminAuthChanged'));

      // Navigate to login
      navigate('/admin/login', { replace: true });
    }
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-white border-b border-neutral-200 shadow-sm">
        <div className="flex items-center justify-between px-6 py-3">
          {/* Left: Logo and Mobile Menu */}
          <div className="flex items-center gap-3">
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 rounded-md text-neutral-700 hover:bg-neutral-100 hover:text-black transition-colors"
              aria-label="Toggle menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-24 h-12 rounded-lg bg-white flex items-center justify-center ring-neutral-200">
                {businessSettings?.logo?.url ? (
                  <img
                    src={businessSettings.logo.url}
                    alt={businessSettings.companyName || "Company"}
                    className="w-24 h-10 object-contain"
                    loading="lazy"
                    onError={(e) => {
                      // Hide image if it fails to load
                      e.target.style.display = 'none';
                    }}
                  />
                ) : (
                  businessSettings?.companyName ? (
                    <span className="text-sm font-semibold text-neutral-700 px-2 truncate">
                      {businessSettings.companyName}
                    </span>
                  ) : (
                    <span className="text-sm font-semibold text-neutral-700 px-2 truncate">
                      Admin Panel
                    </span>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Right: User Profile */}
          <div className="flex items-center gap-3 ml-auto">
            {/* User Profile */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="flex items-center gap-2 pl-3 border-l border-neutral-200 cursor-pointer hover:bg-neutral-100 rounded-md px-2 py-1 transition-colors">

                  <div className="hidden md:block">
                    <p className="text-sm font-medium text-neutral-900">
                      {adminData?.name || "Admin User"}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {adminData?.email
                        ? (() => {
                          const [local, domain] = adminData.email.split("@");
                          return (
                            local[0] +
                            "*".repeat(Math.min(local.length - 1, 5)) +
                            "@" +
                            domain
                          );
                        })()
                        : ""}
                    </p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-neutral-700 hidden md:block" />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-64 bg-white border border-neutral-200 rounded-lg shadow-lg z-50 text-neutral-900 animate-in fade-in-0 zoom-in-95 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
              >
                <div className="p-4 border-b border-neutral-200">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center overflow-hidden border border-neutral-300">
                      {adminData?.profileImage ? (
                        <img
                          src={adminData.profileImage && adminData.profileImage.trim() ? adminData.profileImage : undefined}
                          alt={adminData.name || "Admin"}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-lg font-semibold text-neutral-600">
                          {adminData?.name
                            ? adminData.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .toUpperCase()
                              .substring(0, 2)
                            : "AD"}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">
                        {adminData?.name || "Admin User"}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {adminData?.email
                          ? (() => {
                            const [local, domain] = adminData.email.split("@");
                            return (
                              local[0] +
                              "*".repeat(Math.min(local.length - 1, 5)) +
                              "@" +
                              domain
                            );
                          })()
                          : ""}
                      </p>
                    </div>
                  </div>
                </div>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    className="cursor-pointer hover:bg-neutral-100 focus:bg-neutral-100"
                    onClick={() => navigate("/admin/profile")}
                  >
                    <User className="mr-2 w-4 h-4" />
                    <span>Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer hover:bg-neutral-100 focus:bg-neutral-100"
                    onClick={() => navigate("/admin/settings")}
                  >
                    <Settings className="mr-2 w-4 h-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-red-600 hover:bg-red-50 focus:bg-red-50"
                  onClick={handleLogout}
                >
                  <LogOut className="mr-2 w-4 h-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
    </>
  );
}