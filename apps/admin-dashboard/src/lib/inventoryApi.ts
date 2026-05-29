import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:3000' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const getInventoryAdmin = (warehouseId: string, search?: string) =>
  api.get('/api/warehouse/inventory/admin', { params: { warehouseId, ...(search ? { search } : {}) } }).then((r) => r.data)

export const getBinLocations = (warehouseId: string) =>
  api.get('/api/warehouse/bin-locations', { params: { warehouseId } }).then((r) => r.data)

export const createBinLocation = (data: {
  warehouseId: string; zone: string; aisle: string; rack: string; shelf: string; capacity?: number
}) => api.post('/api/warehouse/bin-locations', data).then((r) => r.data)

export const updateBinLocation = (id: string, data: { capacity?: number; isActive?: boolean }) =>
  api.put(`/api/warehouse/bin-locations/${id}`, data).then((r) => r.data)

export const assignSkuToBin = (binId: string, skuId: string, warehouseId: string) =>
  api.patch(`/api/warehouse/bin-locations/${binId}/assign-sku`, { skuId, warehouseId }).then((r) => r.data)

export const getInboundShipments = (warehouseId: string) =>
  api.get('/api/warehouse/inbound', { params: { warehouseId } }).then((r) => r.data)

export const createInboundShipment = (data: {
  warehouseId: string; supplier: string; referenceNo: string;
  expectedAt?: string; notes?: string; items: { skuId: string; expectedQty: number }[]
}) => api.post('/api/warehouse/inbound', data).then((r) => r.data)

export const receiveInboundItems = (
  shipmentId: string,
  items: { itemId: string; receivedQty: number; binLocationId?: string }[]
) => api.post(`/api/warehouse/inbound/${shipmentId}/receive-items`, { items }).then((r) => r.data)

export const completeInboundShipment = (shipmentId: string) =>
  api.post(`/api/warehouse/inbound/${shipmentId}/complete`).then((r) => r.data)

export const getAdjustments = (warehouseId: string, skuId?: string) =>
  api.get('/api/warehouse/adjustments', { params: { warehouseId, ...(skuId ? { skuId } : {}) } }).then((r) => r.data)

export const createAdjustment = (data: {
  warehouseId: string; skuId: string; quantityDelta: number; reason: string; notes?: string
}) => api.post('/api/warehouse/adjustments', data).then((r) => r.data)

export const createSku = (data: {
  productId: string; size: string; color: string; colorHex: string; barcode?: string
}) => api.post('/api/admin/skus', data).then((r) => r.data)

export const getWarehouses = () =>
  api.get('/api/admin/warehouse').then((r) => r.data)
