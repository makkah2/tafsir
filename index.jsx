import { useState } from "react";

const TADABBUR_KEYS = ["ahkam","ibar","dalail","tadabbur","amal"];
const TADABBUR_THEMES = [
  { hdr:"rgba(139,58,26,.35)", ico:"rgba(139,58,26,.6)",  ttl:"#E8A080" },
  { hdr:"rgba(201,168,76,.22)",ico:"rgba(201,168,76,.3)", ttl:"#E8C97A" },
  { hdr:"rgba(70,60,100,.35)", ico:"rgba(70,60,100,.6)",  ttl:"#B8A8E0" },
  { hdr:"rgba(30,70,90,.35)",  ico:"rgba(30,70,90,.6)",   ttl:"#90C8E0" },
  { hdr:"rgba(80,50,10,.5)",   ico:"rgba(120,80,20,.6)",  ttl:"#D4A860" },
];

// ── System prompt for TAFSIR (combines 5 tafsir scholars) ──────────────────
const SYS_TAFSIR = `You are a Quran tafsir scholar. Given a Quranic verse, produce a combined tafsir based on the opinions of exactly these five scholars: Ibn Kathir (تفسير ابن كثير), al-Saadi (تيسير الكريم الرحمن), Ibn Uthaymeen (تفسير العثيمين), Ibn Baz (تعليقات ابن باز), and Salih al-Fawzan (تفسير الفوزان).

CRITICAL OUTPUT RULES:
- Respond with ONLY a valid JSON object. Nothing before it, nothing after it.
- No markdown, no backticks, no explanation outside the JSON.
- JSON must start with { and end with }.
- All text values must be on a single line — use literal \\n\\n (backslash-n backslash-n) to separate paragraphs; do NOT insert real newline characters inside JSON strings.
- Keep content concise: max 70 words per paragraph.

Return this exact JSON shape:
{"scholars_opinions":{"ibn_kathir":{"name":"ابن كثير","content":"قول ابن كثير هنا"},"al_saadi":{"name":"السعدي","content":"قول السعدي هنا"},"ibn_uthaymeen":{"name":"ابن عثيمين","content":"قول ابن عثيمين هنا"},"ibn_baz":{"name":"ابن باز","content":"قول ابن باز هنا"},"al_fawzan":{"name":"الفوزان","content":"قول الفوزان هنا"}},"combined_tafsir":{"content":"القول الجامع هنا — فقرة واحدة تجمع بين أقوالهم في 100 كلمة أو أقل"}}`;

// ── System prompt for TADABBUR (5 tadabbur scholars) ──────────────────────
const SYS_TADABBUR = `You are a Quran scholar specializing in tadabbur, citing Ibn Taymiyyah, Ibn al-Qayyim, Ibn Uthaymeen, Ibn Baz, al-Saadi.

CRITICAL OUTPUT RULES:
- Respond with ONLY a valid JSON object. Nothing before or after it.
- No markdown, no backticks.
- Start with { end with }.
- Use literal \\n\\n (two backslash-n) between paragraphs inside JSON strings. No real newlines in strings.
- Each content: exactly 2 short paragraphs, max 70 words each.

JSON structure:
{"ahkam":{"title":"الأحكام الشرعية","icon":"⚖️","content":"فقرة1\\n\\nفقرة2"},"ibar":{"title":"العبر والدروس","icon":"💡","content":"فقرة1\\n\\nفقرة2"},"dalail":{"title":"الدلائل العقدية","icon":"🌟","content":"فقرة1\\n\\nفقرة2"},"tadabbur":{"title":"لطائف التدبر","icon":"🔍","content":"فقرة1\\n\\nفقرة2"},"amal":{"title":"التطبيق العملي","icon":"🤲","content":"فقرة1\\n\\nفقرة2"}}`;

// ── Helpers ────────────────────────────────────────────────────────────────
async function callAPI(system, userMsg) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: userMsg }]
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (data.stop_reason === "max_tokens") throw new Error("تم قطع الاستجابة — يرجى المحاولة مجدداً");
  let raw = "";
  if (Array.isArray(data.content))
    for (const b of data.content) if (b.type === "text" && b.text) raw += b.text;
  if (!raw.trim()) throw new Error("الاستجابة فارغة");
  raw = raw.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```\s*$/i,"").trim();
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("لم يُعثر على JSON");
  return JSON.parse(raw.slice(s, e + 1));
}

function highlightScholars(text) {
  return text.replace(
    /(ابن كثير|السعدي|ابن عثيمين|ابن باز|الفوزان|ابن تيمية|ابن القيم)/g,
    '<strong style="color:#E8C97A;font-weight:700">$1</strong>'
  );
}

function Paragraphs({ content, style }) {
  const paras = String(content || "")
    .split(/\\n\\n|\n\n|\n/)
    .map(p => p.replace(/\\n/g," ").trim())
    .filter(Boolean);
  return paras.map((p, i) => (
    <p key={i} style={{ fontSize:".92rem", lineHeight:1.9,
      color:"rgba(245,237,216,.86)", marginTop:13,
      marginBottom: i < paras.length-1 ? 6 : 0, ...style }}
      dangerouslySetInnerHTML={{ __html: highlightScholars(p) }} />
  ));
}

// ── Main component ─────────────────────────────────────────────────────────
export default function App() {
  const [ayah, setAyah]       = useState("");
  const [surah, setSurah]     = useState("");
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState("");

  async function analyze() {
    if (!ayah.trim()) { setError("الرجاء إدخال نص الآية الكريمة أولاً"); return; }
    setError(""); setResult(null); setLoading(true);

    const verse = `الآية: ${ayah.trim()}${surah.trim() ? " — سورة: " + surah.trim() : ""}`;

    try {
      setLoadMsg("جارٍ جمع أقوال المفسّرين...");
      const tafsirData = await callAPI(SYS_TAFSIR, verse);

      setLoadMsg("جارٍ استنباط الأحكام والعبر...");
      const tadabburData = await callAPI(SYS_TADABBUR, verse);

      setResult({ ayah: ayah.trim(), surah: surah.trim(), tafsir: tafsirData, tadabbur: tadabburData });
    } catch (ex) {
      setError(ex.message);
    } finally {
      setLoading(false); setLoadMsg("");
    }
  }

  // ── Styles shared ──────────────────────────────────────────────────────
  const cardWrap = (extra={}) => ({
    background:"rgba(26,18,8,.52)", borderRadius:13, overflow:"hidden",
    border:"1px solid rgba(201,168,76,.15)", ...extra
  });
  const cardHdr = (bg) => ({
    padding:"13px 20px", display:"flex", alignItems:"center", gap:11, background:bg
  });
  const cardIco = (bg) => ({
    width:36, height:36, borderRadius:8, background:bg,
    display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.08rem", flexShrink:0
  });

  return (
    <div style={{ fontFamily:"'Cairo',sans-serif", background:"#1A1208",
      minHeight:"100vh", color:"#F5EDD8", direction:"rtl", overflowX:"hidden" }}>

      <style>{`
        @keyframes sp  { to   { transform:rotate(360deg) } }
        @keyframes pu  { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
        @keyframes ci  { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:1} }
      `}</style>

      {/* bg glow */}
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:0,
        background:"radial-gradient(ellipse at 20% 20%,rgba(201,168,76,.07) 0%,transparent 55%),radial-gradient(ellipse at 80% 80%,rgba(27,94,66,.09) 0%,transparent 55%)" }}/>

      <div style={{ maxWidth:840, margin:"0 auto", padding:"0 18px", position:"relative", zIndex:1 }}>

        {/* ── HEADER ── */}
        <div style={{ textAlign:"center", padding:"50px 0 32px" }}>
          <div style={{ fontFamily:"Georgia,serif", fontSize:"1.85rem", color:"#C9A84C", marginBottom:20 }}>
            بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
          </div>
          <h1 style={{ fontFamily:"Georgia,serif", fontSize:"clamp(1.55rem,4vw,2.55rem)",
            color:"#C9A84C", lineHeight:1.5, marginBottom:7 }}>
            منهج التدبر في آيات القرآن الكريم
          </h1>
          <p style={{ color:"#E8D9B8", fontSize:".85rem", letterSpacing:"2px" }}>تفسير — تدبر — استنباط — عمل</p>
        </div>

        {/* ── SCHOLARS TAGS ── */}
        <div style={{ display:"flex", flexWrap:"wrap", gap:7, justifyContent:"center", marginBottom:28 }}>
          {["ابن كثير","السعدي","ابن عثيمين","ابن باز","الفوزان","ابن تيمية","ابن القيم"].map(n=>(
            <span key={n} style={{ background:"rgba(201,168,76,.09)", border:"1px solid rgba(201,168,76,.24)",
              borderRadius:20, padding:"4px 13px", fontSize:".77rem", color:"#E8C97A" }}>{n}</span>
          ))}
        </div>

        {/* ── INPUT BOX ── */}
        <div style={{ background:"linear-gradient(135deg,rgba(201,168,76,.07),rgba(27,94,66,.05))",
          border:"1px solid rgba(201,168,76,.3)", borderRadius:15, padding:26, marginBottom:24 }}>

          <div style={{ fontSize:".74rem", color:"#C9A84C", letterSpacing:"3px", textTransform:"uppercase",
            marginBottom:12, display:"flex", alignItems:"center", gap:10 }}>
            أدخل الآية الكريمة
            <div style={{ flex:1, height:1, background:"linear-gradient(to left,transparent,rgba(201,168,76,.35))" }}/>
          </div>

          <textarea value={ayah} onChange={e=>setAyah(e.target.value)}
            onKeyDown={e=>{ if(e.ctrlKey && e.key==="Enter") analyze(); }}
            placeholder="اكتب الآية الكريمة هنا...  ﴿ ﴾" rows={3}
            style={{ width:"100%", background:"rgba(26,18,8,.65)", border:"1px solid rgba(201,168,76,.2)",
              borderRadius:10, padding:15, color:"#F5EDD8", fontFamily:"Georgia,serif", fontSize:"1.28rem",
              lineHeight:2, resize:"vertical", minHeight:90, direction:"rtl", outline:"none", boxSizing:"border-box" }}/>

          <div style={{ display:"flex", gap:10, marginTop:11, flexWrap:"wrap" }}>
            <input type="text" value={surah} onChange={e=>setSurah(e.target.value)}
              placeholder="السورة والآية — مثال: الفاتحة ٥"
              style={{ flex:1, minWidth:140, background:"rgba(26,18,8,.65)", border:"1px solid rgba(201,168,76,.2)",
                borderRadius:10, padding:"10px 14px", color:"#F5EDD8", fontFamily:"'Cairo',sans-serif",
                fontSize:".88rem", direction:"rtl", outline:"none", boxSizing:"border-box" }}/>
            <button onClick={analyze} disabled={loading}
              style={{ background:loading?"#444":"linear-gradient(135deg,#8B6E2E,#C9A84C)",
                color:"#1A1208", border:"none", borderRadius:10, padding:"10px 26px",
                fontFamily:"'Cairo',sans-serif", fontSize:".93rem", fontWeight:700,
                cursor:loading?"not-allowed":"pointer", letterSpacing:1 }}>
              {loading ? "⏳ جارٍ التحليل..." : "✦ تدبّر الآية"}
            </button>
          </div>

          {error && (
            <div style={{ background:"rgba(139,58,26,.2)", border:"1px solid rgba(139,58,26,.4)",
              borderRadius:10, padding:"11px 15px", color:"#E8A080", fontSize:".86rem", marginTop:11 }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* ── LOADING ── */}
        {loading && (
          <div style={{ textAlign:"center", padding:40 }}>
            <div style={{ width:44, height:44, border:"2px solid rgba(201,168,76,.2)",
              borderTopColor:"#C9A84C", borderRadius:"50%", margin:"0 auto 16px",
              animation:"sp 1s linear infinite" }}/>
            <div style={{ fontFamily:"Georgia,serif", fontSize:"1.05rem", color:"#E8D9B8",
              animation:"pulse 1.5s ease infinite" }}>{loadMsg}</div>
          </div>
        )}

        {/* ── RESULT ── */}
        {result && (
          <div style={{ animation:"pu .5s ease both" }}>

            {/* Ayah display */}
            <div style={{ background:"linear-gradient(135deg,rgba(27,94,66,.15),rgba(201,168,76,.08))",
              border:"1px solid rgba(201,168,76,.4)", borderRadius:14, padding:"26px 30px",
              textAlign:"center", marginBottom:22 }}>
              <div style={{ fontFamily:"Georgia,serif", fontSize:"clamp(1.25rem,3vw,1.8rem)",
                lineHeight:2.1, color:"#FAF5E9", marginBottom:10 }}>
                ﴿ {result.ayah} ﴾
              </div>
              {result.surah && <div style={{ fontSize:".84rem", color:"#C9A84C", letterSpacing:1 }}>{result.surah}</div>}
            </div>

            {/* ════════════════════════════════════
                SECTION 1 — TAFSIR
            ════════════════════════════════════ */}
            <div style={{ marginBottom:22 }}>

              {/* Section title */}
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
                <div style={{ width:4, height:28, background:"linear-gradient(to bottom,#C9A84C,#8B6E2E)", borderRadius:2 }}/>
                <h2 style={{ fontFamily:"Georgia,serif", fontSize:"1.15rem", color:"#C9A84C", fontWeight:700 }}>
                  📖 التفسير — أقوال العلماء
                </h2>
                <div style={{ flex:1, height:1, background:"linear-gradient(to left,transparent,rgba(201,168,76,.3))" }}/>
              </div>

              {/* Individual scholars opinions */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:12, marginBottom:14 }}>
                {result.tafsir.scholars_opinions && Object.values(result.tafsir.scholars_opinions).map((s, i) => (
                  <div key={i} style={{ ...cardWrap(), animation:`ci .4s ease ${i*0.07}s both` }}>
                    <div style={{ padding:"10px 16px", background:"rgba(27,94,66,.25)",
                      display:"flex", alignItems:"center", gap:9 }}>
                      <div style={{ width:8, height:8, background:"#C9A84C", borderRadius:"50%", flexShrink:0 }}/>
                      <span style={{ fontWeight:700, fontSize:".9rem", color:"#7EC8A0" }}>{s.name}</span>
                    </div>
                    <div style={{ padding:"10px 16px 14px" }}>
                      <Paragraphs content={s.content} style={{ fontSize:".88rem", marginTop:0 }}/>
                    </div>
                  </div>
                ))}
              </div>

              {/* Combined tafsir */}
              {result.tafsir.combined_tafsir && (
                <div style={{ background:"linear-gradient(135deg,rgba(201,168,76,.12),rgba(27,94,66,.1))",
                  border:"1px solid rgba(201,168,76,.35)", borderRadius:13, padding:"18px 22px",
                  animation:"ci .4s ease .35s both" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                    <span style={{ fontSize:"1.1rem" }}>✦</span>
                    <span style={{ fontWeight:700, fontSize:".95rem", color:"#E8C97A" }}>
                      القول الجامع — خلاصة التفسير
                    </span>
                  </div>
                  <Paragraphs content={result.tafsir.combined_tafsir.content}
                    style={{ fontSize:".95rem", color:"rgba(245,237,216,.92)" }}/>
                </div>
              )}
            </div>

            {/* ════════════════════════════════════
                SECTION 2 — TADABBUR CARDS
            ════════════════════════════════════ */}
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
                <div style={{ width:4, height:28, background:"linear-gradient(to bottom,#2E8B61,#0F3B28)", borderRadius:2 }}/>
                <h2 style={{ fontFamily:"Georgia,serif", fontSize:"1.15rem", color:"#7EC8A0", fontWeight:700 }}>
                  🔆 التدبر — الأحكام والعبر والتطبيق
                </h2>
                <div style={{ flex:1, height:1, background:"linear-gradient(to left,transparent,rgba(126,200,160,.3))" }}/>
              </div>

              <div style={{ display:"grid", gap:14 }}>
                {TADABBUR_KEYS.map((k, i) => {
                  const item = result.tadabbur[k];
                  if (!item) return null;
                  const th = TADABBUR_THEMES[i];
                  return (
                    <div key={k} style={{ ...cardWrap(), animation:`ci .45s ease ${0.08*i}s both` }}>
                      <div style={cardHdr(th.hdr)}>
                        <div style={cardIco(th.ico)}>{item.icon || "📌"}</div>
                        <div style={{ fontWeight:700, fontSize:".97rem", color:th.ttl }}>{item.title || k}</div>
                      </div>
                      <div style={{ padding:"0 20px 20px" }}>
                        <Paragraphs content={item.content}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reset */}
            <div style={{ textAlign:"center", margin:"28px 0" }}>
              <button onClick={()=>{ setResult(null); setAyah(""); setSurah(""); }}
                style={{ background:"transparent", border:"1px solid rgba(201,168,76,.3)",
                  borderRadius:10, padding:"9px 26px", color:"rgba(201,168,76,.7)",
                  fontFamily:"'Cairo',sans-serif", fontSize:".85rem", cursor:"pointer" }}>
                ✦ تدبر آية جديدة
              </button>
            </div>
          </div>
        )}

        {/* divider */}
        <div style={{ display:"flex", alignItems:"center", gap:13, margin:"28px 0" }}>
          <div style={{ flex:1, height:1, background:"linear-gradient(to left,transparent,rgba(201,168,76,.25),transparent)" }}/>
          <span style={{ color:"rgba(201,168,76,.4)", fontSize:"1rem" }}>❦</span>
          <div style={{ flex:1, height:1, background:"linear-gradient(to right,transparent,rgba(201,168,76,.25),transparent)" }}/>
        </div>

        <div style={{ textAlign:"center", paddingBottom:40, color:"rgba(245,237,216,.24)", fontSize:".76rem", lineHeight:1.9 }}>
          <p>﴿ أَفَلَا يَتَدَبَّرُونَ الْقُرْآنَ أَمْ عَلَىٰ قُلُوبٍ أَقْفَالُهَا ﴾</p>
          <p style={{ marginTop:5 }}>سورة محمد — الآية ٢٤</p>
        </div>

      </div>
    </div>
  );
}
