from flask import Blueprint, jsonify, request
from services.reliefweb_service import reliefweb_service
from services.gdelt_service import extract_top_words, gdelt_service
from services.nd_gain_service import nd_gain_service
from services.worldbank_service import worldbank_service

climate_data_bp = Blueprint("climate_data_bp", __name__)


def _get_limit_arg(default: str = "100") -> int:
    limit = request.args.get("limit", default)
    try:
        limit_int = int(limit)
    except ValueError:
        raise ValueError("limit must be an integer")
    return max(1, min(limit_int, 500))


def _get_worldbank_data_response():
    worldbank_df = worldbank_service.get_climate_change_data()
    limit_int = _get_limit_arg("100")
    records = worldbank_df.head(limit_int).to_dict(orient="records")
    return jsonify(records), 200


def _get_worldbank_meta_response():
    return jsonify(worldbank_service.get_climate_meta()), 200


def _get_worldbank_map_response():
    metric = request.args.get("metric")
    if not metric:
        return jsonify({"error": "Missing required query param: metric"}), 400

    agg = (request.args.get("agg") or "mean").lower()
    if agg not in {"mean", "median", "sum", "min", "max"}:
        return (
            jsonify({"error": "agg must be one of: mean, median, sum, min, max"}),
            400,
        )

    year_raw = request.args.get("year")
    if year_raw is None or year_raw == "":
        year_val = None
    else:
        try:
            year_val = int(year_raw)
        except ValueError:
            return jsonify({"error": "year must be an integer"}), 400

    worldbank_df = worldbank_service.get_climate_change_data()
    if metric in worldbank_df.columns:
        try:
            payload = worldbank_service.get_climate_map(metric, year=year_val, agg=agg)
            return jsonify(payload), 200
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

    return jsonify({"error": f"Unknown metric: {metric}"}), 400


@climate_data_bp.route("/api/climate-data")
def get_climate_data():
    """
    API endpoint to get climate change data.
    Returns a JSON array of records (limited to 100 rows for safety).
    """
    try:
        return _get_worldbank_data_response()
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@climate_data_bp.route("/api/climate-meta")
def climate_meta():
    """Return metadata helpful for map visualizations (available years and numeric metrics)."""
    try:
        return _get_worldbank_meta_response()
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@climate_data_bp.route("/api/climate-map")
def climate_map():
    """Choropleth-ready output: [{country, value}] for a given metric + year.

    Query params:
    - metric: numeric column name (required)
    - year: year to filter (optional; defaults to latest)
    - agg: mean|median|sum|min|max (optional; default mean)
    """
    try:
        return _get_worldbank_map_response()
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@climate_data_bp.route("/api/worldbank-data")
def worldbank_data():
    """World Bank dataset endpoint alias for climate-data."""
    try:
        return _get_worldbank_data_response()
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@climate_data_bp.route("/api/worldbank-meta")
def worldbank_meta():
    """World Bank metadata endpoint alias for climate-meta."""
    try:
        return _get_worldbank_meta_response()
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@climate_data_bp.route("/api/worldbank-map")
def worldbank_map():
    """World Bank choropleth endpoint alias for climate-map."""
    try:
        return _get_worldbank_map_response()
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@climate_data_bp.route("/api/risk-meta")
def risk_meta():
    """Return available ND-GAIN metrics and years."""
    try:
        return jsonify(nd_gain_service.get_meta()), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@climate_data_bp.route("/api/risk-map")
def risk_map():
    """Return one ND-GAIN metric by country for a selected year."""
    metric = (request.args.get("metric") or "vulnerability").strip()
    year_raw = request.args.get("year")

    if year_raw is None or year_raw == "":
        year = None
    else:
        try:
            year = int(year_raw)
        except ValueError:
            return jsonify({"error": "year must be an integer"}), 400

    try:
        return jsonify(nd_gain_service.get_map(metric, year=year)), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@climate_data_bp.route("/api/risk-scatter")
def risk_scatter():
    """Return country-level ND-GAIN metrics for a scatter plot."""
    x_metric = (request.args.get("xMetric") or "vulnerability").strip()
    y_metric = (request.args.get("yMetric") or "readiness").strip()
    size_metric = (
        request.args.get("sizeMetric") or "governance_readiness"
    ).strip()
    year_raw = request.args.get("year")

    if year_raw is None or year_raw == "":
        year = None
    else:
        try:
            year = int(year_raw)
        except ValueError:
            return jsonify({"error": "year must be an integer"}), 400

    try:
        return jsonify(
            nd_gain_service.get_scatter(
                x_metric,
                y_metric,
                size_metric,
                year=year,
            )
        ), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@climate_data_bp.route("/api/climate-news")
def climate_news():
    """Return latest climate change news coverage for a hovered region.

    Query params:
    - country: country/region name (required; comes from GeoJSON feature properties)
    - limit: number of articles (optional; default 5; capped)
    """

    country = (request.args.get("country") or "").strip()
    if not country:
        return jsonify({"error": "Missing required query param: country"}), 400

    limit = request.args.get("limit", "5")
    try:
        limit_int = int(limit)
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    try:
        articles = reliefweb_service.get_latest_climate_news(country, limit=limit_int)
        return (
            jsonify(
                {
                    "country": country,
                    "query": f"climate change {country}",
                    "articles": articles,
                }
            ),
            200,
        )
    except PermissionError as e:
        cached = reliefweb_service.get_cached_latest_climate_news(
            country, limit=limit_int, allow_expired=True
        )
        if cached:
            return (
                jsonify(
                    {
                        "country": country,
                        "query": f"climate change {country}",
                        "articles": cached,
                        "warning": "ReliefWeb access denied; showing cached results.",
                    }
                ),
                200,
            )
        return jsonify({"error": str(e)}), 502
    except Exception as e:
        cached = reliefweb_service.get_cached_latest_climate_news(
            country, limit=limit_int, allow_expired=True
        )
        if cached:
            return (
                jsonify(
                    {
                        "country": country,
                        "query": f"climate change {country}",
                        "articles": cached,
                        "warning": "ReliefWeb error; showing cached results.",
                    }
                ),
                200,
            )
        return jsonify({"error": str(e)}), 500


@climate_data_bp.route("/api/climate-news-wordmap")
def climate_news_wordmap():
    """Return a global word cloud for climate-change news.

    Query params:
    - timespan: e.g. 1week, 7d, 24h (optional; default 24h)
    - maxrecords: number of articles to sample (optional; default 80; capped to 250)
    - top: number of words to return (optional; default 60; capped to 120)
    """

    timespan = (request.args.get("timespan") or "24h").strip() or "24h"

    maxrecords_raw = request.args.get("maxrecords", "80")
    try:
        maxrecords = int(maxrecords_raw)
    except ValueError:
        return jsonify({"error": "maxrecords must be an integer"}), 400
    maxrecords = max(1, min(maxrecords, 250))

    top_raw = request.args.get("top", "60")
    try:
        top = int(top_raw)
    except ValueError:
        return jsonify({"error": "top must be an integer"}), 400
    top = max(1, min(top, 120))

    try:
        articles = gdelt_service.get_latest_climate_articles(
            maxrecords=maxrecords,
            timespan=timespan,
        )
        titles = [a.get("title", "") for a in articles if isinstance(a, dict)]
        words = extract_top_words([t for t in titles if isinstance(t, str)], top=top)

        return (
            jsonify(
                {
                    "timespan": timespan,
                    "maxrecords": maxrecords,
                    "query": '"climate change" OR "global warming" (English sources)',
                    "articleCount": len(articles),
                    "articles": articles,
                    "words": words,
                }
            ),
            200,
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 502