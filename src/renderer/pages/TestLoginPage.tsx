
import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://lliuckljienxmohsoitv.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsaXVja2xqaWVueG1vaHNvaXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU4NTk2NjgsImV4cCI6MjA2MTQzNTY2OH0.lpPgq0V4Qz0A7B6z28gQ7Tw_BaeN4zyr4ZnKWbum5VA'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isSignup, setIsSignup] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  const handleLogin = async () => {
    console.log('Login clicked')
    setLoading(true)
    try {
        const token = await (window as any).electronAPI.googleAuth();
        setToken(token.access_token);
        console.log("Token: ", token);
    } catch (error) {
      console.error('Login error:', error)
      setError('An unexpected error occurred. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col min-h-screen justify-center items-center px-6 py-12 bg-gradient-to-b from-background-start-rgb to-background-end-rgb">
      <section className="w-full text-center space-y-6">
        <h1 className="text-5xl font-extrabold tracking-tight mb-4 bg-gradient-to-r from-blue-600 via-green-500 to-indigo-400 bg-clip-text text-transparent inline-block mb-20">
          Welcome to EasyAccess
        </h1>
      </section>

      <button
          onClick={handleLogin}
          className="flex items-center justify-center space-x-3 px-6 py-3 bg-white text-gray-700 font-semibold rounded-md shadow hover:shadow-lg hover:bg-gray-100 transition"
      >
        <span className="text-lg">Sign in with Google</span>
      </button>
      {token && (
        <div className="mt-4">
          <h2 className="text-lg font-semibold">Access Token:</h2>
          <p className="text-sm text-gray-600">{token}</p>
        </div>
      )}
    </div>
  )
}
