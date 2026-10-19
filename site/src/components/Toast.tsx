import { createContext, useCallback, useContext, useState } from 'react'

const ToastCtx = createContext<(msg: string) => void>(() => {})

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const show = useCallback((m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(cur => (cur === m ? null : cur)), 2400)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className={'toast' + (msg ? ' show' : '')} role="status">{msg}</div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
