import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { PublicSettings, User } from '../lib/types'

interface Auth {
  user: User | null
  settings: PublicSettings | null
  loading: boolean
  refresh: () => Promise<void>
  setUser: (u: User | null) => void
}

const Ctx = createContext<Auth>({ user: null, settings: null, loading: true, refresh: async () => {}, setUser: () => {} })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    const [me, st] = await Promise.all([api.me().catch(() => ({ user: null })), api.settings().catch(() => null)])
    setUser(me.user)
    setSettings(st)
    setLoading(false)
  }, [])
  useEffect(() => { refresh() }, [refresh])
  return <Ctx.Provider value={{ user, settings, loading, refresh, setUser }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
