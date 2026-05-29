import React, { useEffect, useState } from 'react'
import { getAdjustments, createAdjustment, getInventoryAdmin } from '../lib/inventoryApi'

interface Adjustment {
  id: string; quantityDelta: number; reason: string; notes: string | null; createdAt: string
  sku: { size: string; color: string; barcode: string; product: { name: string; brand: string } }
}

const REASONS = ['DAMAGE', 'SHRINKAGE', 'AUDIT_CORRECTION', 'FOUND', 'SYSTEM_ERROR', 'OTHER']

export default function AdjustmentsPage({ warehouseId }: { warehouseId: string }) {
  const [adjustments, setAdjustments] = useState<Adjustment[]>([])
  const [skuList, setSkuList] = useState<{ sku: { id: string; size: string; color: string; product: { name: string; brand: string } } }[]>([])
  const [skuId, setSkuId] = useState('')
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('AUDIT_CORRECTION')
  const [notes, setNotes] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const load = () => getAdjustments(warehouseId).then(setAdjustments)

  useEffect(() => {
    if (warehouseId) {
      load()
      getInventoryAdmin(warehouseId).then(setSkuList)
    }
  }, [warehouseId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setMsg('')
    const d = parseInt(delta)
    if (isNaN(d) || d === 0) return setError('Delta must be a non-zero integer')
    if (!skuId) return setError('Select a SKU')
    try {
      await createAdjustment({ warehouseId, skuId, quantityDelta: d, reason, notes: notes || undefined })
      setMsg('Adjustment recorded'); setDelta(''); setNotes(''); setSkuId('')
      load()
    } catch (err: any) { setError(err.response?.data?.error ?? 'Error') }
  }

  const sInput = { padding: '8px', background: '#0f0f1a', color: '#fff', border: '1px solid #444', borderRadius: '4px', width: '100%', marginBottom: '8px' } as React.CSSProperties
  const sBtn = { padding: '8px 16px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' } as React.CSSProperties
  const sTh = { background: '#1a1a2e', padding: '10px', textAlign: 'left' as const, borderBottom: '1px solid #333', color: '#aaa' }
  const sTd = { padding: '10px', borderBottom: '1px solid #222' }

  return (
    <div style={{ padding: '20px', color: '#fff', background: '#0f0f1a', minHeight: '100vh' }}>
      <h2 style={{ marginBottom: '20px' }}>Stock Adjustments</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '32px' }}>

        <div>
          <h4 style={{ marginBottom: '12px' }}>New Adjustment</h4>
          <form onSubmit={handleSubmit}>
            <label style={{ fontSize: '12px', color: '#aaa' }}>SKU *
              <select value={skuId} onChange={e => setSkuId(e.target.value)} style={sInput}>
                <option value="">— select SKU —</option>
                {skuList.map(inv => (
                  <option key={inv.sku.id} value={inv.sku.id}>
                    {inv.sku.product.name} / {inv.sku.color} / {inv.sku.size}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: '12px', color: '#aaa' }}>Quantity delta * (negative to remove)
              <input type="number" value={delta} onChange={e => setDelta(e.target.value)} placeholder="e.g. -5 or +10" style={sInput} />
            </label>

            <label style={{ fontSize: '12px', color: '#aaa' }}>Reason *
              <select value={reason} onChange={e => setReason(e.target.value)} style={sInput}>
                {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>

            <label style={{ fontSize: '12px', color: '#aaa' }}>Notes
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" style={sInput} />
            </label>

            <button type="submit" style={sBtn}>Record Adjustment</button>
            {msg && <p style={{ color: '#22c55e', marginTop: '8px', fontSize: '13px' }}>{msg}</p>}
            {error && <p style={{ color: '#ef4444', marginTop: '8px', fontSize: '13px' }}>{error}</p>}
          </form>
        </div>

        <div>
          <h4 style={{ marginBottom: '12px' }}>Recent Adjustments</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>{['SKU', 'Delta', 'Reason', 'Notes', 'Date'].map(h => <th key={h} style={sTh}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {adjustments.map(adj => (
                <tr key={adj.id}>
                  <td style={sTd}>{adj.sku.product.name} / {adj.sku.color} / {adj.sku.size}</td>
                  <td style={{ ...sTd, color: adj.quantityDelta > 0 ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>
                    {adj.quantityDelta > 0 ? '+' : ''}{adj.quantityDelta}
                  </td>
                  <td style={sTd}><span style={{ padding: '2px 6px', background: '#333', borderRadius: '4px', fontSize: '11px' }}>{adj.reason}</span></td>
                  <td style={{ ...sTd, color: '#aaa', fontSize: '12px' }}>{adj.notes ?? '—'}</td>
                  <td style={{ ...sTd, color: '#aaa', fontSize: '12px' }}>{new Date(adj.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}
