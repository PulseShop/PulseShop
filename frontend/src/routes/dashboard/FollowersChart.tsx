import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * A running total, not a per-day amount — drawn as a line rather than the
 * filled area RevenueChart uses, so the two read as different kinds of
 * quantity at a glance.
 */
export function FollowersChart({ data }: { data: { name: string; followers: number }[] }) {
  return (
    <div className="h-full w-full pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="name"
            stroke="#9ca3af"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            interval={Math.max(0, Math.ceil(data.length / 6) - 1)}
          />
          <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip formatter={(value) => [value, "Followers"]} />
          <Line type="monotone" dataKey="followers" stroke="#0d9488" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
