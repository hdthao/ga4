import {
  defaultHostnameFilter,
  defaultPropertyId,
  siteTitle,
} from '../server/ga4-service.js'

export default function handler(_req, res) {
  if (!defaultPropertyId) {
    res.status(500).json({ message: 'Missing GA4_PROPERTY_ID' })
    return
  }

  res.status(200).json({
    siteTitle: siteTitle || defaultPropertyId,
    propertyId: defaultPropertyId,
    hostnameFilter: defaultHostnameFilter,
  })
}
