"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleLogin() {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setError(error.message);
    router.push("/chat");
    router.refresh();
  }

  async function handleSignUp() {
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return setError(error.message);
    router.push("/chat");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-black text-emerald-100 flex items-center justify-center">
      <div className="w-full max-w-md rounded-3xl border border-emerald-500/30 bg-emerald-950/20 p-8 backdrop-blur">
        <h1 className="text-3xl font-semibold text-emerald-300">The Arcadian Archive</h1>
        <p className="mt-2 text-sm text-emerald-200/70">Access terminal</p>

        <div className="mt-6 space-y-3">
          <input
            className="w-full rounded-xl border border-emerald-500/20 bg-black/40 px-4 py-3"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="w-full rounded-xl border border-emerald-500/20 bg-black/40 px-4 py-3"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={handleLogin} className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 text-black font-medium">
            Log in
          </button>
          <button onClick={handleSignUp} className="flex-1 rounded-xl border border-emerald-500/40 px-4 py-3">
            Sign up
          </button>
        </div>
      </div>
    </main>
  );
}