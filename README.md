# HR Analytics Dashboard

An interactive HR analytics dashboard built from `data/hr_analytics_dataset_cleaned.xlsx` (200 employees, 6 departments, 12 cities).

**Created by Deepa M** · [LinkedIn](https://www.linkedin.com/in/deepa-m-681b57203)

## Open the dashboard

Double-click `dashboard/index.html`. No server, install or internet connection is needed for the charts (fonts load online when available).

## What you can do

- Filter by department, gender, city, status (active or left) and overtime.
- Click any department bar, city bar or gender slice to cross-filter every chart. Click again, or use the chips at the top, to clear.
- Switch the attrition chart between drivers: overtime, satisfaction, work-life balance, rating, promotions, age, salary, commute, education, marital status and city.
- Search, sort and page through employees, each with a rule-based attrition risk score and the reasons behind it.
- Download the filtered rows as CSV.
- Click **Load Excel file** to refresh the dashboard from any workbook with the same 21 columns.

## Sections

Summary (auto insights and 12 KPIs), Workforce, Pay, Attrition, Performance and engagement, Employees.

## Rebuild after changing the Excel file

```bash
pip install -r requirements.txt
python scripts/build_dashboard.py            # uses data/hr_analytics_dataset_cleaned.xlsx
python scripts/build_dashboard.py my_file.xlsx   # or point to another workbook
```

## Project structure

```
data/hr_analytics_dataset_cleaned.xlsx   source data
dashboard/index.html                     built, self-contained dashboard
dashboard/src/                           template.html, style.css, app.js (edit these)
scripts/build_dashboard.py               embeds data, charts and code into index.html
scripts/vendor/                          Chart.js and SheetJS, bundled for offline use
.github/workflows/deploy-pages.yml       optional GitHub Pages deploy
```

## Notes

Salaries are monthly figures in rupees. The risk score is a transparent rule set (overtime, low satisfaction, poor work-life balance, long commute, no promotion in 3+ years, pay below department median, low training), meant for exploration rather than prediction.
