"""Generate a sales analytics report from the PulseShop database.

Pulls orders (with line items) and products from Supabase and prints a summary:
revenue, order counts, top products, orders by channel, and low-stock items.
Optionally writes the summary to JSON. Designed to be run ad-hoc or on a
schedule (cron / GitHub Actions) for daily reporting.

Usage:
    python analytics_report.py
    python analytics_report.py --merchant <merchant_uuid> --json report.json
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone

from _client import get_client


def build_report(orders: list[dict], products: list[dict]) -> dict:
    paid = [o for o in orders if o.get("payment_status") == "paid"]
    revenue = sum(o.get("total_kes", 0) for o in paid)

    units = defaultdict(lambda: {"units": 0, "revenue": 0})
    for o in orders:
        for it in o.get("order_items", []) or []:
            name = it.get("product_name", "?")
            units[name]["units"] += it.get("qty", 0)
            units[name]["revenue"] += it.get("line_total_kes", 0)
    top = sorted(units.items(), key=lambda kv: kv[1]["units"], reverse=True)[:5]

    channels: dict[str, int] = defaultdict(int)
    for o in orders:
        channels[o.get("channel", "direct")] += 1

    low_stock = [
        {"name": p.get("name"), "sku": p.get("sku"), "stock": p.get("stock_qty"), "status": p.get("status")}
        for p in products
        if p.get("status") in ("low", "out")
    ]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "orders_total": len(orders),
        "orders_paid": len(paid),
        "orders_pending": sum(1 for o in orders if o.get("payment_status") == "pending"),
        "revenue_kes": revenue,
        "avg_order_kes": round(revenue / len(paid)) if paid else 0,
        "top_products": [{"name": n, **v} for n, v in top],
        "orders_by_channel": dict(channels),
        "low_stock": low_stock,
    }


def print_report(r: dict) -> None:
    print("=" * 48)
    print("PulseShop — Sales Report")
    print(f"generated: {r['generated_at']}")
    print("=" * 48)
    print(f"Revenue (paid):  KES {r['revenue_kes']:,}")
    print(f"Orders:          {r['orders_total']}  (paid {r['orders_paid']}, pending {r['orders_pending']})")
    print(f"Avg order:       KES {r['avg_order_kes']:,}")
    print("\nTop products:")
    for i, p in enumerate(r["top_products"], 1):
        print(f"  {i}. {p['name']:<28} {p['units']:>4} sold   KES {p['revenue']:,}")
    if not r["top_products"]:
        print("  (no sales yet)")
    print("\nOrders by channel:")
    for ch, n in r["orders_by_channel"].items():
        print(f"  {ch:<12} {n}")
    if r["low_stock"]:
        print("\nLow / out of stock:")
        for p in r["low_stock"]:
            print(f"  {p['name']:<28} {p['stock']:>3}  ({p['status']})")
    print("=" * 48)


def main() -> None:
    ap = argparse.ArgumentParser(description="PulseShop analytics report.")
    ap.add_argument("--merchant", help="Limit to one merchant UUID.")
    ap.add_argument("--json", help="Also write the report to this JSON file.")
    args = ap.parse_args()

    client = get_client()

    orders_q = client.table("orders").select("*, order_items(*)")
    products_q = client.table("products").select("*")
    if args.merchant:
        orders_q = orders_q.eq("merchant_id", args.merchant)
        products_q = products_q.eq("merchant_id", args.merchant)

    orders = orders_q.execute().data or []
    products = products_q.execute().data or []

    report = build_report(orders, products)
    print_report(report)

    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2)
        print(f"\nJSON written to {args.json}")


if __name__ == "__main__":
    main()
