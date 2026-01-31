"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

export function AuthButton() {
  const { user, loading, signOut } = useAuth();
  const [showModal, setShowModal] = useState(false);

  if (loading) {
    return (
      <div className="h-9 w-20 bg-paper-line rounded-lg animate-pulse" />
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-ink-muted hidden sm:inline">
          {user.email}
        </span>
        <button
          onClick={() => signOut()}
          className="px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink bg-white hover:bg-gray-50 border border-paper-lineDark rounded-lg transition-colors"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-4 py-2 text-sm font-medium text-ink bg-highlighter-yellow hover:bg-highlighter-yellowDark rounded-lg transition-colors"
      >
        Sign in
      </button>

      {showModal && <AuthModal onClose={() => setShowModal(false)} />}
    </>
  );
}

function AuthModal({ onClose }: { onClose: () => void }) {
  const { signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const { error } = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password);

    setIsLoading(false);

    if (error) {
      setError(error.message);
    } else if (isSignUp) {
      setSuccess(true);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-fade-in">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-ink-muted hover:text-ink"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-xl font-bold text-ink mb-2 font-handwriting">
          {isSignUp ? "Create account" : "Welcome back"}
        </h2>
        <p className="text-sm text-ink-muted mb-6">
          {isSignUp
            ? "Sign up to save your progress"
            : "Sign in to continue your learning"}
        </p>

        {success ? (
          <div className="bg-highlighter-green/20 border border-green-300 rounded-lg p-4">
            <p className="text-green-800 text-sm">
              Check your email for a confirmation link!
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink-muted mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 border border-paper-lineDark rounded-lg focus:outline-none focus:ring-2 focus:ring-highlighter-yellow"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ink-muted mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2 border border-paper-lineDark rounded-lg focus:outline-none focus:ring-2 focus:ring-highlighter-yellow"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-highlighter-pink/20 border border-pink-300 rounded-lg p-3">
                <p className="text-pink-800 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-2 bg-highlighter-yellow hover:bg-highlighter-yellowDark disabled:bg-gray-200 text-ink font-medium rounded-lg transition-colors"
            >
              {isLoading
                ? "Loading..."
                : isSignUp
                ? "Sign up"
                : "Sign in"}
            </button>
          </form>
        )}

        {!success && (
          <p className="mt-4 text-center text-sm text-ink-muted">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
              }}
              className="text-highlighter-yellowDark hover:underline font-medium"
            >
              {isSignUp ? "Sign in" : "Sign up"}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
