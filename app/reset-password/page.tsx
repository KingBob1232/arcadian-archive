"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    // Check if we have the access token in the URL
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token')) {
      router.push('/chat');
    }
  }, [router]);

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    if (password !== confirmPassword) {
      setMessage("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) throw error;

      setMessage("Password updated successfully! Redirecting...");
      setTimeout(() => {
        router.push('/chat');
      }, 2000);
    } catch (error: any) {
      setMessage(error.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="jade-app">
      <div className="jade-grid-overlay" />
      <div className="jade-shell sidebar-open">
        <div className="jade-main" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div className="jade-brand-card" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div className="jade-brand-kicker">JADE CORE</div>
            <h1>The Arcadian Archive</h1>
            <p>Reset your password</p>
            
            <form onSubmit={handleResetPassword} style={{ marginTop: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input
                  type="password"
                  placeholder="New Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="jade-input"
                  required
                  minLength={6}
                  style={{ width: '100%' }}
                />
                <input
                  type="password"
                  placeholder="Confirm New Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="jade-input"
                  required
                  minLength={6}
                  style={{ width: '100%' }}
                />
                
                {message && (
                  <p style={{ color: message.includes('success') ? '#42f2a6' : '#ff6b6b' }}>
                    {message}
                  </p>
                )}
                
                <button
                  type="submit"
                  className="jade-primary-btn"
                  disabled={loading}
                  style={{ marginTop: '10px' }}
                >
                  {loading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}