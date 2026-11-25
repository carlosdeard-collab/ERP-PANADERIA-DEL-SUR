import { useEffect, useState, type FormEvent } from 'react'
import { api } from './services/api'

type InventoryTab = 'materias' | 'compras' | 'proveedores' | 'movimientos'
type Unit = 'kg' | 'g' | 'l' | 'ml' | 'unidad'
type PaymentMethod = 'efectivo' | 'transferencia' | 'nequi' | 'daviplata' | 'credito'

interface Material {
  id: number
  codigo: string | null
  nombre: string
  unidad_medida: Unit
  stock_actual: number
  stock_minimo: number
  costo_promedio: number
  activo: boolean
  creado_en: string
}

interface Supplier {
  id: number
  nombre: string
  nit_documento: string | null
  telefono: string | null
  contacto: string | null
  direccion: string | null
  activo: boolean
  creado_en: string
}

interface PurchaseLine {
  id: number
  materia_prima_id: number
  materia_prima_nombre: string
  unidad_medida: string
  cantidad: number
  costo_unitario: number
  subtotal: number
}

interface Purchase {
  id: number
  consecutivo: string
  proveedor_id: number
  proveedor_nombre: string
  numero_factura: string | null
  usuario_id: number
  usuario_nombre: string
  metodo_pago: PaymentMethod
  total: number
  observaciones: string | null
  fecha_compra: string
  detalles: PurchaseLine[]
}

interface Movement {
  id: number
  tipo_item: string
  materia_prima_id: number | null
  producto_id: number | null
  item_nombre: string
  tipo_movimiento: string
  cantidad: number
  stock_anterior: number
  stock_nuevo: number
  costo_unitario: number | null
  referencia: string
  usuario_id: number
  usuario_nombre: string
  fecha: string
}

interface PurchaseDraftLine {
  materia_prima_id: number
  cantidad: number
  costo_unitario: number
}

const money = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

const units: Unit[] = ['kg', 'g', 'l', 'ml', 'unidad']

const movementNames: Record<string, string> = {
  entrada_compra: 'Entrada por compra',
  ajuste_positivo: 'Ajuste positivo',
  ajuste_negativo: 'Ajuste negativo',
  merma: 'Merma',
  salida_produccion: 'Salida a producción',
  entrada_produccion: 'Entrada de producción',
}

export default function InventoryView() {
  const [tab, setTab] = useState<InventoryTab>('materias')
  const [materials, setMaterials] = useState<Material[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [movementType, setMovementType] = useState('')
  const [movementMaterial, setMovementMaterial] = useState('')
  const [materialModal, setMaterialModal] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null)
  const [materialForm, setMaterialForm] = useState({
    codigo: '',
    nombre: '',
    unidad_medida: 'kg' as Unit,
    stock_actual: 0,
    stock_minimo: 0,
    costo_promedio: 0,
    activo: true,
  })
  const [adjustMaterial, setAdjustMaterial] = useState<Material | null>(null)
  const [adjustment, setAdjustment] = useState({
    tipo_movimiento: 'ajuste_positivo',
    cantidad: 0,
    motivo: '',
  })
  const [supplierModal, setSupplierModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [supplierForm, setSupplierForm] = useState({
    nombre: '',
    nit_documento: '',
    telefono: '',
    contacto: '',
    direccion: '',
    activo: true,
  })
  const [purchaseModal, setPurchaseModal] = useState(false)
  const [purchaseSupplier, setPurchaseSupplier] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [purchaseMethod, setPurchaseMethod] = useState<PaymentMethod>('transferencia')
  const [purchaseNotes, setPurchaseNotes] = useState('')
  const [purchaseLines, setPurchaseLines] = useState<PurchaseDraftLine[]>([])
  const [purchaseDetails, setPurchaseDetails] = useState<Purchase | null>(null)

  const loadInventory = async () => {
    try {
      const [materialData, supplierData, purchaseData, movementData] = await Promise.all([
        api<Material[]>('/api/materias-primas'),
        api<Supplier[]>('/api/proveedores'),
        api<Purchase[]>('/api/compras'),
        api<Movement[]>('/api/movimientos-inventario'),
      ])
      setMaterials(materialData)
      setSuppliers(supplierData)
      setPurchases(purchaseData)
      setMovements(movementData)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar el inventario')
    }
  }

  useEffect(() => { void loadInventory() }, [])

  const openNewMaterial = () => {
    setEditingMaterial(null)
    setMaterialForm({
      codigo: '',
      nombre: '',
      unidad_medida: 'kg',
      stock_actual: 0,
      stock_minimo: 0,
      costo_promedio: 0,
      activo: true,
    })
    setMaterialModal(true)
  }

  const openEditMaterial = (material: Material) => {
    setEditingMaterial(material)
    setMaterialForm({
      codigo: material.codigo || '',
      nombre: material.nombre,
      unidad_medida: material.unidad_medida,
      stock_actual: material.stock_actual,
      stock_minimo: material.stock_minimo,
      costo_promedio: material.costo_promedio,
      activo: material.activo,
    })
    setMaterialModal(true)
  }

  const saveMaterial = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    const body = {
      ...materialForm,
      codigo: materialForm.codigo || null,
      stock_minimo: Number(materialForm.stock_minimo),
      costo_promedio: Number(materialForm.costo_promedio),
    }
    try {
      if (editingMaterial) {
        const update = { ...body, stock_actual: undefined }
        await api<Material>(`/api/materias-primas/${editingMaterial.id}`, {
          method: 'PUT',
          body: JSON.stringify(update),
        })
      } else {
        await api<Material>('/api/materias-primas', {
          method: 'POST',
          body: JSON.stringify({ ...body, stock_actual: Number(body.stock_actual) }),
        })
      }
      setMaterialModal(false)
      await loadInventory()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar la materia prima')
    }
  }

  const saveAdjustment = async (event: FormEvent) => {
    event.preventDefault()
    if (!adjustMaterial) return
    setError('')
    try {
      await api<Material>(`/api/materias-primas/${adjustMaterial.id}/ajuste`, {
        method: 'POST',
        body: JSON.stringify({
          ...adjustment,
          cantidad: Number(adjustment.cantidad),
          motivo: adjustment.motivo.trim(),
        }),
      })
      setAdjustMaterial(null)
      setAdjustment({ tipo_movimiento: 'ajuste_positivo', cantidad: 0, motivo: '' })
      await loadInventory()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible registrar el movimiento')
    }
  }

  const openNewSupplier = () => {
    setEditingSupplier(null)
    setSupplierForm({ nombre: '', nit_documento: '', telefono: '', contacto: '', direccion: '', activo: true })
    setSupplierModal(true)
  }

  const openEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    setSupplierForm({
      nombre: supplier.nombre,
      nit_documento: supplier.nit_documento || '',
      telefono: supplier.telefono || '',
      contacto: supplier.contacto || '',
      direccion: supplier.direccion || '',
      activo: supplier.activo,
    })
    setSupplierModal(true)
  }

  const saveSupplier = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    const body = {
      ...supplierForm,
      nit_documento: supplierForm.nit_documento || null,
      telefono: supplierForm.telefono || null,
      contacto: supplierForm.contacto || null,
      direccion: supplierForm.direccion || null,
    }
    try {
      await api<Supplier>(editingSupplier
        ? `/api/proveedores/${editingSupplier.id}`
        : '/api/proveedores', {
          method: editingSupplier ? 'PUT' : 'POST',
          body: JSON.stringify(body),
        })
      setSupplierModal(false)
      await loadInventory()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar el proveedor')
    }
  }

  const openNewPurchase = () => {
    const availableMaterials = materials.filter((material) => material.activo)
    setPurchaseSupplier(String(suppliers.find((supplier) => supplier.activo)?.id || ''))
    setInvoiceNumber('')
    setPurchaseMethod('transferencia')
    setPurchaseNotes('')
    setPurchaseLines(availableMaterials.length > 0
      ? [{ materia_prima_id: availableMaterials[0].id, cantidad: 1, costo_unitario: availableMaterials[0].costo_promedio }]
      : [])
    setPurchaseModal(true)
  }

  const addPurchaseLine = () => {
    const available = materials.filter((material) => material.activo)
    if (!available.length) return
    setPurchaseLines((current) => [...current, {
      materia_prima_id: available[0].id,
      cantidad: 1,
      costo_unitario: available[0].costo_promedio,
    }])
  }

  const updatePurchaseLine = (index: number, patch: Partial<PurchaseDraftLine>) => {
    setPurchaseLines((current) => current.map((line, lineIndex) => (
      lineIndex === index ? { ...line, ...patch } : line
    )))
  }

  const purchaseTotal = purchaseLines.reduce(
    (sum, line) => sum + Number(line.cantidad) * Number(line.costo_unitario),
    0,
  )

  const savePurchase = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await api<Purchase>('/api/compras', {
        method: 'POST',
        body: JSON.stringify({
          proveedor_id: Number(purchaseSupplier),
          numero_factura: invoiceNumber || null,
          metodo_pago: purchaseMethod,
          observaciones: purchaseNotes || null,
          detalles: purchaseLines.map((line) => ({
            ...line,
            cantidad: Number(line.cantidad),
            costo_unitario: Number(line.costo_unitario),
          })),
        }),
      })
      setPurchaseModal(false)
      await loadInventory()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible registrar la compra')
    }
  }

  const showPurchaseDetails = async (purchase: Purchase) => {
    try {
      setPurchaseDetails(await api<Purchase>(`/api/compras/${purchase.id}`))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar el detalle')
    }
  }

  const lowStock = materials.filter((material) => material.activo && material.stock_actual <= material.stock_minimo)
  const valuation = materials.reduce(
    (sum, material) => sum + material.stock_actual * material.costo_promedio,
    0,
  )
  const visibleMaterials = materials.filter((material) => {
    const matchesText = !search
      || material.nombre.toLocaleLowerCase().includes(search.toLocaleLowerCase())
      || (material.codigo || '').toLocaleLowerCase().includes(search.toLocaleLowerCase())
    return matchesText && (!lowOnly || material.stock_actual <= material.stock_minimo)
  })
  const visibleMovements = movements.filter((movement) => (
    (!movementMaterial || movement.materia_prima_id === Number(movementMaterial))
    && (!movementType || movement.tipo_movimiento === movementType)
  ))

  return (
    <div className="inventory-view">
      {error && <div className="error-message">{error}</div>}
      <div className="inventory-heading">
        <div><h2>Inventarios</h2><p>Materias primas, abastecimiento y trazabilidad.</p></div>
      </div>
      <div className="inventory-tabs" role="tablist">
        <button type="button" className={tab === 'materias' ? 'selected' : ''} onClick={() => setTab('materias')}>Materias Primas</button>
        <button type="button" className={tab === 'compras' ? 'selected' : ''} onClick={() => setTab('compras')}>Compras</button>
        <button type="button" className={tab === 'proveedores' ? 'selected' : ''} onClick={() => setTab('proveedores')}>Proveedores</button>
        <button type="button" className={tab === 'movimientos' ? 'selected' : ''} onClick={() => setTab('movimientos')}>Movimientos (Kardex)</button>
      </div>

      {tab === 'materias' && (
        <section className="inventory-panel">
          <div className="inventory-stats">
            <article><span>Total de insumos</span><strong>{materials.length}</strong></article>
            <article className={lowStock.length ? 'warning' : ''}><span>Insumos con stock bajo</span><strong>{lowStock.length}</strong></article>
            <article><span>Valorización del inventario</span><strong>{money.format(valuation)}</strong></article>
          </div>
          <div className="inventory-toolbar">
            <input placeholder="Buscar insumo o código..." value={search} onChange={(event) => setSearch(event.target.value)} />
            <label className="filter-checkbox"><input type="checkbox" checked={lowOnly} onChange={(event) => setLowOnly(event.target.checked)} /> Solo stock bajo</label>
            <button type="button" className="primary-button" onClick={openNewMaterial}>+ Nueva materia prima</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Código</th><th>Insumo</th><th>Unidad</th><th>Stock actual / mínimo</th><th>Costo promedio</th><th>Valor en stock</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>
                {visibleMaterials.map((material) => {
                  const low = material.stock_actual <= material.stock_minimo
                  return (
                    <tr key={material.id}>
                      <td>{material.codigo || '—'}</td>
                      <td><strong>{material.nombre}</strong></td>
                      <td>{material.unidad_medida}</td>
                      <td><span className={`stock-level ${low ? 'low' : 'good'}`}>{material.stock_actual.toLocaleString('es-CO')} / {material.stock_minimo.toLocaleString('es-CO')} {material.unidad_medida}</span></td>
                      <td>{money.format(material.costo_promedio)}</td>
                      <td>{money.format(material.stock_actual * material.costo_promedio)}</td>
                      <td><span className={material.activo ? 'status active' : 'status inactive'}>{material.activo ? 'Activo' : 'Inactivo'}</span></td>
                      <td><div className="inventory-row-actions">
                        <button type="button" onClick={() => openEditMaterial(material)}>Editar</button>
                        <button type="button" onClick={() => { setAdjustMaterial(material); setAdjustment({ tipo_movimiento: 'ajuste_positivo', cantidad: 0, motivo: '' }) }}>Ajuste / Merma</button>
                      </div></td>
                    </tr>
                  )
                })}
                {visibleMaterials.length === 0 && <tr><td colSpan={8} className="empty-row">No hay materias primas para mostrar.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'compras' && (
        <section className="inventory-panel">
          <div className="inventory-toolbar">
            <div><h3>Historial de compras</h3><p>Las compras actualizan existencias y costo promedio automáticamente.</p></div>
            <button type="button" className="primary-button" onClick={openNewPurchase}>+ Nueva compra</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Consecutivo</th><th>Fecha</th><th>Proveedor</th><th>Método de pago</th><th>Total</th><th></th></tr></thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td><strong>{purchase.consecutivo}</strong>{purchase.numero_factura && <small className="sub-cell">Factura {purchase.numero_factura}</small>}</td>
                    <td>{new Date(purchase.fecha_compra).toLocaleString('es-CO')}</td>
                    <td>{purchase.proveedor_nombre}</td>
                    <td className="capitalize">{purchase.metodo_pago}</td>
                    <td>{money.format(purchase.total)}</td>
                    <td><button type="button" className="edit-button" onClick={() => void showPurchaseDetails(purchase)}>Ver detalle</button></td>
                  </tr>
                ))}
                {purchases.length === 0 && <tr><td colSpan={6} className="empty-row">No hay compras registradas.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'proveedores' && (
        <section className="inventory-panel">
          <div className="inventory-toolbar">
            <div><h3>Proveedores</h3><p>Contactos de abastecimiento.</p></div>
            <button type="button" className="primary-button" onClick={openNewSupplier}>+ Nuevo proveedor</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Proveedor</th><th>NIT / Documento</th><th>Teléfono</th><th>Contacto</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td><strong>{supplier.nombre}</strong></td>
                    <td>{supplier.nit_documento || '—'}</td>
                    <td>{supplier.telefono || '—'}</td>
                    <td>{supplier.contacto || '—'}</td>
                    <td><span className={supplier.activo ? 'status active' : 'status inactive'}>{supplier.activo ? 'Activo' : 'Inactivo'}</span></td>
                    <td><button type="button" className="edit-button" onClick={() => openEditSupplier(supplier)}>Editar</button></td>
                  </tr>
                ))}
                {suppliers.length === 0 && <tr><td colSpan={6} className="empty-row">No hay proveedores registrados.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'movimientos' && (
        <section className="inventory-panel">
          <div className="inventory-toolbar">
            <div><h3>Kardex de inventario</h3><p>Registro cronológico de entradas, ajustes y mermas.</p></div>
            <div className="kardex-filters">
              <select value={movementMaterial} onChange={(event) => setMovementMaterial(event.target.value)}>
                <option value="">Todas las materias primas</option>
                {materials.map((material) => <option value={material.id} key={material.id}>{material.nombre}</option>)}
              </select>
              <select value={movementType} onChange={(event) => setMovementType(event.target.value)}>
                <option value="">Todos los movimientos</option>
                {Object.entries(movementNames).map(([value, name]) => <option value={value} key={value}>{name}</option>)}
              </select>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha / Hora</th><th>Insumo</th><th>Movimiento</th><th>Stock anterior</th><th>Variación</th><th>Stock nuevo</th><th>Referencia</th><th>Responsable</th></tr></thead>
              <tbody>
                {visibleMovements.map((movement) => {
                  const positive = ['entrada_compra', 'ajuste_positivo', 'entrada_produccion'].includes(movement.tipo_movimiento)
                  return (
                    <tr key={movement.id}>
                      <td>{new Date(movement.fecha).toLocaleString('es-CO')}</td>
                      <td>{movement.item_nombre}</td>
                      <td><span className={`movement-tag ${movement.tipo_movimiento}`}>{movementNames[movement.tipo_movimiento] || movement.tipo_movimiento}</span></td>
                      <td>{movement.stock_anterior.toLocaleString('es-CO')}</td>
                      <td className={positive ? 'movement-positive' : 'movement-negative'}>{positive ? '+' : '−'}{movement.cantidad.toLocaleString('es-CO')}</td>
                      <td>{movement.stock_nuevo.toLocaleString('es-CO')}</td>
                      <td>{movement.referencia}</td>
                      <td>{movement.usuario_nombre}</td>
                    </tr>
                  )
                })}
                {visibleMovements.length === 0 && <tr><td colSpan={8} className="empty-row">No hay movimientos para esos filtros.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {materialModal && (
        <div className="modal-backdrop">
          <form className="modal inventory-modal" onSubmit={saveMaterial}>
            <h2>{editingMaterial ? 'Editar materia prima' : 'Nueva materia prima'}</h2>
            <label>Código (opcional)<input value={materialForm.codigo} onChange={(event) => setMaterialForm({ ...materialForm, codigo: event.target.value })} /></label>
            <label>Nombre<input value={materialForm.nombre} onChange={(event) => setMaterialForm({ ...materialForm, nombre: event.target.value })} minLength={2} required /></label>
            <label>Unidad de medida<select value={materialForm.unidad_medida} onChange={(event) => setMaterialForm({ ...materialForm, unidad_medida: event.target.value as Unit })}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
            {!editingMaterial && <label>Stock inicial<input type="number" min="0" step="0.001" value={materialForm.stock_actual} onChange={(event) => setMaterialForm({ ...materialForm, stock_actual: Number(event.target.value) })} /></label>}
            <label>Stock mínimo<input type="number" min="0" step="0.001" value={materialForm.stock_minimo} onChange={(event) => setMaterialForm({ ...materialForm, stock_minimo: Number(event.target.value) })} /></label>
            <label>Costo promedio (COP)<input type="number" min="0" step="1" value={materialForm.costo_promedio} onChange={(event) => setMaterialForm({ ...materialForm, costo_promedio: Number(event.target.value) })} /></label>
            {editingMaterial && <label className="checkbox-line"><input type="checkbox" checked={materialForm.activo} onChange={(event) => setMaterialForm({ ...materialForm, activo: event.target.checked })} /> Insumo activo</label>}
            <div className="modal-actions"><button type="button" onClick={() => setMaterialModal(false)}>Cancelar</button><button type="submit" className="primary-button">Guardar</button></div>
          </form>
        </div>
      )}

      {adjustMaterial && (
        <div className="modal-backdrop">
          <form className="modal inventory-modal" onSubmit={saveAdjustment}>
            <h2>Ajuste de {adjustMaterial.nombre}</h2>
            <p className="modal-hint">Existencia actual: {adjustMaterial.stock_actual} {adjustMaterial.unidad_medida}</p>
            <label>Tipo de movimiento<select value={adjustment.tipo_movimiento} onChange={(event) => setAdjustment({ ...adjustment, tipo_movimiento: event.target.value })}>
              <option value="ajuste_positivo">Ajuste positivo</option><option value="ajuste_negativo">Ajuste negativo</option><option value="merma">Merma</option>
            </select></label>
            <label>Cantidad ({adjustMaterial.unidad_medida})<input type="number" min="0.001" step="0.001" value={adjustment.cantidad || ''} onChange={(event) => setAdjustment({ ...adjustment, cantidad: Number(event.target.value) })} required /></label>
            <label>Motivo / observación<input value={adjustment.motivo} onChange={(event) => setAdjustment({ ...adjustment, motivo: event.target.value })} minLength={3} required /></label>
            <div className="modal-actions"><button type="button" onClick={() => setAdjustMaterial(null)}>Cancelar</button><button type="submit" className="primary-button">Registrar movimiento</button></div>
          </form>
        </div>
      )}

      {supplierModal && (
        <div className="modal-backdrop">
          <form className="modal inventory-modal" onSubmit={saveSupplier}>
            <h2>{editingSupplier ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
            <label>Nombre<input value={supplierForm.nombre} onChange={(event) => setSupplierForm({ ...supplierForm, nombre: event.target.value })} minLength={2} required /></label>
            <label>NIT / Documento<input value={supplierForm.nit_documento} onChange={(event) => setSupplierForm({ ...supplierForm, nit_documento: event.target.value })} /></label>
            <label>Teléfono<input value={supplierForm.telefono} onChange={(event) => setSupplierForm({ ...supplierForm, telefono: event.target.value })} /></label>
            <label>Contacto<input value={supplierForm.contacto} onChange={(event) => setSupplierForm({ ...supplierForm, contacto: event.target.value })} /></label>
            <label>Dirección<input value={supplierForm.direccion} onChange={(event) => setSupplierForm({ ...supplierForm, direccion: event.target.value })} /></label>
            {editingSupplier && <label className="checkbox-line"><input type="checkbox" checked={supplierForm.activo} onChange={(event) => setSupplierForm({ ...supplierForm, activo: event.target.checked })} /> Proveedor activo</label>}
            <div className="modal-actions"><button type="button" onClick={() => setSupplierModal(false)}>Cancelar</button><button type="submit" className="primary-button">Guardar proveedor</button></div>
          </form>
        </div>
      )}

      {purchaseModal && (
        <div className="modal-backdrop">
          <form className="modal purchase-modal" onSubmit={savePurchase}>
            <h2>Nueva compra</h2>
            <div className="purchase-header-fields">
              <label>Proveedor<select value={purchaseSupplier} onChange={(event) => setPurchaseSupplier(event.target.value)} required>
                <option value="">Seleccionar proveedor</option>
                {suppliers.filter((supplier) => supplier.activo).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.nombre}</option>)}
              </select></label>
              <label>N° de factura<input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} /></label>
              <label>Medio de pago<select value={purchaseMethod} onChange={(event) => setPurchaseMethod(event.target.value as PaymentMethod)}>
                <option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="nequi">Nequi</option><option value="daviplata">Daviplata</option><option value="credito">Crédito</option>
              </select></label>
            </div>
            <div className="purchase-lines-head"><strong>Insumos comprados</strong><button type="button" className="secondary-button" onClick={addPurchaseLine}>+ Agregar línea</button></div>
            <div className="purchase-lines">
              {purchaseLines.map((line, index) => {
                const material = materials.find((item) => item.id === line.materia_prima_id)
                return (
                  <div className="purchase-line" key={index}>
                    <label>Materia prima<select value={line.materia_prima_id} onChange={(event) => {
                      const chosen = materials.find((item) => item.id === Number(event.target.value))
                      updatePurchaseLine(index, { materia_prima_id: Number(event.target.value), costo_unitario: chosen?.costo_promedio || 0 })
                    }}>
                      {materials.filter((item) => item.activo).map((item) => <option key={item.id} value={item.id}>{item.nombre} ({item.unidad_medida})</option>)}
                    </select></label>
                    <label>Cantidad ({material?.unidad_medida || ''})<input type="number" min="0.001" step="0.001" value={line.cantidad} onChange={(event) => updatePurchaseLine(index, { cantidad: Number(event.target.value) })} required /></label>
                    <label>Costo unitario COP<input type="number" min="0" step="1" value={line.costo_unitario} onChange={(event) => updatePurchaseLine(index, { costo_unitario: Number(event.target.value) })} required /></label>
                    <div className="purchase-line-subtotal"><small>Subtotal</small><strong>{money.format(line.cantidad * line.costo_unitario)}</strong></div>
                    <button type="button" className="remove-line" aria-label="Quitar línea" disabled={purchaseLines.length < 2} onClick={() => setPurchaseLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>×</button>
                  </div>
                )
              })}
              {purchaseLines.length === 0 && <p className="empty-panel">Crea materias primas antes de registrar una compra.</p>}
            </div>
            <label>Observaciones<textarea rows={2} value={purchaseNotes} onChange={(event) => setPurchaseNotes(event.target.value)} /></label>
            <div className="purchase-total"><span>Total de compra</span><strong>{money.format(purchaseTotal)}</strong></div>
            <div className="modal-actions"><button type="button" onClick={() => setPurchaseModal(false)}>Cancelar</button><button type="submit" className="primary-button" disabled={!purchaseLines.length}>Registrar compra</button></div>
          </form>
        </div>
      )}

      {purchaseDetails && (
        <div className="modal-backdrop">
          <section className="modal purchase-details-modal">
            <h2>Compra {purchaseDetails.consecutivo}</h2>
            <p className="modal-hint">{purchaseDetails.proveedor_nombre} · {new Date(purchaseDetails.fecha_compra).toLocaleString('es-CO')}</p>
            <div className="table-wrap"><table>
              <thead><tr><th>Materia prima</th><th>Cantidad</th><th>Costo unitario</th><th>Subtotal</th></tr></thead>
              <tbody>{purchaseDetails.detalles.map((line) => <tr key={line.id}><td>{line.materia_prima_nombre}</td><td>{line.cantidad} {line.unidad_medida}</td><td>{money.format(line.costo_unitario)}</td><td>{money.format(line.subtotal)}</td></tr>)}</tbody>
            </table></div>
            <div className="purchase-total"><span>Total</span><strong>{money.format(purchaseDetails.total)}</strong></div>
            <div className="modal-actions"><button type="button" className="primary-button" onClick={() => setPurchaseDetails(null)}>Cerrar</button></div>
          </section>
        </div>
      )}
    </div>
  )
}
