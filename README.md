# Crop Intelligence Dashboard

A one-page global crop-weather intelligence demo. The dashboard visualizes crop stress, drought stress, and heat anomalies from continent to country and ADM1 level across a 28-day horizon.

Live demo: https://crop-intelligence-dashboard.vercel.app

## Forecast design

The intended operational pipeline separates the fetched forecast from the learned extension:

1. Fetch weather forecasts for days 1–14.
2. Preserve every available provider value unchanged.
3. Reconstruct only missing values inside days 1–14.
4. Combine the completed 14-day window with historical ERA5 weather.
5. Predict days 15–28 with a lead-specific ensemble.
6. Attach source, lead time, confidence, and model version to every value.

The days 15–28 ensemble blends a learned nonlinear model with day-14 persistence. Blend weights are selected independently for each lead day on an earlier validation period and then frozen before testing.

## Data sources

### ERA5

- ECMWF ERA5 weather data from 1960–2025.
- Monthly global history at 0.25° resolution for temperature, surface soil moisture, and wind.
- Hourly 2018 ERA5 data, aggregated to daily agricultural-location truth, for the 28-day replay test.
- ERA5 is used as historical context and verification truth. It is not presented as a live forecast.

Source: https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels

### Crop production

- FAOSTAT annual crop yields.
- The crop-loss target is yield shortfall relative to a trailing five-year median.
- Country–crop history and all target-derived priors are calculated strictly from years preceding each test year.

Source: https://www.fao.org/faostat/en/#data/QCL

### Crop calendars

- GGCMI Phase 3 planting and maturity calendars.
- Static 0.5° calendars for 18 crops, separated into rainfed and irrigated systems.
- Growing seasons that cross New Year are assigned to the appropriate FAO harvest year.

Source: https://doi.org/10.5281/zenodo.5062513

### Agricultural geography

- Crop-specific harvested-area grids select agricultural weather sample points instead of country centroids.
- Natural Earth country and ADM1 boundaries support the geographic interface.
- Antarctica is explicitly excluded from all crop layers and aggregation.

Source: https://www.naturalearthdata.com/

### Live forecast demo

- Open-Meteo supplies the current daily forecast records used by the deployed ingestion demonstration.
- The refresh runs daily on Vercel.
- The current deployment samples representative agricultural regions; exhaustive global ADM1 ingestion remains future work.

Source: https://open-meteo.com/

## Models

### Days 1–14 gap reconstruction

Only missing provider values are filled. The ERA5 replay hides three observations inside each 14-day window and reconstructs them from neighboring available horizon values. The baseline is persistence from the last value before the window.

### Days 15–28 extension

Inputs include:

- recent ERA5 history;
- lagged values and rolling statistics;
- the completed days 1–14 forecast vector;
- forecast-window mean, variability, endpoint, and trend;
- day-of-year seasonality;
- requested lead day.

A `HistGradientBoostingRegressor` learns the nonlinear extension. Its output is blended with day-14 persistence using lead-specific weights selected on a validation month.

### Confidence

The current confidence score is a held-out relative skill measure:

```text
100 × baseline MAE / (baseline MAE + model MAE)
```

A score of 50 means performance equal to day-14 persistence; greater than 50 indicates improvement. The report also records the held-out 80th-percentile absolute error. This is not a probability of a weather event.

## Real-data replay results

The structural replay uses ERA5 daily observations from 2018. Training ends in July, August selects lead-specific blend weights, and September onward is untouched test data.

| Component | Variable | MAE improvement vs persistence |
|---|---|---:|
| Days 1–14 gap fill | Temperature | 58.6% |
| Days 1–14 gap fill | Precipitation | 39.2% |
| Days 1–14 gap fill | Wind | 46.6% |
| Days 15–28 extension | Temperature | 8.4% |
| Days 15–28 extension | Precipitation | 4.0% |
| Days 15–28 extension | Wind | 7.7% |

The days 1–14 replay uses ERA5 observations as a proxy for an issued provider forecast. It validates the pipeline structure but does not measure provider forecast bias. Provider-specific calibration begins after issued forecasts and their later ERA5 truth have accumulated.

## Daily storage and retraining

The protected Vercel cron endpoint fetches forecasts daily and appends them to a DuckDB archive. Because Vercel functions have ephemeral local filesystems, the DuckDB file is persisted in a private Vercel Blob store after every successful refresh.

Stored fields include:

- issue time and valid date;
- lead day;
- ISO3 and ADM1;
- coordinates and variable;
- raw, filled, and extended values;
- confidence and source;
- model version.

This archive provides forecast–truth pairs for later bias correction and retraining.

## Why these libraries were used

### Next.js and React

- **Next.js** provides the one-page frontend, server-side API routes, Vercel deployment integration, and scheduled-function support in one project.
- **React** manages interactive map scope, crop, hazard, country, ADM1, and forecast-day state without full page reloads.
- The dashboard remains a single screen while its controls update the same shared geographic state.

### D3 Geo, TopoJSON, and World Atlas

- **D3 Geo** projects geographic coordinates and converts country/ADM1 features into map paths.
- **TopoJSON Client** decodes compact boundary topology into GeoJSON features in the browser.
- **World Atlas** supplies a lightweight global country topology suitable for a fast choropleth.
- These libraries were selected instead of a full tiled-map platform because the demo needs analytical region selection and coloring, not street-level navigation.

### Natural Earth

- Natural Earth provides public-domain country and ADM1 geometry with consistent international coverage and manageable download size.
- It keeps the demo independent of commercial map tokens and avoids exposing a map-provider API key in browser code.

### DuckDB

- DuckDB stores typed weather history in a single analytical database file.
- It handles append-heavy forecast archives and later time-series/model-training queries without requiring a separate database server.
- The same file can be downloaded for local Python analysis and retraining.
- Since Vercel function disks are ephemeral, the file is copied to temporary storage only during a refresh and then written back to private durable object storage.

### Vercel Blob

- Vercel Blob provides durable private storage for the DuckDB file across serverless executions.
- It was chosen because a DuckDB file cannot safely persist on Vercel's temporary function filesystem.
- Access credentials remain server-side environment variables and are never sent to the browser.

### Polars

- Polars performs lazy, streaming scans over the multi-gigabyte ERA5 Parquet data.
- Predicate and projection pushdown prevent loading the full global weather table into memory.
- It is used for spatial point filtering and daily/monthly aggregation before data enters the smaller modeling tables.

### pandas and NumPy

- **pandas** handles the smaller country–crop–year panels and rolling historical features used by scikit-learn.
- **NumPy** provides deterministic numerical transforms, lag vectors, interpolation, clipping, and confidence calculations.
- They remain useful after Polars has reduced the raw weather archive to model-scale data.

### scikit-learn

- `HistGradientBoostingRegressor` captures nonlinear relationships without requiring a large neural-network training system.
- It supports missing numerical values, regularization, sample weighting, and reproducible training.
- Its relatively small artifact and CPU requirements fit both rolling backtests and periodic retraining.

### Xarray and NetCDF4

- **Xarray** reads the GGCMI gridded planting and maturity calendars with named latitude/longitude coordinates.
- **NetCDF4** supplies the underlying reader for the official `.nc4` calendar files.
- Nearest-grid selection aligns crop calendars with agricultural ERA5 sampling points.

### Joblib

- Joblib serializes trained scikit-learn models together with feature definitions and model metadata.
- This keeps the exact selected feature order attached to the saved model and supports reproducible local inference.

### Open-Meteo

- Open-Meteo provides a simple forecast endpoint for the deployed ingestion demonstration without placing an API key in client code.
- Forecast fetching still occurs server-side so provider responses can be archived consistently and replaced by another provider later.

## Current status

This repository is a working public demo, not an operational agricultural warning service. The interface includes illustrative risk visualization, while the daily ingestion and private DuckDB archive are live. Global ADM1 forecast ingestion, provider hindcast calibration, and production monitoring remain required before operational use.
