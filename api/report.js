import {
  assertIsoDate,
  defaultHostnameFilter,
  defaultPropertyId,
  fetchReport,
} from '../server/ga4-service.js'

export default async function handler(req, res) {
  try {
    const propertyId = String(req.query.propertyId || defaultPropertyId || '').trim()
    const startDate = String(req.query.startDate || '')
    const endDate = String(req.query.endDate || '')
    const hostnameFilter = String(req.query.hostname || defaultHostnameFilter || '').trim()

    assertIsoDate(startDate, 'startDate')
    assertIsoDate(endDate, 'endDate')

    const report = await fetchReport({ propertyId, startDate, endDate, hostnameFilter })
    res.status(200).json(report)
  } catch (error) {
    res.status(400).json({ message: error.message || 'Cannot fetch report' })
  }
}
