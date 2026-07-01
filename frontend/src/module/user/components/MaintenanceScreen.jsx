import React from "react";
import { Wrench, Phone } from "lucide-react";

export default function MaintenanceScreen({ settings }) {
  const companyName = settings?.companyName || "Abhikaro";
  const logoUrl = settings?.logo?.url;
  const supportPhoneCountryCode = settings?.phone?.countryCode || "+91";
  const supportPhoneNumber = settings?.phone?.number || "7610416971";
  const supportPhone = `${supportPhoneCountryCode}${supportPhoneNumber}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex flex-col justify-between p-6 transition-colors duration-200">
      {/* Top spacing / Logo */}
      <div className="pt-8 text-center">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={companyName}
            className="h-12 lg:h-14 object-contain mx-auto"
          />
        ) : (
          <span className="text-2xl font-extrabold tracking-tight text-red-600 dark:text-red-500">
            {companyName}
          </span>
        )}
      </div>

      {/* Main Content */}
      <div className="max-w-md w-full mx-auto text-center flex flex-col items-center justify-center my-auto py-12">
        {/* Animated Wrench Icon */}
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-red-500/20 rounded-full blur-xl animate-pulse"></div>
          <div className="relative bg-red-50 dark:bg-red-950/30 p-6 rounded-full border border-red-100 dark:border-red-900/50 shadow-md text-red-600 dark:text-red-500">
            <Wrench className="w-12 h-12 stroke-[1.5] animate-[spin_4s_linear_infinite]" />
          </div>
        </div>

        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-zinc-50 tracking-tight mb-4 px-4">
          Under Maintenance
        </h1>
        <p className="text-sm lg:text-base text-slate-600 dark:text-zinc-400 leading-relaxed mb-8 px-6">
          We are currently upgrading our systems and performing scheduled maintenance to serve you better. We&apos;ll be back online shortly!
        </p>

        {/* Progress Bar Animation */}
        <div className="w-48 bg-slate-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden mb-6 relative">
          <div className="h-full bg-red-600 dark:bg-red-500 rounded-full w-1/2 animate-[pulse_1.2s_infinite] mx-auto"></div>
        </div>
        <span className="text-xs text-slate-400 dark:text-zinc-500 animate-pulse">
          Thank you for your patience
        </span>
      </div>

      {/* Footer Info */}
      <div className="pb-8 text-center max-w-sm mx-auto">
        <p className="text-xs font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-4">
          Need Assistance?
        </p>
        <div className="flex justify-center items-center gap-6 text-xs lg:text-sm text-slate-600 dark:text-zinc-400">
          <a
            href={`tel:${supportPhone}`}
            className="flex items-center gap-2 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            <Phone className="w-4 h-4 text-slate-400 dark:text-zinc-500" />
            <span>Call Support</span>
          </a>
        </div>
      </div>
    </div>
  );
}
