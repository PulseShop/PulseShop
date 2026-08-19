import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Every colour here is a token, not a literal.
 *
 * Recharts draws into an SVG and its tooltip into a plain div, so none of it
 * inherits our palette on its own — left alone it paints a WHITE tooltip card
 * with dark text, floating over a near-black analytics page. The axis labels had
 * the same problem in reverse: a fixed grey-400 that is fine on white and muddy
 * on stone-950.
 *
 * SVG presentation attributes accept `var()`, which is what lets `stroke` and
 * `fill` take the same variables the rest of the app uses, and the tooltip is a
 * DOM node so inline styles reach it. Both then flip with the theme for free.
 * Matches the pattern already used by the admin revenue chart.
 */
const shared = {
  tick: { fontSize: 12, fill: "var(--color-muted)" },
  tickLine: false,
  axisLine: false,
} as const;

/** The floating popup. A card surface, a themed border, and ink text. */
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
  // The hover guideline, which is otherwise a hard-coded light grey.
  cursor: { stroke: "var(--color-line)" },
} as const;

export function RevenueChart({ data }: { data: { name: string; total: number }[] }) {
  return (
    <div className="h-full w-full pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            {/* The fill fades the series colour to nothing, so it tracks the
                theme's teal rather than the light theme's. */}
            <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-chart)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--color-chart)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="name" {...shared} />
          <YAxis {...shared} tickFormatter={(value) => `Ksh ${value}`} />
          <Tooltip {...tooltip} formatter={(value) => [`Ksh ${value ?? ""}`, "Revenue"]} />
          <Area
            type="monotone"
            dataKey="total"
            stroke="var(--color-chart)"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorTotal)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
