"""Build dashboard/index.html from data/hr_analytics_dataset_cleaned.xlsx.

Usage:  python scripts/build_dashboard.py [path/to/workbook.xlsx]
The workbook rows, Chart.js, SheetJS, CSS and app code are inlined into one
self-contained HTML file, so it opens with a plain double-click.
Author: Deepa M
"""
import json
import os
import sys

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "data", "hr_analytics_dataset_cleaned.xlsx")
SRC = os.path.join(ROOT, "dashboard", "src")
VENDOR = os.path.join(ROOT, "scripts", "vendor")


def read(*p):
    with open(os.path.join(*p), encoding="utf-8") as f:
        return f.read()


# Dates become ISO strings, blanks become null so JSON stays clean
df = pd.read_excel(XLSX)
for col in df.select_dtypes("datetime").columns:
    df[col] = df[col].dt.strftime("%Y-%m-%d")
df = df.astype(object).where(df.notna(), None)
data = json.dumps(df.to_dict("records"), ensure_ascii=False, default=lambda o: o.item())

# Keep a standalone copy of the data for reference
with open(os.path.join(ROOT, "dashboard", "data.js"), "w", encoding="utf-8") as f:
    f.write("window.HR_DATA = " + data + ";\n")

html = read(SRC, "template.html")
for marker, text in [("/*__CHARTJS__*/", read(VENDOR, "chart.umd.js")),
                     ("/*__XLSX__*/", read(VENDOR, "xlsx.full.min.js")),
                     ("/*__DATA__*/", data),
                     ("/*__CSS__*/", read(SRC, "style.css")),
                     ("/*__APP__*/", read(SRC, "app.js"))]:
    html = html.replace(marker, text)

out = os.path.join(ROOT, "dashboard", "index.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print(f"Built {out} ({len(df)} employees)")
