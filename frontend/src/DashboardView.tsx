import { useEffect, useMemo, useState } from 'react'
import { api, downloadFile } from './services/api'

type Preset = 'hoy' | 'siete' | 'mes' | 'personalizado'

interface DailySale {
  fecha: string
  monto: number
}

interface PaymentSummary {
  metodo_pago: string
  monto: number
  porcentaje: number
}

interface TopProduct {
  producto_id: number
  nombre: string
  cantidad_vendida: number
  ingresos: number
  ganancia_estimada: number
}

interface LowMaterial {
  id: number
  codigo: string | null
  nombre: string
  unidad_medida: string
  stock_actual: number
  stock_minimo: number
}

interface OutOfStockProduct {
  id: number
  codigo: string | null
  nombre: string
}

interface DashboardSummary {
  fecha_inicio: string
  fecha_fin: string
  ventas_totales: number
  cantidad_tickets: number
  ticket_promedio: number
  costo_vendido: number
  gastos_operativos: number
  utilidad_neta_estimada: number
  margen_neto: number
  ventas_por_dia: DailySale[]
  medios_pago: PaymentSummary[]
  top_productos: TopProduct[]
  alertas: {
    materias_primas_bajas: LowMaterial[]
    productos_agotados: OutOfStockProduct[]
    estado_caja: 'abierta' | 'cerrada'
    caja_consecutivo: string | null
  }
}

interface BackupResult {
  nombre_archivo: string
  mensaje: string
}

const money = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

const methodLabels: Record<string, string> = {
  efectivo: 'Efectivo',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
}

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + days)
  return localDate(date)
}

function SalesTrendChart({ rows }: { rows: DailySale[] }) {
  const max = Math.max(...rows.map((row) => row.monto), 1)
  const step = 660 / Math.max(rows.length, 1)
  const labelStep = Math.max(1, Math.ceil(rows.length / 8))
  return (
    <svg className="dashboard-chart" viewBox="0 0 720 240" role="img" aria-label="Ventas por día en pesos colombianos">
      <line x1="38" y1="196" x2="700" y2="196" className="chart-axis" />
      {rows.map((row, index) => {
        const height = row.monto ? Math.max(2, row.monto / max * 150) : 0
        const x = 42 + index * step
        return (
          <g key={row.fecha}>
            <title>{`${row.fecha}: ${money.format(row.monto)}`}</title>
            <rect x={x} y={196 - height} width={Math.max(1, Math.min(24, step * 0.62))} height={height} rx="3" className="chart-bar" />
            {index % labelStep === 0 && <text x={x} y="218" className="chart-label">{row.fecha.slice(5)}</text>}
          </g>
        )
      })}
      {!rows.length && <text x="360" y="115" textAnchor="middle" className="chart-empty">Sin ventas para este periodo</text>}
    </svg>
  )
}

function PaymentChart({ rows }: { rows: PaymentSummary[] }) {
  const max = Math.max(...rows.map((row) => row.monto), 1)
  return (
    <svg className="dashboard-chart payment-chart" viewBox="0 0 560 250" role="img" aria-label="Ingresos por medio de pago">
      {rows.map((row, index) => {
        const y = 18 + index * 44
        const width = row.monto ? row.monto / max * 270 : 0
        return (
          <g key={row.metodo_pago}>
            <text x="0" y={y + 17} className="chart-method-label">{methodLabels[row.metodo_pago] ?? row.metodo_pago}</text>
            <rect x="115" y={y} width="270" height="23" rx="5" className="chart-track" />
            <rect x="115" y={y} width={width} height="23" rx="5" className="chart-bar" />
            <text x="395" y={y + 16} className="chart-value">{money.format(row.monto)}</text>
            <text x="530" y={y + 16} textAnchor="end" className="chart-percent">{row.porcentaje.toFixed(1)}%</text>
          </g>
        )
      })}
    </svg>
  )
}

function TopProductsChart({ rows }: { rows: TopProduct[] }) {
  const max = Math.max(...rows.map((row) => row.cantidad_vendida), 1)
  return (
    <svg className="dashboard-chart top-products-chart" viewBox={`0 0 720 ${Math.max(120, rows.length * 52)}`} role="img" aria-label="Productos más vendidos">
      {rows.map((row, index) => {
        const y = 12 + index * 52
        const width = row.cantidad_vendida / max * 280
        return (
          <g key={row.producto_id}>
            <text x="0" y={y + 18} className="chart-product-label">{row.nombre.length > 22 ? `${row.nombre.slice(0, 20)}…` : row.nombre}</text>
            <rect x="180" y={y} width="280" height="26" rx="5" className="chart-track" />
            <rect x="180" y={y} width={width} height="26" rx="5" className="chart-bar" />
            <text x="474" y={y + 12} className="chart-value">{row.cantidad_vendida} und.</text>
            <text x="474" y={y + 27} className="chart-subvalue">{money.format(row.ingresos)} · Gan. {money.format(row.ganancia_estimada)}</text>
          </g>
        )
      })}
      {!rows.length && <text x="360" y="70" textAnchor="middle" className="chart-empty">Sin productos vendidos para este periodo</text>}
    </svg>
  )
}

export default function DashboardView({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [preset, setPreset] = useState<Preset>('hoy')
  const [startDate, setStartDate] = useState(localDate)
  const [endDate, setEndDate] = useState(localDate)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  const loadSummary = async () => {
    setError('')
    setLoading(true)
    try {
      const params = new URLSearchParams({ fecha_inicio: startDate, fecha_fin: endDate })
      setSummary(await api<DashboardSummary>(`/api/dashboard/resumen?${params.toString()}`))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar el resumen ejecutivo')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadSummary() }, [startDate, endDate])

  const periodLabel = useMemo(() => `${startDate} — ${endDate}`, [startDate, endDate])

  const selectPreset = (nextPreset: Preset) => {
    setPreset(nextPreset)
    const end = localDate()
    if (nextPreset === 'hoy') {
      setStartDate(end)
      setEndDate(end)
    } else if (nextPreset === 'siete') {
      setStartDate(shiftDate(end, -6))
      setEndDate(end)
    } else if (nextPreset === 'mes') {
      setStartDate(`${end.slice(0, 8)}01`)
      setEndDate(end)
    }
  }

  const exportReport = async (type: 'ventas' | 'gastos' | 'inventario') => {
    setError('')
    setNotice('')
    try {
      const params = new URLSearchParams({ tipo: type, fecha_inicio: startDate, fecha_fin: endDate })
      const filename = await downloadFile(
        `/api/reportes/exportar-csv?${params.toString()}`,
        `${type}.csv`,
      )
      setNotice(`Descarga iniciada: ${filename}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible exportar el reporte')
    }
  }

  const createBackup = async () => {
    setError('')
    setNotice('')
    try {
      const result = await api<BackupResult>('/api/sistema/backup', { method: 'POST' })
      setNotice(`${result.mensaje}: ${result.nombre_archivo}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible crear el respaldo')
    }
  }

  return (
    <div className="dashboard-view">
      <div className="dashboard-heading">
        <div><h2>Resumen Ejecutivo</h2><p>Indicadores de ventas, costos, utilidad y alertas operativas.</p></div>
        <span className="dashboard-period-label">{periodLabel}</span>
      </div>
      <div className="dashboard-filters">
        <div className="dashboard-presets" role="group" aria-label="Periodo del reporte">
          <button type="button" className={preset === 'hoy' ? 'selected' : ''} onClick={() => selectPreset('hoy')}>Hoy</button>
          <button type="button" className={preset === 'siete' ? 'selected' : ''} onClick={() => selectPreset('siete')}>Últimos 7 días</button>
          <button type="button" className={preset === 'mes' ? 'selected' : ''} onClick={() => selectPreset('mes')}>Este mes</button>
          <button type="button" className={preset === 'personalizado' ? 'selected' : ''} onClick={() => setPreset('personalizado')}>Rango personalizado</button>
        </div>
        {preset === 'personalizado' && (
          <div className="dashboard-date-range">
            <label>Desde<input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} /></label>
            <label>Hasta<input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          </div>
        )}
      </div>
      {error && <div className="error-message">{error}</div>}
      {notice && <div className="success-message">{notice}</div>}
      {loading && !summary ? <div className="dashboard-loading">Cargando indicadores...</div> : summary && (
        <>
          <div className={`dashboard-kpis ${loading ? 'refreshing' : ''}`}>
            <article><span>Ventas Totales</span><strong>{money.format(summary.ventas_totales)}</strong><small>{summary.cantidad_tickets} tickets · promedio {money.format(summary.ticket_promedio)}</small></article>
            <article><span>Costo de Ventas</span><strong>{money.format(summary.costo_vendido)}</strong><small>Costo estimado de productos vendidos</small></article>
            <article><span>Gastos Operativos</span><strong>{money.format(summary.gastos_operativos)}</strong><small>Gastos vigentes del periodo</small></article>
            <article className={summary.utilidad_neta_estimada >= 0 ? 'positive' : 'negative'}><span>Utilidad Neta Estimada</span><strong>{money.format(summary.utilidad_neta_estimada)}</strong><small>Margen neto {summary.margen_neto.toFixed(1)}%</small></article>
          </div>

          <div className="dashboard-charts-grid">
            <section className="dashboard-panel dashboard-trend-panel">
              <div><h3>Evolución de Ventas diarias</h3><p>Ingresos por fecha de pago en el periodo.</p></div>
              <SalesTrendChart rows={summary.ventas_por_dia} />
            </section>
            <section className="dashboard-panel">
              <div><h3>Ingresos por Medio de Pago</h3><p>Comparativo de efectivo y medios digitales.</p></div>
              <PaymentChart rows={summary.medios_pago} />
            </section>
            <section className="dashboard-panel dashboard-top-panel">
              <div><h3>Top 5 Productos más vendidos</h3><p>Unidades, ingresos y ganancia bruta estimada.</p></div>
              <TopProductsChart rows={summary.top_productos} />
            </section>
          </div>

          <section className="dashboard-panel dashboard-alerts">
            <div className="dashboard-panel-heading"><div><h3>Alertas del Negocio</h3><p>Estado actual de inventario y operación.</p></div>
              <span className={`dashboard-cash-status ${summary.alertas.estado_caja}`}>Caja {summary.alertas.estado_caja}{summary.alertas.caja_consecutivo ? ` · ${summary.alertas.caja_consecutivo}` : ''}</span>
            </div>
            <div className="dashboard-alert-grid">
              <button type="button" className={summary.alertas.materias_primas_bajas.length ? 'dashboard-alert warning' : 'dashboard-alert clear'} onClick={() => onNavigate('Inventarios')}>
                <strong>{summary.alertas.materias_primas_bajas.length} insumos por agotarse</strong>
                <span>{summary.alertas.materias_primas_bajas.slice(0, 3).map((item) => `${item.nombre} (${item.stock_actual} ${item.unidad_medida})`).join(' · ') || 'Sin materias primas bajo mínimo'}</span>
                <small>Ir a Inventarios →</small>
              </button>
              <button type="button" className={summary.alertas.productos_agotados.length ? 'dashboard-alert warning' : 'dashboard-alert clear'} onClick={() => onNavigate('Catálogo')}>
                <strong>{summary.alertas.productos_agotados.length} productos sin stock</strong>
                <span>{summary.alertas.productos_agotados.slice(0, 3).map((item) => item.nombre).join(' · ') || 'Sin productos agotados'}</span>
                <small>Ir a Catálogo →</small>
              </button>
              <button type="button" className={`dashboard-alert ${summary.alertas.estado_caja === 'abierta' ? 'clear' : 'warning'}`} onClick={() => onNavigate('Caja')}>
                <strong>{summary.alertas.estado_caja === 'abierta' ? 'Turno de caja activo' : 'No hay caja abierta'}</strong>
                <span>{summary.alertas.caja_consecutivo ?? 'Abre un turno para registrar gastos en efectivo.'}</span>
                <small>Ir a Caja →</small>
              </button>
            </div>
          </section>

          <section className="dashboard-panel dashboard-actions">
            <div><h3>Reportes y Respaldo</h3><p>Descarga archivos compatibles con Excel o crea una copia de la base de datos.</p></div>
            <div className="dashboard-action-buttons">
              <button type="button" className="secondary-button" onClick={() => void exportReport('ventas')}>Exportar Ventas (CSV)</button>
              <button type="button" className="secondary-button" onClick={() => void exportReport('gastos')}>Exportar Gastos (CSV)</button>
              <button type="button" className="secondary-button" onClick={() => void exportReport('inventario')}>Exportar Inventario (CSV)</button>
              <button type="button" className="primary-button" onClick={() => void createBackup()}>Crear Copia de Seguridad</button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
