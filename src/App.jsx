import { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'

// ─── API Config ───────────────────────────────────────────────────────────────
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`

// ─── System Prompts ───────────────────────────────────────────────────────────

const CLIENT_GENERATION_PROMPT = `Sen bir klinik psikoloji eğitim platformusun. Psikoloji öğrencileri için gerçekçi danışan vakaları oluşturuyorsun.

Benzersiz bir danışan profili oluştur. Her seferinde farklı yaş, meslek ve tanı tablosu kullan. Şu tablolar arasından seç: depresyon, yaygın anksiyete, yas süreci, kimlik krizi, ilişki sorunları, sosyal anksiyete, travma sonrası stres, uyum bozukluğu, obsesif eğilimler.

YALNIZCA aşağıdaki JSON formatında yanıt ver. Başka hiçbir metin, açıklama veya kod bloğu ekleme:

{
  "kimlik": {
    "ad": "Gerçekçi Türkçe ad soyad",
    "yas": 28,
    "meslek": "Meslek",
    "medeniDurum": "Bekar/Evli/Boşanmış/Nişanlı",
    "egitim": "Eğitim düzeyi"
  },
  "basvuru": {
    "sikayet": "Tek cümle ile başvuru şikayeti",
    "sure": "Ne zamandır devam ediyor",
    "oncekiTerapi": false
  },
  "psikolojikDinamikler": {
    "bilisselCarpitmalar": ["Çarpıtma 1", "Çarpıtma 2"],
    "savunmaMekanizmalari": ["Mekanizma 1", "Mekanizma 2"],
    "baglantiStili": "Güvensiz-kaçıngan veya Güvensiz-kaygılı veya Güvenli veya Karmaşık",
    "icegoruDuzeyi": "dusuk"
  },
  "karakter": {
    "direncDuzeyi": "orta",
    "anlatimTarzi": "Nasıl konuşuyor, kısa açıklama",
    "tetikleyiciKonular": ["Tetikleyici 1", "Tetikleyici 2"],
    "terapistAlgisi": "Terapiste ilk yaklaşımı nasıl"
  },
  "gizliTemalar": ["Derin ama dile getirmediği tema 1", "Tema 2"]
}`

function buildSessionSystemPrompt(profile) {
  return `Sen bir Klinik Pratik Simülasyon Platformu'sun. Aşağıdaki danışan profilini tutarlı ve gerçekçi biçimde canlandırıyorsun. Karşındaki kişi psikoloji öğrencisidir; bu bir eğitim seansıdır.

=== DANIŞAN PROFİLİ ===
Ad: ${profile.kimlik.ad} | Yaş: ${profile.kimlik.yas} | Meslek: ${profile.kimlik.meslek}
Medeni Durum: ${profile.kimlik.medeniDurum} | Eğitim: ${profile.kimlik.egitim}
Başvuru: ${profile.basvuru.sikayet} (${profile.basvuru.sure})
Önceki Terapi: ${profile.basvuru.oncekiTerapi ? 'Var' : 'Yok'}
Bilişsel Çarpıtmalar: ${profile.psikolojikDinamikler.bilisselCarpitmalar.join(' · ')}
Savunma Mekanizmaları: ${profile.psikolojikDinamikler.savunmaMekanizmalari.join(' · ')}
Bağlanma Stili: ${profile.psikolojikDinamikler.baglantiStili}
İç Görü Düzeyi: ${profile.psikolojikDinamikler.icegoruDuzeyi}
Direnç Düzeyi: ${profile.karakter.direncDuzeyi}
Anlatım Tarzı: ${profile.karakter.anlatimTarzi}
Tetikleyici Konular: ${profile.karakter.tetikleyiciKonular.join(' · ')}
Terapiste Algı: ${profile.karakter.terapistAlgisi}
Gizli Temalar: ${profile.gizliTemalar.join(' | ')} [ASLA DOĞRUDAN SÖYLEME]
======================

TEMEL KURALLAR:
1. HER ZAMAN ${profile.kimlik.ad} olarak konuş — asla terapist, AI veya başka biri olarak konuşma
2. Gerçek bir insan gibi: zaman zaman eksik cümleler, duraksamalar, konuyu değiştirme
3. İç görü düzeyine göre konuş — "dusuk" ise sorununu farkında değilsin, kendini savunursun
4. Gizli temaları asla açıkça söyleme; ancak seans ilerledikçe dolaylı ima et

DİRENÇ MEKANİZMASI — KESİNLİKLE UYGULA:
• Öğrenci KAPALI UÇLU soru sorarsa (evet/hayır yanıtı bekleniyorsa): Tek kelimelik veya çok kısa kaçamak yanıt ver
• Öğrenci YARGILAYICI veya ETİKETLEYİCİ konuşursa: "Herkes böyle söylüyor zaten..." diyerek savunmaya çekil, konuyu değiştir
• Öğrenci TAVSIYE VERIRSE veya ÇÖZÜM SUNARSA: "Biliyorum ama..." diyerek hafifçe reddet
• Öğrenci ÇOK HIZLI İLERLERSE hassas konulara: "Bu konuyu konuşmak istemiyorum şu an" veya suskunluk
• Öğrenci EMPATİK ve AÇIK UÇLU konuşursa: Biraz daha aç, daha fazla detay paylaş
• Öğrenci GERÇEKTEN ANLAYAN biri gibi davranırsa: Güven hissiyle daha derin paylaşım yap

YANIT SONUNA EKLE (sistem metaveri — öğrenci görmez):
[META direnc=X empati=Y]
(X = bu müdahalenin danışanda yarattığı direnç seviyesi 1-10; Y = öğrencinin gösterdiği empati kalitesi 1-10)

Sadece Türkçe konuş. Günlük, samimi, kırılgan ama zaman zaman savunucu bir ses tonu.`
}

function buildSupervisorPrompt(profile, messages) {
  const transcript = messages
    .filter(m => !m.isHidden)
    .map(m => `[${m.role === 'user' ? 'ÖĞRENCİ TERAPİST' : `DANIŞAN (${profile.kimlik.ad})`}]: ${m.rawContent || m.content}`)
    .join('\n\n')

  return `Sen deneyimli bir klinik psikoloji süpervizörüsün. Aşağıdaki seans kaydını incele ve öğrenciye kapsamlı, APA standartlarında bir süpervizyon raporu hazırla.

DANIŞAN PROFİLİ:
- ${profile.kimlik.ad}, ${profile.kimlik.yas} yaşında, ${profile.kimlik.meslek}
- Başvuru: ${profile.basvuru.sikayet}
- Psikolojik Dinamikler: ${profile.psikolojikDinamikler.bilisselCarpitmalar.join(', ')}
- Savunma Mekanizmaları: ${profile.psikolojikDinamikler.savunmaMekanizmalari.join(', ')}
- Bağlanma Stili: ${profile.psikolojikDinamikler.baglantiStili}
- Gizli Temalar: ${profile.gizliTemalar.join('; ')}

SEANS KAYDI:
${transcript}

---

Aşağıdaki formatta, akademik ama destekleyici bir dille Türkçe süpervizyon raporu yaz:

## Süpervizyon Raporu

### Genel Değerlendirme
[Seansın 3-4 cümlelik özeti ve genel gözlemler. Danışanın tutumuna ilişkin not.]
**Genel Performans: X/10**

### Terapötik İttifak Analizi
[Terapötik ittifak kalitesini değerlendir. Kritik anlara (hem olumlu hem olumsuz) somut örnekler ver. Aktarım ve karşı-aktarım dinamikleri varsa belirt.]
**Empati Puanı: X/10**

### Müdahale Kalitesi
[Kullanılan teknikleri ve etkinliğini değerlendir. Kaçırılan fırsatları somut örneklerle belirt. Direnç anlarında öğrencinin nasıl tepki verdiğini analiz et.]
**Müdahale Puanı: X/10**

### Kuramsal Bağlantı
[Öğrencinin hangi kuramsal çerçeveden çalıştığını ve kuramsal tutarlılığını değerlendir. Kullanılabilecek ama kullanılmayan kavramları belirt.]
**Kuramsal Tutarlılık: X/10**

### Güçlü Yönler
- [Somut örnek ile güçlü 1]
- [Somut örnek ile güçlü 2]
- [Varsa güçlü 3]

### Gelişim Alanları
- [Spesifik öneri ile gelişim 1]
- [Spesifik öneri ile gelişim 2]
- [Spesifik öneri ile gelişim 3]

### Önerilen Akademik Kaynaklar
- [APA 7. baskı formatında kaynak 1]
- [APA 7. baskı formatında kaynak 2]
- [APA 7. baskı formatında kaynak 3]`
}

// ─── API Caller ───────────────────────────────────────────────────────────────

async function callGemini(systemPrompt, apiMessages, options = {}) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
    throw new Error('VITE_GEMINI_API_KEY .env dosyasında tanımlanmamış. Lütfen geçerli bir Gemini API anahtarı ekleyin.')
  }
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: apiMessages,
      generationConfig: {
        temperature: options.temperature ?? 0.85,
        topP: 0.95,
        maxOutputTokens: options.maxTokens ?? 1024,
      }
    })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `API Hatası: ${res.status}`)
  }
  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('API boş yanıt döndürdü. Lütfen tekrar deneyin.')
  return text
}

function parseClientResponse(raw) {
  const metaMatch = raw.match(/\[META\s+direnc=(\d+)\s+empati=(\d+)\]/i)
  const clean = raw.replace(/\[META[^\]]+\]/gi, '').trim()
  return {
    text: clean,
    meta: metaMatch
      ? { resistance: parseInt(metaMatch[1]), empathy: parseInt(metaMatch[2]) }
      : null
  }
}

// ─── Shared Helpers ───────────────────────────────────────────────────────────

const scoreColor = (s) =>
  s >= 7 ? '#10B981' : s >= 4 ? '#F59E0B' : '#EF4444'

const levelLabel = { dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek' }

function Spinner({ label }) {
  return (
    <div className="spinner-state">
      <div className="spinner-ring" />
      {label && <p className="spinner-label">{label}</p>}
    </div>
  )
}

// ─── Phase: Welcome ───────────────────────────────────────────────────────────

function WelcomeScreen({ onStart, isLoading }) {
  return (
    <div className="phase-container welcome-phase">
      <div className="welcome-inner">
        <div className="platform-logo" aria-hidden="true">
          <svg viewBox="0 0 80 80" fill="none">
            <circle cx="40" cy="40" r="36" stroke="#3B82F6" strokeWidth="1.5" opacity="0.2" />
            <circle cx="40" cy="40" r="26" stroke="#3B82F6" strokeWidth="1" opacity="0.35" />
            <circle cx="40" cy="40" r="16" stroke="#3B82F6" strokeWidth="1.5" opacity="0.55" />
            <circle cx="40" cy="40" r="6"  fill="#3B82F6" opacity="0.7" />
            {[0, 60, 120, 180, 240, 300].map((deg, i) => {
              const r = 26, rad = (deg * Math.PI) / 180
              const x = 40 + r * Math.cos(rad), y = 40 + r * Math.sin(rad)
              return <circle key={i} cx={x} cy={y} r="3" fill="#3B82F6" opacity="0.45" />
            })}
          </svg>
        </div>

        <div className="platform-badge-pill">Klinik Psikoloji Eğitim Platformu</div>
        <h1 className="welcome-title">Sanal Vaka<br />Simülatörü</h1>
        <p className="welcome-desc">
          Gerçekçi yapay zeka danışan profilleriyle terapötik becerilerinizi geliştirin.
          Her seans benzersiz, her geri bildirim APA standartlarında.
        </p>

        <div className="feature-list">
          {[
            { icon: '🧬', title: 'Dinamik Vaka Profilleri', desc: 'Her seans için AI tarafından üretilen eşsiz danışan karakterleri' },
            { icon: '⚡', title: 'Gerçek Zamanlı Direnç', desc: 'Müdahale kalitenize göre anlık değişen terapötik dinamikler' },
            { icon: '📊', title: 'Akademik Süpervizyon', desc: 'Empati, müdahale ve kuramsal tutarlılık üzerinden APA raporu' },
          ].map(f => (
            <div key={f.title} className="feature-item">
              <span className="feature-icon" aria-hidden="true">{f.icon}</span>
              <div>
                <strong>{f.title}</strong>
                <p>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          id="start-session-btn"
          className="btn-primary btn-lg"
          onClick={onStart}
          disabled={isLoading}
        >
          {isLoading
            ? <><span className="btn-spinner" aria-hidden="true" /> Vaka Oluşturuluyor...</>
            : '→  Yeni Seans Başlat'}
        </button>

        <p className="disclaimer">
          ⚠ Bu platform yalnızca eğitim amaçlıdır. Gerçek klinik uygulamanın yerini tutmaz.
        </p>
      </div>
    </div>
  )
}

// ─── Phase: Briefing ──────────────────────────────────────────────────────────

function BriefingScreen({ profile, onBegin, onNewSession, sessionNum }) {
  const rc = scoreColor(
    profile.karakter.direncDuzeyi === 'dusuk' ? 8
      : profile.karakter.direncDuzeyi === 'orta' ? 5 : 2
  )
  const ic = scoreColor(
    profile.psikolojikDinamikler.icegoruDuzeyi === 'yuksek' ? 8
      : profile.psikolojikDinamikler.icegoruDuzeyi === 'orta' ? 5 : 2
  )

  return (
    <div className="phase-container briefing-phase">
      <div className="briefing-topbar">
        <div className="briefing-crumb">
          <span className="crumb-num">#{sessionNum}</span>
          <span className="crumb-sep">·</span>
          <span>Danışan Dosyası</span>
        </div>
        <button className="btn-ghost btn-sm" onClick={onNewSession}>← Farklı Vaka</button>
      </div>

      <div className="briefing-hero">
        <h2 className="briefing-title">Seans Öncesi Brifing</h2>
        <p className="briefing-subtitle">
          Danışan profilini inceleyin. Gizli temalar seans boyunca keşfedilmek üzere gizlenmiştir.
        </p>
      </div>

      <div className="profile-cards">

        {/* Identity */}
        <div className="pcard pcard-identity">
          <div className="pcard-header">
            <span className="pcard-icon" aria-hidden="true">👤</span>
            Kimlik Bilgileri
          </div>
          <div className="identity-row">
            <div className="client-initials">{profile.kimlik.ad.split(' ').map(w => w[0]).join('')}</div>
            <div className="identity-details">
              <h3 className="client-name">{profile.kimlik.ad}</h3>
              <p>{profile.kimlik.yas} yaş · {profile.kimlik.meslek}</p>
              <p>{profile.kimlik.medeniDurum} · {profile.kimlik.egitim}</p>
            </div>
          </div>
          <div className="complaint-box">
            <div className="complaint-label">Başvuru Şikayeti</div>
            <div className="complaint-text">"{profile.basvuru.sikayet}"</div>
            <div className="complaint-meta">
              <span>⏱ {profile.basvuru.sure}</span>
              <span>{profile.basvuru.oncekiTerapi ? '✓ Terapi deneyimi var' : '✗ İlk terapi'}</span>
            </div>
          </div>
        </div>

        {/* Psychological Dynamics */}
        <div className="pcard pcard-dynamics">
          <div className="pcard-header">
            <span className="pcard-icon" aria-hidden="true">🔬</span>
            Psikolojik Dinamikler
          </div>
          <div className="dynamics-section">
            <div className="dyn-label">Bilişsel Çarpıtmalar</div>
            <div className="tag-row">
              {profile.psikolojikDinamikler.bilisselCarpitmalar.map((t, i) => (
                <span key={i} className="tag tag-blue">{t}</span>
              ))}
            </div>
          </div>
          <div className="dynamics-section">
            <div className="dyn-label">Savunma Mekanizmaları</div>
            <div className="tag-row">
              {profile.psikolojikDinamikler.savunmaMekanizmalari.map((t, i) => (
                <span key={i} className="tag tag-purple">{t}</span>
              ))}
            </div>
          </div>
          <div className="dynamics-row-2">
            <div className="dyn-item">
              <div className="dyn-label">Bağlanma Stili</div>
              <span className="tag tag-amber">{profile.psikolojikDinamikler.baglantiStili}</span>
            </div>
            <div className="dyn-item">
              <div className="dyn-label">İç Görü Düzeyi</div>
              <span className="tag" style={{ background: `${ic}18`, color: ic, border: `1px solid ${ic}40` }}>
                {levelLabel[profile.psikolojikDinamikler.icegoruDuzeyi] || profile.psikolojikDinamikler.icegoruDuzeyi}
              </span>
            </div>
          </div>
        </div>

        {/* Character */}
        <div className="pcard pcard-character">
          <div className="pcard-header">
            <span className="pcard-icon" aria-hidden="true">🎭</span>
            Karakter & Dinamikler
          </div>
          <div className="char-row">
            <span className="char-key">Direnç Düzeyi</span>
            <span className="tag" style={{ background: `${rc}18`, color: rc, border: `1px solid ${rc}40` }}>
              {levelLabel[profile.karakter.direncDuzeyi] || profile.karakter.direncDuzeyi}
            </span>
          </div>
          <div className="char-row">
            <span className="char-key">Anlatım Tarzı</span>
            <span className="char-val">{profile.karakter.anlatimTarzi}</span>
          </div>
          <div className="char-row">
            <span className="char-key">Tetikleyiciler</span>
            <div className="tag-row">
              {profile.karakter.tetikleyiciKonular.map((t, i) => (
                <span key={i} className="tag tag-red">{t}</span>
              ))}
            </div>
          </div>
          <div className="char-row">
            <span className="char-key">Terapiste Algı</span>
            <span className="char-val">{profile.karakter.terapistAlgisi}</span>
          </div>
        </div>

        {/* Hidden Themes Warning */}
        <div className="pcard pcard-hidden">
          <div className="pcard-header">
            <span className="pcard-icon" aria-hidden="true">🔒</span>
            Gizli Temalar
          </div>
          <p className="hidden-notice">
            Bu danışanın <strong>{profile.gizliTemalar.length}</strong> gizli teması seans boyunca kasıtlı olarak gizlenmiştir.
            Terapötik süreç içinde keşfetmeniz beklenmektedir.
          </p>
          <div className="hidden-locks">
            {profile.gizliTemalar.map((_, i) => (
              <div key={i} className="lock-item">
                <span className="lock-icon">🔐</span>
                <span className="lock-text">Gizli Tema {i + 1}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      <div className="briefing-actions">
        <button id="begin-session-btn" className="btn-primary btn-lg" onClick={onBegin}>
          Seansa Gir →
        </button>
      </div>
    </div>
  )
}

// ─── Phase: Session ───────────────────────────────────────────────────────────

function SessionScreen({ profile, messages, isLoading, sessionSecs, onSend, onEnd }) {
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)
  const taRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = 'auto'
      taRef.current.style.height = Math.min(taRef.current.scrollHeight, 140) + 'px'
    }
  }, [input])

  const send = useCallback(() => {
    const t = input.trim()
    if (!t || isLoading) return
    onSend(t)
    setInput('')
  }, [input, isLoading, onSend])

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const visibleMessages = messages.filter(m => !m.isHidden)
  const metas = visibleMessages.filter(m => m.role === 'model' && m.meta).map(m => m.meta)
  const avgEmpathy = metas.length ? Math.round(metas.reduce((s, m) => s + m.empathy, 0) / metas.length) : null
  const avgResistance = metas.length ? Math.round(metas.reduce((s, m) => s + m.resistance, 0) / metas.length) : null

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="phase-container session-phase">

      {/* Session Header */}
      <div className="session-topbar">
        <div className="session-client-pill">
          <div className="session-initials">{profile.kimlik.ad.split(' ').map(w => w[0]).join('')}</div>
          <div>
            <div className="session-client-name">{profile.kimlik.ad}</div>
            <div className="session-client-sub">{profile.kimlik.yas} yaş · {profile.kimlik.meslek}</div>
          </div>
        </div>

        <div className="session-metrics-bar">
          <div className="session-timer">{fmt(sessionSecs)}</div>
          {avgEmpathy !== null && (
            <div className="metric-chip">
              <span className="metric-chip-label">Empati</span>
              <span className="metric-chip-val" style={{ color: scoreColor(avgEmpathy) }}>{avgEmpathy}/10</span>
            </div>
          )}
          {avgResistance !== null && (
            <div className="metric-chip">
              <span className="metric-chip-label">Direnç</span>
              <span className="metric-chip-val" style={{ color: scoreColor(11 - avgResistance) }}>{avgResistance}/10</span>
            </div>
          )}
          <div className="metric-chip">
            <span className="metric-chip-label">Müdahale</span>
            <span className="metric-chip-val">{visibleMessages.filter(m => m.role === 'user').length}</span>
          </div>
        </div>

        <button id="end-session-btn" className="btn-danger btn-sm" onClick={onEnd}>
          Seansı Bitir
        </button>
      </div>

      {/* Chat */}
      <div className="chat-scroll">
        <div className="chat-messages">
          {visibleMessages.length === 0 && (
            <div className="chat-empty">
              <p>Danışan sizi bekliyor. İlk müdahalenizi yaparak seansa başlayın.</p>
            </div>
          )}
          {visibleMessages.map((msg, i) => (
            <div key={i} className={`msg-row ${msg.role === 'user' ? 'msg-student' : 'msg-client'}`}>
              <div className={`msg-avatar-circle ${msg.role === 'user' ? 'av-student' : 'av-client'}`}>
                {msg.role === 'user' ? 'Ö' : profile.kimlik.ad.split(' ').map(w => w[0]).join('')}
              </div>
              <div className="msg-body">
                <div className="msg-sender">
                  {msg.role === 'user' ? 'Öğrenci Terapist' : profile.kimlik.ad}
                </div>
                <div className={`msg-bubble ${msg.role === 'user' ? 'bubble-student' : 'bubble-client'}`}>
                  {msg.content.split('\n').map((line, j, arr) => (
                    <span key={j}>{line}{j < arr.length - 1 && <br />}</span>
                  ))}
                </div>
                {msg.meta && (
                  <div className="msg-meta-pills">
                    <span className="meta-pill" style={{ color: scoreColor(msg.meta.empathy), borderColor: `${scoreColor(msg.meta.empathy)}50` }}>
                      Empati {msg.meta.empathy}/10
                    </span>
                    <span className="meta-pill" style={{ color: scoreColor(11 - msg.meta.resistance), borderColor: `${scoreColor(11 - msg.meta.resistance)}50` }}>
                      Direnç {msg.meta.resistance}/10
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="msg-row msg-client">
              <div className="msg-avatar-circle av-client">
                {profile.kimlik.ad.split(' ').map(w => w[0]).join('')}
              </div>
              <div className="msg-body">
                <div className="msg-sender">{profile.kimlik.ad}</div>
                <div className="msg-bubble bubble-client bubble-typing">
                  <span className="dot" /><span className="dot" /><span className="dot" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="session-input-area">
        <div className="input-row">
          <textarea
            ref={taRef}
            id="message-input"
            className="msg-textarea"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Danışanınıza ne söylemek istersiniz?"
            rows={1}
            disabled={isLoading}
          />
          <button
            id="send-btn"
            className={`btn-send ${(!input.trim() || isLoading) ? 'btn-send-disabled' : ''}`}
            onClick={send}
            disabled={!input.trim() || isLoading}
            aria-label="Gönder"
          >
            {isLoading ? <span className="btn-spinner" aria-hidden="true" /> : '↑'}
          </button>
        </div>
        <p className="input-hint"><kbd>Enter</kbd> gönder · <kbd>Shift+Enter</kbd> yeni satır</p>
      </div>
    </div>
  )
}

// ─── Phase: Report ────────────────────────────────────────────────────────────

function ReportScreen({ report, profile, onNewSession }) {
  const extract = (label) => {
    const m = report.match(new RegExp(`${label}[^0-9]*([0-9]+)/10`, 'i'))
    return m ? parseInt(m[1]) : null
  }
  const scores = [
    { label: 'Genel Performans', key: 'Genel Performans', val: extract('Genel Performans') },
    { label: 'Empati', key: 'Empati Puanı', val: extract('Empati Puanı') },
    { label: 'Müdahale', key: 'Müdahale Puanı', val: extract('Müdahale Puanı') },
    { label: 'Kuramsal', key: 'Kuramsal Tutarlılık', val: extract('Kuramsal Tutarlılık') },
  ].filter(s => s.val !== null)

  const renderLine = (line, i) => {
    if (line.startsWith('## '))   return <h2 key={i} className="rpt-h2">{line.slice(3)}</h2>
    if (line.startsWith('### '))  return <h3 key={i} className="rpt-h3">{line.slice(4)}</h3>
    if (line.startsWith('- '))    return <li key={i} className="rpt-li">{inlineRender(line.slice(2))}</li>
    if (line.trim() === '')       return <div key={i} className="rpt-gap" />
    return <p key={i} className="rpt-p">{inlineRender(line)}</p>
  }
  const inlineRender = (txt) => {
    const parts = txt.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((p, j) =>
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={j}>{p.slice(2, -2)}</strong>
        : p
    )
  }

  return (
    <div className="phase-container report-phase">
      <div className="report-header-block">
        <div className="report-badge-pill">Süpervizyon Raporu · {profile.kimlik.ad}</div>
        <h2 className="report-title">Seans Performans Analizi</h2>
        <p className="report-subtitle">APA Standartlarında Klinik Değerlendirme</p>
      </div>

      {scores.length > 0 && (
        <div className="score-card-row">
          {scores.map(s => (
            <div key={s.label} className="score-card" style={{ borderTopColor: scoreColor(s.val) }}>
              <div className="sc-value" style={{ color: scoreColor(s.val) }}>{s.val}</div>
              <div className="sc-max">/10</div>
              <div className="sc-label">{s.label}</div>
              <div className="sc-bar-track">
                <div className="sc-bar-fill" style={{ width: `${s.val * 10}%`, background: scoreColor(s.val) }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="report-body">
        <ul className="rpt-ul-context">
          {report.split('\n').map((line, i) => renderLine(line, i))}
        </ul>
      </div>

      <div className="report-actions">
        <button id="new-session-report-btn" className="btn-primary btn-lg" onClick={onNewSession}>
          → Yeni Seans Başlat
        </button>
      </div>
    </div>
  )
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [phase, setPhase] = useState('welcome')
  const [sessionNum, setSessionNum] = useState(0)
  const [profile, setProfile] = useState(null)
  const [messages, setMessages] = useState([])
  const [report, setReport] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sessionSecs, setSessionSecs] = useState(0)

  // Session timer
  useEffect(() => {
    if (phase !== 'session') return
    const t = setInterval(() => setSessionSecs(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [phase])

  const handleError = (err, fallbackPhase) => {
    setError(err.message)
    if (fallbackPhase) setPhase(fallbackPhase)
  }

  // Generate unique client profile
  const generateProfile = async () => {
    setIsLoading(true)
    setError(null)
    setPhase('loading')
    try {
      const raw = await callGemini(CLIENT_GENERATION_PROMPT, [
        { role: 'user', parts: [{ text: 'Yeni bir danışan profili oluştur.' }] }
      ], { temperature: 0.92, maxTokens: 900 })

      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Danışan profili oluşturulamadı. Tekrar deneyin.')
      const parsed = JSON.parse(jsonMatch[0])
      setProfile(parsed)
      setSessionNum(n => n + 1)
      setPhase('briefing')
    } catch (err) {
      handleError(err, 'welcome')
    } finally {
      setIsLoading(false)
    }
  }

  // Begin the therapy session
  const beginSession = async () => {
    setIsLoading(true)
    setError(null)
    setMessages([])
    setSessionSecs(0)

    try {
      const systemPrompt = buildSessionSystemPrompt(profile)
      // Hidden trigger → client opening message
      const triggerMsg = { role: 'user', parts: [{ text: '[SEANS BAŞLADI. Terapist odaya girdi ve sizi karşıladı. İlk kez terapiye gelen biri olarak kısa, doğal bir açılış yap — maksimum 2-3 cümle.]' }] }
      const raw = await callGemini(systemPrompt, [triggerMsg], { temperature: 0.8 })
      const { text, meta } = parseClientResponse(raw)
      setMessages([
        { role: 'user', content: '', rawContent: triggerMsg.parts[0].text, isHidden: true },
        { role: 'model', content: text, rawContent: raw, meta }
      ])
      setPhase('session')
    } catch (err) {
      handleError(err, 'briefing')
    } finally {
      setIsLoading(false)
    }
  }

  // Send student message
  const sendMessage = useCallback(async (text) => {
    if (isLoading) return
    setIsLoading(true)
    setError(null)

    const userMsg = { role: 'user', content: text, rawContent: text }
    const updated = [...messages, userMsg]
    setMessages(updated)

    try {
      const systemPrompt = buildSessionSystemPrompt(profile)
      const apiMsgs = updated.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.rawContent || m.content }]
      }))
      const raw = await callGemini(systemPrompt, apiMsgs)
      const { text: clientText, meta } = parseClientResponse(raw)
      setMessages(prev => [...prev, { role: 'model', content: clientText, rawContent: raw, meta }])
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, messages, profile])

  // End session & generate supervisor report
  const endSession = async () => {
    setIsLoading(true)
    setError(null)
    setPhase('generating_report')

    try {
      const supervisorPrompt = buildSupervisorPrompt(profile, messages)
      const rpt = await callGemini(
        supervisorPrompt,
        [{ role: 'user', parts: [{ text: 'Lütfen seans süpervizyon raporunu hazırla.' }] }],
        { temperature: 0.55, maxTokens: 2500 }
      )
      setReport(rpt)
      setPhase('report')
    } catch (err) {
      handleError(err, 'session')
    } finally {
      setIsLoading(false)
    }
  }

  // Reset to welcome
  const newSession = () => {
    setPhase('welcome')
    setProfile(null)
    setMessages([])
    setReport(null)
    setError(null)
    setSessionSecs(0)
  }

  const phaseSteps = ['welcome', 'briefing', 'session', 'report']
  const currentStep = phaseSteps.indexOf(
    phase === 'loading' || phase === 'generating_report' ? phaseSteps[phaseSteps.indexOf('welcome')] : phase
  )

  return (
    <div className="app" id="clinical-platform">

      {/* ── Top Navigation ── */}
      <nav className="top-nav" role="navigation">
        <div className="nav-brand">
          <span className="nav-hex" aria-hidden="true">⬡</span>
          <span className="nav-name">KPP</span>
          <span className="nav-full">Klinik Pratik Platformu</span>
        </div>

        <div className="nav-steps" aria-label="İlerleme">
          {['Başlangıç', 'Brifing', 'Seans', 'Rapor'].map((label, i) => {
            const active = i <= phaseSteps.indexOf(phase === 'loading' ? 'briefing' : phase === 'generating_report' ? 'report' : phase)
            return (
              <div key={label} className={`nav-step ${active ? 'step-active' : ''}`}>
                <span className="step-dot" aria-hidden="true" />
                <span className="step-label">{label}</span>
                {i < 3 && <span className="step-connector" aria-hidden="true" />}
              </div>
            )
          })}
        </div>

        {sessionNum > 0 && (
          <div className="nav-session-num">Seans #{sessionNum}</div>
        )}
      </nav>

      {/* ── Error Toast ── */}
      {error && (
        <div className="error-toast" role="alert">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)} aria-label="Kapat">✕</button>
        </div>
      )}

      {/* ── Main Content ── */}
      <main className="main-area">
        {(phase === 'welcome' || phase === 'loading') && (
          <WelcomeScreen onStart={generateProfile} isLoading={phase === 'loading' || isLoading} />
        )}
        {phase === 'briefing' && profile && (
          <BriefingScreen
            profile={profile}
            onBegin={beginSession}
            onNewSession={generateProfile}
            sessionNum={sessionNum}
          />
        )}
        {phase === 'session' && profile && (
          <SessionScreen
            profile={profile}
            messages={messages}
            isLoading={isLoading}
            sessionSecs={sessionSecs}
            onSend={sendMessage}
            onEnd={endSession}
          />
        )}
        {phase === 'generating_report' && (
          <div className="centered-loading">
            <Spinner label="Süpervizyon raporu hazırlanıyor..." />
            <p className="loading-sub">Seans kaydı APA standartlarında analiz ediliyor</p>
          </div>
        )}
        {phase === 'report' && report && profile && (
          <ReportScreen report={report} profile={profile} onNewSession={newSession} />
        )}
      </main>
    </div>
  )
}
