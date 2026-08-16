import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { v1beta as analyticsAdmin } from '@google-analytics/admin'
import { BetaAnalyticsDataClient } from '@google-analytics/data'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')

export const defaultPropertyId = process.env.GA4_PROPERTY_ID
export const defaultHostnameFilter = process.env.GA4_HOSTNAME_FILTER || ''
export const siteTitle = process.env.GA4_SITE_TITLE?.trim()

function resolveCredentialPath(value) {
  if (!value) return ''
  return path.isAbsolute(value) ? value : path.resolve(appRoot, value)
}

function getCredentials() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    return JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64) {
    return JSON.parse(
      Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64, 'base64').toString('utf8'),
    )
  }

  return null
}

function getClientOptions() {
  const credentials = getCredentials()
  if (credentials) return { credentials }

  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!credentialPath) {
    throw new Error(
      'Missing GOOGLE_APPLICATION_CREDENTIALS_JSON, GOOGLE_APPLICATION_CREDENTIALS_BASE64, or GOOGLE_APPLICATION_CREDENTIALS',
    )
  }

  return { keyFilename: resolveCredentialPath(credentialPath) }
}

export function assertIsoDate(value, fieldName) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
    throw new Error(`${fieldName} must be YYYY-MM-DD`)
  }
}

function parseGaDate(value) {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

function normalizeBounce(value) {
  const rate = Number(value || 0)
  return rate > 1 ? rate / 100 : rate
}

function getDataClient() {
  return new BetaAnalyticsDataClient(getClientOptions())
}

function getAdminClient() {
  return new analyticsAdmin.AnalyticsAdminServiceClient(getClientOptions())
}

function propertyIdFromName(name) {
  return String(name || '').replace('properties/', '')
}

export async function listGa4Properties() {
  const client = getAdminClient()
  const [accountSummaries] = await client.listAccountSummaries()

  return accountSummaries.flatMap((account) =>
    (account.propertySummaries || []).map((property) => ({
      account: account.account,
      accountName: account.displayName,
      property: property.property,
      propertyId: propertyIdFromName(property.property),
      displayName: property.displayName,
    })),
  )
}

async function getPropertyTitle(propertyId) {
  try {
    const properties = await listGa4Properties()
    const property = properties.find((item) => item.propertyId === propertyId)
    return property?.displayName || siteTitle || propertyId
  } catch {
    return siteTitle || propertyId
  }
}

function summarize(dailyRows, countryRows) {
  const totalViews = dailyRows.reduce((sum, row) => sum + row.views, 0)
  const totalSessions = dailyRows.reduce((sum, row) => sum + row.sessions, 0) || 1
  const avgBounce =
    dailyRows.reduce((sum, row) => sum + row.bounce * row.sessions, 0) / totalSessions
  const avgDuration =
    dailyRows.reduce((sum, row) => sum + row.avgDuration * row.sessions, 0) / totalSessions
  const days = new Set(dailyRows.map((row) => row.date)).size
  const topDay = dailyRows.reduce(
    (best, row) => (!best || row.views > best.views ? row : best),
    null,
  )

  return {
    totalViews,
    avgBounce,
    avgDuration,
    days,
    countries: countryRows.length,
    topDay: topDay?.date || '-',
  }
}

function aggregateDaily(rows) {
  const byDate = new Map()

  for (const row of rows) {
    const current = byDate.get(row.date) || {
      date: row.date,
      views: 0,
      sessions: 0,
      bounceWeight: 0,
      durationWeight: 0,
      hostnames: new Set(),
    }

    current.views += row.views
    current.sessions += row.sessions
    current.bounceWeight += row.bounce * row.sessions
    current.durationWeight += row.avgDuration * row.sessions
    current.hostnames.add(row.hostname)
    byDate.set(row.date, current)
  }

  return [...byDate.values()]
    .map((row) => ({
      date: row.date,
      hostname: [...row.hostnames].join(', '),
      views: row.views,
      sessions: row.sessions,
      bounce: row.sessions ? row.bounceWeight / row.sessions : 0,
      avgDuration: row.sessions ? row.durationWeight / row.sessions : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function aggregateHostnames(rows) {
  const byHostname = new Map()

  for (const row of rows) {
    byHostname.set(row.hostname, (byHostname.get(row.hostname) || 0) + row.views)
  }

  return [...byHostname.entries()]
    .map(([hostname, views]) => ({ hostname, views }))
    .sort((a, b) => b.views - a.views)
}

function aggregateCountries(rows) {
  const byCountry = new Map()

  for (const row of rows) {
    const key = `${row.country}::${row.code}`
    const current = byCountry.get(key) || { country: row.country, code: row.code, views: 0 }
    current.views += row.views
    byCountry.set(key, current)
  }

  return [...byCountry.values()].sort((a, b) => b.views - a.views)
}

export async function fetchReport({ propertyId, startDate, endDate, hostnameFilter }) {
  if (!propertyId) throw new Error('Missing propertyId')

  const client = getDataClient()
  const selectedSiteTitle = await getPropertyTitle(propertyId)

  const [dailyResponse] = await client.runReport({
    property: `properties/${propertyId}`,
    dimensions: [{ name: 'date' }, { name: 'hostName' }],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
      { name: 'sessions' },
    ],
    dateRanges: [{ startDate, endDate }],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  })

  const allDailyRows = (dailyResponse.rows || []).map((row) => ({
    date: parseGaDate(row.dimensionValues[0].value),
    hostname: row.dimensionValues[1].value,
    views: Number(row.metricValues[0].value || 0),
    bounce: normalizeBounce(row.metricValues[1].value),
    avgDuration: Number(row.metricValues[2].value || 0),
    sessions: Number(row.metricValues[3].value || 0),
  }))

  const dailyRows = allDailyRows.filter((row) => !hostnameFilter || row.hostname === hostnameFilter)

  const [countryResponse] = await client.runReport({
    property: `properties/${propertyId}`,
    dimensions: [{ name: 'country' }, { name: 'countryId' }, { name: 'hostName' }],
    metrics: [{ name: 'screenPageViews' }],
    dateRanges: [{ startDate, endDate }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 250,
  })

  const countryRows = aggregateCountries(
    (countryResponse.rows || [])
      .map((row) => ({
        country: row.dimensionValues[0].value,
        code: row.dimensionValues[1].value,
        hostname: row.dimensionValues[2].value,
        views: Number(row.metricValues[0].value || 0),
      }))
      .filter((row) => !hostnameFilter || row.hostname === hostnameFilter),
  )

  return {
    propertyId,
    siteTitle: hostnameFilter || selectedSiteTitle,
    configuredSiteTitle: selectedSiteTitle,
    selectedHostname: hostnameFilter,
    hostnames: aggregateHostnames(allDailyRows),
    range: { startDate, endDate },
    summary: summarize(dailyRows, countryRows),
    daily: aggregateDaily(dailyRows),
    dailyDetail: dailyRows.sort((a, b) => a.date.localeCompare(b.date)),
    countries: countryRows,
  }
}
