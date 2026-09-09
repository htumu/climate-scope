import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { formatMetric } from '../utils'

type ClimateMeta = {
    years: number[]
    metrics: string[]
    defaultMetric: string | null
}

type ScatterResponse = {
    records: ScatterPoint[]
}

type ScatterPoint = {
    country: string
    x: number
    y: number
    size: number
}

type ScatterTooltipState = {
    x: number
    y: number
    country: string
    xValue: number
    yValue: number
    sizeValue: number
}

function isScatterPoint(value: unknown): value is ScatterPoint {
    if (typeof value !== 'object' || value === null) return false
    const candidate = value as Partial<ScatterPoint>
    return (
        typeof candidate.country === 'string' &&
        Number.isFinite(candidate.x) &&
        Number.isFinite(candidate.y) &&
        Number.isFinite(candidate.size)
    )
}

function isClimateMeta(value: unknown): value is ClimateMeta {
    if (typeof value !== 'object' || value === null) return false
    const candidate = value as Partial<ClimateMeta>
    return Array.isArray(candidate.years) && Array.isArray(candidate.metrics)
}

function isScatterResponse(value: unknown): value is ScatterResponse {
    if (typeof value !== 'object' || value === null) return false
    const candidate = value as Partial<ScatterResponse>
    return Array.isArray(candidate.records) && candidate.records.every(isScatterPoint)
}

function BubbleScatterPlot() {
    const scatterSvgRef = useRef<SVGSVGElement | null>(null)
    const [meta, setMeta] = useState<ClimateMeta | null>(null)
    const [xMetric, setXMetric] = useState<string>('')
    const [yMetric, setYMetric] = useState<string>('')
    const [sizeMetric, setSizeMetric] = useState<string>('')
    const [scatterYear, setScatterYear] = useState<number | null>(null)
    const [scatterRecords, setScatterRecords] = useState<ScatterPoint[]>([])
    const [scatterError, setScatterError] = useState<string>('')
    const [scatterTooltip, setScatterTooltip] = useState<ScatterTooltipState | null>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [selectedCountry, setSelectedCountry] = useState<string>('')

    useEffect(() => {
        let cancelled = false

        async function loadMeta() {
            try {
                const metaRes = await fetch('http://127.0.0.1:5001/api/risk-meta')
                if (!metaRes.ok) throw new Error('Failed to load /api/risk-meta')
                const metaRaw: unknown = await metaRes.json()
                if (!isClimateMeta(metaRaw)) throw new Error('Unexpected response shape from /api/risk-meta')
                if (!cancelled) {
                    setMeta(metaRaw)
                    if (metaRaw.years?.length) {
                        setScatterYear(metaRaw.years[metaRaw.years.length - 1])
                    }
                    const metrics = new Set(metaRaw.metrics)
                    setXMetric(metrics.has('vulnerability') ? 'vulnerability' : metaRaw.metrics[0] ?? '')
                    setYMetric(metrics.has('readiness') ? 'readiness' : metaRaw.metrics[1] ?? metaRaw.metrics[0] ?? '')
                    setSizeMetric(metrics.has('governance_readiness') ? 'governance_readiness' : metaRaw.metrics[2] ?? metaRaw.metrics[0] ?? '')
                }
            } catch (e) {
                if (!cancelled) {
                    setScatterError(e instanceof Error ? e.message : 'Failed to load risk metadata')
                }
            }
        }

        loadMeta()
        return () => { cancelled = true }
    }, [])

    useEffect(() => {
        if (!xMetric || !yMetric || !sizeMetric || scatterYear === null) return

        let cancelled = false

        async function loadScatterValues() {
            try {
                const params = new URLSearchParams({
                    xMetric,
                    yMetric,
                    sizeMetric,
                    year: String(scatterYear),
                })
                const res = await fetch(`http://127.0.0.1:5001/api/risk-scatter?${params}`)
                if (!res.ok) {
                    const errorBody = await res.json().catch(() => null)
                    throw new Error(errorBody?.error ?? 'Failed to load /api/risk-scatter')
                }

                const rawData: unknown = await res.json()
                if (!isScatterResponse(rawData)) {
                    throw new Error('Unexpected response shape from /api/risk-scatter')
                }

                if (!cancelled) {
                    setScatterRecords(rawData.records.filter(isScatterPoint))
                    setScatterError('')
                }
            } catch (e) {
                if (!cancelled) {
                    setScatterError(e instanceof Error ? e.message : 'Failed to load scatter values')
                    setScatterRecords([])
                }
            }
        }

        loadScatterValues()
        return () => { cancelled = true }
    }, [xMetric, yMetric, sizeMetric, scatterYear])

    useEffect(() => {
        if (!scatterSvgRef.current) return

        const width = 980
        const height = 520
        const margin = { top: 20, right: 30, bottom: 70, left: 90 }
        const svg = d3.select(scatterSvgRef.current)

        svg.interrupt()
        svg.selectAll('*').remove()
        svg.attr('width', width).attr('height', height)

        if (!scatterRecords.length) return

        const xExtent = d3.extent(scatterRecords, (d) => d.x) as [number, number]
        const yExtent = d3.extent(scatterRecords, (d) => d.y) as [number, number]
        const sizeExtent = d3.extent(scatterRecords, (d) => d.size) as [number, number]

        const xPad = (xExtent[1] - xExtent[0]) * 0.08 || 1
        const yPad = (yExtent[1] - yExtent[0]) * 0.08 || 1

        const xScale = d3
            .scaleLinear()
            .domain([xExtent[0] - xPad, xExtent[1] + xPad])
            .range([margin.left, width - margin.right])

        const yScale = d3
            .scaleLinear()
            .domain([yExtent[0] - yPad, yExtent[1] + yPad])
            .range([height - margin.bottom, margin.top])

        const sizeMax = Math.max(0, sizeExtent[1] ?? 0)
        const rScale = d3
            .scaleSqrt()
            .domain([0, sizeMax || 1])
            .range([5, 18])

        const xAxis = d3.axisBottom(xScale).ticks(7).tickSize(0)
        const yAxis = d3.axisLeft(yScale).ticks(7).tickSize(0)

        // gridlines
        svg.append('g')
            .attr('transform', `translate(0,${height - margin.bottom})`)
            .call(
                d3.axisBottom(xScale)
                    .ticks(7)
                    .tickSize(-(height - margin.top - margin.bottom))
                    .tickFormat(() => '')
            )
            .selectAll('line')
            .attr('stroke', '#e2e8ef')
            .attr('stroke-opacity', 1)

        svg.append('g')
            .attr('transform', `translate(${margin.left},0)`)
            .call(
                d3.axisLeft(yScale)
                    .ticks(7)
                    .tickSize(-(width - margin.left - margin.right))
                    .tickFormat(() => '')
            )
            .selectAll('line')
            .attr('stroke', '#e2e8ef')
            .attr('stroke-opacity', 1)

        svg.selectAll('.domain').remove()

        const xAxisGroup = svg.append('g')
            .attr('transform', `translate(0,${height - margin.bottom})`)
            .call(xAxis)

        const yAxisGroup = svg.append('g')
            .attr('transform', `translate(${margin.left},0)`)
            .call(yAxis)

        xAxisGroup.selectAll('text')
            .attr('fill', '#6b7280')
            .style('font-size', '12px')

        yAxisGroup.selectAll('text')
            .attr('fill', '#6b7280')
            .style('font-size', '12px')

        xAxisGroup.selectAll('line').attr('stroke', '#d1d5db')
        yAxisGroup.selectAll('line').attr('stroke', '#d1d5db')

        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height - 22)
            .attr('text-anchor', 'middle')
            .attr('fill', '#374151')
            .style('font-size', '14px')
            .style('font-weight', '500')
            .text(formatMetric(xMetric))

        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -height / 2)
            .attr('y', 28)
            .attr('text-anchor', 'middle')
            .attr('fill', '#374151')
            .style('font-size', '14px')
            .style('font-weight', '500')
            .text(formatMetric(yMetric))

        const bubbleGroup = svg.append('g')

        bubbleGroup
            .selectAll('circle')
            .data(scatterRecords, (d: any) => d.country)
            .join('circle')
            .attr('cx', (d) => xScale(d.x))
            .attr('cy', (d) => yScale(d.y))
            .attr('r', 0)
            .attr('fill', '#2563eb')
            .attr('fill-opacity', (d) => selectedCountry && d.country !== selectedCountry ? 0.12 : 0.5)
            .attr('stroke', (d) => d.country === selectedCountry ? '#111827' : '#1d4ed8')
            .attr('stroke-width', (d) => d.country === selectedCountry ? 3 : 1.5)
            .on('mousemove', (event: MouseEvent, d) => {
                setScatterTooltip({
                    x: event.clientX,
                    y: event.clientY,
                    country: d.country,
                    xValue: d.x,
                    yValue: d.y,
                    sizeValue: d.size,
                })
            })
            .on('click', (_event: MouseEvent, d) => {
                setSelectedCountry((current) => current === d.country ? '' : d.country)
            })
            .on('mouseleave', () => {
                setScatterTooltip(null)
            })
            .transition()
            .duration(600)
            .attr('r', (d) => rScale(d.size))

        // label only biggest few
        const topCountries = [...scatterRecords].sort((a, b) => b.size - a.size).slice(0, 5)
        const selectedPoint = scatterRecords.find((record) => record.country === selectedCountry)
        const labelPoints = selectedPoint && !topCountries.some((record) => record.country === selectedCountry)
            ? [...topCountries, selectedPoint]
            : topCountries

        svg.append('g')
            .selectAll('text.country-label')
            .data(labelPoints)
            .join('text')
            .attr('class', 'country-label')
            .attr('x', (d) => xScale(d.x))
            .attr('y', (d) => yScale(d.y) - 12)
            .attr('text-anchor', 'middle')
                .attr('fill', (d) => d.country === selectedCountry ? '#111827' : '#1f2937')
            .style('font-size', '11px')
            .style('font-weight', '500')
            .text((d) => d.country)
            }, [scatterRecords, xMetric, yMetric, sizeMetric, scatterYear, selectedCountry])

    useEffect(() => {
        if (!isPlaying || !meta?.years?.length) return

        const interval = setInterval(() => {
            setScatterYear((prev) => {
                const years = meta.years
                const currentIndex = years.indexOf(prev ?? -1)
                const nextIndex = currentIndex + 1

                if (nextIndex >= years.length) {
                    setIsPlaying(false)
                    return prev
                }

                return years[nextIndex]
            })
        }, 800)

        return () => clearInterval(interval)
    }, [isPlaying, meta])

    return (
        <>
            <div className="scatter-layout">
                <div className="scatter-sidebar">
                    <h3>Controls</h3>

                    <label>
                        X Axis
                        <select value={xMetric} onChange={(e) => setXMetric(e.target.value)} disabled={!meta}>
                            {(meta?.metrics ?? []).map((m) => (
                                <option key={m} value={m}>{formatMetric(m)}</option>
                            ))}
                        </select>
                    </label>

                    <label>
                        Y Axis
                        <select value={yMetric} onChange={(e) => setYMetric(e.target.value)} disabled={!meta}>
                            {(meta?.metrics ?? []).map((m) => (
                                <option key={m} value={m}>{formatMetric(m)}</option>
                            ))}
                        </select>
                    </label>

                    <label>
                        Bubble Size
                        <select value={sizeMetric} onChange={(e) => setSizeMetric(e.target.value)} disabled={!meta}>
                            {(meta?.metrics ?? []).map((m) => (
                                <option key={m} value={m}>{formatMetric(m)}</option>
                            ))}
                        </select>
                    </label>

                    <label>
                        Focus Country
                        <select
                            value={selectedCountry}
                            onChange={(e) => setSelectedCountry(e.target.value)}
                            disabled={!scatterRecords.length}
                        >
                            <option value="">All countries</option>
                            {[...scatterRecords]
                                .sort((a, b) => a.country.localeCompare(b.country))
                                .map((record) => (
                                    <option key={record.country} value={record.country}>
                                        {record.country}
                                    </option>
                                ))}
                        </select>
                    </label>

                    <button
                        type="button"
                        className="play-btn"
                        onClick={() => setIsPlaying((prev) => !prev)}
                    >
                        {isPlaying ? 'Pause' : 'Play'}
                    </button>

                    <div>
                        <div className="year-label">
                            Year: <strong>{scatterYear ?? ''}</strong>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={Math.max((meta?.years?.length ?? 1) - 1, 0)}
                            step={1}
                            value={Math.max((meta?.years ?? []).indexOf(scatterYear ?? -1), 0)}
                            onChange={(e) => {
                                const index = Number(e.target.value)
                                const nextYear = meta?.years?.[index]
                                if (typeof nextYear === 'number') setScatterYear(nextYear)
                            }}
                            style={{ width: '100%', marginTop: 6 }}
                            disabled={!meta || (meta?.years?.length ?? 0) === 0}
                        />
                    </div>
                </div>

                <div className="scatter-plot-area">
                    <h2>Climate Vulnerability vs Policy Readiness</h2>
                    {scatterError ? <p style={{ color: '#b00020', margin: '0 0 8px' }}>{scatterError}</p> : null}
                    <svg
                        ref={scatterSvgRef}
                        style={{
                            width: '100%',
                            maxWidth: 980,
                            display: 'block',
                            background: '#f8faff',
                            borderRadius: 8,
                            border: '1px solid #e5e7eb',
                        }}
                    />
                </div>
            </div>

            {scatterTooltip ? (
                <div
                    style={{
                        position: 'fixed',
                        left: scatterTooltip.x + 14,
                        top: scatterTooltip.y + 14,
                        pointerEvents: 'none',
                        background: '#ffffff',
                        color: '#1f2937',
                        padding: '10px 12px',
                        borderRadius: 8,
                        fontSize: 12,
                        lineHeight: 1.6,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                        border: '1px solid #e5e7eb',
                        zIndex: 11,
                    }}
                >
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{scatterTooltip.country}</div>
                    <div>{formatMetric(xMetric)}: {scatterTooltip.xValue.toFixed(2)}</div>
                    <div>{formatMetric(yMetric)}: {scatterTooltip.yValue.toFixed(2)}</div>
                    <div>{formatMetric(sizeMetric)}: {scatterTooltip.sizeValue.toFixed(2)}</div>
                </div>
            ) : null}
        </>
    )
}

export default BubbleScatterPlot
