const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '')
const hostname = window.location.hostname
const localHostname = /^(localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|::1)$/i.test(hostname)
const localApiUrl = import.meta.env.DEV && localHostname
  ? `http://${hostname}:8000/api`
  : ''
const API_URL = configuredApiUrl || localApiUrl

export function endpointUrl(path: string) {
  if (!API_URL) {
    throw new Error('Configura VITE_API_URL para conectar con el backend.')
  }
  const base = API_URL.replace(/\/+$/, '')
  const normalizedPath = path === '/api'
    ? ''
    : path.startsWith('/api/')
      ? path.slice(4)
      : path.startsWith('/')
        ? path
        : `/${path}`
  return `${base}${normalizedPath}`
}

function authHeaders(options: RequestInit) {
  const saved = localStorage.getItem('erp_panaderia_auth')
  const session = saved ? JSON.parse(saved) as { access_token?: string } : null
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }
  return headers
}

async function authenticatedFetch(path: string, options: RequestInit = {}) {
  const response = await fetch(endpointUrl(path), {
    ...options,
    headers: authHeaders(options),
  })
  if (response.status === 401) {
    localStorage.removeItem('erp_panaderia_auth')
    window.location.reload()
  }
  return response
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await authenticatedFetch(path, options)
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.detail || `Error HTTP ${response.status}`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function downloadFile(path: string, fallbackFilename: string) {
  const response = await authenticatedFetch(path)
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.detail || `Error HTTP ${response.status}`)
  }
  const blob = await response.blob()
  const filename = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1]
    || fallbackFilename
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
  return filename
}

