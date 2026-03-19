"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { v4 as uuidv4 } from "uuid";
import { User } from "@supabase/supabase-js";

type Chat = {
  id: string;
  title: string;
  created_at?: string;
  user_id?: string;
};

type Message = {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at?: string;
  user_id?: string;
};

type TrailPoint = {
  id: number;
  x: number;
  y: number;
};

export default function ChatPage() {
  const supabase = useMemo(() => createClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [listening, setListening] = useState(false);

  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);

  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFileText, setUploadedFileText] = useState<string>("");

  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const trailIdRef = useRef(0);
  const trailFrameRef = useRef<number | null>(null);

  // Auth state
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatListRef = useRef<HTMLDivElement | null>(null);

  // Get current user on mount
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };
    
    getUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  useEffect(() => {
    if (user) {
      void loadChats();
    }
  }, [user]);

  useEffect(() => {
    const t = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 40);
    return () => clearTimeout(t);
  }, [messages]);

  useEffect(() => {
    const cleanup = window.setInterval(() => {
      setTrail((prev) => prev.slice(0, 10));
    }, 120);

    return () => clearInterval(cleanup);
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (trailFrameRef.current) return;

      trailFrameRef.current = window.requestAnimationFrame(() => {
        const point: TrailPoint = {
          id: trailIdRef.current++,
          x: e.clientX,
          y: e.clientY,
        };

        setTrail((prev) => [point, ...prev].slice(0, 14));
        trailFrameRef.current = null;
      });
    };

    window.addEventListener("mousemove", onMouseMove);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      if (trailFrameRef.current) {
        window.cancelAnimationFrame(trailFrameRef.current);
      }
    };
  }, []);

  async function loadChats() {
    if (!user) return;

    const { data, error } = await supabase
      .from("chats")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load chats:", error);
      return;
    }

    const loaded = (data ?? []) as Chat[];
    setChats(loaded);

    if (loaded.length > 0) {
      await selectChat(loaded[0].id);
    } else {
      await createNewChat();
    }
  }

  async function selectChat(id: string) {
    setChatId(id);
    setEditingChatId(null);
    setDeletingChatId(null);
    setUploadedFileName(null);
    setUploadedFileText("");

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to load messages:", error);
      return;
    }

    setMessages((data ?? []) as Message[]);
  }

  async function createNewChat() {
    if (!user) {
      alert("Please sign in to create a chat");
      return;
    }

    const id = uuidv4();

    const optimisticChat: Chat = {
      id,
      title: "New Chat",
      created_at: new Date().toISOString(),
      user_id: user.id,
    };

    setChats((prev) => [optimisticChat, ...prev]);
    setChatId(id);
    setMessages([]);
    setEditingChatId(id);
    setTitleDraft("New Chat");
    setUploadedFileName(null);
    setUploadedFileText("");

    // Scroll to top of chat list when new chat is created
    setTimeout(() => {
      if (chatListRef.current) {
        chatListRef.current.scrollTop = 0;
      }
    }, 100);

    const { error } = await supabase.from("chats").insert({
      id,
      title: "New Chat",
      user_id: user.id,
    });

    if (error) {
      console.error("Failed to create chat:", error);
      
      if (error.code === '42501') {
        alert("Unable to create chat due to database permissions. Please check your authentication status.");
      } else {
        alert("Failed to create chat. Please try again.");
      }
      
      // Remove the optimistic chat since the insert failed
      setChats((prev) => prev.filter((chat) => chat.id !== id));
      if (chats.length > 0) {
        await selectChat(chats[0].id);
      } else {
        setChatId(null);
      }
    }
  }

  async function deleteChat(chatIdToDelete: string) {
    if (!user) return;

    // Close any open editing/delete states
    setEditingChatId(null);
    setDeletingChatId(null);

    // Confirm deletion
    if (!confirm("Are you sure you want to delete this chat? This action cannot be undone.")) {
      return;
    }

    // Optimistically remove from UI
    setChats((prev) => prev.filter((chat) => chat.id !== chatIdToDelete));

    // If the deleted chat was the selected one, select another chat
    if (chatId === chatIdToDelete) {
      const remainingChats = chats.filter((chat) => chat.id !== chatIdToDelete);
      if (remainingChats.length > 0) {
        await selectChat(remainingChats[0].id);
      } else {
        setChatId(null);
        setMessages([]);
        // Optionally create a new chat if none remain
        await createNewChat();
      }
    }

    // Delete from database
    const { error } = await supabase
      .from("chats")
      .delete()
      .eq("id", chatIdToDelete)
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to delete chat:", error);
      alert("Failed to delete chat. Please try again.");
      // Reload chats to restore the deleted one
      await loadChats();
    }
  }

  function startRename(chat: Chat) {
    setEditingChatId(chat.id);
    setDeletingChatId(null);
    setTitleDraft(chat.title);
  }

  async function saveRename(targetChatId: string) {
    if (!user) return;
    
    const nextTitle = titleDraft.trim() || "Untitled Chat";

    setChats((prev) =>
      prev.map((chat) =>
        chat.id === targetChatId ? { ...chat, title: nextTitle } : chat
      )
    );

    setEditingChatId(null);

    const { error } = await supabase
      .from("chats")
      .update({ title: nextTitle })
      .eq("id", targetChatId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to rename chat:", error);
      alert("Failed to rename chat. Please try again.");
    }
  }

  function pickVoice() {
    const voices = speechSynthesis.getVoices();
    return (
      voices.find((v) => /Samantha|Jenny|Aria|Google UK English Female|Victoria/i.test(v.name)) ||
      voices.find((v) => /Female/i.test(v.name)) ||
      voices.find((v) => /en-US|en-GB/i.test(v.lang)) ||
      voices[0] ||
      null
    );
  }

  function speak(text: string) {
    if (!voiceEnabled || !text.trim()) return;

    speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();

    if (voice) utter.voice = voice;
    utter.rate = 1;
    utter.pitch = 1.02;
    utter.volume = 1;

    speechSynthesis.speak(utter);
  }

  function startVoiceInput() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? "";
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };

    recognition.start();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !chatId || !user) return;

    try {
      let text = "";

      const isTextLike =
        file.type.startsWith("text/") ||
        file.name.endsWith(".txt") ||
        file.name.endsWith(".md") ||
        file.name.endsWith(".csv") ||
        file.name.endsWith(".json");

      if (isTextLike) {
        text = await file.text();
      } else {
        text =
          `File uploaded: ${file.name}\n` +
          `This file type cannot be fully parsed in the browser yet. ` +
          `Ask the Archive to help based on the file name or upload a text-based file for deeper analysis.`;
      }

      setUploadedFileName(file.name);
      setUploadedFileText(text.slice(0, 12000));

      await supabase.from("uploads").insert({
        chat_id: chatId,
        filename: file.name,
        extracted_text: text.slice(0, 12000),
        user_id: user.id,
      });
    } catch (err) {
      console.error("Failed to read file:", err);
      alert("Could not read that file.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);

    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });

        if (error) {
          if (error.message.includes('User already registered')) {
            alert('This email is already registered. Please sign in instead.');
            setAuthMode('signin');
          } else if (error.message.includes('weak password')) {
            alert('Password is too weak. Please use a stronger password.');
          } else {
            throw error;
          }
        } else if (data.user && !data.session) {
          alert('✓ Account created! Please check your email for the confirmation link before signing in.');
          setEmail('');
          setPassword('');
          setAuthMode('signin');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            alert('Invalid email or password. Please try again.');
          } else if (error.message.includes('Email not confirmed')) {
            alert('Please confirm your email before signing in. Check your inbox for the confirmation link.\n\nYou can request a new confirmation link by trying to sign up again.');
          } else if (error.message.includes('user_not_found')) {
            alert('No account found with this email. Please sign up first.');
            setAuthMode('signup');
          } else {
            throw error;
          }
        }
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      alert(error.message || 'Authentication failed. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      alert('Check your email for the password reset link!');
      setShowResetPassword(false);
      setResetEmail('');
    } catch (error: any) {
      console.error('Reset password error:', error);
      alert(error.message || 'Failed to send reset email. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setChats([]);
    setChatId(null);
    setMessages([]);
    setEmail('');
    setPassword('');
  }

  async function sendMessage() {
    if (!input.trim() || !chatId || !user || sending) return;

    const plainUserMessage = input.trim();

    const outboundMessage = uploadedFileText
      ? `Use this uploaded file as context if relevant.\n\n[Uploaded file: ${uploadedFileName}]\n${uploadedFileText}\n\nUser request: ${plainUserMessage}`
      : plainUserMessage;

    setInput("");
    setSending(true);

    const optimisticUserContent = uploadedFileName
      ? `${plainUserMessage}\n\n📎 ${uploadedFileName}`
      : plainUserMessage;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: optimisticUserContent, user_id: user.id },
      { role: "assistant", content: "", user_id: user.id },
    ]);

    if (
      chats.find((c) => c.id === chatId)?.title === "New Chat" &&
      plainUserMessage.trim()
    ) {
      const autoTitle = plainUserMessage.slice(0, 36);
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId ? { ...chat, title: autoTitle } : chat
        )
      );
      await supabase
        .from("chats")
        .update({ title: autoTitle })
        .eq("id", chatId)
        .eq("user_id", user.id);
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chatId,
          message: outboundMessage,
          userId: user.id,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Chat request failed.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          if (!event.startsWith("data: ")) continue;

          try {
            const json = JSON.parse(event.slice(6));

            if (json.type === "delta" && typeof json.delta === "string") {
              fullText += json.delta;

              setMessages((prev) => {
                if (!prev.length) return prev;
                const lastIndex = prev.length - 1;
                const last = prev[lastIndex];
                return [
                  ...prev.slice(0, lastIndex),
                  { ...last, content: (last.content || "") + json.delta },
                ];
              });
            }

            if (json.type === "error") {
              setMessages((prev) => {
                if (!prev.length) return prev;
                const lastIndex = prev.length - 1;
                const last = prev[lastIndex];
                return [
                  ...prev.slice(0, lastIndex),
                  {
                    ...last,
                    content:
                      json.message || "The Arcadian Archive glitched for a second.",
                  },
                ];
              });
            }

            if (json.type === "done") {
              setSending(false);
              if (fullText) speak(fullText);
            }
          } catch (err) {
            console.error("Failed parsing stream event:", err);
          }
        }
      }

      setUploadedFileName(null);
      setUploadedFileText("");
    } catch (err) {
      console.error("Send failed:", err);

      setMessages((prev) => {
        if (!prev.length) return prev;
        const lastIndex = prev.length - 1;
        const last = prev[lastIndex];
        return [
          ...prev.slice(0, lastIndex),
          {
            ...last,
            content: "⚠️ The Arcadian Archive glitched for a second.",
          },
        ];
      });

      setSending(false);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <main className="jade-app">
        <div className="jade-grid-overlay" />
        <div className="jade-shell sidebar-open">
          <div className="jade-main" style={{ justifyContent: 'center', alignItems: 'center' }}>
            <div className="jade-thinking">Loading...</div>
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    if (showResetPassword) {
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
                      type="email"
                      placeholder="Enter your email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="jade-input"
                      required
                      style={{ width: '100%' }}
                    />
                    
                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                      <button
                        type="submit"
                        className="jade-primary-btn"
                        disabled={authLoading}
                        style={{ flex: 1 }}
                      >
                        {authLoading ? 'Sending...' : 'Send Reset Link'}
                      </button>
                      
                      <button
                        type="button"
                        className="jade-mini-btn"
                        onClick={() => {
                          setShowResetPassword(false);
                          setResetEmail('');
                        }}
                        style={{ flex: 1 }}
                      >
                        Back
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </main>
      );
    }

    return (
      <main className="jade-app">
        <div className="jade-grid-overlay" />
        <div className="jade-shell sidebar-open">
          <div className="jade-main" style={{ justifyContent: 'center', alignItems: 'center' }}>
            <div className="jade-brand-card" style={{ maxWidth: '400px', textAlign: 'center' }}>
              <div className="jade-brand-kicker">JADE CORE</div>
              <h1>The Arcadian Archive</h1>
              <p>Built for Jade 💚</p>
              
              <form onSubmit={handleEmailAuth} style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="jade-input"
                    required
                    style={{ width: '100%' }}
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="jade-input"
                    required
                    style={{ width: '100%' }}
                  />
                  
                  {authMode === 'signin' && (
                    <button
                      type="button"
                      className="jade-mini-btn"
                      onClick={() => setShowResetPassword(true)}
                      style={{ 
                        fontSize: '0.9rem',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--jade-muted)',
                        textDecoration: 'underline'
                      }}
                    >
                      Forgot password?
                    </button>
                  )}

                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <button
                      type="submit"
                      className="jade-primary-btn"
                      disabled={authLoading}
                      style={{ flex: 1 }}
                    >
                      {authLoading ? 'Please wait...' : authMode === 'signin' ? 'Sign In' : 'Sign Up'}
                    </button>
                    
                    <button
                      type="button"
                      className="jade-mini-btn"
                      onClick={() => {
                        setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
                        setEmail('');
                        setPassword('');
                      }}
                      style={{ flex: 1 }}
                    >
                      Switch to {authMode === 'signin' ? 'Sign Up' : 'Sign In'}
                    </button>
                  </div>

                  {authMode === 'signup' && (
                    <p style={{ fontSize: '0.8rem', color: 'var(--jade-muted)', marginTop: '10px' }}>
                      By signing up, you'll receive a confirmation email to verify your account.
                    </p>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="jade-app">
      <div className="jade-grid-overlay" />

      <div className="jade-mouse-trail" aria-hidden="true">
        {trail.map((point, index) => (
          <span
            key={point.id}
            className="jade-trail-dot"
            style={{
              left: point.x,
              top: point.y,
              opacity: Math.max(0.08, 0.55 - index * 0.04),
              transform: `translate(-50%, -50%) scale(${Math.max(
                0.35,
                1 - index * 0.05
              )})`,
            }}
          />
        ))}
      </div>

      <div className={`jade-shell ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
        {sidebarOpen && (
          <>
            <div
              className="jade-mobile-overlay"
              onClick={() => setSidebarOpen(false)}
            />
            <aside className="jade-sidebar">
              <div className="jade-brand-card">
                <div className="jade-brand-kicker">JADE CORE</div>
                <h1>The Arcadian Archive</h1>
                <p>Welcome, {user.email}</p>
              </div>

              <button
                className="jade-primary-btn"
                onClick={() => void createNewChat()}
                type="button"
              >
                + New Chat
              </button>

              <div className="jade-chat-list-container" ref={chatListRef}>
                <div className="jade-chat-list">
                  {chats.map((chat) => (
                    <div
                      key={chat.id}
                      className={`jade-chat-item ${chat.id === chatId ? "active" : ""}`}
                    >
                      {editingChatId === chat.id ? (
                        <div className="jade-chat-rename">
                          <input
                            value={titleDraft}
                            onChange={(e) => setTitleDraft(e.target.value)}
                            className="jade-rename-input"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveRename(chat.id);
                              if (e.key === "Escape") setEditingChatId(null);
                            }}
                            autoFocus
                          />
                          <button
                            className="jade-mini-btn"
                            onClick={() => void saveRename(chat.id)}
                            type="button"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            className="jade-chat-main"
                            onClick={() => void selectChat(chat.id)}
                            type="button"
                          >
                            {chat.title}
                          </button>
                          <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                            <button
                              className="jade-mini-btn"
                              onClick={() => startRename(chat)}
                              type="button"
                              style={{ flex: 1 }}
                            >
                              Rename
                            </button>
                            <button
                              className="jade-mini-btn"
                              onClick={() => void deleteChat(chat.id)}
                              type="button"
                              style={{ 
                                flex: 1,
                                background: 'rgba(255, 100, 100, 0.1)',
                                borderColor: 'rgba(255, 100, 100, 0.3)',
                                color: '#ff9b9b'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 100, 100, 0.2)';
                                e.currentTarget.style.borderColor = 'rgba(255, 100, 100, 0.5)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 100, 100, 0.1)';
                                e.currentTarget.style.borderColor = 'rgba(255, 100, 100, 0.3)';
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button
                className="jade-mini-btn"
                onClick={handleSignOut}
                style={{ marginTop: 'auto' }}
                type="button"
              >
                Sign Out
              </button>
            </aside>
          </>
        )}

        <section className="jade-main">
          <header className="jade-topbar">
            <div className="jade-topbar-left">
              <button
                className="jade-icon-btn"
                onClick={() => setSidebarOpen((prev) => !prev)}
                type="button"
                aria-label="Toggle sidebar"
              >
                ☰
              </button>

              <div>
                <div className="jade-kicker">Jade Interface</div>
                <div className="jade-title">The Arcadian Archive</div>
              </div>
            </div>

            <div className="jade-topbar-right">
              <button
                className={`jade-chip ${voiceEnabled ? "on" : ""}`}
                onClick={() => setVoiceEnabled((prev) => !prev)}
                type="button"
              >
                {voiceEnabled ? "Voice On" : "Voice Off"}
              </button>
            </div>
          </header>

          <div className="jade-messages-panel">
            {messages.length === 0 ? (
              <div className="jade-empty-state">
                <h2>Hey {user.email?.split('@')[0] || 'Jade'}.</h2>
                <p>Nice to see you. What do you need today?</p>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`jade-message-row ${m.role}`}>
                  <div className={`jade-message ${m.role}`}>{m.content}</div>
                </div>
              ))
            )}

            {sending && <div className="jade-thinking">Thinking…</div>}

            <div ref={bottomRef} />
          </div>

          <footer className="jade-composer-panel">
            <div className="jade-tools-row">
              <button
                className={`jade-icon-btn ${listening ? "live" : ""}`}
                onClick={startVoiceInput}
                type="button"
              >
                {listening ? "🎙 Listening" : "🎤 Voice"}
              </button>

              <button
                className="jade-icon-btn"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                📎 Upload
              </button>

              {uploadedFileName ? (
                <div className="jade-file-pill">Attached: {uploadedFileName}</div>
              ) : null}

              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
            </div>

            <div className="jade-composer">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="jade-input"
                placeholder="Talk to your AI..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendMessage();
                }}
              />

              <button
                className="jade-primary-btn"
                onClick={() => void sendMessage()}
                type="button"
                disabled={sending}
              >
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </footer>
        </section>
      </div>

      {/* Birthday badge */}
      <div className="jade-birthday-badge">
        🎉 Happy Birthday Jade! 🎂
      </div>
    </main>
  );
}