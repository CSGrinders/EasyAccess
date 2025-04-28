
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

  const handleLogin = async () => {
    console.log('Login clicked')
    setLoading(true)
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })
        if (error) {
            setError(error.message)
        } else {
            console.log('Login success!', data)
        }
    } catch (error) {
      console.error('Login error:', error)
      setError('An unexpected error occurred. Please try again.')
    }
    setLoading(false)
  }

  const handleSignup = async () => {
    console.log('Sign Up clicked')
    setLoading(true)
    try {
        // Check if passwords match
        if (password !== confirmPassword) {
            setError("Passwords do not match!")
            setLoading(false)
            return
        }
        setError(null)

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        })

        if (error) {
        setError(error.message)
        } else {
        console.log('Sign up success!', data)
        }
    } catch (error) {
        console.error('Sign up error:', error)
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

      <section className="w-full max-w-md text-center space-y-6">
        {/* Conditional Form Rendering */}
        {isSignup ? (
          <>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-sidebar-primary"
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-sidebar-primary"
            />

            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full p-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-sidebar-primary"
            />

            <button
              onClick={handleSignup}
              className="w-full p-3 rounded-md border border-gray-300 bg-sidebar-primary font-bold disabled:bg-gray-300"
              disabled={loading}
            >
              {loading ? 'Creating Account...' : 'Sign Up'}
            </button>
          </>
        ) : (
          <>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-sidebar-primary"
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-sidebar-primary"
            />

            <button
              onClick={handleLogin}
              className="w-full p-3 rounded-md border border-gray-300 bg-sidebar-primary font-bold disabled:bg-gray-300"
              disabled={loading}
            >
              {loading ? 'Logging In...' : 'Log In'}
            </button>
          </>
        )}

        {/* Switch between login and signup */}
        <p className="text-sm mt-4">
          {isSignup ? (
            <>
              Already have an account?{' '}
              <button
                onClick={() => setIsSignup(false)}
                className="text-blue-500 hover:text-blue-700"
              >
                Log In
              </button>
            </>
          ) : (
            <>
              Don't have an account?{' '}
              <button
                onClick={() => setIsSignup(true)}
                className="text-blue-500 hover:text-blue-700"
              >
                Sign Up
              </button>
            </>
          )}
        </p>

        {error && (
          <p className="text-red-500 text-sm mt-4">{error}</p>
        )}
      </section>
    </div>
  )
}
