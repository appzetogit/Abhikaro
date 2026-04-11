import { Link } from "react-router-dom"
import { useEffect, useState } from "react"
import { ArrowLeft } from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"

const PREFS_KEY = "user_settings_notification_prefs_v1"

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { email: true, push: true }
    const parsed = JSON.parse(raw)
    return {
      email: typeof parsed.email === "boolean" ? parsed.email : true,
      push: typeof parsed.push === "boolean" ? parsed.push : true,
    }
  } catch {
    return { email: true, push: true }
  }
}

export default function Settings() {
  const [prefs, setPrefs] = useState(loadPrefs)

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      // ignore
    }
  }, [prefs])

  return (
    <AnimatedPage className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a] p-4">
      <div className="max-w-4xl mx-auto space-y-6 pt-4 sm:pt-5">
        <div className="flex items-center gap-3">
          <Link to="/profile">
            <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
              <ArrowLeft className="h-5 w-5 text-black dark:text-white" />
            </Button>
          </Link>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-black dark:text-white">Settings</h1>
        </div>
        <Card className="bg-white dark:bg-[#1a1a1a] border-0 dark:border-gray-800">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Notifications & Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-gray-900 dark:text-gray-100">Email Notifications</Label>
                <p className="text-sm text-muted-foreground dark:text-gray-400">
                  Receive updates about your orders via email
                </p>
              </div>
              <Switch
                checked={prefs.email}
                onCheckedChange={(v) => setPrefs((p) => ({ ...p, email: v }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-gray-900 dark:text-gray-100">Push Notifications</Label>
                <p className="text-sm text-muted-foreground dark:text-gray-400">
                  Receive push notifications on your device
                </p>
              </div>
              <Switch
                checked={prefs.push}
                onCheckedChange={(v) => setPrefs((p) => ({ ...p, push: v }))}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </AnimatedPage>
  )
}
