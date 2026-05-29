import React, { useEffect, useState } from 'react'
import { getInboundShipments, createInboundShipment, receiveInboundItems, completeInboundShipment, getBinLocations, getInventoryAdmin } from '../lib/inventoryApi'

interface ShipmentItem { id: string; skuId: string; expectedQty: number; receivedQty: number; binLocationId: string | null; sku: { size: string; color: string; barcode: string; product: { name: string; brand: string } } }
interface Shipment { id: string; referenceNo: string; supplier: string; status: string; expectedAt: string | null; items: ShipmentItem[] }

const STATUS_COLOR: Record<string, string> = { EXPECTED: '#f59e0b', RECEIVING: '#4a90e2', COMPLETED: '#22c55e', DISCREPANCY: '#ef4444' }

export default function InboundPage({ warehouseId }: { warehouseId: string }) {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [selected, setSelected] = useState<Shipment | null>(null)
  const [view, setView] = useState<'list' | 'create' | 'receive'>('list')
  const [bins, setBins] = useState<{ id: string; locationCode: string }[]>([])
  const [skuList, setSkuList] = useState<{ sku: { id: string; size: string; color: string; barcode: string; product: { name: string; brand: string } } }[]>([])
  const [form, setForm] = useState({ supplier: '', referenceNo: '', expectedAt: '', notes: '', items: [{ skuId: '', expectedQty: 1 }] })
  const [receiveData, setReceiveData] = useState<Record<string, { qty: string; binLocationId: string }>>({})
  const [msg, setMsg] = useState('')

  const load = () => getInboundShipments(warehouseId).then(setShipments)

  useEffect(() => {
    if (warehouseId) {
      load()
      getBinLocations(warehouseId).then(setBins)
      getInventoryAdmin(warehouseId).then(setSkuList)
    }
  }, [warehouseId])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const validItems = form.items.filter(i => i.skuId)
    if (!validItems.length) return setMsg('Add at least one SKU')
    try {
      await createInboundShipment({ warehouseId, supplier: form.supplier, referenceNo: form.referenceNo, expectedAt: form.expectedAt || undefined, notes: form.notes || undefined, items: validItems.map(i => ({ skuId: i.skuId, expectedQty: i.expectedQty })) })
      setMsg('Shipment created'); setView('list'); load()
    } catch (err: any) { setMsg(err.response?.data?.error ?? 'Error') }
  }

  const openReceive = (shipment: Shipment) => {
    setSelected(shipment)
    const init: Record<string, { qty: string; binLocationId: string }> = {}
    shipment.items.forEach(i => { init[i.id] = { qty: String(i.expectedQty), binLocationId: i.binLocationId ?? '' } })
    setReceiveData(init)
    setView('receive')
  }

  const handleReceive = async () => {
    if (!selected) return
    const items = Object.entries(receiveData).map(([itemId, { qty, binLocationId }]) => ({
      itemId, receivedQty: parseInt(qty) || 0, binLocationId: binLocationId || undefined
    }))
    await receiveInboundItems(selected.id, items)
    setMsg('Items received'); load()
  }

  const handleComplete = async () => {
    if (!selected) return
    const result = await completeInboundShipment(selected.id)
    setMsg(`Shipment marked ${result.status}`)
    setView('list'); load()
  }

  const sBtn = (color = '#4a90e2') => ({ padding: '8px 16px', background: color, color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '8px' } as React.CSSProperties)
  const sInput = { padding: '8px', background: '#0f0f1a', color: '#fff', border: '1px solid #444', borderRadius: '4px', width: '100%', marginBottom: '8px' } as React.CSSProperties
  const sTh = { background: '#1a1a2e', padding: '10px', textAlign: 'left' as const, borderBottom: '1px solid #333', color: '#aaa' }
  const sTd = { padding: '10px', borderBottom: '1px solid #222' }
  const badge = (s: string) => ({ padding: '3px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold', background: STATUS_COLOR[s] ?? '#555', color: '#fff' } as React.CSSProperties)
  const page = { padding: '20px', color: '#fff', background: '#0f0f1a', minHeight: '100vh' } as React.CSSProperties

  if (view === 'create') return (
    <div style={page}>
      <h2>New Inbound Shipment</h2>
      <button onClick={() => setView('list')} style={sBtn('#555')}>Back</button>
      <form onSubmit={handleCreate} style={{ maxWidth: '600px', marginTop: '16px' }}>
        {[['Supplier *', 'supplier', 'text'], ['Reference / PO # *', 'referenceNo', 'text'], ['Expected date', 'expectedAt', 'date'], ['Notes', 'notes', 'text']].map(([label, field, type]) => (
          <label key={field} style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '8px' }}>
            {label}
            <input type={type} required={field === 'supplier' || field === 'referenceNo'} value={(form as any)[field]}
              onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} style={sInput} />
          </label>
        ))}
        <h4>Items</h4>
        {form.items.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <select value={item.skuId} onChange={e => setForm(f => { const items = [...f.items]; items[idx].skuId = e.target.value; return { ...f, items } })}
              style={{ ...sInput, marginBottom: 0, flex: 2 }}>
              <option value="">— select SKU —</option>
              {skuList.map(inv => (
                <option key={inv.sku.id} value={inv.sku.id}>{inv.sku.product.name} / {inv.sku.color} / {inv.sku.size} [{inv.sku.barcode}]</option>
              ))}
            </select>
            <input type="number" min="1" value={item.expectedQty} onChange={e => setForm(f => { const items = [...f.items]; items[idx].expectedQty = parseInt(e.target.value); return { ...f, items } })}
              style={{ ...sInput, marginBottom: 0, width: '80px' }} />
            {form.items.length > 1 && <button type="button" onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))} style={sBtn('#ef4444')}>×</button>}
          </div>
        ))}
        <button type="button" onClick={() => setForm(f => ({ ...f, items: [...f.items, { skuId: '', expectedQty: 1 }] }))} style={sBtn('#555')}>+ Add Item</button>
        <div style={{ marginTop: '16px' }}>
          <button type="submit" style={sBtn()}>Create Shipment</button>
          {msg && <span style={{ color: '#ef4444', fontSize: '13px', marginLeft: '8px' }}>{msg}</span>}
        </div>
      </form>
    </div>
  )

  if (view === 'receive' && selected) return (
    <div style={page}>
      <h2>Receive: {selected.referenceNo}</h2>
      <p style={{ color: '#aaa', fontSize: '13px' }}>Supplier: {selected.supplier} · <span style={badge(selected.status)}>{selected.status}</span></p>
      <button onClick={() => setView('list')} style={sBtn('#555')}>Back</button>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginTop: '16px' }}>
        <thead>
          <tr>{['SKU', 'Barcode', 'Expected', 'Received Qty', 'Assign Bin'].map(h => <th key={h} style={sTh}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {selected.items.map(item => (
            <tr key={item.id}>
              <td style={sTd}>{item.sku.product.name} / {item.sku.color} / {item.sku.size}</td>
              <td style={{ ...sTd, fontFamily: 'monospace', fontSize: '12px' }}>{item.sku.barcode}</td>
              <td style={sTd}>{item.expectedQty}</td>
              <td style={sTd}>
                <input type="number" min="0" value={receiveData[item.id]?.qty ?? ''}
                  onChange={e => setReceiveData(d => ({ ...d, [item.id]: { ...d[item.id], qty: e.target.value } }))}
                  style={{ width: '80px', padding: '4px', background: '#0f0f1a', color: '#fff', border: '1px solid #444', borderRadius: '4px' }} />
              </td>
              <td style={sTd}>
                <select value={receiveData[item.id]?.binLocationId ?? ''}
                  onChange={e => setReceiveData(d => ({ ...d, [item.id]: { ...d[item.id], binLocationId: e.target.value } }))}
                  style={{ padding: '4px', background: '#0f0f1a', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}>
                  <option value="">— no bin —</option>
                  {bins.map(b => <option key={b.id} value={b.id}>{b.locationCode}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button onClick={handleReceive} style={sBtn()}>Save Received Quantities</button>
        <button onClick={handleComplete} style={sBtn('#22c55e')}>Mark Complete</button>
        {msg && <span style={{ color: '#22c55e', fontSize: '13px' }}>{msg}</span>}
      </div>
    </div>
  )

  return (
    <div style={page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2>Inbound Shipments</h2>
        <button onClick={() => setView('create')} style={sBtn()}>+ New Shipment</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr>{['Reference', 'Supplier', 'Status', 'Expected', 'Items', 'Actions'].map(h => <th key={h} style={sTh}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {shipments.map(s => (
            <tr key={s.id}>
              <td style={{ ...sTd, fontFamily: 'monospace' }}>{s.referenceNo}</td>
              <td style={sTd}>{s.supplier}</td>
              <td style={sTd}><span style={badge(s.status)}>{s.status}</span></td>
              <td style={sTd}>{s.expectedAt ? new Date(s.expectedAt).toLocaleDateString() : '—'}</td>
              <td style={sTd}>{s.items.length} SKUs</td>
              <td style={sTd}>
                {s.status !== 'COMPLETED' && <button onClick={() => openReceive(s)} style={sBtn()}>Receive Items</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
