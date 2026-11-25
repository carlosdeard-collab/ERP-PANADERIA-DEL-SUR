import { useEffect, useState, type FormEvent } from 'react'
import { api } from './services/api'
import { printElementById } from './services/print'

interface CashClose {
  id: number
  consecutivo: string
  usuario_apertura_id: number
  usuario_apertura_nombre: string
  usuario_cierre_id: number | null
  usuario_cierre_nombre: string | null
  estado: 'abierta' | 'cerrada'
  fecha_apertura: string
  fecha_cierre: string | null
  base_inicial: number
  ventas_efectivo: number
  ventas_digitales: number
  total_ventas: number
  gastos_efectivo: number
  compras_efectivo: number
  efectivo_esperado: number
  efectivo_contado: number | null
  diferencia: number | null
  observaciones: string | null
}

const money = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

function CashReceipt({ cashClose }: { cashClose: CashClose }) {
  const difference = cashClose.diferencia ?? 0
  const balanced = Math.abs(difference) < 0.005
  return (
    <div className="cash-receipt-print" id="cash-receipt-print">
      <div className="cash-receipt-header">
        <strong>ERP PANADERÍA</strong>
        <span>Comprobante de cierre de caja</span>
        <b>{cashClose.consecutivo}</b>
      </div>
      <div className="cash-receipt-meta">
        <span>Apertura: {new Date(cashClose.fecha_apertura).toLocaleString('es-CO')}</span>
        <span>Cierre: {cashClose.fecha_cierre ? new Date(cashClose.fecha_cierre).toLocaleString('es-CO') : '—'}</span>
        <span>Abrió: {cashClose.usuario_apertura_nombre}</span>
        <span>Cerró: {cashClose.usuario_cierre_nombre ?? '—'}</span>
      </div>
      <div className="cash-receipt-lines">
        <div><span>Base inicial</span><strong>{money.format(cashClose.base_inicial)}</strong></div>
        <div><span>Ventas en efectivo</span><strong>{money.format(cashClose.ventas_efectivo)}</strong></div>
        <div><span>Ventas digitales</span><strong>{money.format(cashClose.ventas_digitales)}</strong></div>
        <div><span>Gastos en efectivo</span><strong>- {money.format(cashClose.gastos_efectivo)}</strong></div>
        <div><span>Compras en efectivo</span><strong>- {money.format(cashClose.compras_efectivo)}</strong></div>
      </div>
      <div className="cash-receipt-total"><span>Efectivo esperado</span><strong>{money.format(cashClose.efectivo_esperado)}</strong></div>
      <div className="cash-receipt-total"><span>Efectivo contado</span><strong>{money.format(cashClose.efectivo_contado ?? 0)}</strong></div>
      <div className={`cash-receipt-difference ${balanced ? 'balanced' : difference > 0 ? 'surplus' : 'shortage'}`}>
        <span>{balanced ? 'Caja cuadrada' : difference > 0 ? 'Sobrante' : 'Faltante'}</span>
        <strong>{difference > 0 ? '+ ' : difference < 0 ? '- ' : ''}{money.format(Math.abs(difference))}</strong>
      </div>
      {cashClose.observaciones && <p className="cash-receipt-notes">{cashClose.observaciones}</p>}
    </div>
  )
}

export default function CashView({ isAdmin }: { isAdmin: boolean }) {
  const [activeCash, setActiveCash] = useState<CashClose | null>(null)
  const [history, setHistory] = useState<CashClose[]>([])
  const [openingBase, setOpeningBase] = useState(0)
  const [openingNotes, setOpeningNotes] = useState('')
  const [countedCash, setCountedCash] = useState(0)
  const [closingNotes, setClosingNotes] = useState('')
  const [closeModal, setCloseModal] = useState(false)
  const [receipt, setReceipt] = useState<CashClose | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const loadCash = async () => {
    try {
      const current = await api<CashClose | null>('/api/caja/activa')
      setActiveCash(current)
      if (isAdmin) setHistory(await api<CashClose[]>('/api/caja/historial'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible consultar la caja')
    }
  }

  useEffect(() => {
    void loadCash()
    const timer = window.setInterval(() => { void loadCash() }, 30000)
    return () => window.clearInterval(timer)
  }, [isAdmin])

  const openCash = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api<CashClose>('/api/caja/abrir', {
        method: 'POST',
        body: JSON.stringify({
          base_inicial: openingBase,
          observaciones: openingNotes.trim() || null,
        }),
      })
      setOpeningBase(0)
      setOpeningNotes('')
      await loadCash()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible abrir la caja')
    } finally {
      setSaving(false)
    }
  }

  const closeCash = async (event: FormEvent) => {
    event.preventDefault()
    if (!activeCash) return
    setError('')
    setSaving(true)
    try {
      const closed = await api<CashClose>(`/api/caja/${activeCash.id}/cerrar`, {
        method: 'POST',
        body: JSON.stringify({
          efectivo_contado: countedCash,
          observaciones: closingNotes.trim() || null,
        }),
      })
      setCloseModal(false)
      setClosingNotes('')
      setReceipt(closed)
      await loadCash()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cerrar la caja')
    } finally {
      setSaving(false)
    }
  }

  const printCashReceipt = () => {
    setError('')
    printElementById('cash-receipt-print', setError)
  }

  const difference = activeCash ? countedCash - activeCash.efectivo_esperado : 0
  const isBalanced = Math.abs(difference) < 0.005

  return (
    <div className="cash-view">
      <div className="inventory-heading">
        <h2>Control de Caja</h2>
        <p>Administra el turno, concilia efectivo y consulta los cierres registrados.</p>
      </div>
      {error && <div className="error-message">{error}</div>}

      {!activeCash ? (
        <section className="cash-opening-card">
          <div className="cash-opening-icon">$</div>
          <div><h3>Apertura de Turno</h3><p>Registra el efectivo inicial disponible en el cajón.</p></div>
          <form onSubmit={openCash}>
            <label>Base inicial en efectivo (COP)
              <input type="number" min="0" step="1" value={openingBase} onChange={(event) => setOpeningBase(Number(event.target.value))} required />
            </label>
            <label>Observaciones (opcional)
              <input value={openingNotes} onChange={(event) => setOpeningNotes(event.target.value)} maxLength={1000} />
            </label>
            <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Abriendo...' : 'Abrir caja'}</button>
          </form>
        </section>
      ) : (
        <>
          <div className="cash-active-heading">
            <div><span className="cash-live-dot" /> <strong>{activeCash.consecutivo} · Turno abierto</strong><small>Desde {new Date(activeCash.fecha_apertura).toLocaleString('es-CO')} · {activeCash.usuario_apertura_nombre}</small></div>
            <button type="button" className="secondary-button" onClick={() => void loadCash()}>Actualizar totales</button>
          </div>
          <div className="cash-stats">
            <article><span>Base inicial</span><strong>{money.format(activeCash.base_inicial)}</strong></article>
            <article><span>Ventas en efectivo</span><strong>{money.format(activeCash.ventas_efectivo)}</strong></article>
            <article><span>Ventas digitales</span><strong>{money.format(activeCash.ventas_digitales)}</strong><small>Nequi, Daviplata, tarjeta y transferencias</small></article>
            <article><span>Salidas de efectivo</span><strong>{money.format(activeCash.gastos_efectivo + activeCash.compras_efectivo)}</strong><small>Gastos {money.format(activeCash.gastos_efectivo)} · Compras {money.format(activeCash.compras_efectivo)}</small></article>
            <article className="expected-cash"><span>Efectivo esperado en cajón</span><strong>{money.format(activeCash.efectivo_esperado)}</strong></article>
          </div>
          <div className="cash-close-action">
            <div><strong>¿Finalizó el turno?</strong><small>Cuenta físicamente el efectivo antes de cerrar.</small></div>
            <button type="button" className="primary-button" onClick={() => {
              setCountedCash(activeCash.efectivo_esperado)
              setClosingNotes('')
              setCloseModal(true)
            }}>Realizar Arqueo y Cerrar Caja</button>
          </div>
        </>
      )}

      {isAdmin && (
        <section className="inventory-panel cash-history">
          <div className="inventory-toolbar"><div><h3>Historial de Cierres de Caja</h3><p>Turnos cerrados con su arqueo y diferencia.</p></div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Cierre / Fecha</th><th>Abrió / Cerró</th><th>Ventas</th><th>Esperado</th><th>Contado</th><th>Diferencia</th><th>Comprobante</th></tr></thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.consecutivo}</strong><small className="sub-cell">{item.fecha_cierre ? new Date(item.fecha_cierre).toLocaleString('es-CO') : '—'}</small></td>
                    <td>{item.usuario_apertura_nombre}<small className="sub-cell">{item.usuario_cierre_nombre ?? '—'}</small></td>
                    <td>{money.format(item.total_ventas)}</td>
                    <td>{money.format(item.efectivo_esperado)}</td>
                    <td>{money.format(item.efectivo_contado ?? 0)}</td>
                    <td className={(item.diferencia ?? 0) < 0 ? 'cash-shortage' : (item.diferencia ?? 0) > 0 ? 'cash-surplus' : ''}>{money.format(item.diferencia ?? 0)}</td>
                    <td><button type="button" className="edit-button" onClick={() => setReceipt(item)}>Ver / imprimir</button></td>
                  </tr>
                ))}
                {history.length === 0 && <tr><td colSpan={7} className="empty-row">Aún no hay cierres registrados.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {closeModal && activeCash && (
        <div className="modal-backdrop">
          <form className="modal cash-close-modal" onSubmit={closeCash}>
            <h2>Arqueo {activeCash.consecutivo}</h2>
            <p className="modal-hint">Efectivo esperado: <strong>{money.format(activeCash.efectivo_esperado)}</strong></p>
            <label>Efectivo contado físicamente (COP)
              <input autoFocus type="number" min="0" step="1" value={countedCash} onChange={(event) => setCountedCash(Number(event.target.value))} required />
            </label>
            <div className={`cash-difference-preview ${isBalanced ? 'balanced' : difference > 0 ? 'surplus' : 'shortage'}`}>
              <span>{isBalanced ? 'Caja cuadrada' : difference > 0 ? 'Sobrante (+)' : 'Faltante (-)'}</span>
              <strong>{isBalanced ? money.format(0) : `${difference > 0 ? '+' : '-'} ${money.format(Math.abs(difference))}`}</strong>
            </div>
            <label>Observaciones de cierre (opcional)<textarea rows={3} maxLength={1000} value={closingNotes} onChange={(event) => setClosingNotes(event.target.value)} /></label>
            <div className="modal-actions"><button type="button" onClick={() => setCloseModal(false)}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Cerrando...' : 'Confirmar cierre'}</button></div>
          </form>
        </div>
      )}

      {receipt && (
        <div className="modal-backdrop cash-receipt-backdrop">
          <section className="modal cash-receipt-modal">
            <button type="button" className="modal-close" aria-label="Cerrar comprobante" onClick={() => setReceipt(null)}>×</button>
            <CashReceipt cashClose={receipt} />
            <div className="modal-actions"><button type="button" className="primary-button" onClick={printCashReceipt}>Imprimir comprobante</button><button type="button" onClick={() => setReceipt(null)}>Cerrar</button></div>
          </section>
        </div>
      )}
    </div>
  )
}
