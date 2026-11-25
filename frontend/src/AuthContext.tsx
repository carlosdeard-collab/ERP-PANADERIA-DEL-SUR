import { createContext, useContext, useState, type ReactNode } from 'react'
import { endpointUrl } from './services/api'

export type Role = 'administradora' | 'mesera'

export interface AuthUser {
  id: number
  username: string
  nombre: string
  rol: Role
  access_token: string
  token_type: string
}

interface AuthContextValue {
  user: AuthUser | null
  login: (username: string, password: string, selectedRole: Role) => Promise<AuthUser>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const STORAGE_KEY = 'erp_panaderia_auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) as AuthUser : null
  })

  const login = async (username: string, password: string, selectedRole: Role) => {
    const response = await fetch(endpointUrl('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    if (!response.ok) {
      throw new Error('Usuario o contraseña incorrectos')
    }

    const payload = await response.json()
    if (payload.rol !== selectedRole) {
      throw new Error(El usuario no pertenece al perfil )
    }

    const authenticatedUser: AuthUser = { ...payload }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authenticatedUser))
    setUser(authenticatedUser)
    return authenticatedUser
  }

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return context
}
