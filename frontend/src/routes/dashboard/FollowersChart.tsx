import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * A running total, not a per-day amount — drawn as a line rather than the
 * filled area RevenueChart uses, so the two read as different kinds of
 * quantity at a glance.
 *
 * Colours are tokens for the reason spelled out in RevenueChart: recharts has
 * no idea our palette exists, so its tooltip would stay a white card on a
 * near-black page.
 */
const shared = {
  tick: { fontSize: 12, fill: "var(--color-muted)" },
  tickLine: false,
  axisLine: false,
} as const;

const tooltip = {
  contentStyle: {
    background: "var(--color-card)",
    border: "1px solid var(--color-line)",
    borderRadius: 12,
    fontSize: 12,
    color: "var(--color-ink)",
  },
  labelStyle: { color: "var(--color-muted)" },
  itemStyle: { color: "var(--color-ink)" },
  cursor: { stroke: "var(--color-line)" },
} as const;

export function FollowersChart({ data }: { data: { name: string; followers: number }[] }) {
  return (
    <div className="h-full w-full pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="name"
            {...shared}
            interval={Math.max(0, Math.ceil(data.length / 6) - 1)}
          />
          <YAxis {...shared} allowDecimals={false} />
          <Tooltip {...tooltip} formatter={(value) => [value, "Followers"]} />
          <Line
            type="monotone"
            dataKey="followers"
            stroke="var(--color-chart)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
