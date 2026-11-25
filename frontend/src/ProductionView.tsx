import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from './services/api'

type ProductionTab = 'bitacora' | 'recetas'

interface Product {
  id: number
  nombre: string
  precio_venta: number
  stock_actual: number
  disponible: boolean
}

interface Material {
  id: number
  nombre: string
  unidad_medida: string
  stock_actual: number
  costo_promedio: number
  activo: boolean
}

interface RecipeIngredient {
  materia_prima_id: number
  materia_prima_nombre: string
  unidad_medida: string
  cantidad_requerida: number
  costo_unitario: number
  costo_parcial: number
}

interface Recipe {
  id: number
  producto_id: number
  producto_nombre: string
  precio_venta: number
  nombre: string
  rendimiento_unidades: number
  instrucciones: string | null
  activa: boolean
  creado_en: string
  costo_lote: number
  costo_unitario_estimado: number
  margen_bruto_estimado: number
  ingredientes: RecipeIngredient[]
}

interface ProductionIngredient {
  materia_prima_id: number
  materia_prima_nombre: string
  unidad_medida: string
  cantidad_consumida: number
  costo_unitario: number
  costo_parcial: number
}

interface Production {
  id: number
  consecutivo: string
  receta_id: number
  receta_nombre: string
  producto_id: number
  producto_nombre: string
  lotes_producidos: number
  cantidad_esperada: number
  cantidad_buena: number
  cantidad_merma: number
  costo_total_insumos: number
  costo_unitario_real: number
  observaciones: string | null
  usuario_id: number
  usuario_nombre: string
  fecha_produccion: string
  anulada: boolean
  ingredientes: ProductionIngredient[]
}

interface RecipeDraftLine {
  materia_prima_id: number | ''
  cantidad_requerida: number
}

interface RecipeForm {
  producto_id: number
  nombre: string
  rendimiento_unidades: number
  instrucciones: string
  activa: boolean
  ingredientes: RecipeDraftLine[]
}

const money = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

const localDate = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const emptyRecipeForm = (): RecipeForm => ({
  producto_id: 0,
  nombre: '',
  rendimiento_unidades: 1,
  instrucciones: '',
  activa: true,
  ingredientes: [{ materia_prima_id: '' as const, cantidad_requerida: 1 }],
})

export default function ProductionView() {
  const [tab, setTab] = useState<ProductionTab>('bitacora')
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productions, setProductions] = useState<Production[]>([])
  const [selectedDate, setSelectedDate] = useState(localDate)
  const [productFilter, setProductFilter] = useState('')
  const [error, setError] = useState('')
  const [recipeModal, setRecipeModal] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)
  const [recipeForm, setRecipeForm] = useState<RecipeForm>(emptyRecipeForm)
  const [productionModal, setProductionModal] = useState(false)
  const [productionRecipeId, setProductionRecipeId] = useState('')
  const [lots, setLots] = useState(1)
  const [goodUnits, setGoodUnits] = useState(1)
  const [wasteUnits, setWasteUnits] = useState(0)
  const [productionNotes, setProductionNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [productionDetails, setProductionDetails] = useState<Production | null>(null)

  const loadData = async () => {
    try {
      const query = new URLSearchParams({ fecha: selectedDate })
      if (productFilter) query.set('producto_id', productFilter)
      const [recipeData, materialData, productData, productionData] = await Promise.all([
        api<Recipe[]>('/api/recetas'),
        api<Material[]>('/api/materias-primas'),
        api<Product[]>('/api/productos'),
        api<Production[]>(`/api/producciones?${query.toString()}`),
      ])
      setRecipes(recipeData)
      setMaterials(materialData)
      setProducts(productData)
      setProductions(productionData)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar producción y recetas')
    }
  }

  useEffect(() => { void loadData() }, [selectedDate, productFilter])

  const validProductions = productions.filter((production) => !production.anulada)
  const todayStats = useMemo(() => ({
    lots: validProductions.reduce((sum, production) => sum + production.lotes_producidos, 0),
    good: validProductions.reduce((sum, production) => sum + production.cantidad_buena, 0),
    waste: validProductions.reduce((sum, production) => sum + production.cantidad_merma, 0),
    cost: validProductions.reduce((sum, production) => sum + production.costo_total_insumos, 0),
  }), [productions])

  const selectedRecipe = recipes.find((recipe) => recipe.id === Number(productionRecipeId))
  const expectedUnits = selectedRecipe ? Math.round(selectedRecipe.rendimiento_unidades * lots) : 0
  const requiredMaterials = selectedRecipe?.ingredientes.map((ingredient) => {
    const material = materials.find((row) => row.id === ingredient.materia_prima_id)
    const required = ingredient.cantidad_requerida * lots
    return {
      ...ingredient,
      required,
      available: material?.stock_actual ?? 0,
      currentCost: material?.costo_promedio ?? ingredient.costo_unitario,
      active: material?.activo ?? false,
    }
  }) ?? []
  const insufficientMaterials = requiredMaterials.filter(
    (line) => !line.active || line.available < line.required,
  )
  const projectedCost = requiredMaterials.reduce(
    (sum, line) => sum + line.required * line.currentCost,
    0,
  )

  const openNewRecipe = () => {
    setEditingRecipe(null)
    setRecipeForm(emptyRecipeForm())
    setError('')
    setRecipeModal(true)
  }

  const openEditRecipe = (recipe: Recipe) => {
    setEditingRecipe(recipe)
    setRecipeForm({
      producto_id: recipe.producto_id,
      nombre: recipe.nombre,
      rendimiento_unidades: recipe.rendimiento_unidades,
      instrucciones: recipe.instrucciones ?? '',
      activa: recipe.activa,
      ingredientes: recipe.ingredientes.map((line) => ({
        materia_prima_id: line.materia_prima_id,
        cantidad_requerida: line.cantidad_requerida,
      })),
    })
    setError('')
    setRecipeModal(true)
  }

  const saveRecipe = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!recipeForm.producto_id || recipeForm.ingredientes.some((line) => !line.materia_prima_id)) {
      setError('Selecciona el producto y todas las materias primas de la receta.')
      return
    }
    const ingredientIds = recipeForm.ingredientes.map((line) => Number(line.materia_prima_id))
    if (new Set(ingredientIds).size !== ingredientIds.length) {
      setError('No puedes agregar dos veces la misma materia prima.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...recipeForm,
        instrucciones: recipeForm.instrucciones.trim() || null,
        ingredientes: recipeForm.ingredientes.map((line) => ({
          materia_prima_id: Number(line.materia_prima_id),
          cantidad_requerida: Number(line.cantidad_requerida),
        })),
      }
      await api<Recipe>(editingRecipe ? `/api/recetas/${editingRecipe.id}` : '/api/recetas', {
        method: editingRecipe ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      })
      setRecipeModal(false)
      await loadData()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar la receta')
    } finally {
      setSaving(false)
    }
  }

  const openProduction = () => {
    const firstRecipe = recipes.find((recipe) => recipe.activa)
    setProductionRecipeId(firstRecipe ? String(firstRecipe.id) : '')
    setLots(1)
    setGoodUnits(firstRecipe?.rendimiento_unidades ?? 1)
    setWasteUnits(0)
    setProductionNotes('')
    setError('')
    setProductionModal(true)
  }

  const changeProductionRecipe = (recipeId: string) => {
    const recipe = recipes.find((row) => row.id === Number(recipeId))
    setProductionRecipeId(recipeId)
    setGoodUnits(recipe ? Math.round(recipe.rendimiento_unidades * lots) : 1)
    setWasteUnits(0)
  }

  const changeLots = (nextLots: number) => {
    setLots(nextLots)
    setGoodUnits(selectedRecipe ? Math.round(selectedRecipe.rendimiento_unidades * nextLots) : 1)
  }

  const registerProduction = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!selectedRecipe || insufficientMaterials.length > 0) {
      setError('No hay existencias suficientes para todos los insumos requeridos.')
      return
    }
    if (goodUnits + wasteUnits > expectedUnits) {
      setError(`Unidades buenas y merma no pueden superar el rendimiento esperado (${expectedUnits}).`)
      return
    }
    setSaving(true)
    try {
      await api<Production>('/api/producciones', {
        method: 'POST',
        body: JSON.stringify({
          receta_id: selectedRecipe.id,
          lotes_producidos: lots,
          cantidad_buena: goodUnits,
          cantidad_merma: wasteUnits,
          observaciones: productionNotes.trim() || null,
        }),
      })
      setProductionModal(false)
      await loadData()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible registrar la producción')
    } finally {
      setSaving(false)
    }
  }

  const cancelProduction = async (production: Production) => {
    if (!window.confirm(`¿Anular ${production.consecutivo}? Se devolverán los insumos y se retirarán las unidades de vitrina.`)) return
    setError('')
    try {
      await api<Production>(`/api/producciones/${production.id}/anular`, { method: 'POST' })
      await loadData()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible anular la producción')
    }
  }

  const updateRecipeLine = (index: number, patch: Partial<RecipeDraftLine>) => {
    setRecipeForm((current) => ({
      ...current,
      ingredientes: current.ingredientes.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    }))
  }

  return (
    <div className="production-view">
      <div className="inventory-heading">
        <h2>Producción y recetas</h2>
        <p>Controla los escandallos, el consumo de materias primas y la entrada de productos a vitrina.</p>
      </div>
      <div className="inventory-tabs" role="tablist" aria-label="Secciones de producción">
        <button type="button" role="tab" aria-selected={tab === 'bitacora'} className={tab === 'bitacora' ? 'selected' : ''} onClick={() => setTab('bitacora')}>Bitácora de Producción</button>
        <button type="button" role="tab" aria-selected={tab === 'recetas'} className={tab === 'recetas' ? 'selected' : ''} onClick={() => setTab('recetas')}>Recetas y Costos</button>
      </div>
      {error && <div className="error-message">{error}</div>}

      {tab === 'bitacora' ? (
        <section className="inventory-panel">
          <div className="inventory-stats">
            <article><span>Lotes producidos</span><strong>{todayStats.lots.toLocaleString('es-CO')}</strong></article>
            <article><span>Unidades aptas a vitrina</span><strong>{todayStats.good.toLocaleString('es-CO')}</strong></article>
            <article className={todayStats.waste ? 'warning' : ''}><span>Mermas de horneo</span><strong>{todayStats.waste.toLocaleString('es-CO')}</strong></article>
            <article><span>Costo total producido</span><strong>{money.format(todayStats.cost)}</strong></article>
          </div>
          <div className="inventory-toolbar">
            <div><h3>Historial de producción</h3><p>El registro actualiza el Kardex de insumos y las existencias del producto.</p></div>
            <input aria-label="Filtrar por fecha" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            <select aria-label="Filtrar por producto" value={productFilter} onChange={(event) => setProductFilter(event.target.value)}>
              <option value="">Todos los productos</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.nombre}</option>)}
            </select>
            <button type="button" className="primary-button" onClick={openProduction} disabled={!recipes.some((recipe) => recipe.activa)}>+ Registrar producción</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Consecutivo / Fecha</th><th>Producto</th><th>Lotes</th><th>Buenas / merma</th><th>Costo total</th><th>Costo unitario</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>
                {productions.map((production) => (
                  <tr key={production.id} className={production.anulada ? 'production-cancelled-row' : ''}>
                    <td><strong>{production.consecutivo}</strong><small className="sub-cell">{new Date(production.fecha_produccion).toLocaleString('es-CO')}</small></td>
                    <td>{production.producto_nombre}</td>
                    <td>{production.lotes_producidos}</td>
                    <td>{production.cantidad_buena} / {production.cantidad_merma}</td>
                    <td>{money.format(production.costo_total_insumos)}</td>
                    <td>{money.format(production.costo_unitario_real)}</td>
                    <td><span className={`production-state ${production.anulada ? 'cancelled' : 'completed'}`}>{production.anulada ? 'Anulada' : 'Registrada'}</span></td>
                    <td><div className="inventory-row-actions">
                      <button type="button" onClick={() => setProductionDetails(production)}>Detalle</button>
                      {!production.anulada && <button type="button" className="production-cancel-button" onClick={() => void cancelProduction(production)}>Anular</button>}
                    </div></td>
                  </tr>
                ))}
                {productions.length === 0 && <tr><td colSpan={8} className="empty-row">No hay producciones para los filtros seleccionados.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="inventory-panel">
          <div className="inventory-toolbar">
            <div><h3>Recetas y costos teóricos</h3><p>Los costos se calculan con el costo promedio vigente de cada materia prima.</p></div>
            <button type="button" className="primary-button" onClick={openNewRecipe}>+ Crear receta</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Receta / Producto</th><th>Rendimiento</th><th>Costo por lote</th><th>Costo unitario</th><th>Precio vitrina</th><th>Margen bruto</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>
                {recipes.map((recipe) => (
                  <tr key={recipe.id}>
                    <td><strong>{recipe.nombre}</strong><small className="sub-cell">{recipe.producto_nombre}</small></td>
                    <td>{recipe.rendimiento_unidades} unidades</td>
                    <td>{money.format(recipe.costo_lote)}</td>
                    <td>{money.format(recipe.costo_unitario_estimado)}</td>
                    <td>{money.format(recipe.precio_venta)}</td>
                    <td><span className={recipe.margen_bruto_estimado < 0 ? 'margin-negative' : 'margin-positive'}>{recipe.margen_bruto_estimado.toFixed(1)}%</span></td>
                    <td><span className={`production-state ${recipe.activa ? 'completed' : 'cancelled'}`}>{recipe.activa ? 'Activa' : 'Inactiva'}</span></td>
                    <td><button type="button" className="edit-button" onClick={() => openEditRecipe(recipe)}>Editar</button></td>
                  </tr>
                ))}
                {recipes.length === 0 && <tr><td colSpan={8} className="empty-row">No hay recetas registradas. Crea una para iniciar producción.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {recipeModal && (
        <div className="modal-backdrop">
          <form className="modal production-modal" onSubmit={saveRecipe}>
            <h2>{editingRecipe ? 'Editar receta' : 'Crear receta'}</h2>
            <label>Producto
              <select value={recipeForm.producto_id || ''} onChange={(event) => {
                const productId = Number(event.target.value)
                setRecipeForm((current) => ({
                  ...current,
                  producto_id: productId,
                  nombre: editingRecipe ? current.nombre : `Fórmula ${products.find((product) => product.id === productId)?.nombre ?? ''}`,
                }))
              }} required>
                <option value="" disabled>Selecciona un producto</option>
                {products.map((product) => {
                  const alreadyHasRecipe = recipes.some((recipe) => recipe.producto_id === product.id && recipe.id !== editingRecipe?.id)
                  return <option key={product.id} value={product.id} disabled={alreadyHasRecipe}>{product.nombre}{alreadyHasRecipe ? ' (ya tiene receta)' : ''}</option>
                })}
              </select>
            </label>
            <label>Nombre de la receta<input value={recipeForm.nombre} onChange={(event) => setRecipeForm({ ...recipeForm, nombre: event.target.value })} minLength={3} maxLength={150} required /></label>
            <label>Rendimiento del lote (unidades)<input type="number" min="1" step="1" value={recipeForm.rendimiento_unidades} onChange={(event) => setRecipeForm({ ...recipeForm, rendimiento_unidades: Number(event.target.value) })} required /></label>
            <label>Instrucciones<textarea value={recipeForm.instrucciones} onChange={(event) => setRecipeForm({ ...recipeForm, instrucciones: event.target.value })} rows={3} /></label>
            <label className="production-checkbox"><input type="checkbox" checked={recipeForm.activa} onChange={(event) => setRecipeForm({ ...recipeForm, activa: event.target.checked })} /> Receta activa</label>

            <div className="production-lines-header"><strong>Ingredientes por lote completo</strong><button type="button" className="secondary-button" onClick={() => setRecipeForm((current) => ({ ...current, ingredientes: [...current.ingredientes, { materia_prima_id: '', cantidad_requerida: 1 }] }))}>+ Agregar insumo</button></div>
            <div className="production-lines">
              {recipeForm.ingredientes.map((line, index) => {
                const chosenIds = recipeForm.ingredientes
                  .filter((_, lineIndex) => lineIndex !== index)
                  .map((item) => Number(item.materia_prima_id))
                const material = materials.find((row) => row.id === Number(line.materia_prima_id))
                const partialCost = material ? Number(line.cantidad_requerida) * material.costo_promedio : 0
                return (
                  <div className="production-line" key={index}>
                    <label>Materia prima
                      <select value={line.materia_prima_id} onChange={(event) => updateRecipeLine(index, { materia_prima_id: event.target.value ? Number(event.target.value) : '' })} required>
                        <option value="" disabled>Selecciona un insumo</option>
                        {materials.filter((item) => item.activo || item.id === line.materia_prima_id).map((item) => (
                          <option key={item.id} value={item.id} disabled={chosenIds.includes(item.id)}>{item.nombre}</option>
                        ))}
                      </select>
                    </label>
                    <label>Cantidad requerida<input type="number" min="0.001" step="any" value={line.cantidad_requerida} onChange={(event) => updateRecipeLine(index, { cantidad_requerida: Number(event.target.value) })} required /></label>
                    <div className="production-line-meta"><small>{material ? `Unidad: ${material.unidad_medida}` : 'Unidad: —'}</small><strong>{money.format(partialCost)}</strong></div>
                    <button type="button" className="remove-line" aria-label="Quitar ingrediente" disabled={recipeForm.ingredientes.length <= 1} onClick={() => setRecipeForm((current) => ({ ...current, ingredientes: current.ingredientes.filter((_, lineIndex) => lineIndex !== index) }))}>×</button>
                  </div>
                )
              })}
            </div>
            {error && <div className="error-message">{error}</div>}
            <div className="modal-actions"><button type="button" onClick={() => setRecipeModal(false)}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Guardando...' : 'Guardar receta'}</button></div>
          </form>
        </div>
      )}

      {productionModal && (
        <div className="modal-backdrop">
          <form className="modal production-modal production-entry-modal" onSubmit={registerProduction}>
            <h2>Registrar producción</h2>
            <label>Receta
              <select value={productionRecipeId} onChange={(event) => changeProductionRecipe(event.target.value)} required>
                {recipes.filter((recipe) => recipe.activa).map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.nombre} · {recipe.producto_nombre}</option>)}
              </select>
            </label>
            <div className="production-number-fields">
              <label>Lotes producidos<input type="number" min="0.01" step="0.01" value={lots} onChange={(event) => changeLots(Number(event.target.value))} required /></label>
              <label>Rendimiento esperado<input value={expectedUnits} readOnly /></label>
              <label>Unidades buenas (vitrina)<input type="number" min="1" max={expectedUnits} step="1" value={goodUnits} onChange={(event) => setGoodUnits(Number(event.target.value))} required /></label>
              <label>Merma de horneo<input type="number" min="0" max={expectedUnits} step="1" value={wasteUnits} onChange={(event) => setWasteUnits(Number(event.target.value))} required /></label>
            </div>
            <div className="production-requirements">
              <h3>Insumos requeridos vs. disponibles</h3>
              <div className="table-wrap"><table>
                <thead><tr><th>Insumo</th><th>Requerido</th><th>Disponible</th><th>Costo proyectado</th></tr></thead>
                <tbody>{requiredMaterials.map((line) => (
                  <tr key={line.materia_prima_id} className={!line.active || line.available < line.required ? 'production-shortage' : ''}>
                    <td>{line.materia_prima_nombre}</td>
                    <td>{line.required.toLocaleString('es-CO', { maximumFractionDigits: 3 })} {line.unidad_medida}</td>
                    <td>{line.available.toLocaleString('es-CO', { maximumFractionDigits: 3 })} {line.unidad_medida}</td>
                    <td>{money.format(line.required * line.currentCost)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
              {insufficientMaterials.length > 0 && <p className="production-error">{insufficientMaterials.map((line) => !line.active ? `${line.materia_prima_nombre} está inactiva` : `Faltan ${(line.required - line.available).toLocaleString('es-CO', { maximumFractionDigits: 3 })} ${line.unidad_medida} de ${line.materia_prima_nombre}`).join(' · ')}</p>}
              <div className="production-projected-cost"><span>Costo proyectado de insumos</span><strong>{money.format(projectedCost)}</strong></div>
            </div>
            <label>Observaciones<textarea value={productionNotes} onChange={(event) => setProductionNotes(event.target.value)} rows={2} maxLength={1000} /></label>
            {error && <div className="error-message">{error}</div>}
            {goodUnits + wasteUnits > expectedUnits && <div className="error-message">Las unidades buenas y la merma superan el rendimiento esperado.</div>}
            <div className="modal-actions"><button type="button" onClick={() => setProductionModal(false)}>Cancelar</button><button type="submit" className="primary-button" disabled={saving || insufficientMaterials.length > 0 || !selectedRecipe || goodUnits < 1 || goodUnits + wasteUnits > expectedUnits}>{saving ? 'Registrando...' : 'Confirmar producción'}</button></div>
          </form>
        </div>
      )}

      {productionDetails && (
        <div className="modal-backdrop">
          <section className="modal production-details-modal">
            <h2>Detalle {productionDetails.consecutivo}</h2>
            <p className="modal-hint">{productionDetails.producto_nombre} · {new Date(productionDetails.fecha_produccion).toLocaleString('es-CO')} · Responsable: {productionDetails.usuario_nombre}</p>
            <div className="production-detail-summary">
              <span>Lotes <strong>{productionDetails.lotes_producidos}</strong></span>
              <span>Esperadas <strong>{productionDetails.cantidad_esperada}</strong></span>
              <span>Buenas <strong>{productionDetails.cantidad_buena}</strong></span>
              <span>Merma <strong>{productionDetails.cantidad_merma}</strong></span>
            </div>
            {productionDetails.observaciones && <p>{productionDetails.observaciones}</p>}
            <div className="table-wrap"><table>
              <thead><tr><th>Insumo consumido</th><th>Cantidad</th><th>Costo unitario</th><th>Costo parcial</th></tr></thead>
              <tbody>{productionDetails.ingredientes.map((line) => <tr key={line.materia_prima_id}><td>{line.materia_prima_nombre}</td><td>{line.cantidad_consumida.toLocaleString('es-CO', { maximumFractionDigits: 3 })} {line.unidad_medida}</td><td>{money.format(line.costo_unitario)}</td><td>{money.format(line.costo_parcial)}</td></tr>)}</tbody>
            </table></div>
            <div className="production-projected-cost"><span>Costo total / unitario real</span><strong>{money.format(productionDetails.costo_total_insumos)} / {money.format(productionDetails.costo_unitario_real)}</strong></div>
            {productionDetails.anulada && <div className="error-message">Esta producción fue anulada y su inventario fue revertido.</div>}
            <div className="modal-actions"><button type="button" className="primary-button" onClick={() => setProductionDetails(null)}>Cerrar</button></div>
          </section>
        </div>
      )}
    </div>
  )
}
