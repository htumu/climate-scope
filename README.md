## Climate Scope

Climate Scope is an interactive climate-risk and policy-readiness dashboard. It helps users compare countries by climate vulnerability, adaptation readiness, and governance capacity, then explore current climate-related news.

The project is designed around one question:

> Which countries face the greatest climate risk, how prepared are they, and what policy signals help explain the difference?

## Features

- **Risk map** — Explore ND-GAIN vulnerability, readiness, overall gain, and readiness dimensions by country and year.
- **Policy comparison scatter plot** — Compare vulnerability with readiness and use bubble size to represent another readiness metric.
- **Country focus** — Select or click a country in the scatter plot to highlight it while comparing it with the global context.
- **Climate news word map** — Explore recent climate-news topics and open related articles.
- **Country news panel** — Hover over or pin a country on the map to load recent climate-related coverage.

## Architecture

```text
ND-GAIN source CSV files
	|
	v
ND-GAIN processing script
	|
	v
Normalized country-year CSV
	|
	v
Flask API + in-memory caching
	|
	v
React + TypeScript + D3 frontend
```

The backend owns data loading, validation, normalization, and API responses. The frontend focuses on interactive maps and charts.

## Data

The current analytical dataset is ND-GAIN. The repository uses these aggregate files:

- Overall gain score
- Overall readiness
- Economic readiness
- Governance readiness
- Social readiness
- Vulnerability

The source files use a wide format with one column per year. The processing script converts them into a shared country-year format:

```text
country_code,country,year,gain,readiness,economic_readiness,governance_readiness,social_readiness,vulnerability
```

The processed dataset currently covers 192 countries and the years 1995–2024. Values are comparative index scores, not percentages. Vulnerability is interpreted as risk, where lower is generally better. Readiness metrics are interpreted as capacity, where higher is generally better.

## Project Layout

```text
backend/
  app.py
  routes/climate_data_routes.py
  services/nd_gain_service.py
  services/gdelt_service.py
  services/reliefweb_service.py
  scripts/process_nd_gain.py
  data/nd_gain_country_year.csv
frontend/
  src/components/ChoroplethMap.tsx
  src/components/BubbleScatterPlot.tsx
  src/components/NewsWordMap.tsx
```

## Local Setup

### Backend

Create and activate a virtual environment:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

The processed dataset is expected at:

```text
backend/data/nd_gain_country_year.csv
```

You can override the location in `backend/.env`:

```text
FLASK_RUN_PORT=5001
ND_GAIN_CSV_PATH=/absolute/path/to/nd_gain_country_year.csv
RELIEFWEB_APPNAME=your-approved-appname
CORS_ORIGINS=http://localhost:5173
```

Start Flask:

```bash
flask --app app run --debug
```

The backend runs at `http://127.0.0.1:5001` by default.

### Frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at the Vite development URL, normally `http://localhost:5173`.

## Processing ND-GAIN Files

Place the downloaded ND-GAIN folders in a directory containing:

```text
gain/gain.csv
readiness/readiness.csv
readiness/economic.csv
readiness/governance.csv
readiness/social.csv
vulnerability/vulnerability.csv
```

Then run the processing script from the project root:

```bash
python3 backend/scripts/process_nd_gain.py \
  --input-root "resources 2" \
  --output backend/data/nd_gain_country_year.csv
```

The script reshapes each wide CSV, validates `ISO3` and year keys, merges the metrics, and writes one normalized file for the API.

## API Endpoints

### ND-GAIN metadata

```text
GET /api/risk-meta
```

Returns available metrics, years, and metric-specific year availability.

### Risk map

```text
GET /api/risk-map?metric=vulnerability&year=2024
```

Supported metrics include:

```text
gain
readiness
economic_readiness
governance_readiness
social_readiness
vulnerability
```

The `year` parameter is optional and defaults to the latest available year.

### Risk scatter plot

```text
GET /api/risk-scatter?xMetric=vulnerability&yMetric=readiness&sizeMetric=governance_readiness&year=2024
```

The response contains country-level `x`, `y`, and `size` values. Reusing a metric for multiple roles is supported.

### Country climate news

```text
GET /api/climate-news?country=India&limit=5
```

This endpoint uses ReliefWeb reports and requires an approved `RELIEFWEB_APPNAME`. Cached results may be returned when the external service is unavailable.

### Climate news word map

```text
GET /api/climate-news-wordmap?timespan=24h&maxrecords=80&top=60
```

This endpoint uses GDELT to retrieve recent climate-related article titles and extract frequently occurring terms.

## Validation

Build the frontend:

```bash
cd frontend
npm run build
```

Test the backend endpoints with Flask's test client or a running server:

```text
GET /api/risk-meta
GET /api/risk-map?metric=vulnerability&year=2024
GET /api/risk-scatter?xMetric=vulnerability&yMetric=readiness&sizeMetric=vulnerability&year=2024
```

## Deployment Notes

The backend is configured to run on Heroku. The frontend uses `VITE_API_BASE_URL`, so it can be hosted separately and point to the Heroku backend.

### Deploy the backend to Heroku

From the project root:

```bash
heroku login
heroku create your-climate-scope-api
git push heroku main
```

Set the backend configuration variables:

```bash
heroku config:set RELIEFWEB_APPNAME=your-approved-appname
heroku config:set CORS_ORIGINS=https://your-frontend-domain.example
```

Check the API:

```bash
curl https://your-climate-scope-api.herokuapp.com/api/risk-meta
```

### Build the frontend

Create `frontend/.env.production` locally or configure the equivalent environment variable in the frontend hosting provider:

```text
VITE_API_BASE_URL=https://your-climate-scope-api.herokuapp.com
```

Then build:

```bash
cd frontend
npm run build
```

Before production deployment:

1. Use a production frontend host and set `VITE_API_BASE_URL` there.
2. Keep the normalized ND-GAIN CSV available to the deployed backend.
3. Restrict `CORS_ORIGINS` to the deployed frontend origin.
4. Do not commit `.env` files or service credentials.

No database is required for the current read-only dataset. PostgreSQL can be added later if the project gains user accounts, saved comparisons, scheduled updates, or larger data sources.

## Data Attribution

Document the official ND-GAIN source, GDELT, ReliefWeb, and any other data providers in the final portfolio version. Include retrieval dates and links when publishing the project.
