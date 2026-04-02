import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Check, Instagram, Facebook } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { openExternalUrl } from "@/lib/utils/externalNavigation"
import AnimatedPage from "../../components/AnimatedPage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useProfile } from "../../context/ProfileContext";
import { userAPI } from "@/lib/api";

export default function ContactUs() {
  const { userProfile } = useProfile();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    message: "",
  });

  const initialData = useMemo(
    () => ({
      name:
        userProfile?.name ||
        userProfile?.fullName ||
        [userProfile?.firstName, userProfile?.lastName]
          .filter(Boolean)
          .join(" ") ||
        "",
      phone: userProfile?.phone || "",
      email: userProfile?.email || "",
      message: "",
    }),
    [userProfile],
  );

  useEffect(() => {
    setForm(initialData);
  }, [initialData]);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      message: form.message.trim(),
    };

    if (!payload.name || !payload.phone || !payload.email || !payload.message) {
      toast.error("Please fill all fields");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await userAPI.createContactUsMessage(payload);
      if (response.data?.success) {
        setIsSubmitted(true);
        toast.success("Message sent successfully");
        setForm({
          ...initialData,
          message: "",
        });
      } else {
        toast.error("Failed to send message");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to send message");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatedPage className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a]">
      <div className="max-w-5xl mx-auto px-4 md:px-6 lg:px-8 pt-8 pb-6 md:pt-9 md:pb-8 lg:pt-10 lg:pb-10">
        <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6 lg:mb-8">
          <Link to="/profile">
            <Button variant="ghost" size="icon" className="h-8 w-8 md:h-10 md:w-10 p-0">
              <ArrowLeft className="h-4 w-4 md:h-5 md:w-5 text-black dark:text-white" />
            </Button>
          </Link>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-black dark:text-white">
            Contact Us
          </h1>
        </div>

        {!isSubmitted ? (
          <Card className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-sm border-0 dark:border-gray-800">
            <CardContent className="p-4 md:p-5 lg:p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Name
                </label>
                <Input
                  value={form.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder="Enter your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Phone
                </label>
                <Input
                  value={form.phone}
                  onChange={(e) => handleChange("phone", e.target.value)}
                  placeholder="Enter your phone"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Email Address
                </label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  placeholder="Enter your email"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Your Message
                </label>
                <Textarea
                  value={form.message}
                  onChange={(e) => handleChange("message", e.target.value)}
                  placeholder="Type your message..."
                  className="w-full min-h-[140px] resize-y rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Message"
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  window.location.href = "tel:6001756001";
                }}
                className="w-full border-gray-300 text-gray-800 hover:bg-gray-50"
              >
                Call: 6001756001
              </Button>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openExternalUrl("https://www.instagram.com/abhikaro_official")}
                  className="w-full border-pink-300 text-pink-700 hover:bg-pink-50"
                >
                  <Instagram className="h-4 w-4 mr-2" />
                  Instagram
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openExternalUrl("https://www.facebook.com/61573547314622/")}
                  className="w-full border-blue-300 text-blue-700 hover:bg-blue-50"
                >
                  <Facebook className="h-4 w-4 mr-2" />
                  Facebook
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-sm border-0 dark:border-gray-800">
            <CardContent className="p-6 text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="h-7 w-7 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Message Sent
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                We received your message and will contact you soon.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AnimatedPage>
  );
}

