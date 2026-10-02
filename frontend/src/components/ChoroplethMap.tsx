import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { formatMetric } from "../utils";
import { apiUrl } from "../api";

type ClimatePoint = {
  country: string;
  value: number;
};

type ClimateMeta = {
  years: number[];
  metrics: string[];
  metricYears?: Record<string, number[]>;
  defaultMetric: string | null;
};

type ClimateMapResponse = {
  records: ClimatePoint[];
};

type TooltipState = {
  x: number;
  y: number;
  country: string;
  value: number | null;
};

type NewsArticle = {
  title: string;
  url: string;
  source?: string | null;
  date?: string | null;
};

type NewsResponse = {
  country: string;
  articles: NewsArticle[];
  warning?: string;
};

type WorldFeature = GeoJSON.Feature<GeoJSON.Geometry, { name?: string }>;
type WorldCollection = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  { name?: string }
>;

const COUNTRY_ALIASES: Record<string, string> = {
  USA: "United States",
  Russia: "Russian Federation",
  Bolivia: "Bolivia, Plurinational State of",
  "Democratic Republic of the Congo": "Congo, the Democratic Republic o",
  "Republic of the Congo": "Congo",
  Laos: "Lao People's Democratic Republic",
  Libya: "Libyan Arab Jamahiriya",
  Venezuela: "Venezuela, Bolivarian Republic o",
  Vietnam: "Viet Nam",
  "United Republic of Tanzania": "Tanzania, United Republic of",
  Iran: "Iran, Islamic Republic of",
  Syria: "Syrian Arab Republic",
  "Macedonia, the former Yugoslav Republic of": "North Macedonia",
  "North Korea": "Korea, Democratic People's Repub",
  "South Korea": "Korea, Republic of",
};

function canonicalCountryName(country: string): string {
  return COUNTRY_ALIASES[country] ?? country;
}

function toDataMap(records: ClimatePoint[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of records) {
    if (typeof row.country === "string" && Number.isFinite(row.value)) {
      map.set(canonicalCountryName(row.country), Number(row.value));
    }
  }
  return map;
}

function isClimateMeta(value: unknown): value is ClimateMeta {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ClimateMeta>;
  return Array.isArray(candidate.years) && Array.isArray(candidate.metrics);
}

function isClimateMapResponse(value: unknown): value is ClimateMapResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ClimateMapResponse>;
  return Array.isArray(candidate.records);
}

function isNewsResponse(value: unknown): value is NewsResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<NewsResponse>;
  return typeof candidate.country === "string" && Array.isArray(candidate.articles);
}

function formatMetricValue(value: number, metric: string): string {
  const metricLower = metric.toLowerCase();
  const looksPercentLike =
    metricLower.includes("percent") ||
    metricLower.includes("growth") ||
    metricLower.includes("ratio") ||
    metricLower.includes("share");

  if (looksPercentLike) {
    return d3.format(".2f")(value);
  }

  const abs = Math.abs(value);
  if (abs >= 1000) {
    return d3.format(",.0f")(value);
  }
  return d3.format(".2f")(value);
}

function ChoroplethMap() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [meta, setMeta] = useState<ClimateMeta | null>(null);
  const [metric, setMetric] = useState<string>("");
  const [year, setYear] = useState<number | null>(null);
  const [mapRecords, setMapRecords] = useState<ClimatePoint[]>([]);
  const [world, setWorld] = useState<WorldCollection | null>(null);
  const [error, setError] = useState<string>("");
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const [pinnedCountry, setPinnedCountry] = useState<string | null>(null);
  const selectedCountry = pinnedCountry;
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState("");
  const [newsWarning, setNewsWarning] = useState("");
  const newsCacheRef = useRef<Map<string, { articles: NewsArticle[]; warning: string }>>(
    new Map(),
  );

  const colorScaleInfo = useMemo(() => {
    const values = mapRecords
      .map((r) => r.value)
      .filter((v) => Number.isFinite(v));

    if (!values.length) {
      const fallback = d3
        .scaleSequential(d3.interpolateYlOrRd)
        .domain([0, 1])
        .clamp(true);
      return {
        colorFor: (v: number) => fallback(v),
        legendMin: 0,
        legendMax: 1,
        legendMode: "Linear scale",
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const q05 = d3.quantileSorted(sorted, 0.05) ?? min;
    const q50 = d3.quantileSorted(sorted, 0.5) ?? q05;
    const q95 = d3.quantileSorted(sorted, 0.95) ?? max;

    const positive = sorted.filter((v) => v > 0);
    const mostlyPositive = positive.length >= sorted.length * 0.95;
    const skewRatio = q50 > 0 ? q95 / q50 : Number.POSITIVE_INFINITY;
    const useLog = mostlyPositive && skewRatio >= 8 && max > 0;

    if (useLog) {
      const smallestPositive = positive[0] ?? 1e-6;
      const domainMin = Math.max(q05, smallestPositive);
      const domainMax = Math.max(q95, domainMin * 1.01);
      const scale = d3
        .scaleSequentialLog(d3.interpolateYlOrRd)
        .domain([domainMin, domainMax])
        .clamp(true);

      return {
        colorFor: (v: number) => scale(v > 0 ? v : domainMin),
        legendMin: domainMin,
        legendMax: domainMax,
        legendMode: "Log scale (5th-95th percentile)",
      };
    }

    const domainMin = q05;
    const domainMax = Math.max(q95, domainMin + 1e-9);
    const scale = d3
      .scaleSequential(d3.interpolateYlOrRd)
      .domain([domainMin, domainMax])
      .clamp(true);

    return {
      colorFor: (v: number) => scale(v),
      legendMin: domainMin,
      legendMax: domainMax,
      legendMode: "Linear scale (5th-95th percentile)",
    };
  }, [mapRecords]);

  const availableYears = useMemo(() => {
    if (!meta) return [] as number[];
    const perMetricYears = metric ? meta.metricYears?.[metric] : undefined;
    if (Array.isArray(perMetricYears) && perMetricYears.length > 0) {
      return perMetricYears;
    }
    return meta.years ?? [];
  }, [meta, metric]);

  const selectedValue = useMemo(() => {
    if (!selectedCountry) return null;
    return toDataMap(mapRecords).get(selectedCountry) ?? null;
  }, [mapRecords, selectedCountry]);

  useEffect(() => {
    if (!selectedCountry) {
      setNewsArticles([]);
      setNewsLoading(false);
      setNewsError("");
      setNewsWarning("");
      return;
    }

    const country = selectedCountry;

    const cached = newsCacheRef.current.get(country);
    if (cached) {
      setNewsArticles(cached.articles);
      setNewsWarning(cached.warning);
      setNewsError("");
      setNewsLoading(false);
      return;
    }

    const controller = new AbortController();
    setNewsLoading(true);
    setNewsArticles([]);
    setNewsError("");
    setNewsWarning("");

    async function loadCountryNews() {
      try {
        const url = apiUrl(`/api/climate-news?country=${encodeURIComponent(country)}&limit=4`);
        const response = await fetch(url, { signal: controller.signal });
        const raw: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = (raw as { error?: unknown } | null)?.error;
          throw new Error(typeof message === "string" ? message : "Unable to load country reporting");
        }
        if (!isNewsResponse(raw)) throw new Error("Unexpected country reporting response");

        const warning = raw.warning ?? "";
        newsCacheRef.current.set(country, { articles: raw.articles, warning });
        setNewsArticles(raw.articles);
        setNewsWarning(warning);
      } catch (error) {
        if (controller.signal.aborted) return;
        setNewsError(error instanceof Error ? error.message : "Unable to load country reporting");
      } finally {
        if (!controller.signal.aborted) setNewsLoading(false);
      }
    }

    loadCountryNews();
    return () => controller.abort();
  }, [selectedCountry]);

  useEffect(() => {
    let cancelled = false;

    async function loadMetaAndMap() {
      try {
        const [metaRes, worldRes] = await Promise.all([
          fetch(apiUrl("/api/risk-meta")),
          d3.json<WorldCollection>(
            "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson",
          ),
        ]);

        if (!metaRes.ok) {
          throw new Error("Failed to load /api/risk-meta");
        }

        const metaRaw: unknown = await metaRes.json();
        if (!isClimateMeta(metaRaw)) {
          throw new Error("Unexpected response shape from /api/risk-meta");
        }

        const metaJson = metaRaw;
        if (!cancelled) {
          setMeta(metaJson);
          const initialMetric =
            metaJson.defaultMetric ||
            metaJson.metrics?.[0] ||
            "";
          setMetric(initialMetric);

          const initialYears =
            (initialMetric && metaJson.metricYears?.[initialMetric]) ||
            metaJson.years ||
            [];
          setYear(
            initialYears.length ? initialYears[initialYears.length - 1] : null,
          );
        }

        if (!cancelled) {
          setWorld(worldRes ?? null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to load map metadata",
          );
        }
      }
    }

    loadMetaAndMap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!availableYears.length) {
      if (year !== null) {
        setYear(null);
      }
      return;
    }

    if (year === null || !availableYears.includes(year)) {
      setYear(availableYears[availableYears.length - 1]);
    }
  }, [availableYears, year]);

  useEffect(() => {
    if (!metric || year === null) return;

    let cancelled = false;

    async function loadMapValues() {
      try {
        const url = apiUrl(`/api/risk-map?metric=${encodeURIComponent(metric)}&year=${year}`);
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error("Failed to load /api/risk-map");
        }
        const rawData: unknown = await res.json();
        if (!isClimateMapResponse(rawData)) {
          throw new Error("Unexpected response shape from /api/risk-map");
        }

        const data = rawData;
        if (!cancelled) {
          setMapRecords(Array.isArray(data.records) ? data.records : []);
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to load map values",
          );
          setMapRecords([]);
        }
      }
    }

    loadMapValues();
    return () => {
      cancelled = true;
    };
  }, [metric, year]);

  useEffect(() => {
    if (!svgRef.current || !world) return;

    const width = 980;
    const height = 560;
    const svg = d3.select(svgRef.current);

    svg.selectAll("*").remove();
    svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const projection = d3.geoNaturalEarth1().fitSize([width, height], world);
    const path = d3.geoPath(projection);
    const dataMap = toDataMap(mapRecords);

    const countryPaths = svg
      .append("g")
      .selectAll("path")
      .data(world.features as WorldFeature[])
      .join("path")
      .attr("d", (d) => path(d) ?? "")
      .attr("fill", (d) => {
        const name = d.properties?.name ?? "";
        const val = dataMap.get(canonicalCountryName(name));
        return typeof val === "number"
          ? colorScaleInfo.colorFor(val)
          : "#d9d9d9";
      })
      .attr("stroke", "rgba(15, 23, 42, 0.55)")
      .attr("stroke-width", 0.6);

    countryPaths
      .on("click", (_event: MouseEvent, d) => {
        const countryName = canonicalCountryName(d.properties?.name ?? "");
        if (!countryName) return;
        setPinnedCountry((prev) => (prev === countryName ? null : countryName));
      })
      .on("mousemove", (event: MouseEvent, d) => {
        const countryName = canonicalCountryName(d.properties?.name ?? "Unknown");
        const val = dataMap.get(countryName);
        setTooltip({
          x: event.clientX,
          y: event.clientY,
          country: countryName,
          value: typeof val === "number" ? val : null,
        });
      })
      .on("mouseleave", () => {
        setTooltip(null);
      });
  }, [world, mapRecords, colorScaleInfo]);

  return (
    <div className="choropleth-layout">
      <div className="choropleth-map-area">
        <h2>Where climate pressure is concentrated</h2>
        <p className="analysis-subtitle">Darker areas indicate higher values for the selected metric and year.</p>
        {error ? (
          <p style={{ color: "#b00020", margin: "0 0 8px" }}>{error}</p>
        ) : null}
        <div className="choropleth-map-frame">
          <svg ref={svgRef} className="choropleth-map-svg" />
        </div>
      </div>

      <div className="map-sidebar">
        <h3>Controls</h3>

        <label>
          Metric
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            disabled={!meta}
          >
            {(meta?.metrics ?? []).map((m) => (
              <option key={m} value={m}>
                {formatMetric(m)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Year
          <select
            value={year ?? ""}
            onChange={(e) => setYear(Number(e.target.value))}
            disabled={!meta || availableYears.length === 0}
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <div>
          <div className="legend-label">
            {metric ? formatMetric(metric) : "Metric"} ({year ?? "latest"})
          </div>
          <div className="legend-bar" />
          <div className="legend-range">
            <span>{formatMetricValue(colorScaleInfo.legendMin, metric)}</span>
            <span>{formatMetricValue(colorScaleInfo.legendMax, metric)}</span>
          </div>
          <div className="legend-note">
            {colorScaleInfo.legendMode}. Gray = missing data
          </div>
        </div>

        <div className="map-insight-panel">
          <p className="map-insight-panel__kicker">Country focus</p>
          <h3 className="map-insight-panel__title">
            {selectedCountry ?? "Select a country"}
          </h3>
          {selectedCountry ? (
            <>
              <div className="map-insight-value">
                {selectedValue === null ? "No data" : formatMetricValue(selectedValue, metric)}
                <span>{formatMetric(metric)}</span>
              </div>
              <p className="map-insight-copy">
                {metric === "vulnerability"
                  ? selectedValue === null
                    ? "This country has no value for the selected year."
                    : selectedValue >= colorScaleInfo.legendMax * 0.7
                      ? "This sits in the higher-risk end of the current global distribution."
                      : "This sits below the higher-risk end of the current global distribution."
                  : "Use this score as a comparison point, then check readiness in the gap view."}
              </p>
              <button
                type="button"
                className="map-clear-btn"
                onClick={() => setPinnedCountry(null)}
              >
                Clear selection
              </button>
              <div className="country-news">
                <div className="country-news__header">
                  <span>Recent reporting</span>
                  {newsLoading ? <span>Loading...</span> : null}
                </div>
                {newsWarning ? <p className="country-news__status">{newsWarning}</p> : null}
                {newsError ? <p className="country-news__status country-news__status--error">{newsError}</p> : null}
                {!newsLoading && !newsError && newsArticles.length === 0 ? (
                  <p className="country-news__status">No recent climate reports found.</p>
                ) : null}
                <ul className="country-news__list">
                  {newsArticles.map((article) => (
                    <li key={article.url}>
                      <a href={article.url} target="_blank" rel="noreferrer">{article.title}</a>
                      {article.source ? <small>{article.source}</small> : null}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <>
              <p className="map-insight-copy">
                Hover for a quick value. Click once to hold a country here while you read the map.
              </p>
              <div className="country-news country-news--empty">
                <div className="country-news__header">Country reporting</div>
                <p className="country-news__status">Click a country to see recent climate reports here.</p>
              </div>
            </>
          )}
        </div>
      </div>

      {tooltip ? (
        <div
          style={{
            position: "fixed",
            left: tooltip.x + 14,
            top: tooltip.y + 14,
            pointerEvents: "none",
            background: "#ffffff",
            color: "#1f2937",
            padding: "8px 10px",
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.4,
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            border: "1px solid #e5e7eb",
            zIndex: 10,
          }}
        >
          <div style={{ fontWeight: 600 }}>{tooltip.country}</div>
          <div>
            {tooltip.value === null
              ? "No data"
              : formatMetricValue(tooltip.value, metric)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ChoroplethMap;
