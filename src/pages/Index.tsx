import { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/icon';

type Section = 'home' | 'chats' | 'docs' | 'search' | 'settings' | 'archive';

interface Message {
  id: number;
  role: 'user' | 'ai';
  text: string;
  blocked?: boolean;
}

interface Chat {
  id: number;
  title: string;
  date: string;
  messages: Message[];
}

interface SearchResult {
  id: number;
  title: string;
  url: string;
  snippet: string;
  safe: boolean;
}

const BLOCKED_WORDS = ['мат', 'хрен', 'блин', 'черт', 'дурак'];
const DANGEROUS_PATTERNS = ['взрыв', 'оружи', 'убий', 'хак', 'взлом'];
const ADULT_PATTERNS = ['18+', 'порн', 'эротик', 'секс'];

function checkContent(text: string, level: 'low' | 'medium' | 'high'): { blocked: boolean; reason: string } {
  const lower = text.toLowerCase();
  if (level !== 'low') {
    for (const w of DANGEROUS_PATTERNS) {
      if (lower.includes(w)) return { blocked: true, reason: 'ОПАСНЫЙ ЗАПРОС' };
    }
  }
  if (level === 'high') {
    for (const w of ADULT_PATTERNS) {
      if (lower.includes(w)) return { blocked: true, reason: 'КОНТЕНТ 18+' };
    }
    for (const w of BLOCKED_WORDS) {
      if (lower.includes(w)) return { blocked: true, reason: 'НЕЦЕНЗУРНАЯ ЛЕКСИКА' };
    }
  }
  return { blocked: false, reason: '' };
}

const MOCK_SEARCH_RESULTS: SearchResult[] = [
  { id: 1, title: 'Что такое нейронные сети?', url: 'wiki.example.com/neural-networks', snippet: 'Нейронные сети — математические модели, имитирующие работу мозга человека...', safe: true },
  { id: 2, title: 'Машинное обучение для начинающих', url: 'learn.example.com/ml-basics', snippet: 'Введение в машинное обучение: основные алгоритмы и применения в реальной жизни...', safe: true },
  { id: 3, title: 'История искусственного интеллекта', url: 'history.example.com/ai', snippet: 'От первых экспертных систем 1960-х до современных языковых моделей...', safe: true },
  { id: 4, title: 'ЗАБЛОКИРОВАНО', url: 'unsafe.example.com', snippet: 'Этот результат заблокирован фильтром безопасности.', safe: false },
];

const INITIAL_CHATS: Chat[] = [
  {
    id: 1, title: 'ДИАЛОГ #001', date: '2026-05-10',
    messages: [
      { id: 1, role: 'user', text: 'Привет! Как дела?' },
      { id: 2, role: 'ai', text: 'СИСТЕМА АКТИВНА. Все модули работают в штатном режиме. Чем могу помочь?' },
    ]
  },
  {
    id: 2, title: 'ДИАЛОГ #002', date: '2026-05-11',
    messages: [
      { id: 1, role: 'user', text: 'Объясни принцип работы ИИ' },
      { id: 2, role: 'ai', text: 'ИИ — это набор алгоритмов, обученных на больших массивах данных для выполнения задач, требующих интеллекта.' },
    ]
  },
];

export default function Index() {
  const [section, setSection] = useState<Section>('home');
  const [chats, setChats] = useState<Chat[]>(INITIAL_CHATS);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchDone, setSearchDone] = useState(false);
  const [filterLevel, setFilterLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [language, setLanguage] = useState<'ru' | 'en'>('ru');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [twoFactor, setTwoFactor] = useState(false);
  const [uploadedDoc, setUploadedDoc] = useState<string | null>(null);
  const [docAnalysis, setDocAnalysis] = useState<string | null>(null);
  const [bootDone, setBootDone] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setBootDone(true), 1800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages]);

  function sendMessage() {
    if (!inputText.trim() || !activeChat) return;
    const check = checkContent(inputText, filterLevel);
    const userMsg: Message = { id: Date.now(), role: 'user', text: inputText };
    let aiMsg: Message;
    if (check.blocked) {
      aiMsg = { id: Date.now() + 1, role: 'ai', text: `[${check.reason}] ЗАПРОС ЗАБЛОКИРОВАН СИСТЕМОЙ ФИЛЬТРАЦИИ.`, blocked: true };
    } else {
      aiMsg = { id: Date.now() + 1, role: 'ai', text: `ОБРАБОТКА ЗАПРОСА: "${inputText.substring(0, 50)}..." — Ответ сгенерирован в штатном режиме. Все данные обработаны безопасно.` };
    }
    const updated = chats.map(c =>
      c.id === activeChat.id ? { ...c, messages: [...c.messages, userMsg, aiMsg] } : c
    );
    setChats(updated);
    setActiveChat(prev => prev ? { ...prev, messages: [...prev.messages, userMsg, aiMsg] } : prev);
    setInputText('');
  }

  function createNewChat() {
    const newChat: Chat = {
      id: Date.now(),
      title: `ДИАЛОГ #${String(chats.length + 1).padStart(3, '0')}`,
      date: new Date().toISOString().split('T')[0],
      messages: [{ id: 1, role: 'ai', text: 'НОВЫЙ СЕАНС ИНИЦИАЛИЗИРОВАН. Введите запрос.' }]
    };
    setChats(prev => [...prev, newChat]);
    setActiveChat(newChat);
    setSection('chats');
  }

  function doSearch() {
    if (!searchQuery.trim()) return;
    const check = checkContent(searchQuery, filterLevel);
    if (check.blocked) {
      setSearchResults([{ id: 0, title: `ЗАБЛОКИРОВАНО: ${check.reason}`, url: '', snippet: 'Запрос заблокирован системой безопасности.', safe: false }]);
    } else {
      setSearchResults(MOCK_SEARCH_RESULTS.filter(r =>
        filterLevel === 'high' ? r.safe : true
      ));
    }
    setSearchDone(true);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedDoc(file.name);
    setDocAnalysis(null);
    setTimeout(() => {
      setDocAnalysis(`АНАЛИЗ ЗАВЕРШЁН: ${file.name}\n\nТип: ТЕКСТОВЫЙ ДОКУМЕНТ\nРазмер: ${(file.size / 1024).toFixed(1)} KB\nЯзык: РУССКИЙ\nСтатус: БЕЗОПАСНО\n\nСОДЕРЖИМОЕ:\nДокумент проверен на наличие запрещённого контента. Нарушений не обнаружено. Готов к обработке.`);
    }, 1200);
  }

  if (!bootDone) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center">
        <div className="pixel-font text-white text-center space-y-6 animate-fade-in">
          <div className="text-xs tracking-widest mb-8 text-gray-500">INITIALIZING SYSTEM...</div>
          <div className="text-lg sm:text-2xl tracking-tight leading-relaxed">
            RM<span className="text-gray-400">-</span>XXXX<span className="text-gray-600">_</span>BETA
          </div>
          <div className="flex gap-2 justify-center mt-6">
            {[0,1,2,3,4,5,6,7].map(i => (
              <div
                key={i}
                className="w-2 h-2 bg-white"
                style={{ animation: `blink 0.8s steps(1) ${i * 0.1}s infinite` }}
              />
            ))}
          </div>
          <div className="text-xs text-gray-600 mt-8 typing-cursor">ЗАГРУЗКА МОДУЛЕЙ БЕЗОПАСНОСТИ</div>
        </div>
      </div>
    );
  }

  const navItems: { id: Section; label: string; icon: string }[] = [
    { id: 'home', label: 'ГЛАВНАЯ', icon: 'Home' },
    { id: 'chats', label: 'ЧАТЫ', icon: 'MessageSquare' },
    { id: 'docs', label: 'ДОКУМЕНТЫ', icon: 'FileText' },
    { id: 'search', label: 'ПОИСК', icon: 'Search' },
    { id: 'archive', label: 'АРХИВ', icon: 'Archive' },
    { id: 'settings', label: 'НАСТРОЙКИ', icon: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="border-b-2 border-white px-4 py-3 flex items-center justify-between scan-lines">
        <div className="pixel-font text-xs sm:text-sm tracking-widest glitch" data-text="RM-XXXX_BETA">
          RM-XXXX_BETA
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs text-gray-500 mono-font hidden sm:block">
            {new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="tag-safe">
            {filterLevel === 'high' ? 'МАКС' : filterLevel === 'medium' ? 'СРЕДН' : 'МИН'} ФИЛЬТР
          </div>
          <div className="w-2 h-2 bg-white animate-blink" />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-14 sm:w-48 border-r-2 border-white flex flex-col py-4 gap-1 shrink-0">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => { setSection(item.id); if (item.id !== 'chats') setActiveChat(null); }}
              className={`pixel-btn w-full text-left flex items-center gap-3 px-3 py-3 border-0 border-b border-gray-800 ${section === item.id ? 'pixel-btn-active' : ''}`}
            >
              <Icon name={item.icon} size={14} />
              <span className="hidden sm:block text-[7px]">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Main */}
        <main className="flex-1 overflow-auto">

          {/* HOME */}
          {section === 'home' && (
            <div className="p-6 sm:p-10 animate-fade-in">
              <div className="max-w-2xl mx-auto">
                <div className="pixel-font text-xs text-gray-500 tracking-widest mb-2">
                  ДОБРО ПОЖАЛОВАТЬ В
                </div>
                <h1 className="pixel-font text-2xl sm:text-4xl text-white mb-1 leading-relaxed tracking-tight">
                  RM-XXXX
                </h1>
                <div className="pixel-font text-sm text-gray-400 mb-8 typing-cursor">_BETA</div>

                <p className="mono-font text-gray-400 text-sm leading-relaxed mb-10 border-l-2 border-gray-600 pl-4">
                  Защищённый ИИ-ассистент с многоуровневой системой фильтрации контента.<br/>
                  Все запросы проходят проверку безопасности в реальном времени.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                  {[
                    { icon: 'MessageSquare', title: 'ЧАТЫ', desc: 'Диалоги с ИИ', action: () => setSection('chats') },
                    { icon: 'FileText', title: 'ДОКУМЕНТЫ', desc: 'Загрузка и анализ файлов', action: () => setSection('docs') },
                    { icon: 'Search', title: 'ПОИСК', desc: 'Безопасный поиск в сети', action: () => setSection('search') },
                    { icon: 'Archive', title: 'АРХИВ', desc: 'История диалогов', action: () => setSection('archive') },
                  ].map(card => (
                    <button
                      key={card.title}
                      onClick={card.action}
                      className="border-2 border-gray-700 hover:border-white bg-black hover:bg-white hover:text-black transition-all p-5 text-left group"
                    >
                      <Icon name={card.icon} size={20} className="mb-3 group-hover:text-black" />
                      <div className="pixel-font text-xs mb-2">{card.title}</div>
                      <div className="mono-font text-xs text-gray-500 group-hover:text-gray-800">{card.desc}</div>
                    </button>
                  ))}
                </div>

                <button onClick={createNewChat} className="pixel-btn w-full py-4 text-xs tracking-widest">
                  + НАЧАТЬ НОВЫЙ ДИАЛОГ
                </button>

                <div className="mt-8 border border-gray-800 p-4">
                  <div className="pixel-font text-xs text-gray-600 mb-3">СТАТУС СИСТЕМЫ</div>
                  {[
                    { name: 'МОДУЛЬ ФИЛЬТРАЦИИ', status: 'OK' },
                    { name: 'ЗАЩИТА 18+', status: 'АКТИВНА' },
                    { name: 'БЛОКИРОВКА МАТА', status: 'АКТИВНА' },
                    { name: 'ЗАЩИТА ОТ ОПАСНЫХ ЗАПРОСОВ', status: 'АКТИВНА' },
                  ].map(s => (
                    <div key={s.name} className="flex justify-between items-center py-1 border-b border-gray-900">
                      <span className="mono-font text-xs text-gray-500">{s.name}</span>
                      <span className="pixel-font text-xs text-white">{s.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CHATS LIST */}
          {section === 'chats' && !activeChat && (
            <div className="p-6 animate-fade-in">
              <div className="flex justify-between items-center mb-6">
                <div className="pixel-font text-xs text-white">ДИАЛОГИ</div>
                <button onClick={createNewChat} className="pixel-btn text-xs">+ НОВЫЙ</button>
              </div>
              <div className="space-y-2 max-w-xl">
                {chats.map(chat => (
                  <button
                    key={chat.id}
                    onClick={() => setActiveChat(chat)}
                    className="w-full border-2 border-gray-700 hover:border-white p-4 text-left transition-all"
                  >
                    <div className="flex justify-between items-center">
                      <span className="pixel-font text-xs">{chat.title}</span>
                      <span className="mono-font text-xs text-gray-600">{chat.date}</span>
                    </div>
                    <div className="mono-font text-xs text-gray-500 mt-2 truncate">
                      {chat.messages[chat.messages.length - 1]?.text.substring(0, 60)}...
                    </div>
                    <div className="mono-font text-xs text-gray-700 mt-1">
                      {chat.messages.length} сообщений
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CHAT OPEN */}
          {section === 'chats' && activeChat && (
            <div className="flex flex-col animate-fade-in" style={{ height: 'calc(100vh - 57px)' }}>
              <div className="border-b-2 border-gray-800 px-4 py-2 flex items-center gap-3">
                <button onClick={() => setActiveChat(null)} className="pixel-btn text-xs px-2 py-1 border border-gray-600">←</button>
                <span className="pixel-font text-xs">{activeChat.title}</span>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-3">
                {activeChat.messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={msg.role === 'user' ? 'chat-bubble-user' : msg.blocked ? 'chat-bubble-ai border-gray-600' : 'chat-bubble-ai'}>
                      {msg.blocked && <div className="tag-blocked mb-2">ЗАБЛОКИРОВАНО</div>}
                      <div className={msg.blocked ? 'text-gray-500' : ''}>{msg.text}</div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <div className="border-t-2 border-gray-800 p-3 flex gap-2">
                <input
                  className="pixel-input"
                  placeholder="ВВЕДИТЕ ЗАПРОС..."
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                />
                <button onClick={sendMessage} className="pixel-btn px-4">→</button>
              </div>
            </div>
          )}

          {/* DOCS */}
          {section === 'docs' && (
            <div className="p-6 animate-fade-in max-w-xl">
              <div className="pixel-font text-xs text-white mb-6">ЗАГРУЗКА ДОКУМЕНТОВ</div>

              <div
                className="border-2 border-dashed border-gray-600 hover:border-white p-10 text-center cursor-pointer transition-all mb-4"
                onClick={() => fileInputRef.current?.click()}
              >
                <Icon name="Upload" size={24} className="mx-auto mb-3 text-gray-600" />
                <div className="pixel-font text-xs text-gray-500 mb-1">ВЫБРАТЬ ФАЙЛ</div>
                <div className="mono-font text-xs text-gray-700">.txt, .pdf, .doc, .docx</div>
                <input ref={fileInputRef} type="file" accept=".txt,.pdf,.doc,.docx" className="hidden" onChange={handleFileUpload} />
              </div>

              {uploadedDoc && (
                <div className="border-2 border-gray-700 p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name="FileText" size={14} />
                    <span className="mono-font text-sm">{uploadedDoc}</span>
                  </div>
                  {!docAnalysis && (
                    <div className="pixel-font text-xs text-gray-500 typing-cursor">АНАЛИЗ</div>
                  )}
                </div>
              )}

              {docAnalysis && (
                <div className="border-2 border-white p-4 animate-fade-in">
                  <div className="pixel-font text-xs mb-3 text-white">РЕЗУЛЬТАТ АНАЛИЗА</div>
                  <pre className="mono-font text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">{docAnalysis}</pre>
                </div>
              )}

              {!uploadedDoc && (
                <div className="border border-gray-900 p-4 mt-6">
                  <div className="pixel-font text-xs text-gray-700 mb-2">ВОЗМОЖНОСТИ</div>
                  {['Извлечение текста из документов', 'Проверка на запрещённый контент', 'Анализ структуры и содержания', 'Безопасное хранение в архиве'].map(f => (
                    <div key={f} className="mono-font text-xs text-gray-600 py-1 border-b border-gray-900">▸ {f}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SEARCH */}
          {section === 'search' && (
            <div className="p-6 animate-fade-in max-w-2xl">
              <div className="pixel-font text-xs text-white mb-6">БЕЗОПАСНЫЙ ПОИСК</div>

              <div className="flex gap-2 mb-2">
                <input
                  className="pixel-input"
                  placeholder="ПОИСКОВЫЙ ЗАПРОС..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doSearch()}
                />
                <button onClick={doSearch} className="pixel-btn px-4 shrink-0">ПОИСК</button>
              </div>

              <div className="flex items-center gap-2 mb-6">
                <span className="mono-font text-xs text-gray-600">Уровень фильтра:</span>
                <div className="tag-safe">{filterLevel === 'high' ? 'СТРОГИЙ' : filterLevel === 'medium' ? 'СРЕДНИЙ' : 'МЯГКИЙ'}</div>
                <button onClick={() => setSection('settings')} className="mono-font text-xs text-gray-700 hover:text-white underline">изменить</button>
              </div>

              {searchDone && (
                <div className="space-y-3 animate-fade-in">
                  <div className="pixel-font text-xs text-gray-600 mb-3">РЕЗУЛЬТАТЫ: {searchResults.length}</div>
                  {searchResults.map(r => (
                    <div key={r.id} className={`border-2 p-4 ${r.safe ? 'border-gray-700' : 'border-gray-800 opacity-50'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        {r.safe ? <div className="tag-safe">БЕЗОПАСНО</div> : <div className="tag-blocked">ЗАБЛОК</div>}
                        <span className="mono-font text-xs text-gray-500">{r.url}</span>
                      </div>
                      <div className="pixel-font text-xs mb-2 mt-2 text-white">{r.title}</div>
                      <div className="mono-font text-xs text-gray-500">{r.snippet}</div>
                    </div>
                  ))}
                </div>
              )}

              {!searchDone && (
                <div className="border border-gray-900 p-4">
                  <div className="pixel-font text-xs text-gray-700 mb-3">АКТИВНЫЕ ФИЛЬТРЫ</div>
                  {[
                    filterLevel !== 'low' ? 'Блокировка опасных запросов' : null,
                    filterLevel === 'high' ? 'Блокировка контента 18+' : null,
                    filterLevel === 'high' ? 'Блокировка нецензурной лексики' : null,
                  ].filter(Boolean).map(f => (
                    <div key={f as string} className="mono-font text-xs text-gray-600 py-1">■ {f}</div>
                  ))}
                  {filterLevel === 'low' && <div className="mono-font text-xs text-gray-700">Минимальная фильтрация активна</div>}
                </div>
              )}
            </div>
          )}

          {/* ARCHIVE */}
          {section === 'archive' && (
            <div className="p-6 animate-fade-in max-w-2xl">
              <div className="pixel-font text-xs text-white mb-6">АРХИВ ДИАЛОГОВ</div>
              <div className="space-y-4">
                {chats.map(chat => (
                  <div key={chat.id} className="border-2 border-gray-800 p-4">
                    <div className="flex justify-between items-center mb-3">
                      <span className="pixel-font text-xs">{chat.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="mono-font text-xs text-gray-600">{chat.date}</span>
                        <button
                          onClick={() => { setActiveChat(chat); setSection('chats'); }}
                          className="pixel-btn text-xs px-2 py-1"
                        >ОТКРЫТЬ</button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {chat.messages.map(msg => (
                        <div key={msg.id} className="flex items-start gap-2">
                          <span className="pixel-font text-xs text-gray-600 shrink-0 w-6">
                            {msg.role === 'user' ? 'USR' : 'SYS'}
                          </span>
                          <span className="mono-font text-xs text-gray-500 truncate">{msg.text.substring(0, 80)}</span>
                          {msg.blocked && <div className="tag-blocked shrink-0">!</div>}
                        </div>
                      ))}
                    </div>
                    <div className="mono-font text-xs text-gray-700 mt-3 pt-2 border-t border-gray-900">
                      СООБЩЕНИЙ: {chat.messages.length} | ЗАБЛОК: {chat.messages.filter(m => m.blocked).length}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {section === 'settings' && (
            <div className="p-6 animate-fade-in max-w-xl">
              <div className="pixel-font text-xs text-white mb-8">НАСТРОЙКИ СИСТЕМЫ</div>

              <div className="border-2 border-gray-800 p-5 mb-4">
                <div className="pixel-font text-xs text-gray-400 mb-4 pb-2 border-b border-gray-800">ФИЛЬТРАЦИЯ КОНТЕНТА</div>
                <div className="mb-4">
                  <div className="mono-font text-xs text-gray-500 mb-3">Уровень строгости:</div>
                  <div className="flex gap-2">
                    {(['low', 'medium', 'high'] as const).map(lvl => (
                      <button
                        key={lvl}
                        onClick={() => setFilterLevel(lvl)}
                        className={`pixel-btn flex-1 py-3 text-xs ${filterLevel === lvl ? 'pixel-btn-active' : ''}`}
                      >
                        {lvl === 'low' ? 'МЯГКИЙ' : lvl === 'medium' ? 'СРЕДНИЙ' : 'СТРОГИЙ'}
                      </button>
                    ))}
                  </div>
                  <div className="mono-font text-xs text-gray-600 mt-3 p-3 border border-gray-900">
                    {filterLevel === 'low' && '▸ Только блокировка опасных запросов'}
                    {filterLevel === 'medium' && '▸ Блокировка опасных запросов + нецензурных слов'}
                    {filterLevel === 'high' && '▸ Максимальная защита: опасные + 18+ + мат'}
                  </div>
                </div>
                <div className="space-y-2">
                  {[
                    { label: 'Блокировка нецензурной лексики', active: filterLevel !== 'low' },
                    { label: 'Блокировка контента 18+', active: filterLevel === 'high' },
                    { label: 'Блокировка опасных запросов', active: true },
                  ].map(item => (
                    <div key={item.label} className="flex justify-between items-center py-2 border-b border-gray-900">
                      <span className="mono-font text-xs text-gray-500">{item.label}</span>
                      <span className={`pixel-font text-xs ${item.active ? 'text-white' : 'text-gray-700'}`}>
                        {item.active ? '■ ВКЛ' : '□ ВЫКЛ'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-2 border-gray-800 p-5 mb-4">
                <div className="pixel-font text-xs text-gray-400 mb-4 pb-2 border-b border-gray-800">ЯЗЫК ИНТЕРФЕЙСА</div>
                <div className="flex gap-2">
                  {(['ru', 'en'] as const).map(lang => (
                    <button
                      key={lang}
                      onClick={() => setLanguage(lang)}
                      className={`pixel-btn flex-1 py-3 text-xs ${language === lang ? 'pixel-btn-active' : ''}`}
                    >
                      {lang === 'ru' ? 'РУССКИЙ' : 'ENGLISH'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-2 border-gray-800 p-5 mb-4">
                <div className="pixel-font text-xs text-gray-400 mb-4 pb-2 border-b border-gray-800">БЕЗОПАСНОСТЬ АККАУНТА</div>
                <div className="flex justify-between items-center py-2">
                  <span className="mono-font text-xs text-gray-500">Двухфакторная аутентификация</span>
                  <button
                    onClick={() => setTwoFactor(p => !p)}
                    className={`pixel-btn text-xs px-3 py-2 ${twoFactor ? 'pixel-btn-active' : ''}`}
                  >
                    {twoFactor ? '■ ВКЛ' : '□ ВЫКЛ'}
                  </button>
                </div>
                <div className="flex justify-between items-center py-2 border-t border-gray-900">
                  <span className="mono-font text-xs text-gray-500">Сменить пароль</span>
                  <button className="pixel-btn text-xs px-3 py-2">→ СМЕНИТЬ</button>
                </div>
                <div className="flex justify-between items-center py-2 border-t border-gray-900">
                  <span className="mono-font text-xs text-gray-500">Экспорт данных</span>
                  <button className="pixel-btn text-xs px-3 py-2">↓ ЭКСПОРТ</button>
                </div>
              </div>

              <div className="border-2 border-gray-800 p-5">
                <div className="pixel-font text-xs text-gray-400 mb-4 pb-2 border-b border-gray-800">ОТОБРАЖЕНИЕ</div>
                <div className="flex gap-2">
                  {(['dark', 'light'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={`pixel-btn flex-1 py-3 text-xs ${theme === t ? 'pixel-btn-active' : ''}`}
                    >
                      {t === 'dark' ? '◼ ТЁМНАЯ' : '◻ СВЕТЛАЯ'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Footer */}
      <footer className="border-t-2 border-gray-900 px-4 py-2 flex justify-between items-center">
        <div className="pixel-font text-xs text-gray-700">RM-XXXX_BETA v1.0</div>
        <div className="mono-font text-xs text-gray-700">
          ФИЛЬТР: {filterLevel.toUpperCase()} | ДИАЛОГОВ: {chats.length}
        </div>
      </footer>
    </div>
  );
}