import { useEffect, useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Download, Loader2, RefreshCw, X } from 'lucide-react'
import './App.css'

const API_BASE = ''
const COUNTRY_COLORS = [
  '#2563eb',
  '#16a34a',
  '#ef4444',
  '#f97316',
  '#7c3aed',
  '#0ea5e9',
  '#14b8a6',
  '#a855f7',
  '#64748b',
  '#22c55e',
  '#eab308',
  '#ec4899',
]
const ALL_SITES = '__all__'

function toIsoDate(date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date, amount) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function monthRange(monthValue) {
  const [year, month] = monthValue.split('-').map(Number)
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0)
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) }
}

function getPresetRange(preset, selectedMonth) {
  const today = new Date()

  if (preset === 'yesterday') {
    const yesterday = addDays(today, -1)
    return { startDate: toIsoDate(yesterday), endDate: toIsoDate(yesterday) }
  }

  if (preset === 'last14') {
    return { startDate: toIsoDate(addDays(today, -13)), endDate: toIsoDate(today) }
  }

  if (preset === 'last28') {
    return { startDate: toIsoDate(addDays(today, -27)), endDate: toIsoDate(today) }
  }

  if (preset === 'thisMonth') {
    return monthRange(toIsoDate(today).slice(0, 7))
  }

  if (preset === 'lastMonth') {
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    return monthRange(toIsoDate(lastMonth).slice(0, 7))
  }

  if (preset === 'month') {
    return monthRange(selectedMonth)
  }

  return { startDate: toIsoDate(addDays(today, -6)), endDate: toIsoDate(today) }
}

function formatNumber(value) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(value || 0))
}

function formatPercent(value) {
  return `${((value || 0) * 100).toFixed(2)}%`
}

function formatDuration(seconds) {
  const totalSeconds = Math.round(seconds || 0)
  const minutes = Math.floor(totalSeconds / 60)
  const rest = totalSeconds % 60
  return `${minutes}m ${String(rest).padStart(2, '0')}s`
}

function countryLabel(country) {
  return country.code && country.code !== '(not set)' ? country.code : country.country || 'Khác'
}

function countryFlagUrl(country) {
  const code = String(country.code || '').toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return ''

  return `https://flagcdn.com/24x18/${code.toLowerCase()}.png`
}

function CountryIcon({ country }) {
  const flagUrl = countryFlagUrl(country)

  if (!flagUrl) {
    return <span className="country-flag fallback">•</span>
  }

  return (
    <img
      className="country-flag"
      src={flagUrl}
      width="24"
      height="18"
      alt=""
      loading="lazy"
    />
  )
}

function downloadCsv(report) {
  const rows = [
    ['Date', 'Hostname', 'Views', 'Sessions', 'Avg Duration Seconds', 'Bounce Rate'],
    ...report.dailyDetail.map((row) => [
      row.date,
      row.hostname,
      row.views,
      row.sessions,
      row.avgDuration.toFixed(2),
      row.bounce.toFixed(4),
    ]),
  ]

  const csv = rows
    .map((row) =>
      row
        .map((cell) => String(cell).replaceAll('"', '""'))
        .map((cell) => `"${cell}"`)
        .join(','),
    )
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `ga4-report-${report.range.startDate}-${report.range.endDate}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function KpiCard({ accent, label, value, detail }) {
  return (
    <section className="kpi-card" style={{ '--accent': accent }}>
      <p>{label}</p>
      <strong>{value}</strong>
      {detail ? <span>{detail}</span> : null}
    </section>
  )
}

function SectionTitle({ color = '#2563eb', children }) {
  return (
    <div className="section-title">
      <span style={{ background: color }} />
      <h2>{children}</h2>
    </div>
  )
}

function App() {
  const [config, setConfig] = useState(null)
  const [report, setReport] = useState(null)
  const [preset, setPreset] = useState('last7')
  const [selectedMonth, setSelectedMonth] = useState(toIsoDate(new Date()).slice(0, 7))
  const [customRange, setCustomRange] = useState(getPresetRange('last7'))
  const [properties, setProperties] = useState([])
  const [selectedPropertyId, setSelectedPropertyId] = useState('')
  const [selectedHostname, setSelectedHostname] = useState(ALL_SITES)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [hasLoadedInitialReport, setHasLoadedInitialReport] = useState(false)

  const activeRange = useMemo(() => {
    if (preset === 'custom') return customRange
    return getPresetRange(preset, selectedMonth)
  }, [customRange, preset, selectedMonth])

  const totalViews = report?.summary.totalViews || 0
  const topCountries = report?.countries.slice(0, 12) || []
  const maxCountryViews = Math.max(...topCountries.map((row) => row.views), 1)

  const pieData = useMemo(() => {
    if (!report?.countries.length) return []
    const top = report.countries.slice(0, 12)
    const topViews = top.reduce((sum, row) => sum + row.views, 0)
    const otherViews = Math.max(totalViews - topViews, 0)
    return otherViews > 0 ? [...top, { country: 'Khác', code: 'OTHER', views: otherViews }] : top
  }, [report, totalViews])

  function showError(message) {
    setErrorMessage(message)
  }

  async function fetchReport() {
    if (!selectedPropertyId) return

    if (activeRange.startDate > activeRange.endDate) {
      showError(
        `3 INVALID_ARGUMENT: start_date must be less than or equal to end_date. start_date = ${activeRange.startDate} and end_date = ${activeRange.endDate}`,
      )
      return
    }

    setLoading(true)
    setErrorMessage('')

    const params = new URLSearchParams({
      propertyId: selectedPropertyId,
      startDate: activeRange.startDate,
      endDate: activeRange.endDate,
    })

    if (selectedHostname !== ALL_SITES) params.set('hostname', selectedHostname)

    try {
      const response = await fetch(`${API_BASE}/api/report?${params.toString()}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Không tải được dữ liệu GA4')
      }

      setReport(data)
    } catch (fetchError) {
      showError(fetchError.message)
      setReport(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetch(`${API_BASE}/api/config`)
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.message || 'Không đọc được cấu hình site')
        }
        return data
      })
      .then((data) => {
        setConfig(data)
        setSelectedPropertyId(data.propertyId || '')
        setSelectedHostname(data.hostnameFilter || ALL_SITES)
      })
      .catch((configError) => showError(configError.message))
  }, [])

  useEffect(() => {
    fetch(`${API_BASE}/api/properties`)
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.message || 'Không lấy được danh sách GA4 properties')
        }
        return data
      })
      .then((data) => {
        setProperties(data.properties || [])
        setSelectedPropertyId((current) => current || data.defaultPropertyId || data.properties?.[0]?.propertyId || '')
      })
      .catch((propertiesError) => showError(propertiesError.message))
  }, [])

  useEffect(() => {
    if (!selectedPropertyId || hasLoadedInitialReport) return

    setHasLoadedInitialReport(true)
    fetchReport()
  }, [selectedPropertyId, hasLoadedInitialReport])

  const siteOptions = report?.propertyId === selectedPropertyId ? report?.hostnames || [] : []
  const selectedProperty = properties.find((property) => property.propertyId === selectedPropertyId)
  const currentTitle =
    selectedHostname !== ALL_SITES
      ? selectedHostname
      : selectedProperty?.displayName || report?.configuredSiteTitle || config?.siteTitle || 'Chưa chọn property'

  return (
    <main className="dashboard">
      {loading ? (
        <div className="loading-overlay" role="status" aria-live="polite">
          <div className="loading-box">
            <Loader2 className="spin" size={34} />
            <strong>Đang tải dữ liệu GA4</strong>
            <span>Vui lòng chờ trong giây lát</span>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="error-modal" role="dialog" aria-modal="true" aria-labelledby="error-title">
          <div className="error-card">
            <div>
              <strong id="error-title">Lỗi khi tải dữ liệu</strong>
              <p>{errorMessage}</p>
            </div>
            <button
              type="button"
              className="error-close"
              onClick={() => setErrorMessage('')}
              aria-label="Đóng thông báo lỗi"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ) : null}

      <header className="page-header">
        <div>
          <p>GA4 Dashboard</p>
          <h1>{currentTitle}</h1>
        </div>

        <div className="header-actions">
          <select value={preset} onChange={(event) => setPreset(event.target.value)}>
            <option value="yesterday">Hôm qua</option>
            <option value="last7">7 ngày gần nhất</option>
            <option value="last14">14 ngày gần nhất</option>
            <option value="last28">28 ngày gần nhất</option>
            <option value="thisMonth">Tháng này</option>
            <option value="lastMonth">Tháng trước</option>
            <option value="month">Chọn tháng</option>
            <option value="custom">Tùy chọn ngày</option>
          </select>

          {preset === 'month' ? (
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
            />
          ) : null}

          {preset === 'custom' ? (
            <>
              <input
                type="date"
                value={customRange.startDate}
                onChange={(event) =>
                  setCustomRange((range) => ({ ...range, startDate: event.target.value }))
                }
              />
              <input
                type="date"
                value={customRange.endDate}
                onChange={(event) =>
                  setCustomRange((range) => ({ ...range, endDate: event.target.value }))
                }
              />
            </>
          ) : null}

          <select
            className="property-select"
            value={selectedPropertyId}
            onChange={(event) => {
              setSelectedPropertyId(event.target.value)
              setSelectedHostname(ALL_SITES)
            }}
          >
            {!selectedPropertyId ? <option value="">Chọn GA4 property</option> : null}
            {properties.map((property) => (
              <option key={property.propertyId} value={property.propertyId}>
                {property.displayName} ({property.propertyId})
              </option>
            ))}
          </select>

          <select
            className="site-select"
            value={selectedHostname}
            onChange={(event) => setSelectedHostname(event.target.value)}
          >
            <option value={ALL_SITES}>Tất cả site</option>
            {siteOptions.map((site) => (
              <option key={site.hostname} value={site.hostname}>
                {site.hostname} ({formatNumber(site.views)})
              </option>
            ))}
          </select>

          <button type="button" onClick={fetchReport} disabled={loading || !selectedPropertyId}>
            {loading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            Áp dụng
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => report && downloadCsv(report)}
            disabled={!report}
            title="Xuất CSV"
          >
            <Download size={16} />
          </button>
        </div>
      </header>

      <section className="kpi-grid">
        <KpiCard accent="#2563eb" label="Tổng views" value={formatNumber(totalViews)} />
        <KpiCard accent="#ef4444" label="Bounce rate TB" value={formatPercent(report?.summary.avgBounce)} />
        <KpiCard
          accent="#0891b2"
          label="Time on site TB"
          value={formatDuration(report?.summary.avgDuration)}
          detail={`${formatNumber(report?.dailyDetail.reduce((sum, row) => sum + row.sessions, 0))} phiên`}
        />
        <KpiCard accent="#16a34a" label="Số ngày" value={formatNumber(report?.summary.days)} />
        <KpiCard accent="#7c3aed" label="Số quốc gia" value={formatNumber(report?.summary.countries)} />
        <KpiCard
          accent="#f97316"
          label="Ngày cao nhất"
          value={report?.summary.topDay || '-'}
          detail={`${formatNumber(report?.daily.find((row) => row.date === report?.summary.topDay)?.views)} views`}
        />
      </section>

      <section className="panel detail-panel">
        <div className="panel-head">
          <SectionTitle color="#0f172a">Chi tiết theo ngày</SectionTitle>
          <div className="range-tabs">
            <button
              type="button"
              className={preset === 'last7' ? 'active' : ''}
              onClick={() => setPreset('last7')}
            >
              7 ngày
            </button>
            <button
              type="button"
              className={preset === 'last14' ? 'active' : ''}
              onClick={() => setPreset('last14')}
            >
              14 ngày
            </button>
            <button
              type="button"
              className={preset === 'last28' ? 'active' : ''}
              onClick={() => setPreset('last28')}
            >
              28 ngày
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Hostname</th>
                <th className="numeric">Views</th>
                <th className="numeric">Avg engagement time</th>
                <th className="numeric">Bounce Rate</th>
              </tr>
            </thead>
            <tbody>
              {(report?.dailyDetail || []).map((row) => (
                <tr key={`${row.date}-${row.hostname}`}>
                  <td>{row.date}</td>
                  <td>{row.hostname}</td>
                  <td className="numeric bar-cell">
                    <span style={{ width: `${totalViews ? (row.views / totalViews) * 100 : 0}%` }} />
                    <strong>{formatNumber(row.views)}</strong>
                  </td>
                  <td className="numeric time-cell">
                    <span
                      style={{
                        width: `${report?.summary.avgDuration ? Math.min((row.avgDuration / report.summary.avgDuration) * 70, 100) : 0}%`,
                      }}
                    />
                    <strong>{formatDuration(row.avgDuration)}</strong>
                  </td>
                  <td className="numeric bounce">{formatPercent(row.bounce)}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td>Total</td>
                <td />
                <td className="numeric">{formatNumber(totalViews)}</td>
                <td className="numeric">{formatDuration(report?.summary.avgDuration)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="lower-grid">
        <section className="panel">
          <SectionTitle color="#8b5cf6">Tỷ trọng theo quốc gia</SectionTitle>
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="views"
                  nameKey="country"
                  innerRadius={74}
                  outerRadius={104}
                  paddingAngle={1}
                >
                  {pieData.map((country, index) => (
                    <Cell
                      key={country.code || country.country}
                      fill={COUNTRY_COLORS[index % COUNTRY_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatNumber(value)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center">
              <strong>{formatNumber(totalViews)}</strong>
              <span>views</span>
            </div>
          </div>

          <div className="legend-grid">
            {pieData.map((country, index) => (
              <div className="legend-item" key={`${country.code}-${country.country}`}>
                <span
                  className="legend-swatch"
                  style={{ background: COUNTRY_COLORS[index % COUNTRY_COLORS.length] }}
                />
                <CountryIcon country={country} />
                <strong>{countryLabel(country)}</strong>
                <em>{totalViews ? ((country.views / totalViews) * 100).toFixed(1) : '0.0'}%</em>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <SectionTitle color="#2563eb">Top 12 quốc gia theo views</SectionTitle>
          <div className="country-bars">
            {topCountries.map((country) => (
              <div className="country-row" key={`${country.code}-${country.country}`}>
                <span>
                  <CountryIcon country={country} />
                  {countryLabel(country)}
                </span>
                <div>
                  <i style={{ width: `${(country.views / maxCountryViews) * 100}%` }} />
                </div>
                <strong>{formatNumber(country.views)}</strong>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
