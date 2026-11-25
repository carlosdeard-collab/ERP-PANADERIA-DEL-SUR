import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth, type Role } from './AuthContext'
import { Banknote, BarChart3, Boxes, ChefHat, Clock3, Eye, EyeOff, LogOut, Menu as MenuIcon, Minus, Package, PanelLeftClose, PanelLeftOpen, Plus, Printer, Receipt, ShoppingCart, Table, Trash2, Users, X } from 'lucide-react'
import { api } from './services/api'
import { printElementById } from './services/print'
import CashView from './CashView'
import DashboardView from './DashboardView'
import ExpensesView from './ExpensesView'
import InventoryView from './InventoryView'
import ProductionView from './ProductionView'

const allMenu = [
  { label: 'Resumen', icon: BarChart3, roles: ['administradora'] },
  { label: 'Ventas POS', icon: ShoppingCart, roles: ['administradora', 'mesera'] },
  { label: 'Mesas', icon: Table, roles: ['administradora', 'mesera'] },
  { label: 'Caja', icon: Banknote, roles: ['administradora', 'mesera'] },
  { label: 'Gastos', icon: Receipt, roles: ['administradora'] },
  { label: 'Producción diaria', icon: ChefHat, roles: ['administradora'] },
  { label: 'Inventarios', icon: Boxes, roles: ['administradora'] },
  { label: 'Administración', icon: BarChart3, roles: ['administradora'] },
  { label: 'Catálogo', icon: Package, roles: ['administradora'] },
] as const

interface ManagedUser {
  id: number
  nombre: string
  username: string
  rol: Role
  activo: boolean
  creado_en: string
}

function AdministrationView() {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [resetPasswordId, setResetPasswordId] = useState<number | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [form, setForm] = useState({ nombre: '', username: '', password: '', rol: 'mesera' as Role })

  const loadUsers = async () => {
    try {
      setUsers(await api<ManagedUser[]>('/api/usuarios'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar usuarios')
    }
  }

  useEffect(() => { void loadUsers() }, [])

  const createUser = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await api<ManagedUser>('/api/usuarios', { method: 'POST', body: JSON.stringify(form) })
      setForm({ nombre: '', username: '', password: '', rol: 'mesera' })
      setShowCreate(false)
      await loadUsers()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible crear el usuario')
    }
  }

  const toggleActive = async (user: ManagedUser) => {
    setError('')
    try {
      await api<ManagedUser>(`/api/usuarios/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ activo: !user.activo }),
      })
      await loadUsers()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cambiar el estado')
    }
  }

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault()
    if (resetPasswordId === null) return
    setError('')
    try {
      await api<ManagedUser>(`/api/usuarios/${resetPasswordId}`, {
        method: 'PUT',
        body: JSON.stringify({ password: newPassword }),
      })
      setResetPasswordId(null)
      setNewPassword('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cambiar la contraseña')
    }
  }

  return (
    <div className="admin-view">
      <div className="admin-toolbar">
        <div><h2>Gestión de Usuarios</h2><p>Crea cuentas y administra el acceso al sistema.</p></div>
        <button type="button" className="primary-button" onClick={() => setShowCreate(true)}>+ Nuevo usuario</button>
      </div>
      {error && <div className="error-message">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {users.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.nombre}</strong></td>
                <td>{item.username}</td>
                <td><span className={`role-tag ${item.rol}`}>{item.rol}</span></td>
                <td><span className={item.activo ? 'status active' : 'status inactive'}>{item.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                  <div className="row-actions">
                    <button type="button" onClick={() => setResetPasswordId(item.id)}>Cambiar contraseña</button>
                    <button type="button" onClick={() => void toggleActive(item)}>{item.activo ? 'Desactivar' : 'Activar'}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={createUser}>
            <h2>Crear nuevo usuario</h2>
            <label>Nombre<input value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} minLength={2} required /></label>
            <label>Usuario<input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} minLength={3} required /></label>
            <label>Contraseña<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={8} required /></label>
            <label>Rol<select value={form.rol} onChange={(event) => setForm({ ...form, rol: event.target.value as Role })}><option value="mesera">Mesera</option><option value="administradora">Administradora</option></select></label>
            <div className="modal-actions"><button type="button" onClick={() => setShowCreate(false)}>Cancelar</button><button type="submit" className="primary-button">Crear usuario</button></div>
          </form>
        </div>
      )}

      {resetPasswordId !== null && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={resetPassword}>
            <h2>Cambiar contraseña</h2>
            <label>Nueva contraseña<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required /></label>
            <div className="modal-actions"><button type="button" onClick={() => setResetPasswordId(null)}>Cancelar</button><button type="submit" className="primary-button">Guardar</button></div>
          </form>
        </div>
      )}
    </div>
  )
}

interface Category {
  id: number
  nombre: string
  descripcion: string | null
  activa: boolean
}

interface Product {
  id: number
  codigo: string | null
  nombre: string
  descripcion: string | null
  categoria_id: number
  categoria_nombre: string
  precio_venta: number
  costo_estimado: number
  stock_actual: number
  controlar_stock: boolean
  disponible: boolean
  creado_en: string
}

interface TableRecord {
  id: number
  numero: number
  nombre: string
  capacidad: number
  estado: 'libre' | 'ocupada'
  activa: boolean
  venta_id: number | null
  venta_total: number | null
  abierta_en: string | null
}

interface SaleLine {
  id: number
  producto_id: number
  codigo: string | null
  nombre: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  notas: string | null
}

interface SalePayment {
  id: number
  metodo_pago: string
  monto: number
  monto_recibido: number
  cambio: number
  registrado_en: string
}

interface SaleRecord {
  id: number
  consecutivo: string
  tipo_atencion: 'mesa' | 'mostrador'
  mesa_id: number | null
  mesa_nombre: string | null
  usuario_id: number
  usuario_nombre: string
  estado: 'abierta' | 'pagada' | 'anulada'
  subtotal: number
  descuento: number
  total: number
  observaciones: string | null
  creada_en: string
  cerrada_en: string | null
  detalles: SaleLine[]
  pagos: SalePayment[]
}

type ProductFormState = Omit<Product, 'id' | 'categoria_nombre' | 'creado_en'>

const emptyProduct: ProductFormState = {
  codigo: '',
  nombre: '',
  descripcion: '',
  categoria_id: 0,
  precio_venta: 0,
  costo_estimado: 0,
  stock_actual: 0,
  controlar_stock: true,
  disponible: true,
}

const copCurrency = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

const receiptBusiness = {
  name: import.meta.env.VITE_RECEIPT_BUSINESS_NAME?.trim() || 'Panadería MAFE',
  nit: import.meta.env.VITE_RECEIPT_NIT?.trim() || '',
  address: import.meta.env.VITE_RECEIPT_ADDRESS?.trim() || '',
  phone: import.meta.env.VITE_RECEIPT_PHONE?.trim() || '',
}

const paymentMethodLabels: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  tarjeta: 'Tarjeta',
}

function CatalogView() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [error, setError] = useState('')
  const [showProduct, setShowProduct] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [productForm, setProductForm] = useState<ProductFormState>(emptyProduct)
  const [showCategory, setShowCategory] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [categoryForm, setCategoryForm] = useState({ nombre: '', descripcion: '' })

  const loadCatalog = async () => {
    try {
      const [productData, categoryData] = await Promise.all([
        api<Product[]>('/api/productos'),
        api<Category[]>('/api/categorias'),
      ])
      setProducts(productData)
      setCategories(categoryData)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar el catálogo')
    }
  }

  useEffect(() => { void loadCatalog() }, [])

  const filteredProducts = products.filter((product) => {
    const matchesText = !search
      || product.nombre.toLocaleLowerCase().includes(search.toLocaleLowerCase())
      || (product.codigo || '').toLocaleLowerCase().includes(search.toLocaleLowerCase())
    return matchesText && (!categoryFilter || product.categoria_id === Number(categoryFilter))
  })

  const openNewProduct = () => {
    setEditingProduct(null)
    setProductForm({ ...emptyProduct, categoria_id: categories.find((category) => category.activa)?.id || 0 })
    setShowProduct(true)
  }

  const openEditProduct = (product: Product) => {
    setEditingProduct(product)
    setProductForm({
      codigo: product.codigo || '',
      nombre: product.nombre,
      descripcion: product.descripcion || '',
      categoria_id: product.categoria_id,
      precio_venta: product.precio_venta,
      costo_estimado: product.costo_estimado,
      stock_actual: product.stock_actual,
      controlar_stock: product.controlar_stock,
      disponible: product.disponible,
    })
    setShowProduct(true)
  }

  const saveProduct = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    const payload = {
      ...productForm,
      codigo: productForm.codigo || null,
      descripcion: productForm.descripcion || null,
      precio_venta: Number(productForm.precio_venta),
      costo_estimado: Number(productForm.costo_estimado),
      stock_actual: Number(productForm.stock_actual),
    }
    try {
      await api<Product>(editingProduct
        ? `/api/productos/${editingProduct.id}`
        : '/api/productos', {
          method: editingProduct ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        })
      setShowProduct(false)
      await loadCatalog()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar el producto')
    }
  }

  const toggleProductAvailable = async (product: Product) => {
    setError('')
    try {
      await api<Product>(`/api/productos/${product.id}/disponibilidad?disponible=${!product.disponible}`, {
        method: 'PATCH',
      })
      await loadCatalog()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible actualizar disponibilidad')
    }
  }

  const openCategory = (category?: Category) => {
    setEditingCategory(category || null)
    setCategoryForm({
      nombre: category?.nombre || '',
      descripcion: category?.descripcion || '',
    })
    setShowCategory(true)
  }

  const saveCategory = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await api<Category>(editingCategory
        ? `/api/categorias/${editingCategory.id}`
        : '/api/categorias', {
          method: editingCategory ? 'PUT' : 'POST',
          body: JSON.stringify({
            ...categoryForm,
            descripcion: categoryForm.descripcion || null,
          }),
        })
      setShowCategory(false)
      await loadCatalog()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar la categoría')
    }
  }

  const toggleCategory = async (category: Category) => {
    setError('')
    try {
      await api<Category>(`/api/categorias/${category.id}`, {
        method: 'PUT',
        body: JSON.stringify({ activa: !category.activa }),
      })
      await loadCatalog()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible actualizar la categoría')
    }
  }

  const lowStock = products.filter((product) => product.controlar_stock && product.stock_actual < 5).length
  const activeCategories = categories.filter((category) => category.activa)

  return (
    <div className="catalog-view">
      {error && <div className="error-message">{error}</div>}
      <div className="catalog-heading">
        <div><h2>Catálogo de productos</h2><p>Productos, precios y disponibilidad para la operación diaria.</p></div>
        <div className="catalog-actions">
          <button type="button" className="secondary-button" onClick={() => openCategory()}>Gestionar categorías</button>
          <button type="button" className="primary-button" onClick={openNewProduct}>+ Nuevo producto</button>
        </div>
      </div>

      <div className="catalog-stats">
        <article><span>Total de productos</span><strong>{products.length}</strong></article>
        <article><span>Disponibles para venta</span><strong>{products.filter((product) => product.disponible).length}</strong></article>
        <article><span>Agotados / Stock bajo</span><strong>{lowStock}</strong></article>
      </div>

      <div className="catalog-filters">
        <input aria-label="Buscar por nombre o código" placeholder="Buscar por nombre o código..." value={search} onChange={(event) => setSearch(event.target.value)} />
        <select aria-label="Filtrar por categoría" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.nombre}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        <table className="catalog-table">
          <thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock en vitrina</th><th>Disponible</th><th></th></tr></thead>
          <tbody>
            {filteredProducts.map((product) => (
              <tr key={product.id}>
                <td>{product.codigo || '—'}</td>
                <td><strong>{product.nombre}</strong></td>
                <td><span className="category-tag">{product.categoria_nombre}</span></td>
                <td>{copCurrency.format(product.precio_venta)}</td>
                <td>{product.controlar_stock ? product.stock_actual : <span className="made-to-order">Bajo pedido</span>}</td>
                <td>
                  <button type="button" role="switch" aria-checked={product.disponible} aria-label={`Cambiar disponibilidad de ${product.nombre}`} className={`availability-switch ${product.disponible ? 'on' : ''}`} onClick={() => void toggleProductAvailable(product)}>
                    <span />
                  </button>
                  <small className={product.disponible ? 'available-label' : 'unavailable-label'}>{product.disponible ? 'Disponible' : 'No disponible'}</small>
                </td>
                <td><button type="button" className="edit-button" onClick={() => openEditProduct(product)}>Editar</button></td>
              </tr>
            ))}
            {filteredProducts.length === 0 && <tr><td colSpan={7} className="empty-row">No se encontraron productos.</td></tr>}
          </tbody>
        </table>
      </div>

      {showProduct && (
        <div className="modal-backdrop">
          <form className="modal product-modal" onSubmit={saveProduct}>
            <h2>{editingProduct ? 'Editar producto' : 'Nuevo producto'}</h2>
            <div className="form-grid">
              <label>Código (opcional)<input value={productForm.codigo || ''} onChange={(event) => setProductForm({ ...productForm, codigo: event.target.value })} /></label>
              <label>Nombre<input value={productForm.nombre} onChange={(event) => setProductForm({ ...productForm, nombre: event.target.value })} minLength={2} required /></label>
              <label className="span-two">Descripción<textarea value={productForm.descripcion || ''} onChange={(event) => setProductForm({ ...productForm, descripcion: event.target.value })} rows={2} /></label>
              <label>Categoría<select value={productForm.categoria_id || ''} onChange={(event) => setProductForm({ ...productForm, categoria_id: Number(event.target.value) })} required>
                <option value="" disabled>Seleccionar</option>
                {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.nombre}</option>)}
              </select></label>
              <label>Precio de venta (COP)<input type="number" min="0" step="50" value={productForm.precio_venta} onChange={(event) => setProductForm({ ...productForm, precio_venta: Number(event.target.value) })} required /></label>
              <label>Costo estimado (COP)<input type="number" min="0" step="50" value={productForm.costo_estimado} onChange={(event) => setProductForm({ ...productForm, costo_estimado: Number(event.target.value) })} /></label>
              <label>Stock actual<input type="number" min="0" step="1" value={productForm.stock_actual} disabled={!productForm.controlar_stock} onChange={(event) => setProductForm({ ...productForm, stock_actual: Number(event.target.value) })} /></label>
            </div>
            <label className="checkbox-line"><input type="checkbox" checked={productForm.controlar_stock} onChange={(event) => setProductForm({ ...productForm, controlar_stock: event.target.checked })} /> Controlar stock de vitrina</label>
            <label className="checkbox-line"><input type="checkbox" checked={productForm.disponible} onChange={(event) => setProductForm({ ...productForm, disponible: event.target.checked })} /> Disponible para venta</label>
            <div className="modal-actions"><button type="button" onClick={() => setShowProduct(false)}>Cancelar</button><button type="submit" className="primary-button">Guardar producto</button></div>
          </form>
        </div>
      )}

      {showCategory && (
        <div className="modal-backdrop">
          <section className="modal category-modal">
            <h2>Gestión de categorías</h2>
            <form className="category-form" onSubmit={saveCategory}>
              <label>Nombre<input value={categoryForm.nombre} onChange={(event) => setCategoryForm({ ...categoryForm, nombre: event.target.value })} minLength={2} required /></label>
              <label>Descripción<input value={categoryForm.descripcion} onChange={(event) => setCategoryForm({ ...categoryForm, descripcion: event.target.value })} /></label>
              <div className="modal-actions"><button type="button" onClick={() => setShowCategory(false)}>Cerrar</button><button type="submit" className="primary-button">{editingCategory ? 'Guardar cambios' : 'Crear categoría'}</button></div>
            </form>
            <div className="category-list">
              {categories.map((category) => (
                <div className="category-row" key={category.id}>
                  <div><strong>{category.nombre}</strong><small>{category.activa ? 'Activa' : 'Inactiva'}</small></div>
                  <button type="button" onClick={() => openCategory(category)}>Editar</button>
                  <button type="button" onClick={() => void toggleCategory(category)}>{category.activa ? 'Desactivar' : 'Activar'}</button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function TablesView({
  isAdmin,
  onOperate,
}: {
  isAdmin: boolean
  onOperate: (saleId: number, tableId: number, chargeNow?: boolean) => void
}) {
  const [tables, setTables] = useState<TableRecord[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [manage, setManage] = useState(false)
  const [editing, setEditing] = useState<TableRecord | null>(null)
  const [form, setForm] = useState({ numero: 1, nombre: 'Mesa 1', capacidad: 4, activa: true })
  const [showInactive, setShowInactive] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<TableRecord | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  const loadTables = async () => {
    const query = isAdmin ? '?incluir_inactivas=true' : ''
    setTables(await api<TableRecord[]>(`/api/mesas${query}`))
  }
  useEffect(() => {
    void loadTables().catch((cause) => {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar las mesas')
    })
  }, [isAdmin])

  const operate = async (table: TableRecord, chargeNow = false) => {
    setError('')
    try {
      const sale = table.venta_id
        ? await api<SaleRecord>(`/api/ventas/${table.venta_id}`)
        : await api<SaleRecord>(`/api/ventas/mesas/${table.id}/abrir`, { method: 'POST' })
      onOperate(sale.id, table.id, chargeNow)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible abrir la mesa')
    }
  }

  const openNewTable = () => {
    const number = Math.max(0, ...tables.map((table) => table.numero)) + 1
    setEditing(null)
    setForm({ numero: number, nombre: `Mesa ${number}`, capacidad: 4, activa: true })
    setManage(true)
  }

  const editTable = (table: TableRecord) => {
    setEditing(table)
    setForm({ numero: table.numero, nombre: table.nombre, capacidad: table.capacidad, activa: table.activa })
    setManage(true)
  }

  const saveTable = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await api<TableRecord>(editing ? `/api/mesas/${editing.id}` : '/api/mesas', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(form),
      })
      setManage(false)
      await loadTables()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar la mesa')
    }
  }

  const toggleTableActive = async (table: TableRecord) => {
    setError('')
    setNotice('')
    try {
      await api<TableRecord>(`/api/mesas/${table.id}`, {
        method: 'PUT',
        body: JSON.stringify({ activa: !table.activa }),
      })
      await loadTables()
      setNotice(`${table.nombre} ${table.activa ? 'desactivada' : 'activada'}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible actualizar la mesa')
    }
  }

  const deleteTable = async () => {
    if (!deleteTarget) return
    setDeleteError('')
    setDeleting(true)
    try {
      await api<void>(`/api/mesas/${deleteTarget.id}`, { method: 'DELETE' })
      const deletedName = deleteTarget.nombre
      setDeleteTarget(null)
      setNotice(`${deletedName} eliminada.`)
      try {
        await loadTables()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'La mesa se eliminó, pero no se pudo actualizar la lista')
      }
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : 'No fue posible eliminar la mesa')
    } finally {
      setDeleting(false)
    }
  }

  const activeCount = tables.filter((table) => table.activa === true).length
  const inactiveCount = tables.filter((table) => table.activa === false).length
  const visibleTables = tables.filter((table) => table.activa === true || (isAdmin && showInactive && table.activa === false))

  return (
    <div className="tables-view">
      {error && <div className="error-message">{error}</div>}
      {notice && <div className="success-message">{notice}</div>}
      <div className="operation-heading">
        <div><h2>Mesas</h2><p>Consulta la ocupación y el consumo de cada mesa.</p></div>
        {isAdmin && <button type="button" className="primary-button" onClick={openNewTable}>+ Crear mesa</button>}
      </div>
      {isAdmin && (
        <div className="table-management-toolbar">
          <label className="table-inactive-filter">
            <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
            Mostrar mesas inactivas <span>{inactiveCount}</span>
          </label>
          <div className="table-counts"><span>{activeCount} activas</span><span>{inactiveCount} inactivas</span></div>
        </div>
      )}
      {isAdmin && showInactive && inactiveCount === 0 && (
        <p className="table-empty-inactive">No hay mesas inactivas registradas en la base de datos actual.</p>
      )}
      <div className="tables-grid">
        {visibleTables.map((table) => (
          <article className={`table-card ${table.estado} ${table.activa === false ? 'inactiva' : ''}`} key={table.id}>
            <div className="table-card-top">
              <span className="table-number">{table.numero}</span>
              <span className={`table-status ${table.estado}`}>{table.estado === 'libre' ? 'Libre' : 'Ocupada'}</span>
              {isAdmin && <span className={`table-active-status ${table.activa === false ? 'inactive' : 'active'}`}>{table.activa === false ? 'Inactiva' : 'Activa'}</span>}
            </div>
            <h3>{table.nombre}</h3>
            <p className="table-capacity"><Users size={15} /> Capacidad {table.capacidad}</p>
            {table.activa && table.estado === 'ocupada' ? (
              <>
                <strong className="table-total">{copCurrency.format(table.venta_total || 0)}</strong>
                {table.abierta_en && <small className="table-open-time"><Clock3 size={13} /> Desde {new Date(table.abierta_en).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</small>}
                <div className="table-actions">
                  <button type="button" onClick={() => void operate(table)}>Agregar pedido</button>
                  <button type="button" className="charge-table" onClick={() => void operate(table, true)}>Cobrar</button>
                </div>
              </>
            ) : table.activa === true ? (
              <button type="button" className="open-table" onClick={() => void operate(table)}>Abrir mesa</button>
            ) : <p className="table-inactive-hint">No disponible para pedidos</p>}
            {isAdmin && (
              <div className="table-admin-actions">
                <button type="button" className={table.activa === false ? 'activate-table' : 'deactivate-table'} disabled={table.activa !== false && table.estado === 'ocupada'} onClick={() => void toggleTableActive(table)}>
                  {table.activa === false ? 'Activar' : 'Desactivar'}
                </button>
                <button type="button" className="table-edit" onClick={() => editTable(table)}>Editar</button>
                <button type="button" className="delete-table" onClick={() => { setDeleteError(''); setDeleteTarget(table) }}><Trash2 size={15} /> Eliminar</button>
              </div>
            )}
          </article>
        ))}
        {visibleTables.length === 0 && <div className="empty-panel">{showInactive ? 'No hay mesas registradas.' : 'No hay mesas activas.'}</div>}
      </div>

      {manage && (
        <div className="modal-backdrop">
          <form className="modal table-modal" onSubmit={saveTable}>
            <h2>{editing ? 'Editar mesa' : 'Crear mesa'}</h2>
            <label>Número<input type="number" min="1" value={form.numero} onChange={(event) => setForm({ ...form, numero: Number(event.target.value) })} required /></label>
            <label>Nombre<input value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} required /></label>
            <label>Capacidad<input type="number" min="1" max="50" value={form.capacidad} onChange={(event) => setForm({ ...form, capacidad: Number(event.target.value) })} required /></label>
            {editing && <label className="checkbox-line"><input type="checkbox" checked={form.activa} onChange={(event) => setForm({ ...form, activa: event.target.checked })} /> Mesa activa</label>}
            <div className="modal-actions"><button type="button" onClick={() => setManage(false)}>Cancelar</button><button type="submit" className="primary-button">Guardar</button></div>
          </form>
        </div>
      )}
      {deleteTarget && (
        <div className="modal-backdrop">
          <section className="modal table-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-table-title">
            <h2 id="delete-table-title">Eliminar mesa</h2>
            <p>¿Estás seguro de eliminar la {deleteTarget.nombre}? Esta acción no se puede deshacer.</p>
            {deleteError && <div className="error-message">{deleteError}</div>}
            <div className="modal-actions">
              <button type="button" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancelar</button>
              <button type="button" className="danger-button" disabled={deleting} onClick={() => void deleteTable()}>{deleting ? 'Eliminando...' : 'Eliminar mesa'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function PointOfSaleView({
  isAdmin,
  initialSaleId,
  chargeOnOpen,
  onOpenHandled,
  onPaid,
}: {
  isAdmin: boolean
  initialSaleId: number | null
  chargeOnOpen: boolean
  onOpenHandled: () => void
  onPaid: () => void
}) {
  const [section, setSection] = useState<'pos' | 'history'>('pos')
  const [mobilePanel, setMobilePanel] = useState<'catalog' | 'ticket'>('catalog')
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [tables, setTables] = useState<TableRecord[]>([])
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [serviceType, setServiceType] = useState<'mesa' | 'mostrador'>('mostrador')
  const [tableId, setTableId] = useState('')
  const [sale, setSale] = useState<SaleRecord | null>(null)
  const [counterLines, setCounterLines] = useState<SaleLine[]>([])
  const [history, setHistory] = useState<SaleRecord[]>([])
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('efectivo')
  const [amountReceived, setAmountReceived] = useState(0)
  const [receipt, setReceipt] = useState<SaleRecord | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadBase = async () => {
    try {
      const [productData, categoryData, tableData] = await Promise.all([
        api<Product[]>('/api/productos?solo_disponibles=true'),
        api<Category[]>('/api/categorias'),
        api<TableRecord[]>('/api/mesas'),
      ])
      setProducts(productData)
      setCategories(categoryData.filter((category) => category.activa))
      setTables(tableData)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar el punto de venta')
    }
  }

  const loadHistory = async () => {
    try {
      setHistory(await api<SaleRecord[]>('/api/ventas'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar las ventas del día')
    }
  }

  useEffect(() => {
    void loadBase()
    void loadHistory()
  }, [])

  useEffect(() => {
    if (!initialSaleId) return
    api<SaleRecord>(`/api/ventas/${initialSaleId}`).then((opened) => {
      setSale(opened)
      setServiceType('mesa')
      setMobilePanel('ticket')
      setTableId(String(opened.mesa_id || ''))
      if (chargeOnOpen) {
        setAmountReceived(opened.total)
        setPaymentOpen(true)
      }
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'No fue posible cargar la venta'))
      .then(() => onOpenHandled())
  }, [initialSaleId, chargeOnOpen, onOpenHandled])

  const lines = serviceType === 'mesa' ? sale?.detalles || [] : counterLines
  const total = lines.reduce((sum, line) => sum + line.subtotal, 0)
  const visibleProducts = products.filter((product) => {
    const matchesText = product.nombre.toLocaleLowerCase().includes(search.toLocaleLowerCase())
      || (product.codigo || '').toLocaleLowerCase().includes(search.toLocaleLowerCase())
    return matchesText && (categoryId === null || product.categoria_id === categoryId)
  })

  const chooseTable = async (value: string) => {
    if (counterLines.length > 0) {
      setError('Elimina los productos del ticket para habilitar la opción de abrir mesa.')
      return
    }
    setTableId(value)
    setSale(null)
    setError('')
    if (!value) return
    try {
      const selected = tables.find((table) => table.id === Number(value))
      const opened = selected?.venta_id
        ? await api<SaleRecord>(`/api/ventas/${selected.venta_id}`)
        : await api<SaleRecord>(`/api/ventas/mesas/${value}/abrir`, { method: 'POST' })
      setSale(opened)
      setServiceType('mesa')
      setMobilePanel('ticket')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible abrir la mesa')
    }
  }

  const updateMesaLine = async (product: Product, quantity: number, notes: string | null = null) => {
    let activeSale = sale
    if (!activeSale) {
      if (!tableId) {
        setError('Selecciona una mesa antes de agregar productos')
        return
      }
      activeSale = await api<SaleRecord>(`/api/ventas/mesas/${tableId}/abrir`, { method: 'POST' })
      setSale(activeSale)
    }
    const updated = await api<SaleRecord>(`/api/ventas/${activeSale.id}/items`, {
      method: 'POST',
      body: JSON.stringify({ producto_id: product.id, cantidad: quantity, notas: notes }),
    })
    setSale(updated)
  }

  const addProduct = async (product: Product) => {
    setError('')
    setNotice('')
    try {
      if (serviceType === 'mesa') {
        const existing = sale?.detalles.find((line) => line.producto_id === product.id)
        await updateMesaLine(product, (existing?.cantidad || 0) + 1, existing?.notas || null)
      } else {
        setCounterLines((current) => {
          const existing = current.find((line) => line.producto_id === product.id)
          if (existing) {
            return current.map((line) => line.producto_id === product.id
              ? { ...line, cantidad: line.cantidad + 1, subtotal: (line.cantidad + 1) * line.precio_unitario }
              : line)
          }
          return [...current, {
            id: -product.id,
            producto_id: product.id,
            codigo: product.codigo,
            nombre: product.nombre,
            cantidad: 1,
            precio_unitario: product.precio_venta,
            subtotal: product.precio_venta,
            notas: null,
          }]
        })
      }
      setMobilePanel('ticket')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible agregar el producto')
    }
  }

  const changeQuantity = async (line: SaleLine, delta: number) => {
    const quantity = line.cantidad + delta
    if (serviceType === 'mesa') {
      if (!sale) return
      try {
        if (quantity < 1) {
          setSale(await api<SaleRecord>(`/api/ventas/${sale.id}/items/${line.id}`, { method: 'DELETE' }))
        } else {
          const product = products.find((item) => item.id === line.producto_id)
          if (product) await updateMesaLine(product, quantity, line.notas)
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'No fue posible actualizar la cantidad')
      }
    } else {
      setCounterLines((current) => quantity < 1
        ? current.filter((item) => item.producto_id !== line.producto_id)
        : current.map((item) => item.producto_id === line.producto_id
          ? { ...item, cantidad: quantity, subtotal: quantity * item.precio_unitario }
          : item))
    }
  }

  const updateNote = async (line: SaleLine, notes: string) => {
    if (serviceType === 'mesa') {
      const product = products.find((item) => item.id === line.producto_id)
      if (product) {
        try {
          await updateMesaLine(product, line.cantidad, notes || null)
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'No fue posible guardar la nota')
        }
      }
    } else {
      setCounterLines((current) => current.map((item) => item.producto_id === line.producto_id
        ? { ...item, notas: notes || null }
        : item))
    }
  }

  const startPayment = () => {
    if (lines.length === 0) {
      setError('Agrega productos antes de cobrar')
      return
    }
    setError('')
    setPaymentMethod('efectivo')
    setAmountReceived(total)
    setPaymentOpen(true)
  }

  const confirmPayment = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      let paid: SaleRecord
      if (serviceType === 'mesa') {
        if (!sale) throw new Error('No hay una venta de mesa activa')
        paid = await api<SaleRecord>(`/api/ventas/${sale.id}/cobrar`, {
          method: 'POST',
          body: JSON.stringify({ metodo_pago: paymentMethod, monto_recibido: Number(amountReceived) }),
        })
      } else {
        paid = await api<SaleRecord>('/api/ventas/mostrador', {
          method: 'POST',
          body: JSON.stringify({
            items: counterLines.map((line) => ({
              producto_id: line.producto_id,
              cantidad: line.cantidad,
              notas: line.notas,
            })),
            pago: { metodo_pago: paymentMethod, monto_recibido: Number(amountReceived) },
          }),
        })
      }
      setReceipt(paid)
      setPaymentOpen(false)
      setCounterLines([])
      setSale(null)
      setTableId('')
      await loadBase()
      await loadHistory()
      onPaid()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible registrar el pago')
    }
  }

  const cancelSale = async (saleId: number) => {
    if (!window.confirm('¿Anular esta venta? Esta acción no se puede deshacer.')) return
    setError('')
    try {
      await api<SaleRecord>(`/api/ventas/${saleId}/anular`, { method: 'POST' })
      await loadBase()
      await loadHistory()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible anular la venta')
    }
  }

  const saveTableOrder = async () => {
    if (!sale) return
    try {
      setSale(await api<SaleRecord>(`/api/ventas/${sale.id}`))
      setNotice(`Pedido guardado en ${sale.mesa_nombre || 'la mesa'}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible confirmar el pedido')
    }
  }

  const change = Math.max(0, Number(amountReceived || 0) - total)
  const printSaleReceipt = () => {
    setError('')
    printElementById('sale-receipt-print', setError)
  }

  return (
    <div className="pos-view">
      <div className="pos-topbar">
        <div className="pos-tabs">
          <button type="button" className={section === 'pos' ? 'selected' : ''} onClick={() => setSection('pos')}><ShoppingCart size={16} /> Punto de venta</button>
          <button type="button" className={section === 'history' ? 'selected' : ''} onClick={() => { setSection('history'); void loadHistory() }}><Receipt size={16} /> Ventas del día</button>
        </div>
      </div>
      {section === 'pos' && (
        <div className="mobile-pos-switch" role="tablist" aria-label="Vista del punto de venta">
          <button type="button" role="tab" aria-selected={mobilePanel === 'catalog'} className={mobilePanel === 'catalog' ? 'selected' : ''} onClick={() => setMobilePanel('catalog')}>Catálogo</button>
          <button type="button" role="tab" aria-selected={mobilePanel === 'ticket'} className={mobilePanel === 'ticket' ? 'selected' : ''} onClick={() => setMobilePanel('ticket')}>Ticket ({lines.length} ítems · {copCurrency.format(total)})</button>
        </div>
      )}
      {error && <div className="error-message">{error}</div>}
      {notice && <div className="success-message">{notice}</div>}

      {section === 'history' ? (
        <div className="table-wrap history-wrap">
          <table>
            <thead><tr><th>Consecutivo</th><th>Hora</th><th>Atención</th><th>Atendió</th><th>Total</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.consecutivo}</strong></td>
                  <td>{new Date(item.creada_en).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{item.mesa_nombre || 'Mostrador'}</td>
                  <td>{item.usuario_nombre}</td>
                  <td>{copCurrency.format(item.total)}</td>
                  <td><span className={`sale-state ${item.estado}`}>{item.estado}</span></td>
                  <td className="history-actions">
                    <button type="button" onClick={() => setReceipt(item)}><Receipt size={15} /> Comprobante</button>
                    {isAdmin && item.estado !== 'anulada' && <button type="button" onClick={() => void cancelSale(item.id)}>Anular</button>}
                  </td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={7} className="empty-row">Aún no hay ventas hoy.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="service-selector">
            <span>Tipo de atención</span>
            <button type="button" className={serviceType === 'mostrador' ? 'selected' : ''} onClick={() => { setServiceType('mostrador'); setSale(null); setTableId('') }}>Mostrador</button>
            <button
              type="button"
              className={serviceType === 'mesa' ? 'selected' : ''}
              disabled={serviceType !== 'mesa' && counterLines.length > 0}
              aria-describedby={serviceType !== 'mesa' && counterLines.length > 0 ? 'open-table-disabled-help' : undefined}
              onClick={() => {
                if (counterLines.length > 0) {
                  setError('Elimina los productos del ticket para habilitar la opción de abrir mesa.')
                  return
                }
                setError('')
                setServiceType('mesa')
              }}
            >Mesa</button>
            {serviceType === 'mostrador' && counterLines.length > 0 && (
              <span className="table-open-hint" id="open-table-disabled-help">
                Elimina los productos del ticket para habilitar Abrir mesa.
              </span>
            )}
            {serviceType === 'mesa' && (
              <select value={tableId} onChange={(event) => void chooseTable(event.target.value)}>
                <option value="">Seleccionar mesa</option>
                {tables.map((table) => <option value={table.id} key={table.id}>{table.nombre}{table.estado === 'ocupada' ? ' · Ocupada' : ''}</option>)}
              </select>
            )}
            {sale && <span className="active-ticket">{sale.consecutivo} · {sale.mesa_nombre}</span>}
          </div>

          <div className={`pos-columns ${mobilePanel === 'catalog' ? 'mobile-catalog-only' : 'mobile-ticket-only'}`}>
            <section className="pos-catalog">
              <div className="pos-search"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto o código..." /><span>{visibleProducts.length} productos</span></div>
              <div className="category-tabs">
                <button type="button" className={categoryId === null ? 'selected' : ''} onClick={() => setCategoryId(null)}>Todos</button>
                {categories.map((category) => <button type="button" className={categoryId === category.id ? 'selected' : ''} key={category.id} onClick={() => setCategoryId(category.id)}>{category.nombre}</button>)}
              </div>
              <div className="pos-product-grid">
                {visibleProducts.map((product) => {
                  const outOfStock = product.controlar_stock && product.stock_actual <= 0
                  return (
                    <button type="button" className="pos-product-card" key={product.id} disabled={outOfStock} onClick={() => void addProduct(product)}>
                      <span className="product-category">{product.categoria_nombre}</span>
                      <strong>{product.nombre}</strong>
                      <span className="product-price">{copCurrency.format(product.precio_venta)}</span>
                      <small className={outOfStock ? 'stock-empty' : 'stock-ok'}>{product.controlar_stock ? (outOfStock ? 'Agotado' : `Stock ${product.stock_actual}`) : 'Preparado al momento'}</small>
                      <span className="product-add"><Plus size={16} /> Agregar</span>
                    </button>
                  )
                })}
                {visibleProducts.length === 0 && <div className="empty-panel">No hay productos disponibles para esos filtros.</div>}
              </div>
            </section>

            <section className="active-ticket-panel">
              <div className="ticket-heading"><div><small>COMANDA</small><h2>{serviceType === 'mesa' ? sale?.mesa_nombre || 'Selecciona una mesa' : 'Mostrador'}</h2></div><span>{lines.length} ítems</span></div>
              <div className="ticket-lines">
                {lines.map((line) => (
                  <article className="ticket-line" key={line.id}>
                    <div className="ticket-line-main">
                      <div><strong>{line.nombre}</strong><small>{copCurrency.format(line.precio_unitario)} c/u</small></div>
                      <strong>{copCurrency.format(line.subtotal)}</strong>
                    </div>
                    <div className="ticket-line-controls">
                      <div className="quantity-controls">
                        <button type="button" aria-label="Disminuir cantidad" onClick={() => void changeQuantity(line, -1)}><Minus size={13} /></button>
                        <span>{line.cantidad}</span>
                        <button type="button" aria-label="Aumentar cantidad" onClick={() => void changeQuantity(line, 1)}><Plus size={13} /></button>
                      </div>
                      <input aria-label={`Nota de ${line.nombre}`} placeholder="Nota para cocina..." defaultValue={line.notas || ''} onBlur={(event) => void updateNote(line, event.target.value)} />
                    </div>
                  </article>
                ))}
                {lines.length === 0 && <div className="ticket-empty"><ShoppingCart size={25} /><p>Agrega productos desde el catálogo.</p></div>}
              </div>
              <div className="ticket-total"><span>Total</span><strong>{copCurrency.format(total)}</strong></div>
              <div className="ticket-actions">
                {serviceType === 'mesa' && <button type="button" className="secondary-button" disabled={!sale || lines.length === 0} onClick={() => void saveTableOrder()}>Guardar pedido en mesa</button>}
                <button type="button" className="primary-button" disabled={lines.length === 0 || (serviceType === 'mesa' && !sale)} onClick={startPayment}>Cobrar · {copCurrency.format(total)}</button>
              </div>
            </section>
          </div>
        </>
      )}

      {paymentOpen && (
        <div className="modal-backdrop">
          <form className="modal payment-modal" onSubmit={confirmPayment}>
            <button type="button" className="modal-close" aria-label="Cerrar" onClick={() => setPaymentOpen(false)}><X size={18} /></button>
            <h2>Registrar pago</h2>
            <div className="payment-total"><span>Total a pagar</span><strong>{copCurrency.format(total)}</strong></div>
            <label>Medio de pago<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
              <option value="efectivo">Efectivo</option><option value="nequi">Nequi</option><option value="daviplata">Daviplata</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option>
            </select></label>
            <label>Monto recibido<input type="number" min={total} step="50" value={amountReceived} onChange={(event) => setAmountReceived(Number(event.target.value))} required /></label>
            <div className="change-row"><span>Cambio</span><strong>{copCurrency.format(paymentMethod === 'efectivo' ? change : 0)}</strong></div>
            <div className="modal-actions"><button type="button" onClick={() => setPaymentOpen(false)}>Cancelar</button><button type="submit" className="primary-button">Confirmar pago</button></div>
          </form>
        </div>
      )}

      {receipt && (
        <div className="modal-backdrop receipt-backdrop">
          <div className="receipt-modal">
            <button type="button" className="modal-close receipt-close" aria-label="Cerrar comprobante" onClick={() => setReceipt(null)}><X size={18} /></button>
            <ReceiptPrint receipt={receipt} />
            <div className="receipt-actions"><button type="button" className="primary-button" onClick={printSaleReceipt}><Printer size={16} /> Imprimir comprobante</button><button type="button" className="secondary-button" onClick={() => setReceipt(null)}>Cerrar</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

function ReceiptPrint({ receipt }: { receipt: SaleRecord }) {
  const payment = receipt.pagos[receipt.pagos.length - 1]
  const saleDate = receipt.cerrada_en || payment?.registrado_en || receipt.creada_en
  return (
    <div className="receipt-print" id="sale-receipt-print">
      <div className="receipt-header">
        <div className="receipt-logo">P</div>
        <h2>{receiptBusiness.name}</h2>
        <div className="receipt-business-details">
          {receiptBusiness.nit && <div>NIT: {receiptBusiness.nit}</div>}
          {receiptBusiness.address && <div>{receiptBusiness.address}</div>}
          {receiptBusiness.phone && <div>Tel: {receiptBusiness.phone}</div>}
        </div>
        <p>Comprobante interno — no válido como factura electrónica</p>
      </div>
      <div className="receipt-meta">
        <div><span>Consecutivo</span><strong>{receipt.consecutivo}</strong></div>
        <div><span>Fecha y hora</span><strong>{new Date(saleDate).toLocaleString('es-CO')}</strong></div>
        <div><span>Atendió</span><strong>{receipt.usuario_nombre}</strong></div>
        <div><span>Pedido</span><strong>{receipt.tipo_atencion === 'mesa' ? receipt.mesa_nombre || 'Mesa' : 'Llevar / mostrador'}</strong></div>
      </div>
      <table className="receipt-items">
        <thead><tr><th className="receipt-qty">Cant.</th><th className="receipt-product">Producto / unitario</th><th className="receipt-amount">Subtotal</th></tr></thead>
        <tbody>{receipt.detalles.map((item) => (
          <tr key={item.id}>
            <td className="receipt-qty">{item.cantidad}</td>
            <td className="receipt-product">{item.nombre}<small>{copCurrency.format(item.precio_unitario)} c/u</small>{item.notas && <small>{item.notas}</small>}</td>
            <td className="receipt-amount">{copCurrency.format(item.subtotal)}</td>
          </tr>
        ))}</tbody>
      </table>
      <div className="receipt-subtotal"><span>Subtotal</span><strong>{copCurrency.format(receipt.subtotal)}</strong></div>
      {receipt.descuento > 0 && <div className="receipt-subtotal"><span>Descuento</span><strong>- {copCurrency.format(receipt.descuento)}</strong></div>}
      <div className="receipt-total"><span>Total pagado</span><strong>{copCurrency.format(receipt.total)}</strong></div>
      {payment && <div className="receipt-payment">
        <div><span>Medio de pago</span><strong>{paymentMethodLabels[payment.metodo_pago] || payment.metodo_pago}</strong></div>
        <div><span>Recibido</span><strong>{copCurrency.format(payment.monto_recibido)}</strong></div>
        <div><span>Cambio</span><strong>{copCurrency.format(payment.cambio)}</strong></div>
      </div>}
      <p className="receipt-thanks">¡Gracias por tu compra!</p>
    </div>
  )
}

function LoginScreen() {
  const { login } = useAuth()
  const [selectedRole, setSelectedRole] = useState<Role>('administradora')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password, selectedRole)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <div className="brand-mark">M</div>
          <div><small>ERP ARTESANAL</small><strong>Panadería MAFE</strong></div>
        </div>
        <h1>Iniciar sesión</h1>
        <p className="login-subtitle">Tu negocio, listo para un nuevo día.</p>

        <div className="profile-grid">
          <button type="button" aria-pressed={selectedRole === 'administradora'} className={selectedRole === 'administradora' ? 'profile-card active' : 'profile-card'} onClick={() => setSelectedRole('administradora')}>
            <span className="profile-icon"><BarChart3 size={19} /></span>
            <strong>Administradora</strong>
            <small>Control completo del negocio</small>
          </button>
          <button type="button" aria-pressed={selectedRole === 'mesera'} className={selectedRole === 'mesera' ? 'profile-card active' : 'profile-card'} onClick={() => setSelectedRole('mesera')}>
            <span className="profile-icon"><ShoppingCart size={19} /></span>
            <strong>Mesera</strong>
            <small>Pedidos, mesas y ventas</small>
          </button>
        </div>

        <form onSubmit={submit}>
          <label>Usuario
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" minLength={3} required />
          </label>
          <label>Contraseña
            <span className="password-field">
              <input type={passwordVisible ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={8} required />
              <button type="button" className="password-toggle" aria-label={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={passwordVisible} onClick={() => setPasswordVisible((visible) => !visible)}>
                {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          {error && <div className="error-message" role="alert">{error}</div>}
          <button className="login-button" type="submit" disabled={loading}>
            {loading && <span className="loading-spinner" aria-hidden="true" />}
            {loading ? 'Validando acceso...' : 'Ingresar al sistema'}
          </button>
        </form>
      </section>
    </main>
  )
}

export default function App() {
  const { user, logout } = useAuth()
  const [activeView, setActiveView] = useState('Resumen')
  const [activeSaleId, setActiveSaleId] = useState<number | null>(null)
  const [chargeOnOpen, setChargeOnOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    if (!user) return
    if (user.rol !== 'administradora') {
      setActiveView('Ventas POS')
      window.location.hash = 'ventas-pos'
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    const syncFromHash = () => {
      const labels: Record<string, string> = {
        resumen: 'Resumen',
        'ventas-pos': 'Ventas POS',
        mesas: 'Mesas',
        caja: 'Caja',
        gastos: 'Gastos',
        produccion: 'Producción diaria',
        'produccion-diaria': 'Producción diaria',
        inventarios: 'Inventarios',
        administracion: 'Administración',
        catalogo: 'Catálogo',
      }
      const label = labels[window.location.hash.slice(1)]
      if (!label) return
      const isAdminOnly = ['Resumen', 'Gastos', 'Producción diaria', 'Inventarios', 'Administración', 'Catálogo'].includes(label)
      if (user.rol !== 'administradora' && isAdminOnly) {
        setActiveView('Ventas POS')
        window.location.hash = 'ventas-pos'
        return
      }
      setActiveView(label)
    }
    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [user])

  const clearSaleLaunch = useCallback(() => {
    setActiveSaleId(null)
    setChargeOnOpen(false)
  }, [])

  if (!user) return <LoginScreen />

  const menu = allMenu.filter((item) => item.roles.some((role) => role === user.rol))
  const currentView = menu.some((item) => item.label === activeView)
    ? activeView
    : menu[0].label
  const navigateTo = (label: string) => {
    setActiveView(label)
    window.location.hash = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replaceAll(' ', '-')
    setDrawerOpen(false)
  }

  return (
    <main className={`shell${sidebarCollapsed ? ' sidebar-is-collapsed' : ''}`}>
      <div className="mobile-topbar">
        <button type="button" className="mobile-menu-button" aria-label="Abrir menú" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(!drawerOpen)}><MenuIcon size={22} /></button>
        <strong className="mobile-page-title">{currentView}</strong>
        <button type="button" className="mobile-logout-button" aria-label="Cerrar sesión" onClick={logout}><LogOut size={18} /></button>
      </div>
      {drawerOpen && <button type="button" className="mobile-drawer-backdrop" aria-label="Cerrar menú" onClick={() => setDrawerOpen(false)} />}
      <aside className={`sidebar${drawerOpen ? ' drawer-open' : ''}${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
        <div className="brand">
          <span className="sidebar-brand-mark">M</span>
          <span className="brand-name">Panadería <b>MAFE</b></span>
          <button type="button" className="sidebar-collapse-button" aria-label={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}>
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <nav>
          {menu.map(({ label, icon: Icon }) => (
            <button key={label} type="button" title={sidebarCollapsed ? label : undefined} aria-current={currentView === label ? 'page' : undefined} className={currentView === label ? 'active' : ''} onClick={() => navigateTo(label)}>
              <Icon size={19} /> <span className="nav-label">{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <div className="avatar">{user.nombre.charAt(0).toUpperCase()}</div>
          <div className="sidebar-user-copy"><strong>{user.nombre}</strong><small>{user.rol === 'administradora' ? 'Administradora' : 'Mesera'}</small></div>
        </div>
        <button type="button" className="sidebar-logout" onClick={logout} title={sidebarCollapsed ? 'Cerrar sesión' : undefined}><LogOut size={18} /><span>Cerrar sesión</span></button>
      </aside>
      <section className="content">
        <header>
          <div><small>PLATAFORMA DE GESTIÓN</small><h1>{currentView}</h1></div>
          <div className="header-actions">
            <span className="pill">@{user.username} · {user.rol}</span>
            <button type="button" className="logout-button" onClick={logout}><LogOut size={16} /> Cerrar sesión</button>
          </div>
        </header>
        {currentView === 'Administración'
          ? <AdministrationView />
          : currentView === 'Catálogo'
            ? <CatalogView />
            : currentView === 'Resumen'
              ? <DashboardView onNavigate={navigateTo} />
            : currentView === 'Caja'
              ? <CashView isAdmin={user.rol === 'administradora'} />
              : currentView === 'Gastos'
                ? <ExpensesView />
              : currentView === 'Producción diaria'
                ? <ProductionView />
            : currentView === 'Inventarios'
              ? <InventoryView />
            : currentView === 'Mesas'
              ? <TablesView
                  isAdmin={user.rol === 'administradora'}
                  onOperate={(saleId, _tableId, chargeNow = false) => {
                    setActiveSaleId(saleId)
                    setChargeOnOpen(chargeNow)
                    setActiveView('Ventas POS')
                    window.location.hash = 'ventas-pos'
                  }}
                />
              : currentView === 'Ventas POS'
                ? <PointOfSaleView
                    isAdmin={user.rol === 'administradora'}
                    initialSaleId={activeSaleId}
                    chargeOnOpen={chargeOnOpen}
                    onOpenHandled={clearSaleLaunch}
                    onPaid={() => {
                      setActiveSaleId(null)
                      setChargeOnOpen(false)
                    }}
                  />
            : (
            <div className="welcome">
              <h2>{currentView}</h2>
              <p>Acceso autorizado para el perfil {user.rol}.</p>
            </div>
          )}
        <footer>ERP Panadería · Versión 0.1.0 · Entorno local</footer>
      </section>
      {(user.rol === 'mesera' || user.rol === 'administradora') && (
        <nav className="mobile-quickbar" aria-label="Accesos rápidos">
          {user.rol === 'administradora' && <button type="button" className={currentView === 'Resumen' ? 'active' : ''} onClick={() => navigateTo('Resumen')}><BarChart3 size={19} /><span>Resumen</span></button>}
          <button type="button" className={currentView === 'Mesas' ? 'active' : ''} onClick={() => navigateTo('Mesas')}><Table size={19} /><span>Mesas</span></button>
          <button type="button" className={currentView === 'Ventas POS' ? 'active' : ''} onClick={() => navigateTo('Ventas POS')}><ShoppingCart size={19} /><span>POS</span></button>
          <button type="button" className={currentView === 'Caja' ? 'active' : ''} onClick={() => navigateTo('Caja')}><Banknote size={19} /><span>Caja</span></button>
          <button type="button" className="mobile-more-button" aria-label="Abrir menú de módulos" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}><MenuIcon size={19} /><span>Más</span></button>
        </nav>
      )}
    </main>
  )
}
