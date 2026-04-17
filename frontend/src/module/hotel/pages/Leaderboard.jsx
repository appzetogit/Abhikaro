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
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-900 text-white">
              <Trophy className="h-5 w-5" />
            </div>
            <div className="mt-2">
              <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Leaderboard</div>
              <div className="text-xl font-bold text-gray-900">Hotels Ranking</div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-center gap-2">
            <div className="inline-flex rounded-xl bg-gray-100 p-1">
              <button
                className={cn("rounded-lg px-3 py-2 text-sm font-semibold", tab === "month" ? "bg-white shadow" : "text-gray-600")}
                onClick={() => setTab("month")}
              >
                This month
              </button>
              <button
                className={cn("rounded-lg px-3 py-2 text-sm font-semibold", tab === "6months" ? "bg-white shadow" : "text-gray-600")}
                onClick={() => setTab("6months")}
              >
                6 months
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-5">
        {active.loading ? (
          <LeaderboardList rows={[]} loading={true} />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            {(active.payload?.top || []).map((r) => {
              const badge = getBadge(r.rank)
              const reward = getRewardForRank(r.rank)
              return (
                <div
                  key={r.hotelMongoId || r.hotelName}
                  className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0"
                >
                  <div className="w-10 shrink-0 text-center">
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
                        <span
                          className="text-xs font-semibold text-gray-600 whitespace-normal break-words leading-snug"
                          title={reward.label}
                        >
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

        <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Your rank</div>
          {active.loading ? (
            <div className="mt-2 text-sm text-gray-500">Loading...</div>
          ) : active.payload?.me ? (
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-base font-semibold text-gray-900">
                  Rank #{active.payload.me.rank}
                </div>
                <div className="truncate text-xs text-gray-500">
                  {active.payload.me.hotelName}
                </div>
                {(() => {
                  const reward = getRewardForRank(active.payload.me.rank)
                  if (!reward) return null
                  return (
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
                      <span
                        className="text-xs font-semibold text-gray-600 whitespace-normal break-words leading-snug"
                        title={reward.label}
                      >
                        {reward.label}
                      </span>
                    </div>
                  )
                })()}
              </div>
              <div className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                {Number(active.payload.me.orders || 0).toLocaleString("en-IN")} orders
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-gray-500">Not available.</div>
          )}
        </div>
      </div>

      <BottomNavigation />
    </div>
  )
}

