import { useEffect, useMemo, useState } from "react"
import { adminAPI } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import goldBadge from "@/assets/gold.png"
import silverBadge from "@/assets/silver.png"
import brownBadge from "@/assets/brown.png"
import { Building2, RefreshCw } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { uploadAPI } from "@/lib/api"

function formatRangeLabel(range) {
  if (!range?.start || !range?.end) return ""
  const s = new Date(range.start)
  const e = new Date(range.end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return ""
  return `${s.toLocaleDateString("en-IN")} → ${e.toLocaleDateString("en-IN")}`
}

function getBadge(rank) {
  if (rank === 1) return { label: "Gold", src: goldBadge }
  if (rank === 2) return { label: "Silver", src: silverBadge }
  if (rank === 3) return { label: "Bronze", src: brownBadge }
  return null
}

function LeaderboardTable({ data = [], isLoading, rewards, periodKey }) {
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-neutral-500">
        Loading leaderboard...
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-neutral-500">
        No QR orders found in this period.
      </div>
    )
  }

  const getRewardForRank = (rank) => {
    const r = Number(rank)
    if (!rewards || !Number.isFinite(r)) return null

    if (periodKey === "6months") {
      const gift = rewards?.sixMonths?.gifts?.find((g) => Number(g.position) === r)
      if (gift && (gift.name || gift.image?.url)) {
        return { type: "gift", name: gift.name || "Gift", imageUrl: gift.image?.url || "" }
      }
      return null
    }

    // month
    const gift = rewards?.monthly?.gifts?.find((g) => Number(g.position) === r)
    if (gift && (gift.name || gift.image?.url)) {
      return { type: "gift", name: gift.name || "Gift", imageUrl: gift.image?.url || "" }
    }

    const disc = rewards?.monthly?.discounts?.find((d) => Number(d.position) === r)
    const amt = Number(disc?.rupeesOff || 0)
    if (Number.isFinite(amt) && amt > 0) {
      return { type: "discount", name: `₹${amt} off`, imageUrl: "" }
    }

    return null
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200">
      <div className="grid grid-cols-12 bg-neutral-50 px-4 py-3 text-xs font-semibold text-neutral-600">
        <div className="col-span-2">Rank</div>
        <div className="col-span-6">Hotel</div>
        <div className="col-span-2">Reward</div>
        <div className="col-span-2 text-right">QR Orders</div>
      </div>
      <div className="divide-y divide-neutral-200 bg-white">
        {data.map((row) => {
          const badge = getBadge(row.rank)
          const reward = getRewardForRank(row.rank)
          return (
            <div key={row.hotelMongoId || row.hotelId || row.hotelName} className="grid grid-cols-12 px-4 py-3">
              <div className="col-span-2 flex items-center gap-2">
                <span className="w-8 text-sm font-semibold text-neutral-900">{row.rank}</span>
                {badge && (
                  <img
                    src={badge.src}
                    alt={`${badge.label} badge`}
                    title={`${badge.label} badge`}
                    className={cn("h-12 w-12 shrink-0")}
                    loading="lazy"
                  />
                )}
              </div>
              <div className="col-span-6 min-w-0">
                <p className="truncate text-sm font-semibold text-neutral-900">{row.hotelName || "Unknown Hotel"}</p>
                <p className="truncate text-xs text-neutral-500">
                  {row.hotelId ? `ID: ${row.hotelId}` : "ID: —"}
                </p>
              </div>
              <div className="col-span-2 flex items-center">
                {reward ? (
                  <div className="flex min-w-0 items-center gap-2">
                    {reward.type === "gift" && reward.imageUrl ? (
                      <img
                        src={reward.imageUrl}
                        alt={reward.name}
                        className="h-8 w-8 rounded-lg object-cover ring-1 ring-neutral-200"
                        loading="lazy"
                      />
                    ) : reward.type === "discount" ? (
                      <div className="h-8 w-8 rounded-lg bg-emerald-50 ring-1 ring-emerald-200" />
                    ) : (
                      <div className="h-8 w-8 rounded-lg bg-neutral-100 ring-1 ring-neutral-200" />
                    )}
                    <span className="truncate text-xs font-semibold text-neutral-800" title={reward.name}>
                      {reward.name}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-neutral-400">—</span>
                )}
              </div>
              <div className="col-span-2 flex items-center justify-end">
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
                  {Number(row.orders || 0).toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function HotelLeaderboard() {
  const [tab, setTab] = useState("month")
  const [monthly, setMonthly] = useState({ loading: true, data: null, error: null })
  const [sixMonths, setSixMonths] = useState({ loading: true, data: null, error: null })
  const [rewardsOpen, setRewardsOpen] = useState(false)
  const [bannerOpen, setBannerOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [rewardsLoading, setRewardsLoading] = useState(false)
  const [rewardsSaving, setRewardsSaving] = useState(false)
  const [rewardsError, setRewardsError] = useState(null)
  const [rewards, setRewards] = useState(null)
  const [historyType, setHistoryType] = useState("month") // month | 6months | year
  const [historyYear, setHistoryYear] = useState(String(new Date().getFullYear()))
  const [historyKey, setHistoryKey] = useState("")
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(null)
  const [historyData, setHistoryData] = useState(null)

  const active = tab === "6months" ? sixMonths : monthly

  const getPayload = (axiosResponse) => axiosResponse?.data?.data || null

  const headerMeta = useMemo(() => {
    const payload = getPayload(active.data)
    return {
      periodLabel: payload?.periodLabel || (tab === "6months" ? "Last 6 months" : "This month"),
      rangeLabel: formatRangeLabel(payload?.range),
      totalHotels: payload?.leaderboard?.length || 0,
      totalOrders: (payload?.leaderboard || []).reduce((s, r) => s + (Number(r.orders) || 0), 0),
    }
  }, [active.data, tab])

  const fetchLeaderboard = async (periodKey) => {
    const setter = periodKey === "6months" ? setSixMonths : setMonthly
    setter((p) => ({ ...p, loading: true, error: null }))
    try {
      const res = await adminAPI.getHotelLeaderboard({ period: periodKey })
      setter({ loading: false, data: res, error: null })
    } catch (e) {
      setter({ loading: false, data: null, error: e?.message || "Failed to load leaderboard" })
    }
  }

  const fetchRewards = async () => {
    setRewardsLoading(true)
    setRewardsError(null)
    try {
      const res = await adminAPI.getHotelLeaderboardRewards()
      setRewards(res?.data?.data || null)
    } catch (e) {
      setRewardsError(e?.message || "Failed to load rewards settings")
      setRewards(null)
    } finally {
      setRewardsLoading(false)
    }
  }

  const openRewards = async () => {
    setRewardsOpen(true)
    if (!rewards) {
      await fetchRewards()
    }
  }

  const openBanner = async () => {
    if (!rewards) {
      await fetchRewards()
    }
    setBannerOpen(true)
  }

  const computeDefaultHistoryKey = (t, y) => {
    const year = String(y || new Date().getFullYear())
    if (t === "year") return year
    if (t === "6months") return `${year}-H1`
    // month -> previous month by default (completed month)
    const now = new Date()
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const yy = String(prev.getFullYear())
    const mm = String(prev.getMonth() + 1).padStart(2, "0")
    return `${yy}-${mm}`
  }

  const fetchHistory = async ({ type, key, refresh = false }) => {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const res = await adminAPI.getHotelLeaderboardHistory({ type, key, ...(refresh ? { refresh: true } : {}) })
      setHistoryData(res?.data?.data || null)
    } catch (e) {
      setHistoryError(e?.response?.data?.message || e?.message || "Failed to load history")
      setHistoryData(null)
    } finally {
      setHistoryLoading(false)
    }
  }

  const openHistory = async () => {
    const t = historyType
    const y = historyYear
    const defaultKey = computeDefaultHistoryKey(t, y)
    setHistoryKey(defaultKey)
    setHistoryOpen(true)
    await fetchHistory({ type: t, key: defaultKey, refresh: false })
  }

  const saveBannerOnly = async () => {
    if (!rewards) return
    setRewardsSaving(true)
    setRewardsError(null)
    try {
      await adminAPI.updateHotelLeaderboardRewards(rewards)
      setBannerOpen(false)
    } catch (e) {
      setRewardsError(e?.response?.data?.message || e?.message || "Failed to save banner")
    } finally {
      setRewardsSaving(false)
    }
  }

  const saveRewards = async () => {
    if (!rewards) return
    setRewardsSaving(true)
    setRewardsError(null)
    try {
      await adminAPI.updateHotelLeaderboardRewards(rewards)
      setRewardsOpen(false)
    } catch (e) {
      setRewardsError(e?.response?.data?.message || e?.message || "Failed to save rewards settings")
    } finally {
      setRewardsSaving(false)
    }
  }

  const uploadGiftImage = async (file) => {
    const res = await uploadAPI.uploadMedia(file, { folder: "leaderboard/gifts" })
    const payload = res?.data?.data
    return { url: payload?.url || "", publicId: payload?.publicId || "" }
  }

  const uploadBannerImage = async (file) => {
    const res = await uploadAPI.uploadMedia(file, { folder: "leaderboard/banner" })
    const payload = res?.data?.data
    return { url: payload?.url || "", publicId: payload?.publicId || "" }
  }

  const FilePickerRow = ({ onPick, helper = "PNG/JPG up to 20MB" }) => {
    return (
      <label className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2 transition hover:bg-neutral-50">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900">Upload image</p>
          <p className="truncate text-xs text-neutral-500">{helper}</p>
        </div>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            try {
              await onPick(file)
            } finally {
              e.target.value = ""
            }
          }}
        />
        <span className="shrink-0 cursor-pointer rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800">
          Choose
        </span>
      </label>
    )
  }

  useEffect(() => {
    fetchLeaderboard("month")
    fetchLeaderboard("6months")
    fetchRewards()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="px-4 pb-10 lg:px-6 pt-4">
      <div className="relative overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-[0_30px_120px_-60px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col gap-3 border-b border-neutral-200 bg-linear-to-br from-white via-neutral-50 to-neutral-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-900 text-white">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Hotel Management</p>
              <h1 className="text-2xl font-semibold text-neutral-900">Hotel Leaderboard</h1>
              <p className="text-sm text-neutral-500">
                Ranking based on <span className="font-medium text-neutral-700">QR-scan orders</span> (top → down)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openRewards}
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50"
            >
              Set Gifts
            </button>
            <button
              type="button"
              onClick={openHistory}
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50"
            >
              History
            </button>
            <button
              type="button"
              onClick={openBanner}
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50"
            >
              Leaderboard Banner
            </button>
            <button
              type="button"
              onClick={() => fetchLeaderboard(tab)}
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50"
              disabled={active.loading}
            >
              <RefreshCw className={cn("h-4 w-4", active.loading && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>

        <div className="border-b border-neutral-200 bg-white px-6 py-4">
          <Tabs value={tab} onValueChange={setTab}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <TabsList className="bg-neutral-100">
                <TabsTrigger
                  value="month"
                  className="rounded-md px-3 py-2 text-sm font-semibold"
                >
                  Monthly
                </TabsTrigger>
                <TabsTrigger
                  value="6months"
                  className="rounded-md px-3 py-2 text-sm font-semibold"
                >
                  Last 6 months
                </TabsTrigger>
              </TabsList>

              <div className="flex flex-wrap gap-2 text-xs text-neutral-600">
                <span className="rounded-full bg-neutral-100 px-3 py-1">
                  <span className="font-semibold text-neutral-800">{headerMeta.periodLabel}</span>
                  {headerMeta.rangeLabel ? ` • ${headerMeta.rangeLabel}` : ""}
                </span>
                <span className="rounded-full bg-neutral-100 px-3 py-1">
                  <span className="font-semibold text-neutral-800">{headerMeta.totalHotels}</span> hotels
                </span>
                <span className="rounded-full bg-neutral-100 px-3 py-1">
                  <span className="font-semibold text-neutral-800">{headerMeta.totalOrders.toLocaleString("en-IN")}</span>{" "}
                  orders
                </span>
              </div>
            </div>

            <TabsContent value="month" className="mt-4">
              <Card className="border-neutral-200">
                <CardHeader className="border-b border-neutral-200">
                  <CardTitle className="text-lg text-neutral-900">Monthly ranking</CardTitle>
                  <p className="text-sm text-neutral-500">
                    Top 3 hotels get Gold / Silver / Bronze badges.
                  </p>
                </CardHeader>
                <CardContent className="pt-4">
                  {monthly.error ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {monthly.error}
                    </div>
                  ) : (
                    <LeaderboardTable
                      data={getPayload(monthly.data)?.leaderboard || []}
                      isLoading={monthly.loading}
                      rewards={rewards}
                      periodKey="month"
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="6months" className="mt-4">
              <Card className="border-neutral-200">
                <CardHeader className="border-b border-neutral-200">
                  <CardTitle className="text-lg text-neutral-900">6-month analysis</CardTitle>
                  <p className="text-sm text-neutral-500">
                    Aggregated ranking across the last 6 calendar months.
                  </p>
                </CardHeader>
                <CardContent className="pt-4">
                  {sixMonths.error ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {sixMonths.error}
                    </div>
                  ) : (
                    <LeaderboardTable
                      data={getPayload(sixMonths.data)?.leaderboard || []}
                      isLoading={sixMonths.loading}
                      rewards={rewards}
                      periodKey="6months"
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={rewardsOpen} onOpenChange={setRewardsOpen}>
        <DialogContent className="max-w-2xl max-h-[82vh] overflow-y-auto p-0">
          <DialogHeader>
            <div className="px-6 pt-6">
              <DialogTitle className="text-xl">Leaderboard Gifts & Offers</DialogTitle>
              <DialogDescription className="mt-1">
                Configure rewards for Monthly and 6-month leaderboard.
              </DialogDescription>
            </div>
          </DialogHeader>

          {rewardsLoading ? (
            <div className="px-6 py-16 text-center text-sm text-neutral-500">Loading settings...</div>
          ) : rewardsError ? (
            <div className="mx-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {rewardsError}
            </div>
          ) : !rewards ? (
            <div className="px-6 py-16 text-center text-sm text-neutral-500">No settings found.</div>
          ) : (
            <div className="px-6 pb-24 pt-4">
              <Tabs defaultValue="monthly">
                <div className="flex items-center justify-between">
                  <TabsList className="bg-neutral-100">
                    <TabsTrigger value="monthly" className="rounded-md px-3 py-2 text-sm font-semibold">
                      Monthly
                    </TabsTrigger>
                    <TabsTrigger value="sixMonths" className="rounded-md px-3 py-2 text-sm font-semibold">
                      6 months
                    </TabsTrigger>
                  </TabsList>
                  <span className="text-xs text-neutral-500">Auto-saved to cloud on Save</span>
                </div>

                <TabsContent value="monthly" className="mt-4">
                  <div className="space-y-6">
                    <div className="rounded-2xl border border-neutral-200 bg-neutral-50/40 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-neutral-900">Top 5 gifts</p>
                          <p className="text-xs text-neutral-500">Gift name + image per position (1–5).</p>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {rewards.monthly.gifts.map((g, idx) => (
                          <div key={g.position} className="rounded-2xl border border-neutral-200 bg-white p-4">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-neutral-900">Position #{g.position}</p>
                              {g.image?.url ? (
                                <img
                                  src={g.image.url}
                                  alt={`Gift ${g.position}`}
                                  className="h-11 w-11 rounded-xl object-cover ring-1 ring-neutral-200"
                                />
                              ) : (
                                <div className="h-11 w-11 rounded-xl bg-neutral-100 ring-1 ring-neutral-200" />
                              )}
                            </div>
                            <div className="mt-3 grid gap-2">
                              <input
                                value={g.name || ""}
                                onChange={(e) => {
                                  const name = e.target.value
                                  setRewards((prev) => {
                                    const next = structuredClone(prev)
                                    next.monthly.gifts[idx].name = name
                                    return next
                                  })
                                }}
                                placeholder="Gift name (e.g. Dinner Voucher)"
                                className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
                              />
                              <FilePickerRow
                                onPick={async (file) => {
                                  try {
                                    const image = await uploadGiftImage(file)
                                    setRewards((prev) => {
                                      const next = structuredClone(prev)
                                      next.monthly.gifts[idx].image = image
                                      return next
                                    })
                                  } catch (err) {
                                    setRewardsError(err?.message || "Image upload failed")
                                  }
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-neutral-200 bg-neutral-50/40 p-4">
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">Positions 6–10 (₹ off)</p>
                        <p className="text-xs text-neutral-500">Rupees off for ranks 6–10.</p>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {rewards.monthly.discounts.map((d, idx) => (
                          <div key={d.position} className="rounded-2xl border border-neutral-200 bg-white p-4">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-neutral-900">Position #{d.position}</p>
                              <span className="rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-600">
                                Discount
                              </span>
                            </div>
                            <div className="mt-3 flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2">
                              <span className="text-sm font-semibold text-neutral-700">₹</span>
                              <input
                                type="number"
                                min={0}
                                value={Number(d.rupeesOff || 0)}
                                onChange={(e) => {
                                  const v = Number(e.target.value)
                                  setRewards((prev) => {
                                    const next = structuredClone(prev)
                                    next.monthly.discounts[idx].rupeesOff = Number.isFinite(v) ? v : 0
                                    return next
                                  })
                                }}
                                className="h-8 w-full border-0 bg-transparent text-sm text-neutral-900 focus:outline-none"
                                placeholder="0"
                              />
                            </div>
                            <p className="mt-2 text-xs text-neutral-500">Example: 25, 50, 100</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="sixMonths" className="mt-4">
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50/40 p-4">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">Top 3 gifts (6 months)</p>
                      <p className="text-xs text-neutral-500">Gift name + image per position (1–3).</p>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {rewards.sixMonths.gifts.map((g, idx) => (
                        <div key={g.position} className="rounded-2xl border border-neutral-200 bg-white p-4">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-neutral-900">Position #{g.position}</p>
                            {g.image?.url ? (
                              <img
                                src={g.image.url}
                                alt={`Gift ${g.position}`}
                                className="h-11 w-11 rounded-xl object-cover ring-1 ring-neutral-200"
                              />
                            ) : (
                              <div className="h-11 w-11 rounded-xl bg-neutral-100 ring-1 ring-neutral-200" />
                            )}
                          </div>
                          <div className="mt-3 grid gap-2">
                            <input
                              value={g.name || ""}
                              onChange={(e) => {
                                const name = e.target.value
                                setRewards((prev) => {
                                  const next = structuredClone(prev)
                                  next.sixMonths.gifts[idx].name = name
                                  return next
                                })
                              }}
                              placeholder="Gift name (e.g. Premium Hamper)"
                              className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
                            />
                            <FilePickerRow
                              onPick={async (file) => {
                                try {
                                  const image = await uploadGiftImage(file)
                                  setRewards((prev) => {
                                    const next = structuredClone(prev)
                                    next.sixMonths.gifts[idx].image = image
                                    return next
                                  })
                                } catch (err) {
                                  setRewardsError(err?.message || "Image upload failed")
                                }
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}

          <div className="sticky bottom-0 border-t border-neutral-200 bg-white/90 backdrop-blur px-6 py-4">
            <DialogFooter className="sm:justify-between">
              <div className="text-xs text-neutral-500">
                Tip: set gifts for each position to show in announcements.
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRewardsOpen(false)}
                  className="inline-flex items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
                  disabled={rewardsSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveRewards}
                  className="inline-flex items-center justify-center rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
                  disabled={rewardsSaving || rewardsLoading || !rewards}
                >
                  {rewardsSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bannerOpen} onOpenChange={setBannerOpen}>
        <DialogContent className="max-w-xl max-h-[82vh] overflow-y-auto p-0">
          <DialogHeader>
            <div className="px-6 pt-6">
              <DialogTitle className="text-xl">Leaderboard Banner</DialogTitle>
              <DialogDescription className="mt-1">
                Upload a banner image to show on Hotel Dashboard above Overview.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="px-6 pb-32 pt-4">
            {rewardsError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {rewardsError}
              </div>
            ) : null}

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50/40 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-neutral-900">Banners</p>
                {rewards?.banners?.length ? (
                  <span className="rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-600">
                    {rewards.banners.length} uploaded
                  </span>
                ) : (
                  <span className="rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-600">
                    Not set
                  </span>
                )}
              </div>

              <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                {rewards?.banners?.length ? (
                  <img
                    src={rewards.banners[0].url}
                    alt="Leaderboard banner"
                    className="h-40 w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center text-sm text-neutral-500">
                    No banner uploaded
                  </div>
                )}
              </div>

              <div className="mt-3">
                <FilePickerRow
                  helper="Recommended: 1200×400 (JPG/PNG)"
                  onPick={async (file) => {
                    try {
                      const image = await uploadBannerImage(file)
                      setRewards((prev) => {
                        const next = structuredClone(prev || {})
                        const current = Array.isArray(next.banners) ? next.banners : []
                        next.banners = [...current, image]
                        // keep existing structures if missing
                        if (!next.monthly) next.monthly = { gifts: [], discounts: [] }
                        if (!next.sixMonths) next.sixMonths = { gifts: [] }
                        return next
                      })
                    } catch (err) {
                      setRewardsError(err?.message || "Banner upload failed")
                    }
                  }}
                />
              </div>

              {/* Uploaded banners list */}
              {rewards?.banners?.length ? (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {rewards.banners.map((b, idx) => (
                    <div key={`${b.url}-${idx}`} className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                      <img src={b.url} alt={`Banner ${idx + 1}`} className="h-28 w-full object-cover" loading="lazy" />
                      <button
                        type="button"
                        onClick={() => {
                          setRewards((prev) => {
                            const next = structuredClone(prev || {})
                            const arr = Array.isArray(next.banners) ? next.banners : []
                            next.banners = arr.filter((_, i) => i !== idx)
                            return next
                          })
                        }}
                        className="absolute right-2 top-2 rounded-full bg-white/90 p-2 text-neutral-800 shadow-sm ring-1 ring-neutral-200 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition"
                        title="Delete banner"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="sticky bottom-0 border-t border-neutral-200 bg-white/90 backdrop-blur px-6 py-4">
            <DialogFooter className="sm:justify-end">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBannerOpen(false)}
                  className="inline-flex items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
                  disabled={rewardsSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveBannerOnly}
                  className="inline-flex items-center justify-center rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
                  disabled={rewardsSaving || rewardsLoading || !rewards}
                >
                  {rewardsSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-3xl max-h-[82vh] overflow-y-auto p-0">
          <DialogHeader>
            <div className="px-6 pt-6">
              <DialogTitle className="text-xl">Leaderboard History</DialogTitle>
              <DialogDescription className="mt-1">
                Check month / 6-month / year-wise winners and what reward they get.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="px-6 pb-24 pt-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <Tabs value={historyType} onValueChange={(v) => {
                setHistoryType(v)
                const nextKey = computeDefaultHistoryKey(v, historyYear)
                setHistoryKey(nextKey)
              }}>
                <TabsList className="bg-neutral-100">
                  <TabsTrigger value="month" className="rounded-md px-3 py-2 text-sm font-semibold">Monthly</TabsTrigger>
                  <TabsTrigger value="6months" className="rounded-md px-3 py-2 text-sm font-semibold">6 months</TabsTrigger>
                  <TabsTrigger value="year" className="rounded-md px-3 py-2 text-sm font-semibold">Year</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2">
                  <span className="text-xs font-semibold text-neutral-600">Year</span>
                  <input
                    value={historyYear}
                    onChange={(e) => {
                      const y = e.target.value.replace(/[^\d]/g, "").slice(0, 4)
                      setHistoryYear(y)
                      const nextKey = computeDefaultHistoryKey(historyType, y)
                      setHistoryKey(nextKey)
                    }}
                    className="w-20 border-0 bg-transparent text-sm font-semibold text-neutral-900 focus:outline-none"
                    placeholder="2026"
                    inputMode="numeric"
                  />
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2">
                  <span className="text-xs font-semibold text-neutral-600">Key</span>
                  <input
                    value={historyKey}
                    onChange={(e) => setHistoryKey(e.target.value)}
                    className="w-32 border-0 bg-transparent text-sm font-semibold text-neutral-900 focus:outline-none"
                    placeholder={historyType === "month" ? "YYYY-MM" : historyType === "6months" ? "YYYY-H1" : "YYYY"}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => fetchHistory({ type: historyType, key: historyKey, refresh: false })}
                  className="inline-flex items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
                  disabled={historyLoading || !historyKey}
                >
                  {historyLoading ? "Loading..." : "Load"}
                </button>
                <button
                  type="button"
                  onClick={() => fetchHistory({ type: historyType, key: historyKey, refresh: true })}
                  className="inline-flex items-center justify-center rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
                  disabled={historyLoading || !historyKey}
                  title="Recompute and refresh snapshot"
                >
                  Refresh snapshot
                </button>
              </div>
            </div>

            {historyError ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {historyError}
              </div>
            ) : null}

            <div className="mt-4 rounded-2xl border border-neutral-200 bg-white">
              <div className="border-b border-neutral-200 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-neutral-900">
                    {historyData?.type ? String(historyData.type).toUpperCase() : "—"} • {historyData?.key || "—"}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {historyData?.range ? formatRangeLabel(historyData.range) : ""}
                  </p>
                </div>
              </div>

              {historyLoading ? (
                <div className="px-4 py-12 text-center text-sm text-neutral-500">Loading history...</div>
              ) : historyData?.rows?.length ? (
                <div className="divide-y divide-neutral-200">
                  {historyData.rows.map((r) => (
                    <div key={`${r.hotelMongoId || r.hotelId || r.hotelName}-${r.rank}`} className="grid grid-cols-12 px-4 py-3">
                      <div className="col-span-2 flex items-center gap-2">
                        <span className="w-8 text-sm font-semibold text-neutral-900">{r.rank}</span>
                        {getBadge(r.rank) ? (
                          <img
                            src={getBadge(r.rank).src}
                            alt={`${getBadge(r.rank).label} badge`}
                            className="h-10 w-10 shrink-0"
                            loading="lazy"
                          />
                        ) : null}
                      </div>
                      <div className="col-span-6 min-w-0">
                        <p className="truncate text-sm font-semibold text-neutral-900">{r.hotelName || "Unknown Hotel"}</p>
                        <p className="truncate text-xs text-neutral-500">{r.hotelId ? `ID: ${r.hotelId}` : ""}</p>
                      </div>
                      <div className="col-span-2 flex items-center">
                        {r.reward?.type === "gift" ? (
                          <div className="flex min-w-0 items-center gap-2">
                            {r.reward.imageUrl ? (
                              <img
                                src={r.reward.imageUrl}
                                alt={r.reward.label}
                                className="h-8 w-8 rounded-lg object-cover ring-1 ring-neutral-200"
                                loading="lazy"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded-lg bg-neutral-100 ring-1 ring-neutral-200" />
                            )}
                            <span className="truncate text-xs font-semibold text-neutral-800" title={r.reward.label}>
                              {r.reward.label || "Gift"}
                            </span>
                          </div>
                        ) : r.reward?.type === "discount" ? (
                          <span className="text-xs font-semibold text-emerald-700">{r.reward.label || "₹ off"}</span>
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
                      </div>
                      <div className="col-span-2 flex items-center justify-end">
                        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
                          {Number(r.orders || 0).toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-12 text-center text-sm text-neutral-500">
                  No history data found for this key. Try a different key or click "Refresh snapshot".
                </div>
              )}
            </div>

            <div className="mt-3 text-xs text-neutral-500">
              Key formats: <span className="font-semibold">Month</span> = YYYY-MM,{" "}
              <span className="font-semibold">6 months</span> = YYYY-H1 / YYYY-H2,{" "}
              <span className="font-semibold">Year</span> = YYYY
            </div>
          </div>

          <div className="sticky bottom-0 border-t border-neutral-200 bg-white/90 backdrop-blur px-6 py-4">
            <DialogFooter className="sm:justify-end">
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="inline-flex items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
              >
                Close
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

