import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from './services/api'

type ExpenseCategory =
  | 'servicios_publicos'
  | 'gas_horno'
  | 'arriendo'
  | 'nomina'
  | 'aseo_empaques'
  | 'mantenimiento'
  | 'otros'
type ExpenseMethod = 'efectivo_caja' | 'transferencia' | 'nequi' | 'daviplata' | 'otro'

interface Expense {
  id: number
  consecutivo: string
  categoria: ExpenseCategory
  descripcion: string
  monto: number
  metodo_pago: ExpenseMethod
  comprobante_ref: string | null
  cierre_caja_id: number | null
  cierre_caja_consecutivo: string | null
  usuario_id: number
  usuario_nombre: string
  anulado: boolean
  fecha_gasto: string
}

interface CashSummary {
  consecutivo: string
  estado: 'abierta' | 'cerrada'
}

const money = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

const today = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const monthStart = () => `${today().slice(0, 8)}01`

const categoryLabels: Record<ExpenseCategory, string> = {
  servicios_publicos: 'Servicios públicos',
  gas_horno: 'Gas del horno',
  arriendo: 'Arriendo',
  nomina: 'Nómina',
  aseo_empaques: 'Aseo y empaques',
  mantenimiento: 'Mantenimiento',
  otros: 'Otros',
}

const paymentLabels: Record<ExpenseMethod, string> = {
  efectivo_caja: 'Efectivo de caja',
  transferencia: 'Transferencia',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  otro: 'Otro',
}

export default function ExpensesView() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [monthExpenses, setMonthExpenses] = useState<Expense[]>([])
  const [activeCash, setActiveCash] = useState<CashSummary | null>(null)
  const [startDate, setStartDate] = useState(monthStart)
  const [endDate, setEndDate] = useState(today)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'vigentes' | 'anulados'>('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    categoria: 'servicios_publicos' as ExpenseCategory,
    descripcion: '',
    monto: 0,
    metodo_pago: 'transferencia' as ExpenseMethod,
    comprobante_ref: '',
  })

  const loadExpenses = async () => {
    try {
      const filters = new URLSearchParams()
      if (startDate) filters.set('fecha_desde', startDate)
      if (endDate) filters.set('fecha_hasta', endDate)
      if (categoryFilter) filters.set('categoria', categoryFilter)
      if (statusFilter !== 'todos') filters.set('anulado', String(statusFilter === 'anulados'))
      const monthFilters = new URLSearchParams({
        fecha_desde: monthStart(),
        fecha_hasta: today(),
        anulado: 'false',
      })
      const [filteredExpenses, monthlyExpenses, cash] = await Promise.all([
        api<Expense[]>(`/api/gastos?${filters.toString()}`),
        api<Expense[]>(`/api/gastos?${monthFilters.toString()}`),
        api<CashSummary | null>('/api/caja/activa'),
      ])
      setExpenses(filteredExpenses)
      setMonthExpenses(monthlyExpenses)
      setActiveCash(cash)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar los gastos')
    }
  }

  useEffect(() => { void loadExpenses() }, [startDate, endDate, categoryFilter, statusFilter])

  const summary = useMemo(() => {
    const total = monthExpenses.reduce((sum, expense) => sum + expense.monto, 0)
    const cash = monthExpenses
      .filter((expense) => expense.metodo_pago === 'efectivo_caja')
      .reduce((sum, expense) => sum + expense.monto, 0)
    const other = total - cash
    const dayTotal = monthExpenses
      .filter((expense) => expense.fecha_gasto.slice(0, 10) === today())
      .reduce((sum, expense) => sum + expense.monto, 0)
    return { total, cash, other, dayTotal }
  }, [monthExpenses])

  const registerExpense = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api<Expense>('/api/gastos', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          descripcion: form.descripcion.trim(),
          comprobante_ref: form.comprobante_ref.trim() || null,
        }),
      })
      setModalOpen(false)
      setForm({
        categoria: 'servicios_publicos',
        descripcion: '',
        monto: 0,
        metodo_pago: 'transferencia',
        comprobante_ref: '',
      })
      await loadExpenses()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible registrar el gasto')
    } finally {
      setSaving(false)
    }
  }

  const cancelExpense = async (expense: Expense) => {
    if (!window.confirm(`¿Anular el gasto ${expense.consecutivo} por ${money.format(expense.monto)}?`)) return
    setError('')
    try {
      await api<Expense>(`/api/gastos/${expense.id}/anular`, { method: 'POST' })
      await loadExpenses()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible anular el gasto')
    }
  }

  return (
    <div className="expenses-view">
      <div className="inventory-heading">
        <h2>Gastos Operativos</h2>
        <p>Registra y consulta los desembolsos del negocio, con trazabilidad por medio de pago.</p>
      </div>
      {error && <div className="error-message">{error}</div>}
      <div className="inventory-stats expense-stats">
        <article><span>Total de gastos del mes</span><strong>{money.format(summary.total)}</strong><small>Hoy: {money.format(summary.dayTotal)}</small></article>
        <article><span>Pagados desde efectivo en caja</span><strong>{money.format(summary.cash)}</strong><small>Se descuentan del efectivo esperado del turno.</small></article>
        <article><span>Transferencia y otros medios</span><strong>{money.format(summary.other)}</strong><small>Nequi, Daviplata, transferencia u otro.</small></article>
      </div>

      <section className="inventory-panel">
        <div className="inventory-toolbar expense-toolbar">
          <div><h3>Historial de gastos</h3><p>Los registros anulados se conservan para auditoría.</p></div>
          <button type="button" className="primary-button" onClick={() => {
            setError('')
            setModalOpen(true)
          }}>+ Registrar gasto</button>
        </div>
        <div className="expense-filters">
          <label>Desde<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label>Hasta<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          <label>Categoría<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">Todas</option>
            {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label>Estado<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="todos">Todos</option><option value="vigentes">Vigentes</option><option value="anulados">Anulados</option>
          </select></label>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Gasto / Fecha</th><th>Categoría / Descripción</th><th>Medio de pago</th><th>Valor</th><th>Comprobante</th><th>Responsable / Caja</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id} className={expense.anulado ? 'expense-cancelled-row' : ''}>
                  <td><strong>{expense.consecutivo}</strong><small className="sub-cell">{new Date(expense.fecha_gasto).toLocaleString('es-CO')}</small></td>
                  <td><strong>{categoryLabels[expense.categoria]}</strong><small className="sub-cell">{expense.descripcion}</small></td>
                  <td>{paymentLabels[expense.metodo_pago]}</td>
                  <td>{money.format(expense.monto)}</td>
                  <td>{expense.comprobante_ref || '—'}</td>
                  <td>{expense.usuario_nombre}<small className="sub-cell">{expense.cierre_caja_consecutivo ?? 'Sin caja vinculada'}</small></td>
                  <td><span className={`expense-status ${expense.anulado ? 'void' : 'active'}`}>{expense.anulado ? 'Anulado' : 'Vigente'}</span></td>
                  <td>{!expense.anulado && <button type="button" className="expense-cancel-button" onClick={() => void cancelExpense(expense)}>Anular</button>}</td>
                </tr>
              ))}
              {expenses.length === 0 && <tr><td colSpan={8} className="empty-row">No hay gastos para los filtros seleccionados.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <div className="modal-backdrop">
          <form className="modal expense-modal" onSubmit={registerExpense}>
            <h2>Registrar gasto</h2>
            <label>Categoría<select value={form.categoria} onChange={(event) => setForm({ ...form, categoria: event.target.value as ExpenseCategory })}>
              {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label>Descripción<input value={form.descripcion} onChange={(event) => setForm({ ...form, descripcion: event.target.value })} minLength={2} maxLength={300} required /></label>
            <label>Monto (COP)<input type="number" min="1" step="1" value={form.monto} onChange={(event) => setForm({ ...form, monto: Number(event.target.value) })} required /></label>
            <label>Medio de pago<select value={form.metodo_pago} onChange={(event) => setForm({ ...form, metodo_pago: event.target.value as ExpenseMethod })}>
              {Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value} disabled={value === 'efectivo_caja' && !activeCash}>{label}{value === 'efectivo_caja' && !activeCash ? ' · abre caja primero' : ''}</option>)}
            </select></label>
            {form.metodo_pago === 'efectivo_caja' && !activeCash && <p className="modal-hint">Abre una caja desde el menú Caja antes de registrar un gasto en efectivo.</p>}
            <label>Referencia de comprobante (opcional)<input value={form.comprobante_ref} onChange={(event) => setForm({ ...form, comprobante_ref: event.target.value })} maxLength={120} /></label>
            {error && <div className="error-message">{error}</div>}
            <div className="modal-actions"><button type="button" onClick={() => setModalOpen(false)}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Guardando...' : 'Guardar gasto'}</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
