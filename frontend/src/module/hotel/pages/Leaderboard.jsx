import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import BottomNavigation from "../components/BottomNavigation"
import { hotelAPI } from "@/lib/api"
import { cn } from "@/lib/utils"
import goldBadge from "@/assets/gold.png"
import silverBadge from "@/assets/silver.png"
import brownBadge from "@/assets/brown.png"
import { Trophy } from "lucide-react"

function formatRangeLabel(range) {
  if (!range?.start || !range?.end) return ""
  const s = new Date(range.start)
  const e = new Date(range.end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return ""
  return `${s.toLocaleDateString("en-IN")} → ${e.toLocaleDateString("en-IN")}`
}

function getBadge(rank) {
  if (rank === 1) return goldBadge
  if (rank === 2) return silverBadge
  if (rank === 3) return brownBadge
  return null
}

function formatOrdinal(n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return ""
  const mod100 = num % 100
  if (mod100 >= 11 && mod100 <= 13) return `${num}th`
  const mod10 = num % 10
  if (mod10 === 1) return `${num}st`
  if (mod10 === 2) return `${num}nd`
  if (mod10 === 3) return `${num}rd`
  return `${num}th`
}

function LeaderboardList({ rows, loading }) {
  if (loading) {
    return <div className="py-14 text-center text-sm text-gray-500">Loading...</div>
  }
  if (!rows || rows.length === 0) {
    return <div className="py-14 text-center text-sm text-gray-500">No data found.</div>
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      {rows.map((r) => {
        const badge = getBadge(r.rank)
        return (
          <div key={r.hotelMongoId || r.hotelId || r.hotelName} className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
            <div className="w-12 shrink-0 text-center">
              <div className="text-sm font-bold text-gray-900">{r.rank}</div>
            </div>
            <div className="w-12 shrink-0">
              {badge ? (
                <img src={badge} alt={`Rank ${r.rank}`} className="h-11 w-11" />
              ) : (
                <div className="h-11 w-11 rounded-xl bg-gray-100" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-gray-900">{r.hotelName || "Unknown Hotel"}</div>
            </div>
            <div className="shrink-0">
              <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                {Number(r.orders || 0).toLocaleString("en-IN")} orders
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function HotelLeaderboard() {
  const navigate = useNavigate()
  const [tab, setTab] = useState("month")
  const [monthState, setMonthState] = useState({ loading: true, payload: null })
  const [sixState, setSixState] = useState({ loading: true, payload: null })
  const [rewards, setRewards] = useState(null)

  const active = tab === "6months" ? sixState : monthState

  const getRewardForRank = (rank) => {
    const r = Number(rank)
    if (!rewards || !Number.isFinite(r)) return null

    if (tab === "6months") {
      const gift = rewards?.sixMonths?.gifts?.find((g) => Number(g.position) === r)
      if (gift && (gift.name || gift.image?.url)) {
        return { type: "gift", label: gift.name || "Gift", imageUrl: gift.image?.url || "" }
      }
      return null
    }

    const gift = rewards?.monthly?.gifts?.find((g) => Number(g.position) === r)
    if (gift && (gift.name || gift.image?.url)) {
      return { type: "gift", label: gift.name || "Gift", imageUrl: gift.image?.url || "" }
    }

    const disc = rewards?.monthly?.discounts?.find((d) => Number(d.position) === r)
    const amt = Number(disc?.rupeesOff || 0)
    if (Number.isFinite(amt) && amt > 0) {
      return { type: "discount", label: `₹${amt} off`, imageUrl: "" }
    }
    return null
  }

  const fetchData = async (period) => {
    const setter = period === "6months" ? setSixState : setMonthState
    setter({ loading: true, payload: null })
    try {
      const res = await hotelAPI.getLeaderboard({ period })
      setter({ loading: false, payload: res?.data?.data || null })
    } catch {
      setter({ loading: false, payload: { leaderboard: [] } })
    }
  }

  useEffect(() => {
    fetchData("month")
    fetchData("6months")
    hotelAPI
      .getLeaderboardRewards()
      .then((res) => setRewards(res?.data?.data || null))
      .catch(() => setRewards(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const meta = useMemo(() => {
    const p = active.payload
    return {
      label: p?.periodLabel || (tab === "6months" ? "Last 6 months" : "This month"),
      range: formatRangeLabel(p?.range),
    }
  }, [active.payload, tab])

  return (
    <div className="min-h-screen bg-[#f6f7fb] pb-20">
      <div className="bg-gradient-to-b from-rose-400 via-orange-300 to-white">
        <div className="mx-auto max-w-5xl px-4 pb-6 pt-6">
          <div className="flex items-center justify-between">
            <div className="w-24" />
            <div className="text-sm font-semibold text-white/90">Leaderboard</div>
            <button
              type="button"
              onClick={() => navigate("/hotel/leaderboard/past")}
              className="w-24 text-right text-xs font-semibold text-white/90 underline underline-offset-4"
            >
              Past
            </button>
          </div>

          <div className="mt-4 flex justify-center">
            <div className="inline-flex rounded-2xl bg-white/25 p-1 backdrop-blur">
              <button
                className={cn(
                  "rounded-xl px-5 py-2 text-sm font-semibold transition",
                  tab === "month" ? "bg-white text-gray-900 shadow" : "text-white/90",
                )}
                onClick={() => setTab("month")}
              >
                Monthly
              </button>
              <button
                className={cn(
                  "rounded-xl px-5 py-2 text-sm font-semibold transition",
                  tab === "6months" ? "bg-white text-gray-900 shadow" : "text-white/90",
                )}
                onClick={() => setTab("6months")}
              >
                6 months
              </button>
            </div>
          </div>

          <div className="mt-5 flex justify-center">
            <div className="w-full max-w-xl rounded-[28px] bg-white px-5 py-5 shadow-[0_20px_60px_-35px_rgba(0,0,0,0.45)] ring-1 ring-black/5">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow ring-1 ring-black/5">
                  {(() => {
                    const url =
                      tab === "6months"
                        ? rewards?.winnerProfiles?.sixMonths?.url
                        : rewards?.winnerProfiles?.month?.url
                    return url ? (
                      <img
                        src={url}
                        alt="Winner profile"
                        className="h-14 w-14 rounded-full object-cover ring-2 ring-white"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-900">
                        <Trophy className="h-7 w-7 text-yellow-400" />
                      </div>
                    )
                  })()}
                </div>
                <div className="mt-3 text-lg font-bold text-gray-900">
                  {active.payload?.top?.[0]?.hotelName ? active.payload.top[0].hotelName : "Hotels Ranking"}
                </div>
                <div className="mt-1 text-xs text-gray-500">{meta.label}</div>

                <div className="mt-4 grid w-full grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-gray-50 p-3 text-center ring-1 ring-gray-100">
                    <div className="text-[11px] font-semibold text-gray-500">Winner Rank</div>
                    <div className="mt-1 text-xl font-extrabold text-gray-900">
                      {active.payload?.top?.[0] ? "#1" : "—"}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 p-3 text-center ring-1 ring-gray-100">
                    <div className="text-[11px] font-semibold text-gray-500">Orders</div>
                    <div className="mt-1 text-xl font-extrabold text-gray-900">
                      {Number(active.payload?.top?.[0]?.orders || 0).toLocaleString("en-IN")}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 p-3 text-center ring-1 ring-gray-100">
                    <div className="text-[11px] font-semibold text-gray-500">Reward</div>
                    <div className="mt-1 text-xs font-bold text-gray-900 line-clamp-2">
                      {(() => {
                        if (!active.payload?.top?.[0]) return "—"
                        const reward = getRewardForRank(1)
                        return reward?.label || "—"
                      })()}
                    </div>
                  </div>
                </div>

                {active.payload?.top?.[0]?.hotelName ? (
                  <div className="mt-3 text-xs font-semibold text-gray-500">
                    Winner: {active.payload.top[0].hotelName}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-5">
        <div className="mt-2 flex items-center justify-between">
          <div className="text-sm font-bold text-gray-900">Leaderboard</div>
          <div className="text-xs text-gray-500">{meta.range ? meta.range : ""}</div>
        </div>

        <div className="mt-3">
          {active.loading ? (
            <LeaderboardList rows={[]} loading={true} />
          ) : (
            <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
              {(active.payload?.top || []).map((r) => {
                const badge = getBadge(r.rank)
                const reward = getRewardForRank(r.rank)
                const top3Style =
                  r.rank === 1
                    ? "mx-3 my-2 rounded-2xl border border-yellow-200 bg-gradient-to-r from-yellow-100 via-amber-50 to-white shadow-sm ring-1 ring-yellow-100"
                    : r.rank === 2
                      ? "mx-3 my-2 rounded-2xl border-2 border-slate-300 bg-gradient-to-r from-slate-200 via-gray-50 to-white shadow-md ring-1 ring-slate-200"
                      : r.rank === 3
                        ? "mx-3 my-2 rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-100 via-amber-50 to-white shadow-sm ring-1 ring-orange-100"
                        : ""
                const top3NoDivider = r.rank === 1 || r.rank === 2 || r.rank === 3
                return (
                  <div
                    key={r.hotelMongoId || r.hotelName}
                    className={cn(
                      "flex items-center gap-3 border-b border-gray-100 px-4 py-4 last:border-b-0",
                      top3NoDivider && "border-b-0",
                      top3Style,
                    )}
                  >
                    <div className="w-8 shrink-0 text-center text-sm font-extrabold text-gray-900">{r.rank}</div>
                    <div className="w-12 shrink-0">
                      {badge ? (
                        <img src={badge} alt={`Rank ${r.rank}`} className="h-11 w-11" />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-[11px] font-extrabold text-gray-500">
                          {formatOrdinal(r.rank)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-gray-900">{r.hotelName || "Unknown Hotel"}</div>
                      {reward ? (
                        <div className="mt-1 flex min-w-0 items-center gap-2">
                          {reward.type === "gift" && reward.imageUrl ? (
                            <img
                              src={reward.imageUrl}
                              alt={reward.label}
                              className="h-6 w-6 rounded-lg object-cover ring-1 ring-gray-200"
                              loading="lazy"
                            />
                          ) : reward.type === "discount" ? (
                            <div className="h-6 w-6 rounded-lg bg-emerald-50 ring-1 ring-emerald-200" />
                          ) : (
                            <div className="h-6 w-6 rounded-lg bg-gray-100 ring-1 ring-gray-200" />
                          )}
                          <span className="text-xs font-semibold text-gray-600 whitespace-normal break-words leading-snug" title={reward.label}>
                            {reward.label}
                          </span>
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-gray-400">No reward set</div>
                      )}
                    </div>
                    <div className="shrink-0">
                      <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                        {Number(r.orders || 0).toLocaleString("en-IN")} orders
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <BottomNavigation />
    </div>
  )
}

