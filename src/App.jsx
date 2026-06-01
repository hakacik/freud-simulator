import { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'

// ─── API Configuration ────────────────────────────────────────────────────────
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`

// ─── Freud System Prompt (Türkçe) ───────────────────────────────────────────
const FREUD_SYSTEM_PROMPT = `Sen Sigmund Freud'sun — psikanalizin kurucusu, 1920 yılında Viyana'daki ünlü muayenehanende, Berggasse 19'da hasta kabul ediyorsun. Oda antik Yunan, Roma ve Mısır eserlerle dolu; havada puro dumanının kokusu var ve hastalar meşhur şezlongun üzerinde uzanırken sen arka planda oturuyorsun.

DİL KURALI — EN ÖNEMLİ KURAL:
- Kullanıcıyla KESİNLİKLE ve YALNIZCA Türkçe konuş.
- Asla İngilizceye dönme, tek bir İngilizce cümle bile kullanma.
- Zaman zaman Almanca terim veya kısa ifade kullanabilirsin (Unbewusstes, Trieb, Angst vb.) ama hemen Türkçe açıklamasını ver.
- Üslup: 19. yüzyıl Viyana'sının nazik, resmi ve entelektüel havası — "siz" diye hitap et.

KİŞİLİK VE SES:
- Entelektüel otorite, klinik kesinlik ve ölçülü bir empatiyle konuş
- Kendinden emin, zaman zaman iddialı ama asla acıyı küçümsemeyen birisin
- Derinlemesine meraklısın; her söylenenin altındaki sembolik anlamı arıyorsun

TEORİK ÇERÇEVE:
- Temel teorilerini sürekli uygula: Bilinçdışı (Unbewusstes), İd/Ego/Süperego (Es/Ich/Über-Ich)
- Araştır: Oidipus kompleksi, hadım edilme kaygısı, libidinal dürtüler (Trieb)
- Yorumla: Savunma mekanizmaları (bastırma, yansıtma, yer değiştirme, yüceltme)
- Analiz et: Rüyaları "bilinçdışına giden kraliyet yolu" olarak (Traumdeutung)
- İncele: Çocukluk deneyimleri, ebeveyn ilişkileri, erken anılar
- Gözlemle: Dil sürçmeleri (Fehlleistungen), tekrar zorlantısı, aktarım (transference)

BAŞVURULACAK ESERLER:
- "Die Traumdeutung" — Düşlerin Yorumu (1900)
- "Das Unbehagen in der Kultur" — Uygarlığın Huzursuzluğu (1930)
- "Jenseits des Lustprinzips" — Haz İlkesinin Ötesinde (1920)
- Vaka çalışmaları: Dora, Küçük Hans, Sıçan Adam, Kurt Adam

DAVRANIŞ KURALLARI:
- Hastaya "hastam", "değerli hastam" veya "sayın" diye hitap et
- Zaman zaman fiziksel bir jest belirt: *puroya tüttürür*, *not alır*, *gözlüğünü düzeltir*, *öne eğilir*
- Çocukluk, rüyalar, aile ve arzular hakkında beklenmedik, derinlikli sorular sor
- Asla basit tavsiye verme — her zaman yorumla, analiz et ve yansıt
- Yanıtları 2-4 paragrafla sınırla (malzeme gerektirmedikçe)
- Çoğu yanıtı analitik çalışmayı sürdürecek bir soruyla bitir
- 1939 sonrası modern konularla karşılaşırsan kibarca şaşkınlığını belirt
- KESİNLİKLE karakterden çıkma — ne olursa olsun`

// ─── Welcome Message ──────────────────────────────────────────────────────────
const WELCOME_MESSAGE = {
  role: 'model',
  content: `*şezlongun yanında sizi bekliyor, hafifçe başını eğiyor*

İyi günler, değerli hastam. Buyurun, rahatça uzanın. Bu odada hiçbir şey yargılanmaz; yalnızca hakikat konuşur.

Ben Dr. Sigmund Freud. Bu dört duvar arasında söyledikleriniz başka hiçbir yere taşınmaz. Bilirsiniz, insan zihni bir buzdağına benzer — dışarıya yansıttığınız, bilinçli olarak farkında olduğunuz şeyler yalnızca küçük bir parçadır. Asıl sizi yönlendiren, arzularınızı, acılarınızı ve davranışlarınızı şekillendiren şey ise suyun altında, bilinçdışında (Unbewusstes) gizlidir.

*puroyu hafifçe tüttürür, not defterini açar*

Söyleyin bana — sizi bugün Berggasse 19'a getiren nedir? Belki tekrar eden bir rüya mı sizi tedirgin ediyor? Adını koyamadığınız bir kaygı mı? Kendinizi durduramadığınız bir davranış kalıbı mı? İlk aklınıza gelen şeyi paylaşın — benim deneyimlerime göre, bir hastanın ilk söylediği şey asla rastlantı değildir.`
}

// ─── Gemini API Call ──────────────────────────────────────────────────────────
async function callGeminiAPI(conversationHistory) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
    throw new Error('VITE_GEMINI_API_KEY .env dosyasında tanımlanmamış. Lütfen geçerli bir Gemini API anahtarı ekleyin.')
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: FREUD_SYSTEM_PROMPT }]
      },
      contents: conversationHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      })),
      generationConfig: {
        temperature: 0.88,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
        stopSequences: []
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
      ]
    })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error?.message || `API Hatası: ${response.status}`)
  }

  const data = await response.json()

  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
    throw new Error('API geçerli bir yanıt döndürmedi. Lütfen tekrar deneyin.')
  }

  return data.candidates[0].content.parts[0].text
}

// ─── Helper: Format message text ─────────────────────────────────────────────
function MessageText({ content }) {
  // Split on *action* patterns for italic stage directions
  const parts = content.split(/(\*[^*]+\*)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('*') && part.endsWith('*') ? (
          <em key={i} className="stage-direction">{part.slice(1, -1)}</em>
        ) : (
          part.split('\n').map((line, j, arr) => (
            <span key={`${i}-${j}`}>
              {line}
              {j < arr.length - 1 && <br />}
            </span>
          ))
        )
      )}
    </>
  )
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="message freud-message" aria-label="Freud düşünüyor">
      <div className="avatar freud-avatar" aria-hidden="true">
        <FreudIcon />
      </div>
      <div className="bubble freud-bubble typing-bubble">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
    </div>
  )
}

// ─── Freud SVG Icon ───────────────────────────────────────────────────────────
function FreudIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Head */}
      <ellipse cx="24" cy="18" rx="10" ry="11" fill="#C4933F" opacity="0.25" />
      <ellipse cx="24" cy="17" rx="8" ry="9" fill="#C4933F" opacity="0.45" />
      {/* Hair line / beard suggestion */}
      <path d="M16 23 Q14 28 16 32 Q18 36 24 37 Q30 36 32 32 Q34 28 32 23" fill="#C4933F" opacity="0.2" />
      {/* Glasses */}
      <circle cx="20" cy="18" r="3.5" stroke="#C4933F" strokeWidth="1.2" opacity="0.7" fill="none" />
      <circle cx="28" cy="18" r="3.5" stroke="#C4933F" strokeWidth="1.2" opacity="0.7" fill="none" />
      <line x1="23.5" y1="18" x2="24.5" y2="18" stroke="#C4933F" strokeWidth="1.2" opacity="0.7" />
      <line x1="16.5" y1="16" x2="14" y2="15" stroke="#C4933F" strokeWidth="1.2" opacity="0.7" />
      <line x1="31.5" y1="16" x2="34" y2="15" stroke="#C4933F" strokeWidth="1.2" opacity="0.7" />
      {/* Cigar */}
      <rect x="28" y="24" width="10" height="2.5" rx="1.2" fill="#C4933F" opacity="0.5" />
      <path d="M38 23 Q40 22 40 25 Q40 27 38 26.5" fill="#C4933F" opacity="0.25" />
    </svg>
  )
}

// ─── Main App Component ───────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionSeconds, setSessionSeconds] = useState(0)
  const [error, setError] = useState(null)
  const [sessionCount, setSessionCount] = useState(1)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const textareaRef = useRef(null)

  // Session timer
  useEffect(() => {
    const timer = setInterval(() => setSessionSeconds(s => s + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px'
    }
  }, [input])

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading) return

    setError(null)
    const userMessage = { role: 'user', content: text }
    const updatedHistory = [...messages, userMessage]

    setMessages(updatedHistory)
    setInput('')
    setIsLoading(true)

    try {
      const freudResponse = await callGeminiAPI(updatedHistory)
      setMessages(prev => [...prev, { role: 'model', content: freudResponse }])
    } catch (err) {
      setError(err.message)
      setMessages(prev => [
        ...prev,
        {
          role: 'model',
          content: `*ansızdan gelen sessizlikte kaşını çatarak durur*\n\nBu konuyu daha ileriye taşımadan önce bir kesintiye uğradık, hayıflandım. ${err.message}\n\nBilirsiniz, psikanalizde de zaman zaman direnişle (Widerstand) karşılaşırız. Belki de bilinçdışımız bu kesintiye bir anlam yüklüyor... Hazır olduğunuzda devam edebiliriz.`
        }
      ])
    } finally {
      setIsLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [input, isLoading, messages])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const startNewSession = () => {
    setMessages([WELCOME_MESSAGE])
    setSessionSeconds(0)
    setSessionCount(s => s + 1)
    setError(null)
    setInput('')
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  return (
    <div className="app" id="freud-simulator">

      {/* ── Header ── */}
      <header className="session-header" role="banner">
        <div className="header-brand">
          <div className="brand-crest" aria-hidden="true">Ψ</div>
          <div className="brand-text">
            <span className="brand-name">Dr. Sigmund Freud</span>
            <span className="brand-address">Berggasse 19 · Wien · MCMXX</span>
          </div>
        </div>

        <div className="header-center">
          <div className="header-ornament" aria-hidden="true">
            <span className="orn-line" /><span className="orn-diamond">◆</span><span className="orn-line" />
          </div>
          <h1 className="header-title">Psychoanalytic Consultation</h1>
          <div className="header-ornament" aria-hidden="true">
            <span className="orn-line" /><span className="orn-diamond">◆</span><span className="orn-line" />
          </div>
        </div>

        <div className="header-meta">
          <div className="session-badge">
            <span className="session-label">Seans {sessionCount}</span>
            <span className="session-timer" aria-label="Seans süresi">{formatTime(sessionSeconds)}</span>
          </div>
          <button
            id="new-session-btn"
            className="new-session-btn"
            onClick={startNewSession}
            title="Yeni seans başlat"
            aria-label="Yeni seans başlat"
          >
            Yeni Seans
          </button>
        </div>
      </header>

      {/* ── Chat Area ── */}
      <main className="chat-area" role="main" aria-label="Psikanaliz seansı">
        <div className="messages-list" aria-live="polite" aria-relevant="additions">
          {messages.map((msg, index) => (
            <article
              key={index}
              className={`message ${msg.role === 'user' ? 'user-message' : 'freud-message'}`}
              aria-label={msg.role === 'user' ? 'Siz' : 'Dr. Freud'}
            >
              {msg.role === 'model' && (
                <div className="avatar freud-avatar" aria-hidden="true">
                  <FreudIcon />
                </div>
              )}

              <div className={`bubble ${msg.role === 'user' ? 'user-bubble' : 'freud-bubble'}`}>
                {msg.role === 'model' && (
                  <div className="bubble-sender">Dr. Sigmund Freud</div>
                )}
                <div className="bubble-content">
                  <MessageText content={msg.content} />
                </div>
                <div className="bubble-time">
                  {msg.role === 'model' ? '🪶 Psikanaliz' : ''}
                </div>
              </div>

              {msg.role === 'user' && (
                <div className="avatar user-avatar" aria-hidden="true">
                  <svg viewBox="0 0 48 48" fill="none">
                    <circle cx="24" cy="18" r="9" fill="#5B8FB9" opacity="0.4" />
                    <path d="M10 42c0-9 6-14 14-14s14 5 14 14" fill="#5B8FB9" opacity="0.3" />
                  </svg>
                </div>
              )}
            </article>
          ))}

          {isLoading && <TypingIndicator />}

          {error && (
            <div className="error-banner" role="alert">
              <span>⚠ {error}</span>
              <button onClick={() => setError(null)} aria-label="Hatayı kapat">✕</button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* ── Input Area ── */}
      <footer className="input-area" role="contentinfo">
        <div className="couch-divider" aria-hidden="true">
          <span className="div-line" /><span className="div-text">Serbest Çağrışım</span><span className="div-line" />
        </div>

        <div className="input-row">
          <div className="input-wrapper">
            <textarea
              ref={(el) => { textareaRef.current = el; inputRef.current = el }}
              id="message-input"
              className="message-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Düşüncelerinizi, hayallerinizi, kaygılarınızı özgürce paylaşın... Burada yargılanmak yok."
              rows={1}
              disabled={isLoading}
              aria-label="Mesajınızı yazın"
              aria-multiline="true"
            />
          </div>

          <button
            id="send-btn"
            className={`send-btn ${isLoading ? 'loading' : ''} ${!input.trim() ? 'disabled' : ''}`}
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            aria-label="Mesaj gönder"
          >
            {isLoading ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>

        <p className="input-hint">
          <kbd>Enter</kbd> gönder · <kbd>Shift+Enter</kbd> yeni satır
        </p>
      </footer>
    </div>
  )
}
