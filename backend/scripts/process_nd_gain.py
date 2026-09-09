"""Normalize the downloaded ND-GAIN aggregate CSV files."""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


FILES = {
    "gain": Path("gain/gain.csv"),
    "readiness": Path("readiness/readiness.csv"),
    "economic_readiness": Path("readiness/economic.csv"),
    "governance_readiness": Path("readiness/governance.csv"),
    "social_readiness": Path("readiness/social.csv"),
    "vulnerability": Path("vulnerability/vulnerability.csv"),
}


def load_metric(input_root: Path, metric: str, relative_path: Path) -> pd.DataFrame:
    path = input_root / relative_path
    frame = pd.read_csv(path)

    required = {"ISO3", "Name"}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"{path} is missing columns: {sorted(missing)}")

    year_columns = [column for column in frame.columns if str(column).isdigit()]
    if not year_columns:
        raise ValueError(f"{path} does not contain year columns")

    normalized = frame.melt(
        id_vars=["ISO3", "Name"],
        value_vars=year_columns,
        var_name="year",
        value_name=metric,
    )
    normalized = normalized.rename(
        columns={"ISO3": "country_code", "Name": "country"}
    )
    normalized["country_code"] = normalized["country_code"].astype(str).str.strip().str.upper()
    normalized["country"] = normalized["country"].astype(str).str.strip()
    normalized["year"] = pd.to_numeric(normalized["year"], errors="coerce")
    normalized[metric] = pd.to_numeric(normalized[metric], errors="coerce")
    normalized = normalized.dropna(subset=["country_code", "country", "year"])
    normalized["year"] = normalized["year"].astype(int)

    return normalized[["country_code", "country", "year", metric]]


def process(input_root: Path, output_path: Path) -> pd.DataFrame:
    combined: pd.DataFrame | None = None

    for metric, relative_path in FILES.items():
        current = load_metric(input_root, metric, relative_path)
        if current.duplicated(["country_code", "year"]).any():
            raise ValueError(f"{relative_path} contains duplicate country/year rows")

        if combined is None:
            combined = current
        else:
            combined = combined.merge(
                current,
                on=["country_code", "country", "year"],
                how="outer",
                validate="one_to_one",
            )

    if combined is None:
        raise ValueError("No ND-GAIN files were processed")

    combined = combined.sort_values(["year", "country_code"]).reset_index(drop=True)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    combined.to_csv(output_path, index=False)
    return combined


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input-root",
        type=Path,
        default=Path("resources 2"),
        help="Directory containing gain/, readiness/, and vulnerability/",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("backend/data/nd_gain_country_year.csv"),
        help="Path for the normalized output CSV",
    )
    args = parser.parse_args()

    result = process(args.input_root, args.output)
    print(f"Wrote {len(result):,} rows and {len(result.columns):,} columns to {args.output}")
    print(f"Years: {result['year'].min()}-{result['year'].max()}")
    print(f"Countries: {result['country_code'].nunique():,}")


if __name__ == "__main__":
    main()
