import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import BottomNavigation from "../components/BottomNavigation"
import { hotelAPI } from "@/lib/api"
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

export default function PastWinners() {
  const navigate = useNavigate()
  const [key, setKey] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const monthOptions = useMemo(() => {
    const now = new Date()
    const opts = []
    for (let i = 1; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const yy = String(d.getFullYear())
      const mm = String(d.getMonth() + 1).padStart(2, "0")
      const k = `${yy}-${mm}`
      const label = d.toLocaleString("en-IN", { month: "long", year: "numeric" })
      opts.push({ key: k, label })
    }
    return opts
  }, [])

  const load = async (k) => {
    const kk = String(k || "").trim()
    if (!kk) return
    setLoading(true)
    setError(null)
    try {
      const res = await hotelAPI.getLeaderboardHistory({ key: kk })
      setData(res?.data?.data || null)
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to load past winners")
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const defaultKey = monthOptions?.[0]?.key || ""
    setKey(defaultKey)
    if (defaultKey) load(defaultKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthOptions])

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b">
        <div className="mx-auto max-w-5xl px-3 py-4">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-900 text-white">
              <Trophy className="h-5 w-5 text-yellow-400" />
            </div>
            <div className="mt-2">
              <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Leaderboard</div>
              <div className="text-xl font-bold text-gray-900">Past Winners</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <select
              value={key}
              onChange={(e) => {
                const k = e.target.value
                setKey(k)
                load(k)
              }}
              className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900"
            >
              {monthOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => navigate("/hotel/leaderboard")}
              className="h-10 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-800 shadow-sm"
            >
              Current leaderboard
            </button>
          </div>

          {data?.range ? (
            <div className="mt-2 text-center text-xs text-gray-500">{formatRangeLabel(data.range)}</div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-3 py-5">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="py-14 text-center text-sm text-gray-500">Loading...</div>
        ) : data?.rows?.length ? (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            {data.rows.map((r) => {
              const badge = getBadge(r.rank)
              const reward = r.reward
              return (
                <div
                  key={`${r.hotelMongoId || r.hotelId || r.hotelName}-${r.rank}`}
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
                    {reward?.type === "gift" ? (
                      <div className="mt-1 flex min-w-0 items-center gap-2">
                        {reward.imageUrl ? (
                          <img
                            src={reward.imageUrl}
                            alt={reward.label}
                            className="h-6 w-6 rounded-lg object-cover ring-1 ring-gray-200"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-6 w-6 rounded-lg bg-gray-100 ring-1 ring-gray-200" />
                        )}
                        <span className="text-xs font-semibold text-gray-600 whitespace-normal break-words leading-snug" title={reward.label}>
                          {reward.label}
                        </span>
                      </div>
                    ) : reward?.type === "discount" ? (
                      <div className="mt-1 text-xs font-semibold text-emerald-700">{reward.label}</div>
                    ) : (
                      <div className="mt-1 text-xs text-gray-400">No reward set</div>
                    )}
                  </div>
                  <div className="shrink-0">
                    <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 blur-sm select-none">
                      {Number(r.orders || 0).toLocaleString("en-IN")} orders
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="py-14 text-center text-sm text-gray-500">No history found for this month.</div>
        )}
      </div>

      <BottomNavigation />
    </div>
  )
}

