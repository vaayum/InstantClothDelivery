import React, { useEffect, useRef, useState } from 'react'
import bwipjs from 'bwip-js'
import { getInventoryAdmin, createAdjustment, assignSkuToBin, getBinLocations } from '../lib/inventoryApi'

interface InventoryItem {
  id: string
  quantityAvailable: number
  quantityReserved: number
  binLocationId: string | null
  binLocation: { locationCode: string } | null
  sku: {
    id: string; size: string; color: string; colorHex: string; barcode: string
    product: { name: string; brand: string; images: string[] }
  }
}

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function BarcodeCanvas({ value }: { value: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!ref.current) return
    try {
      bwipjs.toCanvas(ref.current, { bcid: 'code128', text: value, scale: 2, height: 10, includetext: true, textxalign: 'center' })
    } catch (_) {}
  }, [value])
  return <canvas ref={ref} style={{ maxWidth: '100%' }} />
}

function printBarcodeLabel(barcode: string, productName: string, skuDetails: string) {
  const w = window.open('', '_blank', 'width=400,height=300')
  if (!w) return
  w.document.write(`<!DOCTYPE html><html><head><title>Label</title>
<style>
  body{margin:0;font-family:monospace}
  .label{width:3in;border:1px solid #000;padding:8px;display:flex;flex-direction:column;align-items:center}
  canvas{max-width:100%}
  .name{font-size:11px;font-weight:bold;margin-top:4px;text-align:center}
  .detail{font-size:10px;color:#555;text-align:center}
  @media print{body{margin:0}}
</style></head><body>
<div class="label" id="root">
  <div class="name">${escHtml(productName)}</div>
  <div class="detail">${escHtml(skuDetails)}</div>
</div>
<script src="https://cdn.jsdelivr.net/npm/bwip-js@3/dist/bwip-js-min.js"></script>
<script>
  const c=document.createElement('canvas');
  bwipjs.toCanvas(c,{bcid:'code128',text:'${escHtml(barcode)}',scale:2,height:10,includetext:true,textxalign:'center'});
  document.getElementById('root').insertBefore(c,document.getElementById('root').firstChild);
  setTimeout(()=>{window.print();window.close()},300);
</script></body></html>`)
}

export default function InventoryPage({ warehouseId }: { warehouseId: string }) {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<InventoryItem | null>(null)
  const [adjustDelta, setAdjustDelta] = useState('')
  const [adjustReason, setAdjustReason] = useState('AUDIT_CORRECTION')
  const [adjustNotes, setAdjustNotes] = useState('')
  const [bins, setBins] = useState<{ id: string; locationCode: string }[]>([])
  const [assignBinId, setAssignBinId] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const load = async () => {
    setLoading(true)
    const data = await getInventoryAdmin(warehouseId, search || undefined)
    setItems(data)
    setLoading(false)
  }

  useEffect(() => { if (warehouseId) load() }, [warehouseId])

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load() }

  const handleAdjust = async () => {
    if (!selected) return
    const delta = parseInt(adjustDelta)
    if (isNaN(delta) || delta === 0) return setMsg('Enter a non-zero integer')
    await createAdjustment({ warehouseId, skuId: selected.sku.id, quantityDelta: delta, reason: adjustReason, notes: adjustNotes })
    setMsg('Adjustment saved')
    setAdjustDelta(''); setAdjustNotes('')
    load()
  }

  const handleAssignBin = async () => {
    if (!selected || !assignBinId) return
    await assignSkuToBin(assignBinId, selected.sku.id, warehouseId)
    setMsg('Bin assigned')
    load()
  }

  const openDetail = async (item: InventoryItem) => {
    setSelected(item); setMsg('')
    const b = await getBinLocations(warehouseId)
    setBins(b)
    setAssignBinId(item.binLocationId ?? '')
  }

  const styles = {
    page: { padding: '20px', color: '#fff', background: '#0f0f1a', minHeight: '100vh' } as React.CSSProperties,
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
    th: { background: '#1a1a2e', padding: '10px', textAlign: 'left' as const, borderBottom: '1px solid #333', color: '#aaa' },
    td: { padding: '10px', borderBottom: '1px solid #222', cursor: 'pointer' },
    panel: { position: 'fixed' as const, right: 0, top: 0, width: '380px', height: '100vh', background: '#1a1a2e', padding: '24px', overflowY: 'auto' as const, borderLeft: '1px solid #333', zIndex: 100 },
    input: { width: '100%', padding: '8px', background: '#0f0f1a', color: '#fff', border: '1px solid #444', borderRadius: '4px', marginBottom: '8px' },
    btn: { padding: '8px 16px', background: '#4a90e2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '8px' },
    btnGreen: { padding: '8px 16px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '8px' },
  }

  return (
    <div style={styles.page}>
      <h2 style={{ marginBottom: '16px' }}>Inventory — {warehouseId}</h2>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input placeholder="Search product, brand, color, size, barcode…" value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...styles.input, marginBottom: 0, flex: 1 }} />
        <button type="submit" style={styles.btn}>Search</button>
        <button type="button" onClick={() => { setSearch(''); setTimeout(load, 0) }} style={{ ...styles.btn, background: '#555' }}>Clear</button>
      </form>

      {loading && <p style={{ color: '#aaa' }}>Loading…</p>}

      <table style={styles.table}>
        <thead>
          <tr>
            {['Product', 'Brand', 'Size', 'Color', 'Barcode', 'Bin', 'Available', 'Reserved'].map(h => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} onClick={() => openDetail(item)}
              style={{ background: selected?.id === item.id ? '#252540' : 'transparent' }}>
              <td style={styles.td}>{item.sku.product.name}</td>
              <td style={styles.td}>{item.sku.product.brand}</td>
              <td style={styles.td}>{item.sku.size}</td>
              <td style={styles.td}>
                <span style={{ display: 'inline-block', width: 12, height: 12, background: item.sku.colorHex, borderRadius: 2, marginRight: 6, border: '1px solid #555' }} />
                {item.sku.color}
              </td>
              <td style={{ ...styles.td, fontFamily: 'monospace', fontSize: '12px' }}>{item.sku.barcode}</td>
              <td style={styles.td}>{item.binLocation?.locationCode ?? <span style={{ color: '#f59e0b' }}>Unassigned</span>}</td>
              <td style={{ ...styles.td, color: item.quantityAvailable <= 3 ? '#ef4444' : '#22c55e', fontWeight: 'bold' }}>
                {item.quantityAvailable}
              </td>
              <td style={{ ...styles.td, color: '#94a3b8' }}>{item.quantityReserved}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <div style={styles.panel}>
          <button onClick={() => setSelected(null)} style={{ ...styles.btn, background: '#555', marginBottom: '16px' }}>✕ Close</button>
          <h3 style={{ marginBottom: '4px' }}>{selected.sku.product.name}</h3>
          <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '16px' }}>
            {selected.sku.product.brand} · {selected.sku.color} · {selected.sku.size}
          </p>

          <div style={{ background: '#fff', padding: '12px', borderRadius: '8px', marginBottom: '16px', textAlign: 'center' }}>
            <BarcodeCanvas value={selected.sku.barcode} />
          </div>

          <button style={styles.btnGreen}
            onClick={() => printBarcodeLabel(selected.sku.barcode, selected.sku.product.name, `${selected.sku.color} / ${selected.sku.size}`)}>
            Print Label
          </button>

          <hr style={{ borderColor: '#333', margin: '16px 0' }} />
          <p style={{ marginBottom: '8px', fontSize: '13px' }}>
            <strong>Bin:</strong> {selected.binLocation?.locationCode ?? 'Unassigned'}
          </p>

          <label style={{ fontSize: '12px', color: '#aaa' }}>Assign Bin</label>
          <select value={assignBinId} onChange={(e) => setAssignBinId(e.target.value)} style={{ ...styles.input }}>
            <option value="">— select bin —</option>
            {bins.map((b) => <option key={b.id} value={b.id}>{b.locationCode}</option>)}
          </select>
          <button onClick={handleAssignBin} style={styles.btn}>Assign</button>

          <hr style={{ borderColor: '#333', margin: '16px 0' }} />
          <h4 style={{ marginBottom: '8px' }}>Adjust Stock</h4>
          <input type="number" placeholder="Delta (e.g. -3 or +10)" value={adjustDelta}
            onChange={(e) => setAdjustDelta(e.target.value)} style={styles.input} />
          <select value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} style={styles.input}>
            {['DAMAGE', 'SHRINKAGE', 'AUDIT_CORRECTION', 'FOUND', 'SYSTEM_ERROR', 'OTHER'].map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <input placeholder="Notes (optional)" value={adjustNotes}
            onChange={(e) => setAdjustNotes(e.target.value)} style={styles.input} />
          <button onClick={handleAdjust} style={{ ...styles.btn, background: '#f59e0b' }}>Apply Adjustment</button>

          {msg && <p style={{ color: '#22c55e', marginTop: '8px', fontSize: '13px' }}>{msg}</p>}
        </div>
      )}
    </div>
  )
}
