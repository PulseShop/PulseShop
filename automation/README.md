# PulseShop automation

Python scripts for image processing and sales reporting against the PulseShop
Supabase backend. Meant to run server-side or on a schedule — they use the
**service role** key, which bypasses RLS and must never be exposed to the frontend.

## Setup

```bash
cd automation
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env   # then fill in SUPABASE_URL and SUPABASE_SERVICE_KEY
```

Find the service role key in Supabase → Project Settings → API (keep it secret).

## Image processor

Optimizes (auto-orient + resize + JPEG) a folder of photos and uploads them to
the public `media` bucket, printing the public URLs and writing a CSV.

```bash
python image_processor.py --input ./photos --merchant <merchant_uuid>
# options: --folder products --max-size 1200 --quality 82 --out urls.csv
```

Paste the resulting URLs into a product's images (or feed the CSV to a future
bulk product importer).

## Analytics report

Prints revenue, order counts, top products, channel breakdown, and low-stock
items; optionally writes JSON.

```bash
python analytics_report.py                       # whole store
python analytics_report.py --merchant <uuid>     # one merchant
python analytics_report.py --json report.json    # also save JSON
```

### Scheduling (example: daily at 6am via cron)

```cron
0 6 * * *  cd /path/to/PulseShop/automation && ./.venv/bin/python analytics_report.py --json /var/log/pulseshop/report.json
```

## Notes

- These reuse the same `media` bucket and schema as the app, so uploaded images
  are immediately usable and reports reflect live data.
- `.env` is gitignored; only `.env.example` is committed.
