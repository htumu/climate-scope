from __future__ import annotations

import os
from typing import Any, Dict, Optional

import pandas as pd


class NdGainService:
    """Load the normalized ND-GAIN country-year dataset for risk APIs."""

    _required_columns = {"country_code", "country", "year"}

    def __init__(self) -> None:
        backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        default_csv = os.path.join(backend_root, "data", "nd_gain_country_year.csv")
        self._csv_path = os.getenv("ND_GAIN_CSV_PATH", default_csv)
        self._data_cache: Optional[pd.DataFrame] = None

    def get_data(self) -> pd.DataFrame:
        if self._data_cache is not None:
            return self._data_cache.copy()

        if not os.path.exists(self._csv_path):
            raise FileNotFoundError(
                f"ND-GAIN data file not found: {self._csv_path}. "
                "Run backend/scripts/process_nd_gain.py first or set ND_GAIN_CSV_PATH."
            )

        data = pd.read_csv(self._csv_path)
        missing = self._required_columns - set(data.columns)
        if missing:
            raise RuntimeError(
                f"ND-GAIN CSV is missing required columns: {sorted(missing)}"
            )

        data["country_code"] = data["country_code"].astype(str).str.strip().str.upper()
        data["country"] = data["country"].astype(str).str.strip()
        data["year"] = pd.to_numeric(data["year"], errors="coerce")
        data = data.dropna(subset=["country_code", "country", "year"])
        data["year"] = data["year"].astype(int)

        for column in data.columns:
            if column not in self._required_columns:
                data[column] = pd.to_numeric(data[column], errors="coerce")

        self._data_cache = data
        return data.copy()

    def get_meta(self) -> Dict[str, Any]:
        data = self.get_data()
        metrics = [
            column
            for column in data.columns
            if column not in self._required_columns
        ]
        metric_years = {
            metric: sorted(
                data.loc[data[metric].notna(), "year"].unique().astype(int).tolist()
            )
            for metric in metrics
        }
        return {
            "datasetRef": os.path.basename(self._csv_path),
            "years": sorted(data["year"].unique().astype(int).tolist()),
            "metrics": metrics,
            "metricYears": metric_years,
            "defaultMetric": "vulnerability" if "vulnerability" in metrics else metrics[0],
        }

    def get_map(
        self, metric: str = "vulnerability", *, year: Optional[int] = None
    ) -> Dict[str, Any]:
        data = self.get_data()
        metrics = [
            column
            for column in data.columns
            if column not in self._required_columns
        ]
        if metric not in metrics:
            raise ValueError(f"Unknown ND-GAIN metric: {metric}")

        available_years = sorted(
            data.loc[data[metric].notna(), "year"].unique().astype(int).tolist()
        )
        chosen_year = available_years[-1] if year is None and available_years else year
        filtered = data if chosen_year is None else data[data["year"] == chosen_year]
        records = filtered[["country_code", "country", metric]].dropna(subset=[metric])
        records = records.rename(columns={metric: "value"})

        return {
            "datasetRef": os.path.basename(self._csv_path),
            "year": chosen_year,
            "metric": metric,
            "records": records.to_dict(orient="records"),
        }

    def get_scatter(
        self,
        x_metric: str,
        y_metric: str,
        size_metric: str,
        *,
        year: Optional[int] = None,
    ) -> Dict[str, Any]:
        data = self.get_data()
        metrics = [
            column
            for column in data.columns
            if column not in self._required_columns
        ]
        requested_metrics = {x_metric, y_metric, size_metric}
        unknown_metrics = requested_metrics - set(metrics)
        if unknown_metrics:
            raise ValueError(
                f"Unknown ND-GAIN metric(s): {', '.join(sorted(unknown_metrics))}"
            )

        available_years = sorted(data["year"].unique().astype(int).tolist())
        chosen_year = available_years[-1] if year is None else year
        if chosen_year not in available_years:
            raise ValueError(f"Unknown year: {chosen_year}")

        filtered = data[data["year"] == chosen_year]
        records = filtered[["country_code", "country"]].copy()
        records["x"] = filtered[x_metric].to_numpy()
        records["y"] = filtered[y_metric].to_numpy()
        records["size"] = filtered[size_metric].to_numpy()
        records = records.dropna(subset=["x", "y", "size"])

        return {
            "datasetRef": os.path.basename(self._csv_path),
            "year": chosen_year,
            "xMetric": x_metric,
            "yMetric": y_metric,
            "sizeMetric": size_metric,
            "records": records.to_dict(orient="records"),
        }


nd_gain_service = NdGainService()
