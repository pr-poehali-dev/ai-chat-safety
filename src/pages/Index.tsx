import { useState, useRef, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';

const API = {
  auth: "https://functions.poehali.dev/38ca5fcc-0335-47f5-ae47-4b4284e3130a",
  chat: "https://functions.poehali.dev/3d9867c7-a62d-4782-ade5-736146cf07f2",
  search: "https://functions.poehali.dev/56d473a5-9842-4138-9780-3298778f5012",
  docs: "https://functions.poehali.dev/566d6c0c-e3b3-4d7c-8066-cef94e75fcd6",
};

const TG_BOT_NAME = "rm_xxxx_beta_bot";

type Section = 'home' | 'chats' | 'docs' | 'search' | 'settings' | 'archive';

interface User {
  id: number;
  telegram_id: number;
  username: string;
  first_name: string;
  last_name: string;
  photo_url: string;
  filter_level: 'low' | 'medium' | 'high';
}

interface Chat {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: number;
  role: 'user' | 'ai';
  content: string;
  blocked: boolean;
  block_reason?: string;
  created_at: string;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  safe: boolean;
}

interface Doc {
  id: number;
  filename: string;
  file_size: number;
  status: string;
  safe: boolean;
  preview: string;
  created_at: string;
}

function apiFetch(url: string, opts: RequestInit = {}, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(opts.headers as Record<string, string> || {}) };
  if (token) headers["X-Session-Token"] = token;
  return fetch(url, { ...opts, headers });
}

export default function Index() {
  const [bootDone, setBootDone] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string>(() => localStorage.getItem("rm_token") || "");
  const [section, setSection] = useState<Section>('home');
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Chats
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [chatsLoading, setChatsLoading] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchBlocked, setSearchBlocked] = useState(false);
  const [searchReason, setSearchReason] = useState('');
  const [searchDone, setSearchDone] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  // Docs
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<Record<string, unknown> | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Settings
  const [filterLevel, setFilterLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Boot animation
  useEffect(() => {
    const t = setTimeout(() => setBootDone(true), 1600);
    return () => clearTimeout(t);
  }, []);

  // Auto-login if token exists
  useEffect(() => {
    if (token && bootDone) {
      apiFetch(API.auth, {}, token)
        .then(r => r.json())
        .then(data => {
          if (data.id) {
            setUser(data);
            setFilterLevel(data.filter_level || 'medium');
          } else {
            localStorage.removeItem("rm_token");
            setToken("");
          }
        })
        .catch(() => {
          localStorage.removeItem("rm_token");
          setToken("");
        });
    }
  }, [bootDone]);

  // Telegram login callback
  useEffect(() => {
    (window as unknown as Record<string, unknown>).onTelegramAuth = async (tgData: Record<string, unknown>) => {
      setAuthLoading(true);
      setAuthError("");
      try {
        const res = await apiFetch(API.auth, {
          method: "POST",
          body: JSON.stringify({ tg_data: tgData })
        });
        const data = await res.json();
        if (data.token) {
          localStorage.setItem("rm_token", data.token);
          setToken(data.token);
          setUser(data.user);
          setFilterLevel(data.user.filter_level || 'medium');
        } else {
          setAuthError("Ошибка авторизации. Попробуй ещё раз.");
        }
      } catch {
        setAuthError("Ошибка соединения.");
      } finally {
        setAuthLoading(false);
      }
    };
  }, []);

  // Load Telegram widget script
  useEffect(() => {
    if (!bootDone || user) return;
    const existing = document.getElementById("tg-login-script");
    if (existing) return;
    const script = document.createElement("script");
    script.id = "tg-login-script";
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", TG_BOT_NAME);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    script.async = true;
    document.getElementById("tg-widget-container")?.appendChild(script);
  }, [bootDone, user]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load chats when entering chats/archive
  useEffect(() => {
    if ((section === 'chats' || section === 'archive') && user && token) {
      loadChats();
    }
    if (section === 'docs' && user && token) {
      loadDocs();
    }
  }, [section, user]);

  async function loadChats() {
    setChatsLoading(true);
    try {
      const res = await apiFetch(API.chat, {}, token);
      const data = await res.json();
      setChats(data.chats || []);
    } finally {
      setChatsLoading(false);
    }
  }

  async function loadMessages(chatId: number) {
    const res = await apiFetch(`${API.chat}?chat_id=${chatId}`, {}, token);
    const data = await res.json();
    setMessages(data.messages || []);
  }

  async function openChat(chat: Chat) {
    setActiveChat(chat);
    setMessages([]);
    await loadMessages(chat.id);
    setSection('chats');
  }

  async function createChat() {
    const res = await apiFetch(API.chat, {
      method: "POST",
      body: JSON.stringify({ action: "create", title: "Новый диалог" })
    }, token);
    const data = await res.json();
    if (data.id) {
      const newChat: Chat = { id: data.id, title: data.title, created_at: data.created_at, updated_at: data.created_at };
      setChats(prev => [newChat, ...prev]);
      setActiveChat(newChat);
      setMessages([{ id: 0, role: 'ai', content: "НОВЫЙ СЕАНС ИНИЦИАЛИЗИРОВАН. Система RM-XXXX_BETA активна. Введите запрос.", blocked: false, created_at: new Date().toISOString() }]);
      setSection('chats');
    }
  }

  async function sendMessage() {
    if (!inputText.trim() || !activeChat || sending) return;
    const text = inputText.trim();
    setInputText('');
    setSending(true);
    // Optimistic user message
    const tmpId = Date.now();
    setMessages(prev => [...prev, { id: tmpId, role: 'user', content: text, blocked: false, created_at: new Date().toISOString() }]);
    try {
      const res = await apiFetch(API.chat, {
        method: "POST",
        body: JSON.stringify({ action: "send", chat_id: activeChat.id, text })
      }, token);
      const data = await res.json();
      setMessages(prev => prev.filter(m => m.id !== tmpId).concat([data.user_message, data.ai_message]));
      // Update chat title
      setChats(prev => prev.map(c => c.id === activeChat.id ? { ...c, title: data.user_message.content.substring(0, 40) + (data.user_message.content.length > 40 ? "..." : ""), updated_at: new Date().toISOString() } : c));
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tmpId));
    } finally {
      setSending(false);
    }
  }

  async function doSearch() {
    if (!searchQuery.trim() || searchLoading) return;
    setSearchLoading(true);
    setSearchDone(false);
    setSearchBlocked(false);
    try {
      const res = await apiFetch(`${API.search}?q=${encodeURIComponent(searchQuery)}`, {}, token);
      const data = await res.json();
      if (data.blocked) {
        setSearchBlocked(true);
        setSearchReason(data.reason);
        setSearchResults([]);
      } else {
        setSearchBlocked(false);
        setSearchResults(data.results || []);
      }
      setSearchDone(true);
    } finally {
      setSearchLoading(false);
    }
  }

  async function loadDocs() {
    setDocsLoading(true);
    try {
      const res = await apiFetch(API.docs, {}, token);
      const data = await res.json();
      setDocs(data.documents || []);
    } finally {
      setDocsLoading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw = ev.target?.result as ArrayBuffer;
      const bytes = new Uint8Array(raw);
      let binary = '';
      bytes.forEach(b => binary += String.fromCharCode(b));
      const b64 = btoa(binary);
      try {
        const res = await apiFetch(API.docs, {
          method: "POST",
          body: JSON.stringify({ filename: file.name, file_size: file.size, content: b64 })
        }, token);
        const data = await res.json();
        setUploadResult(data);
        setDocs(prev => [{ id: data.id, filename: data.filename, file_size: data.file_size, status: 'done', safe: data.safe, preview: data.preview, created_at: data.created_at }, ...prev]);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function saveSettings() {
    setSettingsSaving(true);
    await apiFetch(API.auth, {
      method: "PUT",
      body: JSON.stringify({ filter_level: filterLevel })
    }, token);
    if (user) setUser({ ...user, filter_level: filterLevel });
    setSettingsSaving(false);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  }

  function logout() {
    localStorage.removeItem("rm_token");
    setToken("");
    setUser(null);
    setChats([]);
    setMessages([]);
    setActiveChat(null);
  }

  // BOOT SCREEN
  if (!bootDone) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center">
        <div className="pixel-font text-white text-center space-y-6">
          <div className="text-xs tracking-widest text-gray-500">INITIALIZING SYSTEM...</div>
          <div className="text-lg sm:text-2xl tracking-tight leading-relaxed mt-4">
            RM<span className="text-gray-400">-</span>XXXX<span className="text-gray-600">_</span>BETA
          </div>
          <div className="flex gap-2 justify-center mt-4">
            {[0,1,2,3,4,5,6,7].map(i => (
              <div key={i} className="w-2 h-2 bg-white" style={{ animation: `blink 0.8s steps(1) ${i * 0.1}s infinite` }} />
            ))}
          </div>
          <div className="text-xs text-gray-600 mt-4 typing-cursor">ЗАГРУЗКА МОДУЛЕЙ БЕЗОПАСНОСТИ</div>
        </div>
      </div>
    );
  }

  // AUTH SCREEN
  if (!user) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="pixel-font text-white text-center mb-2 text-xs text-gray-500 tracking-widest">ДОБРО ПОЖАЛОВАТЬ В</div>
          <h1 className="pixel-font text-2xl sm:text-3xl text-white text-center mb-1 leading-relaxed">RM-XXXX</h1>
          <div className="pixel-font text-sm text-gray-500 text-center mb-10 typing-cursor">_BETA</div>

          <div className="border-2 border-gray-800 p-6 mb-4">
            <div className="pixel-font text-xs text-gray-500 mb-4 pb-2 border-b border-gray-800 text-center">АВТОРИЗАЦИЯ</div>
            <p className="mono-font text-xs text-gray-500 text-center mb-6 leading-relaxed">
              Войди через Telegram — быстро и безопасно.<br/>Без паролей.
            </p>
            <div id="tg-widget-container" className="flex justify-center min-h-[50px]">
              {authLoading && <div className="pixel-font text-xs text-gray-500 typing-cursor">АВТОРИЗАЦИЯ</div>}
            </div>
            {authError && (
              <div className="pixel-font text-xs text-center mt-4" style={{ color: '#fff' }}>
                <span className="tag-blocked">ОШИБКА</span> {authError}
              </div>
            )}
          </div>

          <div className="border border-gray-900 p-4">
            <div className="pixel-font text-xs text-gray-700 mb-2 text-center">СИСТЕМА ВКЛЮЧАЕТ</div>
            {['Защищённый ИИ-чат', 'Многоуровневая фильтрация', 'Анализ документов', 'Безопасный поиск', 'Архив диалогов'].map(f => (
              <div key={f} className="mono-font text-xs text-gray-600 py-1 border-b border-gray-900 last:border-0">▸ {f}</div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // MAIN APP
  const navItems = [
    { id: 'home' as Section, label: 'ГЛАВНАЯ', icon: 'Home' },
    { id: 'chats' as Section, label: 'ЧАТЫ', icon: 'MessageSquare' },
    { id: 'docs' as Section, label: 'ДОКУМЕНТЫ', icon: 'FileText' },
    { id: 'search' as Section, label: 'ПОИСК', icon: 'Search' },
    { id: 'archive' as Section, label: 'АРХИВ', icon: 'Archive' },
    { id: 'settings' as Section, label: 'НАСТРОЙКИ', icon: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col" style={{ height: '100dvh' }}>
      {/* Header */}
      <header className="border-b-2 border-white px-4 py-3 flex items-center justify-between scan-lines shrink-0">
        <div className="pixel-font text-xs sm:text-sm tracking-widest glitch" data-text="RM-XXXX_BETA">RM-XXXX_BETA</div>
        <div className="flex items-center gap-3">
          <div className="tag-safe hidden sm:block">
            {filterLevel === 'high' ? 'СТРОГИЙ' : filterLevel === 'medium' ? 'СРЕДНИЙ' : 'МЯГКИЙ'} ФИЛЬТР
          </div>
          <div className="mono-font text-xs text-gray-500 hidden sm:block">
            {user.first_name}{user.username ? ` @${user.username}` : ''}
          </div>
          <button onClick={logout} className="pixel-btn text-xs px-2 py-1 border border-gray-700">ВЫХОД</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-12 sm:w-44 border-r-2 border-white flex flex-col py-2 shrink-0">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => { setSection(item.id); if (item.id !== 'chats') setActiveChat(null); }}
              className={`pixel-btn w-full text-left flex items-center gap-3 px-3 py-3 border-0 border-b border-gray-900 ${section === item.id ? 'pixel-btn-active' : ''}`}
            >
              <Icon name={item.icon} size={13} />
              <span className="hidden sm:block text-[7px] leading-tight">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-hidden flex flex-col">

          {/* HOME */}
          {section === 'home' && (
            <div className="flex-1 overflow-auto p-5 sm:p-8 animate-fade-in">
              <div className="max-w-xl mx-auto">
                <div className="pixel-font text-xs text-gray-500 mb-1">ДОБРО ПОЖАЛОВАТЬ,</div>
                <div className="pixel-font text-xl text-white mb-6">{user.first_name.toUpperCase()}</div>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  {[
                    { icon: 'MessageSquare', title: 'НОВЫЙ ЧАТ', desc: 'Начать диалог с ИИ', action: createChat },
                    { icon: 'Search', title: 'ПОИСК', desc: 'Безопасный поиск', action: () => setSection('search') },
                    { icon: 'FileText', title: 'ДОКУМЕНТЫ', desc: 'Загрузить и проанализировать', action: () => setSection('docs') },
                    { icon: 'Archive', title: 'АРХИВ', desc: 'История диалогов', action: () => setSection('archive') },
                  ].map(card => (
                    <button key={card.title} onClick={card.action}
                      className="border-2 border-gray-700 hover:border-white bg-black hover:bg-white hover:text-black p-4 text-left group transition-all">
                      <Icon name={card.icon} size={18} className="mb-2" />
                      <div className="pixel-font text-xs mb-1">{card.title}</div>
                      <div className="mono-font text-xs text-gray-500 group-hover:text-gray-700">{card.desc}</div>
                    </button>
                  ))}
                </div>

                <div className="border border-gray-800 p-4">
                  <div className="pixel-font text-xs text-gray-600 mb-3">СТАТУС СИСТЕМЫ</div>
                  {[
                    { name: 'АВТОРИЗАЦИЯ', val: 'TELEGRAM' },
                    { name: 'ФИЛЬТР КОНТЕНТА', val: filterLevel.toUpperCase() },
                    { name: 'ДИАЛОГОВ В АРХИВЕ', val: String(chats.length) },
                    { name: 'СИСТЕМА БЕЗОПАСНОСТИ', val: 'АКТИВНА' },
                  ].map(s => (
                    <div key={s.name} className="flex justify-between py-1 border-b border-gray-900 last:border-0">
                      <span className="mono-font text-xs text-gray-600">{s.name}</span>
                      <span className="pixel-font text-xs text-white">{s.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CHATS LIST */}
          {section === 'chats' && !activeChat && (
            <div className="flex-1 overflow-auto p-5 animate-fade-in">
              <div className="flex justify-between items-center mb-4">
                <div className="pixel-font text-xs">ДИАЛОГИ</div>
                <button onClick={createChat} className="pixel-btn text-xs">+ НОВЫЙ</button>
              </div>
              {chatsLoading && <div className="pixel-font text-xs text-gray-600 typing-cursor">ЗАГРУЗКА</div>}
              {!chatsLoading && chats.length === 0 && (
                <div className="border border-gray-900 p-6 text-center">
                  <div className="pixel-font text-xs text-gray-600 mb-3">НЕТ ДИАЛОГОВ</div>
                  <button onClick={createChat} className="pixel-btn text-xs">+ НАЧАТЬ ПЕРВЫЙ ЧАТ</button>
                </div>
              )}
              <div className="space-y-2 max-w-xl">
                {chats.map(chat => (
                  <button key={chat.id} onClick={() => openChat(chat)}
                    className="w-full border-2 border-gray-800 hover:border-white p-4 text-left transition-all">
                    <div className="flex justify-between">
                      <span className="pixel-font text-xs truncate max-w-[70%]">{chat.title}</span>
                      <span className="mono-font text-xs text-gray-600 shrink-0">{new Date(chat.updated_at).toLocaleDateString('ru-RU')}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CHAT OPEN */}
          {section === 'chats' && activeChat && (
            <div className="flex-1 flex flex-col overflow-hidden animate-fade-in">
              <div className="border-b-2 border-gray-800 px-4 py-2 flex items-center gap-3 shrink-0">
                <button onClick={() => { setActiveChat(null); loadChats(); }} className="pixel-btn text-xs px-2 py-1">←</button>
                <span className="pixel-font text-xs truncate">{activeChat.title}</span>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-3">
                {messages.map((msg, i) => (
                  <div key={msg.id || i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}>
                      {msg.blocked && (
                        <div className="tag-blocked mb-2">{msg.block_reason || 'ЗАБЛОКИРОВАНО'}</div>
                      )}
                      <span className={msg.blocked ? 'text-gray-500' : ''}>{msg.content}</span>
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="flex justify-start">
                    <div className="chat-bubble-ai">
                      <span className="pixel-font text-xs text-gray-500 typing-cursor">ОБРАБОТКА</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="border-t-2 border-gray-800 p-3 flex gap-2 shrink-0">
                <input
                  className="pixel-input flex-1"
                  placeholder="ВВЕДИТЕ ЗАПРОС..."
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  disabled={sending}
                />
                <button onClick={sendMessage} disabled={sending} className="pixel-btn px-4">→</button>
              </div>
            </div>
          )}

          {/* DOCS */}
          {section === 'docs' && (
            <div className="flex-1 overflow-auto p-5 animate-fade-in">
              <div className="max-w-xl">
                <div className="pixel-font text-xs mb-5">ДОКУМЕНТЫ</div>
                <div
                  className="border-2 border-dashed border-gray-600 hover:border-white p-8 text-center cursor-pointer transition-all mb-5"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Icon name="Upload" size={22} className="mx-auto mb-3 text-gray-600" />
                  <div className="pixel-font text-xs text-gray-500 mb-1">{uploading ? 'АНАЛИЗ...' : 'ВЫБРАТЬ ФАЙЛ'}</div>
                  <div className="mono-font text-xs text-gray-700">.txt, .pdf, .doc, .docx, .md</div>
                  <input ref={fileInputRef} type="file" accept=".txt,.pdf,.doc,.docx,.md" className="hidden" onChange={handleFileUpload} />
                </div>

                {uploading && (
                  <div className="border-2 border-gray-700 p-4 mb-4">
                    <div className="pixel-font text-xs text-gray-500 typing-cursor">АНАЛИЗ ДОКУМЕНТА</div>
                  </div>
                )}

                {uploadResult && !uploading && (
                  <div className={`border-2 p-4 mb-5 animate-fade-in ${uploadResult.safe ? 'border-white' : 'border-gray-600'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      {uploadResult.safe
                        ? <div className="tag-safe">БЕЗОПАСНО</div>
                        : <div className="tag-blocked">УГРОЗА</div>}
                      <span className="pixel-font text-xs">{uploadResult.filename}</span>
                    </div>
                    {uploadResult.issues?.length > 0 && (
                      <div className="mono-font text-xs text-gray-500 mb-2">
                        Обнаружено: {uploadResult.issues.join(', ')}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {[
                        ['СЛОВ', uploadResult.stats?.words],
                        ['СИМВОЛОВ', uploadResult.stats?.chars],
                        ['ПРЕДЛОЖЕНИЙ', uploadResult.stats?.sentences],
                        ['ЯЗЫК', uploadResult.stats?.lang],
                      ].map(([k, v]) => (
                        <div key={k as string} className="border border-gray-800 p-2">
                          <div className="pixel-font text-xs text-gray-600" style={{ fontSize: '6px' }}>{k}</div>
                          <div className="mono-font text-sm text-white">{v}</div>
                        </div>
                      ))}
                    </div>
                    {uploadResult.preview && (
                      <div className="border border-gray-800 p-3">
                        <div className="pixel-font text-gray-600 mb-1" style={{ fontSize: '6px' }}>ПРЕВЬЮ</div>
                        <div className="mono-font text-xs text-gray-400 leading-relaxed whitespace-pre-wrap">{uploadResult.preview}</div>
                      </div>
                    )}
                  </div>
                )}

                {docsLoading && <div className="pixel-font text-xs text-gray-600 typing-cursor">ЗАГРУЗКА</div>}
                {!docsLoading && docs.length > 0 && (
                  <div>
                    <div className="pixel-font text-xs text-gray-600 mb-3">ЗАГРУЖЕННЫЕ ДОКУМЕНТЫ</div>
                    <div className="space-y-2">
                      {docs.map(doc => (
                        <div key={doc.id} className="border border-gray-800 p-3 flex justify-between items-center">
                          <div>
                            <div className="mono-font text-xs mb-1">{doc.filename}</div>
                            <div className="mono-font text-xs text-gray-600">{(doc.file_size / 1024).toFixed(1)} KB · {new Date(doc.created_at).toLocaleDateString('ru-RU')}</div>
                          </div>
                          {doc.safe ? <div className="tag-safe">OK</div> : <div className="tag-blocked">!</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SEARCH */}
          {section === 'search' && (
            <div className="flex-1 overflow-auto p-5 animate-fade-in">
              <div className="max-w-xl">
                <div className="pixel-font text-xs mb-5">БЕЗОПАСНЫЙ ПОИСК</div>
                <div className="flex gap-2 mb-3">
                  <input
                    className="pixel-input flex-1"
                    placeholder="ПОИСКОВЫЙ ЗАПРОС..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && doSearch()}
                    disabled={searchLoading}
                  />
                  <button onClick={doSearch} disabled={searchLoading} className="pixel-btn px-4 shrink-0">
                    {searchLoading ? '...' : 'ПОИСК'}
                  </button>
                </div>
                <div className="flex items-center gap-2 mb-5">
                  <span className="mono-font text-xs text-gray-600">Фильтр:</span>
                  <div className="tag-safe">{filterLevel === 'high' ? 'СТРОГИЙ' : filterLevel === 'medium' ? 'СРЕДНИЙ' : 'МЯГКИЙ'}</div>
                  <button onClick={() => setSection('settings')} className="mono-font text-xs text-gray-700 hover:text-white">изменить →</button>
                </div>

                {searchDone && searchBlocked && (
                  <div className="border-2 border-gray-800 p-5 animate-fade-in">
                    <div className="tag-blocked mb-3">ЗАБЛОКИРОВАНО</div>
                    <div className="pixel-font text-xs text-gray-500">{searchReason}</div>
                    <div className="mono-font text-xs text-gray-600 mt-2">Запрос заблокирован системой безопасности. Измените запрос или уровень фильтра.</div>
                  </div>
                )}

                {searchDone && !searchBlocked && (
                  <div className="space-y-3 animate-fade-in">
                    <div className="pixel-font text-xs text-gray-600 mb-2">РЕЗУЛЬТАТЫ: {searchResults.length}</div>
                    {searchResults.length === 0 && (
                      <div className="mono-font text-xs text-gray-600">По запросу ничего не найдено.</div>
                    )}
                    {searchResults.map((r, i) => (
                      <div key={i} className="border-2 border-gray-800 hover:border-gray-600 p-4 transition-all">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="tag-safe">БЕЗОПАСНО</div>
                          <span className="mono-font text-xs text-gray-600">{r.url}</span>
                        </div>
                        <div className="pixel-font text-xs text-white mb-2">{r.title}</div>
                        <div className="mono-font text-xs text-gray-500">{r.snippet}</div>
                      </div>
                    ))}
                  </div>
                )}

                {!searchDone && (
                  <div className="border border-gray-900 p-4">
                    <div className="pixel-font text-xs text-gray-700 mb-3">АКТИВНЫЕ ФИЛЬТРЫ</div>
                    {filterLevel !== 'low' && <div className="mono-font text-xs text-gray-600 py-1">■ Блокировка опасных запросов</div>}
                    {filterLevel === 'high' && <div className="mono-font text-xs text-gray-600 py-1">■ Блокировка контента 18+</div>}
                    {filterLevel === 'high' && <div className="mono-font text-xs text-gray-600 py-1">■ Блокировка нецензурной лексики</div>}
                    {filterLevel === 'low' && <div className="mono-font text-xs text-gray-600 py-1">■ Минимальная фильтрация</div>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ARCHIVE */}
          {section === 'archive' && (
            <div className="flex-1 overflow-auto p-5 animate-fade-in">
              <div className="pixel-font text-xs mb-5">АРХИВ ДИАЛОГОВ</div>
              {chatsLoading && <div className="pixel-font text-xs text-gray-600 typing-cursor">ЗАГРУЗКА</div>}
              {!chatsLoading && chats.length === 0 && (
                <div className="mono-font text-xs text-gray-600">Архив пуст. Начни диалог в разделе «Чаты».</div>
              )}
              <div className="space-y-3 max-w-xl">
                {chats.map(chat => (
                  <div key={chat.id} className="border-2 border-gray-800 p-4">
                    <div className="flex justify-between items-center">
                      <span className="pixel-font text-xs truncate max-w-[60%]">{chat.title}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="mono-font text-xs text-gray-600">{new Date(chat.updated_at).toLocaleDateString('ru-RU')}</span>
                        <button onClick={() => openChat(chat)} className="pixel-btn text-xs px-2 py-1">→</button>
                      </div>
                    </div>
                    <div className="mono-font text-xs text-gray-700 mt-2">
                      Создан: {new Date(chat.created_at).toLocaleString('ru-RU')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {section === 'settings' && (
            <div className="flex-1 overflow-auto p-5 animate-fade-in">
              <div className="max-w-md">
                <div className="pixel-font text-xs mb-6">НАСТРОЙКИ</div>

                {/* Profile */}
                <div className="border-2 border-gray-800 p-4 mb-4">
                  <div className="pixel-font text-xs text-gray-500 mb-3 pb-2 border-b border-gray-800">АККАУНТ</div>
                  <div className="flex items-center gap-3">
                    {user.photo_url && <img src={user.photo_url} alt="" className="w-10 h-10 border-2 border-gray-600" style={{ imageRendering: 'pixelated' }} />}
                    <div>
                      <div className="pixel-font text-xs">{user.first_name} {user.last_name}</div>
                      {user.username && <div className="mono-font text-xs text-gray-500 mt-1">@{user.username}</div>}
                      <div className="mono-font text-xs text-gray-600">ID: {user.telegram_id}</div>
                    </div>
                  </div>
                </div>

                {/* Filter level */}
                <div className="border-2 border-gray-800 p-4 mb-4">
                  <div className="pixel-font text-xs text-gray-500 mb-3 pb-2 border-b border-gray-800">УРОВЕНЬ ФИЛЬТРАЦИИ</div>
                  <div className="flex gap-2 mb-3">
                    {(['low', 'medium', 'high'] as const).map(lvl => (
                      <button key={lvl} onClick={() => setFilterLevel(lvl)}
                        className={`pixel-btn flex-1 py-3 text-xs ${filterLevel === lvl ? 'pixel-btn-active' : ''}`}>
                        {lvl === 'low' ? 'МЯГКИЙ' : lvl === 'medium' ? 'СРЕДНИЙ' : 'СТРОГИЙ'}
                      </button>
                    ))}
                  </div>
                  <div className="mono-font text-xs text-gray-600 p-3 border border-gray-900">
                    {filterLevel === 'low' && '▸ Только опасные запросы'}
                    {filterLevel === 'medium' && '▸ Опасные запросы + грубая лексика'}
                    {filterLevel === 'high' && '▸ Максимум: опасные + 18+ + нецензурная лексика'}
                  </div>
                  <div className="mt-3 space-y-1">
                    {[
                      { label: 'Блокировка опасных запросов', on: true },
                      { label: 'Блокировка 18+ контента', on: filterLevel === 'high' },
                      { label: 'Блокировка нецензурной лексики', on: filterLevel !== 'low' },
                    ].map(item => (
                      <div key={item.label} className="flex justify-between items-center py-1 border-b border-gray-900">
                        <span className="mono-font text-xs text-gray-500">{item.label}</span>
                        <span className={`pixel-font text-xs ${item.on ? 'text-white' : 'text-gray-700'}`}>{item.on ? '■ ВКЛ' : '□ ВЫКЛ'}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={saveSettings} disabled={settingsSaving}
                    className={`pixel-btn w-full mt-4 py-3 text-xs ${settingsSaved ? 'pixel-btn-active' : ''}`}>
                    {settingsSaving ? 'СОХРАНЕНИЕ...' : settingsSaved ? '■ СОХРАНЕНО' : 'СОХРАНИТЬ'}
                  </button>
                </div>

                {/* Danger zone */}
                <div className="border-2 border-gray-800 p-4">
                  <div className="pixel-font text-xs text-gray-500 mb-3 pb-2 border-b border-gray-800">СЕССИЯ</div>
                  <button onClick={logout} className="pixel-btn w-full py-3 text-xs">ВЫЙТИ ИЗ АККАУНТА</button>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Footer */}
      <footer className="border-t-2 border-gray-900 px-4 py-2 flex justify-between items-center shrink-0">
        <div className="pixel-font text-xs text-gray-700">RM-XXXX_BETA v2.0</div>
        <div className="mono-font text-xs text-gray-700">ФИЛЬТР: {filterLevel.toUpperCase()}</div>
      </footer>
    </div>
  );
}