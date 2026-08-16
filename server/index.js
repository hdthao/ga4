import cors from 'cors'
import express from 'express'
import {
  assertIsoDate,
  defaultHostnameFilter,
  defaultPropertyId,
  fetchReport,
  listGa4Properties,
  siteTitle,
} from './ga4-service.js'

const app = express()
const port = Number(process.env.PORT || 5174)

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())

app.get('/api/config', (_req, res) => {
  if (!defaultPropertyId) {
    res.status(500).json({ message: 'Missing GA4_PROPERTY_ID' })
    return
  }

  res.json({
    siteTitle: siteTitle || defaultPropertyId,
    propertyId: defaultPropertyId,
    hostnameFilter: defaultHostnameFilter,
  })
})

app.get('/api/properties', async (_req, res) => {
  try {
    const properties = await listGa4Properties()
    res.json({
      defaultPropertyId,
      properties,
    })
  } catch (error) {
    res.status(400).json({ message: error.message || 'Cannot fetch GA4 properties' })
  }
})

app.get('/api/report', async (req, res) => {
  try {
    const propertyId = String(req.query.propertyId || defaultPropertyId || '').trim()
    const startDate = String(req.query.startDate || '')
    const endDate = String(req.query.endDate || '')
    const hostnameFilter = String(req.query.hostname || defaultHostnameFilter || '').trim()

    assertIsoDate(startDate, 'startDate')
    assertIsoDate(endDate, 'endDate')

    const report = await fetchReport({ propertyId, startDate, endDate, hostnameFilter })
    res.json(report)
  } catch (error) {
    res.status(400).json({ message: error.message || 'Cannot fetch report' })
  }
})

app.listen(port, () => {
  console.log(`GA4 API server running at http://localhost:${port}`)
})
