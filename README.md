# ERP Panadería MAFE

ERP web para panadería con ventas POS, mesas, inventario, producción, caja, gastos y reportes. La interfaz funciona en computador y en celulares Android/iOS.

## Arquitectura

- **Frontend:** React, TypeScript, Vite y Tailwind CSS.
- **Backend:** FastAPI, SQLAlchemy y JWT.
- **Base de datos local:** SQLite en `data/panaderia.db`.
- **Base de datos en nube:** PostgreSQL (persistente/administrado por el proveedor).

## Requisitos para desarrollo local

- Windows 10/11, macOS o Linux.
- Python 3.11 o superior.
- Node.js 20 o superior.

### Backend

Desde la raíz del proyecto:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edita `backend/.env` y reemplaza `SECRET_KEY` por una clave aleatoria larga. Puedes generar una con:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Inicia la API desde `backend/`:

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

La documentación interactiva está en `http://127.0.0.1:8000/docs`. Si `DATABASE_URL` no está definida, el backend usa `sqlite:///../data/panaderia.db` y crea las tablas/datos iniciales que falten.

### Frontend

En otra terminal, desde la raíz:

```powershell
cd frontend
npm install
npm run dev
```

Abre `http://localhost:5174`. Para probar desde un celular conectado a la misma Wi-Fi, abre `http://<IPv4-del-computador>:5174`; el backend debe estar escuchando en `0.0.0.0:8000`. En desarrollo local el frontend resuelve el host de la API automáticamente. `frontend/.env.example` sirve para una instalación local en el mismo equipo; no lo uses como URL de API al navegar desde un teléfono, porque `127.0.0.1` apuntaría al propio teléfono.

## Despliegue en la nube

Usa una base de datos PostgreSQL administrada con almacenamiento persistente. No despliegues la SQLite local en un filesystem efímero.

### Backend

Configura el directorio de trabajo del servicio como `backend`, instala dependencias con `pip install -r requirements.txt` y define estas variables en el proveedor:

| Variable | Valor |
| --- | --- |
| `SECRET_KEY` | Secreto aleatorio largo y exclusivo para producción. |
| `DATABASE_URL` | URL de conexión PostgreSQL proporcionada por el proveedor. Se aceptan `postgres://` y `postgresql://`. |
| `ALLOWED_ORIGINS` | Orígenes públicos del frontend separados por comas, sin rutas; por ejemplo `https://erp-panaderia.vercel.app`. |

Comando de inicio para proveedores que exponen el puerto en `$PORT`:

```bash
gunicorn -w 2 -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:$PORT
```

El backend crea las tablas que falten al iniciar. Para cambios futuros de esquema en una base ya desplegada, utiliza migraciones controladas antes de actualizar la aplicación.

### Frontend en Vercel

Importa el repositorio y configura `frontend` como directorio raíz del proyecto. Usa `npm run build` como comando de compilación y `dist` como directorio de salida. Define:

```text
VITE_API_URL=https://<dominio-publico-del-backend>/api
```

`frontend/vercel.json` redirige las rutas de la aplicación a `index.html` para que funcionen al recargar. Añade el origen exacto de Vercel a `ALLOWED_ORIGINS` en el backend. El frontend siempre requiere HTTPS cuando el sitio está publicado sobre HTTPS.

## Seguridad, persistencia y respaldos

- Cambia la contraseña inicial de `admin` (`Admin123!Cambiar`) y no la uses en producción.
- No subas archivos `.env`, bases de datos, respaldos, entornos virtuales ni `node_modules`; están excluidos por `.gitignore`. Los `.gitkeep` de `data/` y `backups/` se conservan.
- En la nube, habilita backups automáticos/snapshots de PostgreSQL en el proveedor. El endpoint de respaldo de la aplicación genera copias locales solo con SQLite; para PostgreSQL responde explícitamente que se deben usar los respaldos administrados.
- `ALLOWED_ORIGINS` debe contener solo los dominios de frontend autorizados. El backend también mantiene el acceso de desarrollo para localhost y direcciones IP privadas.

## Verificación local

```powershell
cd frontend
npm run build
```

```powershell
cd backend
python -m compileall -q app
```
