import React, { useEffect, useState } from 'react'
import { getBinLocations, createBinLocation, updateBinLocation } from '../lib/inventoryApi'

interface BinLocation {
  id: string; zone: string; aisle: string; rack: string; shelf: string
  locationCode: string; capacity: number; isActive: boolean
  inventory: { id: string; quantityAvailable: number; sku: { size: string; color: string; product: { name: string } } }[]
}

export default function BinLocationsPage({ warehouseId }: { warehouseId: string }) {
  const [bins, setBins] = useState<BinLocation[]>([])
  const [zone, setZone] = useState('A')
  const [aisle, setAisle] = useState('01')
  const [rack, setRack] = useState('01')
  const [shelf, setShelf] = useState('1')
  const [capacity, setCapacity] = useState('100')
  const [filterZone, setFilterZone] = useState('')
  const [msg, setMsg] = useState('')

  const load = () => getBinLocations(warehouseId).then(setBins)
  useEffect(() => { if (warehouseId) load() }, [warehouseId])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createBinLocation({ warehouseId, zone, aisle, rack, shelf, capacity: parseInt(capacity) })
      setMsg('Bin created'); load()
    } catch (err: any) {
      setMsg(err.response?.data?.error ?? 'Error')
    }
  }

  const toggleActive = async (bin: BinLocation) => {
    await updateBinLocation(bin.id, { isActive: !bin.isActive })
    load()
  }

  const styles = {
    page: { padding: '20px', color: '#fff', background: '#0f0f1a', minHeight: '100vh' } as React.CSSProperties,
    input: { padding: '8px', background: '#0f0f1a', color: '#fff', border: '1px solid #444', borderRadius: '4px' },
    btn: (color = '#4a90e2') => ({ padding: '8px 16px', background: color, color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' } as React.CSSProperties),
    th: { background: '#1a1a2e', padding: '10px', textAlign: 'left' as const, borderBottom: '1px solid #333', color: '#aaa' },
    td: { padding: '10px', borderBottom: '1px solid #222' },
  }

  const filtered = filterZone ? bins.filter(b => b.zone === filterZone) : bins
  const zones = Array.from(new Set(bins.map(b => b.zone))).sort()

  return (
    <div style={styles.page}>
      <h2>Bin Locations</h2>

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px', alignItems: 'flex-end' }}>
        {[['Zone', zone, setZone], ['Aisle', aisle, setAisle], ['Rack', rack, setRack], ['Shelf', shelf, setShelf]].map(([label, val, set]: any) => (
          <label key={label} style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#aaa' }}>
            {label}
            <input value={val} onChange={e => set(e.target.value)} style={{ ...styles.input, width: '70px' }} />
          </label>
        ))}
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#aaa' }}>
          Capacity
          <input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} style={{ ...styles.input, width: '80px' }} />
        </label>
        <button type="submit" style={styles.btn()}>+ Add Bin</button>
        {msg && <span style={{ color: '#22c55e', fontSize: '13px', alignSelf: 'center' }}>{msg}</span>}
      </form>

      <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span style={{ color: '#aaa', fontSize: '13px' }}>Filter zone:</span>
        <button onClick={() => setFilterZone('')} style={{ ...styles.btn(!filterZone ? '#4a90e2' : '#333'), padding: '4px 10px', fontSize: '12px' }}>All</button>
        {zones.map(z => (
          <button key={z} onClick={() => setFilterZone(z)} style={{ ...styles.btn(filterZone === z ? '#4a90e2' : '#333'), padding: '4px 10px', fontSize: '12px' }}>{z}</button>
        ))}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr>{['Code', 'Zone', 'Aisle', 'Rack', 'Shelf', 'Capacity', 'SKUs stored', 'Active'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {filtered.map(bin => (
            <tr key={bin.id} style={{ background: bin.isActive ? 'transparent' : '#1a0a0a' }}>
              <td style={{ ...styles.td, fontFamily: 'monospace', fontWeight: 'bold' }}>{bin.locationCode}</td>
              <td style={styles.td}>{bin.zone}</td>
              <td style={styles.td}>{bin.aisle}</td>
              <td style={styles.td}>{bin.rack}</td>
              <td style={styles.td}>{bin.shelf}</td>
              <td style={styles.td}>{bin.capacity}</td>
              <td style={styles.td}>
                {bin.inventory.length > 0
                  ? bin.inventory.map(i => `${i.sku.product.name} ${i.sku.color}/${i.sku.size} (${i.quantityAvailable})`).join(', ')
                  : <span style={{ color: '#555' }}>Empty</span>}
              </td>
              <td style={styles.td}>
                <button onClick={() => toggleActive(bin)}
                  style={styles.btn(bin.isActive ? '#22c55e' : '#ef4444')}>
                  {bin.isActive ? 'Active' : 'Inactive'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
