import { defaultPropertyId, listGa4Properties } from '../server/ga4-service.js'

export default async function handler(_req, res) {
  try {
    const properties = await listGa4Properties()
    res.status(200).json({
      defaultPropertyId,
      properties,
    })
  } catch (error) {
    res.status(400).json({ message: error.message || 'Cannot fetch GA4 properties' })
  }
}
