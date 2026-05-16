import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Shield, Zap, Globe, Copy, Check, Apple, Play, Github, ExternalLink, ArrowLeft, Infinity as InfinityIcon, Sparkles, ArrowRight, Link2, Smartphone, ShieldCheck } from "lucide-react";
import logo from "@/assets/aura-logo.png";
import { useReveal, useScrolled, useLenisScroll, useLiveUsers } from "@/hooks/use-aura-effects";
import { testimonials, type Testimonial as TestimonialItem } from "@/data/testimonials";

type SessionState = "active" | "expired" | "limit_exceeded";
type Screen = "welcome" | SessionState;

interface ApiResponse {
  state: SessionState;
  subscription_url: string;
  expires_at: string; // ISO
  attempts_left: number;
  retry_after_seconds: number;
}

const COOKIE_NAME = "aura_onb";
const TG_BOT = "https://t.me/AuraAccessPro_bot?start=onb";

// ---------- helpers ----------
function setCookie(name: string, value: string, hours: number) {
  if (typeof document === "undefined") return;
  const exp = new Date(Date.now() + hours * 3600 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax`;
}
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function formatHMS(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
function formatHM(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h} ч ${pad(m)} мин`;
}

// ---------- Platform detection ----------
type Platform = "ios" | "android" | "other";
function usePlatform(): Platform {
  const [p, setP] = useState<Platform>("other");
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) setP("ios");
    else if (/Android/i.test(ua)) setP("android");
  }, []);
  return p;
}

// ---------- Real API ----------
// Backend: subscription_server.py + onboarding_routes.py на 5.42:5001,
// проксируется через Cloudflare Tunnel на api-aura.trycloudflare.com (или свой домен).
// VITE_API_BASE задаётся в .env Cloudflare Pages.
const API_BASE = import.meta.env.VITE_API_BASE || "/api";

class ApiError extends Error {
  constructor(
    public state: string,
    public payload: Partial<ApiResponse> & { error?: string; message?: string },
    message?: string,
  ) {
    super(message ?? state);
  }
}

async function requestOnboarding(captchaToken: string | null): Promise<ApiResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (captchaToken) headers["x-captcha-token"] = captchaToken;

  const res = await fetch(`${API_BASE}/onboarding/request`, {
    method: "POST",
    headers,
    body: "{}",
    credentials: "include", // нужны cookies (aura_onb)
  });

  let body: Partial<ApiResponse> & { error?: string; message?: string };
  try {
    body = await res.json();
  } catch {
    throw new ApiError("network_error", {}, `HTTP ${res.status}`);
  }

  if (res.ok && body.state === "active") {
    return body as ApiResponse;
  }
  if (body.state === "limit_exceeded") {
    return {
      state: "limit_exceeded",
      subscription_url: "",
      expires_at: new Date().toISOString(),
      attempts_left: 0,
      retry_after_seconds: body.retry_after_seconds ?? 3600,
    };
  }
  throw new ApiError(
    body.state ?? body.error ?? "error",
    body,
    body.message ?? `HTTP ${res.status}`,
  );
}

async function tryCaptchaToken(): Promise<string | null> {
  // Cloudflare Turnstile (invisible mode). Грузится из index.html
  // (https://challenges.cloudflare.com/turnstile/v0/api.js). Если site_key
  // не задан в env — backend стоит passthrough, не дёргаем.
  const key = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  if (!key || !window.turnstile) return null;
  return new Promise((resolve) => {
    let container = document.getElementById("cf-turnstile-invisible");
    if (!container) {
      container = document.createElement("div");
      container.id = "cf-turnstile-invisible";
      container.style.position = "fixed";
      container.style.bottom = "-1000px";
      container.style.left = "-1000px";
      container.style.pointerEvents = "none";
      document.body.appendChild(container);
    }
    try {
      let widgetId: string | undefined;
      const cleanup = () => {
        try { if (widgetId && window.turnstile) window.turnstile.remove(widgetId); } catch {}
      };
      widgetId = window.turnstile.render(container, {
        sitekey: key,
        size: "invisible",
        callback: (token: string) => { cleanup(); resolve(token); },
        "error-callback": () => { cleanup(); resolve(null); },
        "expired-callback": () => { cleanup(); resolve(null); },
      });
      // Invisible widget auto-executes при render() — execute() явно не нужен.
      // Safety timeout 10s — если callback не вызвался.
      setTimeout(() => { cleanup(); resolve(null); }, 10000);
    } catch (err) {
      console.warn("[onboarding] turnstile failed:", err);
      resolve(null);
    }
  });
}

// ---------- Tick hook ----------
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

// ---------- Components ----------
function Logo({ size = 140 }: { size?: number }) {
  return (
    <div
      className="logo-orb glow-pulse select-none"
      style={{ width: size, height: size }}
    >
      <div className="logo-orb-halo" aria-hidden />
      <img
        src={logo}
        alt="Aura Access"
        width={size}
        height={size}
        draggable={false}
        className="logo-orb-img"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

function SilverButton({
  children,
  onClick,
  disabled,
  loading,
  className = "",
  magnetic = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  magnetic?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!magnetic) return;
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    if (window.matchMedia("(hover: none)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < 70) {
        el.style.transform = `translate(${dx * 0.03}px, ${dy * 0.03}px)`;
      } else {
        el.style.transform = "translate(0, 0)";
      }
    };
    const onLeave = () => { el.style.transform = "translate(0, 0)"; };
    window.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [magnetic]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) return;
    const btn = ref.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement("span");
      ripple.className = "ripple";
      const size = Math.max(rect.width, rect.height);
      ripple.style.width = ripple.style.height = size + "px";
      ripple.style.left = e.clientX - rect.left - size / 2 + "px";
      ripple.style.top = e.clientY - rect.top - size / 2 + "px";
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate(8); } catch {}
    }
    onClick?.();
  };
  return (
    <button
      ref={ref}
      onClick={handleClick}
      disabled={disabled || loading}
      className={`btn-silver magnetic relative overflow-hidden rounded-full px-10 py-4 text-base font-medium tracking-tight disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
    >
      {loading ? "Защищённое соединение..." : children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
  href,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
}) {
  const cls = `btn-ghost rounded-full px-8 py-3 text-sm font-medium tracking-tight ${className}`;
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {children}
      </a>
    );
  return (
    <button onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

function FeatureCard({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-white/5 bg-white/[0.015] p-6 backdrop-blur-sm">
      <Icon className="h-5 w-5 text-white/70" strokeWidth={1.5} />
      <div className="text-base font-medium text-white">{title}</div>
      <div className="text-sm font-light text-white/50">{desc}</div>
    </div>
  );
}

function Toast({ show, message = "Скопировано" }: { show: boolean; message?: string }) {
  return (
    <div
      className={`fixed left-1/2 top-8 z-50 -translate-x-1/2 transition-all duration-300 ${show ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"}`}
    >
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/80 px-4 py-2 text-sm text-white backdrop-blur-md">
        <Check className="h-4 w-4 text-emerald-400" strokeWidth={2} />
        {message}
      </div>
    </div>
  );
}

// ---------- Welcome ----------
function WelcomeScreen({ onRequest, loading, hasActive }: { onRequest: () => void; loading: boolean; hasActive: boolean }) {
  const heroRef = useRef<HTMLElement>(null);
  const handleMove = (e: React.MouseEvent) => {
    const el = heroRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div className="fade-up">
      <section
        ref={heroRef}
        onMouseMove={handleMove}
        className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6"
      >
        <div className="aurora" aria-hidden />
        <div className="spotlight" />
        <div className="relative flex flex-col items-center text-center max-w-2xl">
          <Logo size={120} />
          <h1 className="mt-12 text-5xl tracking-tight text-white sm:text-6xl lg:text-7xl">
            <span className="font-light">Безопасный интернет</span>
            <br />
            <span className="font-display-italic text-white/80">за 60 секунд</span>
          </h1>
          <p className="mt-6 text-lg font-light text-white/55 sm:text-xl">
            Защищённое соединение на 3 часа. Без регистрации, без логов, бесплатно.
          </p>

          <SocialProof />

          <div className="mt-10">
            <SilverButton onClick={onRequest} loading={loading} className="btn-silver-glow">
              {hasActive ? "Продолжить сессию" : "Получить доступ"}
            </SilverButton>
          </div>
          <div className="mt-5 flex items-center gap-1.5 text-xs font-light text-white/35">
            <Shield className="h-3 w-3" strokeWidth={1.5} />
            Защищено Yandex SmartCaptcha
          </div>
        </div>
      </section>

      <HowItWorks />

      <section className="relative px-6 pb-32">
        <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-3">
          <FeatureCard icon={Shield} title="Полное шифрование" desc="Никто не видит ваш трафик" />
          <FeatureCard icon={Zap} title="Мгновенно" desc="60 секунд от ссылки до подключения" />
          <FeatureCard icon={Globe} title="Без границ" desc="Доступ к любым сайтам мира" />
        </div>
      </section>

      <Testimonial />
    </div>
  );
}

// ---------- Social proof: live counter + avatars ----------
function SocialProof() {
  const count = useLiveUsers(245);
  const ref = useReveal<HTMLDivElement>();
  const avatarColors = [
    "from-emerald-400 to-cyan-500",
    "from-violet-400 to-fuchsia-500",
    "from-amber-300 to-orange-500",
    "from-sky-400 to-indigo-500",
  ];
  return (
    <div ref={ref} className="reveal mt-8 flex items-center gap-3">
      <div className="avatar-stack flex">
        {avatarColors.map((g, i) => (
          <div
            key={i}
            className={`h-7 w-7 rounded-full bg-gradient-to-br ${g} shadow-[0_0_12px_rgba(255,255,255,0.15)]`}
            aria-hidden
          />
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-xs font-light text-white/55">
        <span className="live-dot" />
        <span className="tabular-nums text-white/85">{count.toLocaleString("ru-RU")}</span>
        <span>сейчас защищены</span>
      </div>
    </div>
  );
}

// ---------- How it works: 3 steps with connecting line ----------
function HowItWorks() {
  const ref = useReveal<HTMLDivElement>();
  const steps = [
    { icon: ShieldCheck, title: "Получите ссылку", desc: "Один клик — и сервер выдаёт вам персональную защищённую подписку." },
    { icon: Smartphone, title: "Установите Karing", desc: "Бесплатное приложение для iOS, Android и десктопа." },
    { icon: Link2, title: "Активируйте", desc: "Вставьте ссылку в Karing и нажмите подключиться. Готово." },
  ];
  return (
    <section className="relative px-6 pb-24 pt-8">
      <div ref={ref} className="reveal mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/40">Процесс</div>
          <h2 className="mt-3 text-3xl tracking-tight text-white sm:text-4xl">
            <span className="font-light">Подключение</span>{" "}
            <span className="font-display-italic text-white/75">в три шага</span>
          </h2>
        </div>
        <div className="relative grid gap-10 md:grid-cols-3 md:gap-6">
          <div className="step-line-h hidden md:block" />
          {steps.map((s, i) => (
            <div key={i} className="relative flex flex-col items-center text-center">
              <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full border border-white/12 bg-black shadow-[0_0_30px_rgba(255,255,255,0.05)]">
                <s.icon className="h-5 w-5 text-white/75" strokeWidth={1.5} />
              </div>
              <div className="mt-2 text-[10px] uppercase tracking-[0.25em] text-white/35">Шаг {i + 1}</div>
              <div className="mt-2 text-base font-medium text-white">{s.title}</div>
              <p className="mt-2 max-w-xs text-sm font-light text-white/50">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- Single testimonial ----------
function Testimonial() {
  const ref = useReveal<HTMLDivElement>();
  const [items, setItems] = useState<TestimonialItem[]>(testimonials);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("aura_user_reviews");
      const userReviews: TestimonialItem[] = raw ? JSON.parse(raw) : [];
      if (Array.isArray(userReviews) && userReviews.length) {
        setItems([...userReviews, ...testimonials]);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % items.length), 7000);
    return () => clearInterval(id);
  }, [paused, items.length]);

  const t = items[idx % items.length];
  const next = () => setIdx((i) => (i + 1) % items.length);
  const prev = () => setIdx((i) => (i - 1 + items.length) % items.length);

  const handleSubmit = (text: string, name: string) => {
    const review: TestimonialItem = {
      name: name.trim() || "Аноним",
      city: "",
      text: text.trim(),
      hue: Math.floor(Math.random() * 360),
    };
    try {
      const raw = localStorage.getItem("aura_user_reviews");
      const userReviews: TestimonialItem[] = raw ? JSON.parse(raw) : [];
      const updated = [review, ...userReviews].slice(0, 50);
      localStorage.setItem("aura_user_reviews", JSON.stringify(updated));
      setItems([...updated, ...testimonials]);
      setIdx(0);
    } catch {}
    setFormOpen(false);
    setThanks(true);
    setTimeout(() => setThanks(false), 2400);
  };

  return (
    <section className="relative px-6 pb-32">
      <div ref={ref} className="reveal mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/40">Отзывы</div>
          <h2 className="mt-3 text-3xl tracking-tight text-white sm:text-4xl">
            <span className="font-light">Что говорят</span>{" "}
            <span className="font-display-italic text-white/75">пользователи</span>
          </h2>
        </div>

        <div
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          className="relative"
        >
          <figure
            key={idx}
            className="zoom-in relative rounded-3xl border border-white/8 bg-white/[0.015] p-8 sm:p-10 backdrop-blur-sm min-h-[260px] sm:min-h-[240px]"
          >
            <div className="absolute -top-4 left-8 select-none font-display text-6xl leading-none text-white/15">"</div>
            <blockquote className="font-display-italic text-lg leading-relaxed text-white/85 sm:text-xl">
              {t.text}
            </blockquote>
            <figcaption className="mt-6 flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-full shadow-[0_0_16px_rgba(255,255,255,0.08)]"
                style={{
                  background: `linear-gradient(135deg, hsl(${t.hue} 70% 65%), hsl(${(t.hue + 60) % 360} 70% 50%))`,
                }}
                aria-hidden
              />
              <div>
                <div className="text-sm font-medium text-white">{t.name}</div>
                <div className="text-xs font-light text-white/45">
                  {t.city || "Постоянный пользователь"}
                </div>
              </div>
            </figcaption>
          </figure>

          <div className="mt-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={prev}
                aria-label="Предыдущий отзыв"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] text-white/60 transition hover:border-white/25 hover:bg-white/[0.05] hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.6} />
              </button>
              <button
                onClick={next}
                aria-label="Следующий отзыв"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] text-white/60 transition hover:border-white/25 hover:bg-white/[0.05] hover:text-white"
              >
                <ArrowRight className="h-4 w-4" strokeWidth={1.6} />
              </button>
              <div className="ml-2 text-xs font-light tabular-nums text-white/40">
                {idx + 1} / {items.length}
              </div>
            </div>
            <button
              onClick={() => setFormOpen(true)}
              className="rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-xs font-medium text-white/80 transition hover:border-white/30 hover:bg-white/[0.06] hover:text-white"
            >
              Оставить отзыв
            </button>
          </div>
        </div>
      </div>

      <ReviewForm open={formOpen} onClose={() => setFormOpen(false)} onSubmit={handleSubmit} />
      <Toast show={thanks} message="Спасибо за отзыв" />
    </section>
  );
}

function ReviewForm({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (text: string, name: string) => void;
}) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setText("");
      setName("");
      setError("");
    }
  }, [open]);

  if (!open) return null;

  const handleSend = () => {
    const trimmed = text.trim();
    if (trimmed.length < 10) { setError("Минимум 10 символов"); return; }
    if (trimmed.length > 500) { setError("Максимум 500 символов"); return; }
    if (name.length > 40) { setError("Имя слишком длинное"); return; }
    onSubmit(trimmed, name.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0a0a0a] p-6 sm:p-8 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] zoom-in"
      >
        <div className="text-[11px] uppercase tracking-[0.25em] text-white/40">Поделитесь опытом</div>
        <h3 className="mt-2 text-xl font-light text-white">Оставить отзыв</h3>

        <div className="mt-5 space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 40))}
            placeholder="Имя (необязательно)"
            maxLength={40}
            className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition focus:border-white/30"
          />
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value.slice(0, 500)); if (error) setError(""); }}
            placeholder="Расскажите о вашем опыте..."
            rows={5}
            maxLength={500}
            className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition focus:border-white/30"
          />
          <div className="flex items-center justify-between text-[11px] font-light text-white/35">
            <span>{error || "Без регистрации, без email"}</span>
            <span className="tabular-nums">{text.length}/500</span>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-full px-4 py-2 text-sm font-light text-white/60 hover:text-white">
            Отмена
          </button>
          <button onClick={handleSend} className="btn-silver rounded-full px-6 py-2.5 text-sm font-medium tracking-tight">
            Отправить
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Active ----------
function ActiveScreen({
  data,
  onCopy,
}: {
  data: ApiResponse;
  onCopy: () => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const platform = usePlatform();
  const now = useNow(true);
  const remaining = Math.max(0, Math.floor((new Date(data.expires_at).getTime() - now) / 1000));
  const sessionNumber = 3 - data.attempts_left;

  const timerCls =
    remaining <= 600 ? "timer-critical" : remaining <= 1800 ? "timer-warn" : "text-white";

  useEffect(() => {
    QRCode.toDataURL(data.subscription_url, {
      margin: 1,
      width: 640,
      color: { dark: "#ffffff", light: "#00000000" },
    }).then(setQrDataUrl);
  }, [data.subscription_url]);

  const handleCopy = () => {
    onCopy();
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate(15); } catch {}
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const scrollToVideo = () => {
    document.getElementById("video-tutorial")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Order app store buttons by platform
  const stores = {
    ios: { href: "https://apps.apple.com/app/karing/id6472431552", icon: Apple, label: "App Store" },
    android: { href: "https://play.google.com/store/apps/details?id=com.nebula.karing", icon: Play, label: "Google Play" },
    other: { href: "https://github.com/KaringX/karing/releases/latest", icon: Github, label: "GitHub" },
  } as const;
  const primaryStore = platform === "ios" ? stores.ios : platform === "android" ? stores.android : null;
  const secondaryStores = primaryStore
    ? Object.entries(stores).filter(([k]) => k !== (platform === "ios" ? "ios" : "android"))
    : Object.entries(stores);

  const scrolled = useScrolled(220);

  return (
    <div className="relative fade-up">
      <div className="ambient-green pointer-events-none absolute inset-x-0 top-0 h-96" />

      {/* Sticky mini-header (appears after scroll) */}
      <div className={`sticky-mini ${scrolled ? "is-visible" : ""}`}>
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Logo size={26} />
            <span className="text-xs font-light uppercase tracking-[0.18em] text-white/55">Aura Access</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
            <span className="live-dot" />
            <span className={`font-mono text-xs tabular-nums ${timerCls}`}>{formatHMS(remaining)}</span>
          </div>
        </div>
      </div>

      <div className="relative mx-auto max-w-2xl px-6 py-20">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-emerald-400/80">
            <span className="live-dot" />
            Соединение готово
          </div>
          <div className="mt-6 text-xs uppercase tracking-[0.3em] text-white/40">Осталось</div>
          <div
            aria-live="polite"
            className={`mt-2 font-mono text-5xl font-extralight tabular-nums sm:text-6xl transition-colors duration-500 ${timerCls}`}
          >
            {formatHMS(remaining)}
          </div>
          <div className="mt-3 text-sm font-light italic text-white/40">
            Сеанс {sessionNumber} из 3 — у вас ещё {3 - sessionNumber} в запасе
          </div>
        </div>

        {/* Mobile: deep link CTA. Desktop: QR for cross-device scan */}
        <div className="mt-12 hidden sm:flex flex-col items-center">
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Subscription QR"
                className="qr-reveal h-[280px] w-[280px] sm:h-[320px] sm:w-[320px]"
              />
            ) : (
              <div className="skeleton-shimmer h-[280px] w-[280px] rounded-2xl sm:h-[320px] sm:w-[320px]" />
            )}
          </div>
          <div className="mt-3 text-xs font-light text-white/40">Отсканируйте телефоном</div>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:hidden">
          <a
            href={`karing://install-config?url=${encodeURIComponent(data.subscription_url)}&name=${encodeURIComponent("Aura 3h")}`}
            className="btn-silver flex items-center justify-center rounded-full px-8 py-4 text-base font-medium tracking-tight"
          >
            Открыть в Karing
          </a>
          <div className="text-center text-xs font-light text-white/40">
            Если Karing не открылся — скопируйте ссылку ниже
          </div>
        </div>

        <div className="mt-4 sm:mt-8 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] p-1.5 pl-4">
          <div className="flex-1 truncate font-mono text-xs text-white/60">
            {data.subscription_url}
          </div>
          <button
            onClick={handleCopy}
            aria-label="Скопировать ссылку подписки"
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium text-white transition-all duration-300 ${copied ? "copy-success" : "bg-white/10 hover:bg-white/15"}`}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" strokeWidth={2} />
                Скопировано
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" strokeWidth={1.8} />
                Скопировать
              </>
            )}
          </button>
        </div>

        <div className="mt-16 space-y-3">
          <StepCard step="1" title="Скачайте Karing">
            <div className="mt-4 flex flex-wrap gap-2">
              {primaryStore && (
                <GhostButton href={primaryStore.href} className="!border-white/30 !bg-white/5">
                  <span className="flex items-center gap-2">
                    <primaryStore.icon className="h-4 w-4" strokeWidth={1.5} />
                    {primaryStore.label}
                  </span>
                </GhostButton>
              )}
              {secondaryStores.map(([k, s]) => (
                <GhostButton key={k} href={s.href} className="opacity-60 hover:opacity-100">
                  <span className="flex items-center gap-2">
                    <s.icon className="h-4 w-4" strokeWidth={1.5} />
                    {s.label}
                  </span>
                </GhostButton>
              ))}
            </div>
          </StepCard>
          <StepCard step="2" title="При первом запуске: выберите Русский язык, согласитесь со всеми параметрами по умолчанию" />
          <StepCard step="3" title="Откройте Karing → '+' → 'Добавление подписки' → вставьте ссылку выше">
            <button
              onClick={scrollToVideo}
              className="mt-4 text-xs font-light text-white/50 underline-offset-4 hover:text-white hover:underline"
            >
              Не получается? Смотрите видео ↓
            </button>
          </StepCard>
          <StepCard step="4" title="Активируйте соединение" />
        </div>

        <div id="video-tutorial" className="mt-10 scroll-mt-20">
          <div className="mb-3 text-xs uppercase tracking-[0.25em] text-white/40">Видеоинструкция</div>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-2">
            <video
              src={`${import.meta.env.BASE_URL}video/karing-tutorial.mp4`}
              poster={`${import.meta.env.BASE_URL}video/karing-tutorial-poster.jpg`}
              controls
              playsInline
              preload="metadata"
              className="block w-full max-w-[360px] mx-auto rounded-xl"
            />
          </div>
          <div className="mt-3 text-center text-xs font-light text-white/40">
            Полная установка Karing и добавление подписки — 1:15
          </div>
        </div>

        <div className="mt-20">
          <a
            href={TG_BOT}
            target="_blank"
            rel="noreferrer"
            className="forever-card group relative block overflow-hidden rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/[0.08] via-white/[0.02] to-cyan-500/[0.06] p-8 sm:p-10 transition-all duration-500 hover:border-emerald-400/40 hover:from-emerald-500/[0.12] hover:to-cyan-500/[0.10]"
          >
            <div className="forever-glow pointer-events-none absolute -inset-px rounded-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl transition-all duration-700 group-hover:bg-emerald-400/20 group-hover:scale-110" />
            <div className="pointer-events-none absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl transition-all duration-700 group-hover:bg-cyan-400/20 group-hover:scale-110" />

            <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-5">
                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/10 text-emerald-300 shadow-[0_0_30px_rgba(16,185,129,0.15)] transition-all duration-500 group-hover:scale-110 group-hover:rotate-[-6deg] group-hover:shadow-[0_0_40px_rgba(16,185,129,0.35)]">
                  <InfinityIcon className="h-7 w-7" strokeWidth={1.5} />
                  <Sparkles className="absolute -right-1 -top-1 h-3.5 w-3.5 text-emerald-200 opacity-0 transition-all duration-500 group-hover:opacity-100 group-hover:rotate-12" />
                </div>
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-300">
                    <span className="live-dot h-1 w-1 rounded-full bg-emerald-400" />
                    Постоянный доступ
                  </div>
                  <h3 className="text-lg sm:text-xl font-light tracking-tight text-white">
                    Сохраните доступ навсегда
                  </h3>
                  <p className="max-w-xl text-sm font-light leading-relaxed text-white/55">
                    Установите Telegram через защищённое соединение и перейдите в{" "}
                    <span className="text-emerald-300/90">@AuraAccessPro_bot</span> — личный аккаунт без ограничений по времени.
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-2 max-w-xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-400/[0.06] px-3 py-1 text-[11px] font-medium text-amber-200/90">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300/60" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-300" />
                      </span>
                      30 дней бесплатно
                    </div>
                    <span className="text-[11px] font-light text-white/40">
                      Без карты · Оплата только если понравится
                    </span>
                  </div>
                  <p className="mt-2 max-w-xl text-xs font-light leading-relaxed text-white/45">
                    После активации в боте у вас есть <span className="text-white/75">30 дней полного доступа</span> для проверки скорости и стабильности.
                    Если всё устраивает — продлеваете подписку по желанию. Никаких авто-списаний и обязательств.
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2 self-stretch sm:self-auto">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-5 py-2.5 text-sm font-medium text-emerald-200 transition-all duration-300 group-hover:bg-emerald-500/20 group-hover:border-emerald-400/50">
                  Открыть бота
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              </div>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}

function StepCard({ step, title, children }: { step: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 text-xs font-light text-white/70">
          {step}
        </div>
        <div className="flex-1 text-sm font-light text-white/85">{title}</div>
      </div>
      {children}
    </div>
  );
}

// ---------- Expired ----------
function ExpiredScreen({ attemptsLeft, onRequest, loading }: { attemptsLeft: number; onRequest: () => void; loading: boolean }) {
  return (
    <div className="relative fade-up">
      <div className="ambient-amber pointer-events-none absolute inset-x-0 top-0 h-96" />
      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-amber-300/70">Сессия завершена</div>
        <h2 className="mt-6 text-4xl text-white sm:text-5xl"><span className="font-light">Сессия</span> <span className="font-display-italic text-white/80">завершена</span></h2>
        <p className="mt-4 text-lg font-light text-white/50">
          Ваши 3 часа защищённого соединения истекли.
        </p>
        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] px-8 py-6">
          <div className="text-xs uppercase tracking-[0.25em] text-white/40">Осталось попыток</div>
          <div className="mt-2 text-4xl font-extralight tabular-nums text-white">
            {attemptsLeft} <span className="text-base text-white/40">из 3</span>
          </div>
        </div>
        <div className="mt-10">
          <SilverButton onClick={onRequest} loading={loading}>
            Получить ещё 3 часа
          </SilverButton>
        </div>
        <a href={TG_BOT} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-1.5 text-sm font-light text-white/60 underline-offset-4 hover:text-white hover:underline">
          Уже установили Telegram? Откройте @AuraAccessPro_bot
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
        </a>
        <div className="mt-12 max-w-md text-sm font-light text-white/35">
          Используйте сегодняшнее время, чтобы установить Telegram и оформить постоянный доступ — там без ограничений.
        </div>
      </div>
    </div>
  );
}

// ---------- Limit ----------
function LimitScreen({ retryAfter }: { retryAfter: number }) {
  const start = useRef(Date.now());
  const now = useNow(true);
  const remaining = Math.max(0, retryAfter - Math.floor((now - start.current) / 1000));

  return (
    <div className="relative fade-up">
      <div className="ambient-rose pointer-events-none absolute inset-x-0 top-0 h-96" />
      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-rose-300/70">Лимит на сегодня</div>
        <h2 className="mt-6 text-4xl text-white sm:text-5xl"><span className="font-light">Лимит</span> <span className="font-display-italic text-white/80">на сегодня</span></h2>
        <p className="mt-4 text-lg font-light text-white/50">
          Получено 3 сеанса за последние 24 часа.
        </p>
        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] px-8 py-6">
          <div className="text-xs uppercase tracking-[0.25em] text-white/40">Следующая попытка через</div>
          <div className="mt-2 font-mono text-4xl font-extralight tabular-nums text-white">
            {formatHM(remaining)}
          </div>
        </div>
        <div className="mt-10">
          <a href={TG_BOT} target="_blank" rel="noreferrer">
            <SilverButton>Перейти в Telegram-бот</SilverButton>
          </a>
        </div>
        <div className="mt-8 text-xs font-light text-white/40">
          Постоянный доступ — от 100 ₽/мес. Без лимитов и таймеров.
        </div>
      </div>
    </div>
  );
}

// ---------- Dev state switcher ----------
function DevSwitcher({ current, set }: { current: Screen; set: (s: Screen) => void }) {
  const screens: { id: Screen; label: string }[] = [
    { id: "welcome", label: "W" },
    { id: "active", label: "A" },
    { id: "expired", label: "E" },
    { id: "limit_exceeded", label: "L" },
  ];
  const [open, setOpen] = useState(false);
  const labels: Record<Screen, string> = {
    welcome: "Welcome",
    active: "Active",
    expired: "Expired",
    limit_exceeded: "Limit",
  };
  return (
    <div className="fixed right-3 top-3 z-50 flex flex-col items-end gap-2 sm:right-4 sm:top-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-black/70 px-3 text-[10px] uppercase tracking-wider text-white/70 backdrop-blur-md transition hover:text-white"
        aria-label="Dev state switcher"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        DEV · {labels[current]}
      </button>
      {open && (
        <div className="flex gap-1 rounded-full border border-white/10 bg-black/70 p-1 backdrop-blur-md">
          {screens.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                set(s.id);
                setOpen(false);
              }}
              title={labels[s.id]}
              className={`h-7 w-7 rounded-full text-[10px] font-medium uppercase tracking-wider transition ${current === s.id ? "bg-white text-black" : "text-white/60 hover:bg-white/10 hover:text-white"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Root ----------
export default function AuraLanding() {
  useLenisScroll();
  const [screen, setScreen] = useState<Screen>("welcome");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [toast, setToast] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDev, setShowDev] = useState(false);

  // Restore session from cookie
  useEffect(() => {
    const raw = getCookie(COOKIE_NAME);
    if (raw) {
      try {
        const parsed: ApiResponse = JSON.parse(raw);
        if (parsed.state === "active" && new Date(parsed.expires_at).getTime() > Date.now()) {
          setData(parsed);
          setScreen("active");
        }
      } catch {}
    }
    if (typeof window === "undefined") return;

    // Activation: #dev in URL OR previously enabled in localStorage
    const fromHash = window.location.hash === "#dev";
    const fromStorage = localStorage.getItem("aura_dev") === "1";
    if (fromHash || fromStorage) {
      setShowDev(true);
      localStorage.setItem("aura_dev", "1");
    }

    // Hotkey: Shift+D toggles the dev switcher
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === "D" || e.key === "d") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
        setShowDev((v) => {
          const next = !v;
          if (next) localStorage.setItem("aura_dev", "1");
          else localStorage.removeItem("aura_dev");
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const requestAccess = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const captchaToken = await tryCaptchaToken();
      const parsed = await requestOnboarding(captchaToken);

      setData(parsed);
      setCookie(COOKIE_NAME, JSON.stringify(parsed), 3);
      setScreen(parsed.state);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.payload.message ?? err.message ?? "Не удалось получить доступ");
      } else {
        setError("Сервис временно недоступен. Попробуйте позже.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCopy = useCallback(() => {
    if (!data) return;
    navigator.clipboard.writeText(data.subscription_url).catch(() => {});
    setToast(true);
    setTimeout(() => setToast(false), 2000);
  }, [data]);

  // Dev switcher mocks
  const handleDevSwitch = (s: Screen) => {
    if (s === "welcome") {
      setData(null);
      setScreen("welcome");
      return;
    }
    if (s === "active") {
      const mock: ApiResponse = {
        state: "active",
        subscription_url: "https://onb.aura-access.duckdns.org/sub/onb/demo123abc456",
        expires_at: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
        attempts_left: 2,
        retry_after_seconds: 0,
      };
      setData(mock);
      setScreen("active");
      return;
    }
    if (s === "expired") {
      setData({
        state: "expired",
        subscription_url: "",
        expires_at: new Date().toISOString(),
        attempts_left: 1,
        retry_after_seconds: 0,
      });
      setScreen("expired");
      return;
    }
    if (s === "limit_exceeded") {
      setData({
        state: "limit_exceeded",
        subscription_url: "",
        expires_at: new Date().toISOString(),
        attempts_left: 0,
        retry_after_seconds: 19380,
      });
      setScreen("limit_exceeded");
    }
  };

  const hasActive = !!(data && data.state === "active" && new Date(data.expires_at).getTime() > Date.now());

  return (
    <main className="relative min-h-screen bg-black text-white">
      <div className="grain-overlay" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <Toast show={toast} />
      {error && (
        <div className="fixed left-1/2 top-8 z-50 -translate-x-1/2 max-w-md px-4">
          <div className="rounded-2xl border border-rose-400/30 bg-rose-950/60 px-5 py-3 text-sm text-rose-100 backdrop-blur-md">
            <div className="flex items-start justify-between gap-3">
              <div className="font-light">{error}</div>
              <button
                onClick={() => setError(null)}
                className="text-rose-100/60 hover:text-rose-100"
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}
      {screen === "active" && (
        <button
          onClick={() => setScreen("welcome")}
          className="fixed left-3 top-3 z-50 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/60 px-3 py-2 text-xs font-light text-white/70 backdrop-blur-md transition hover:border-white/20 hover:bg-black/80 hover:text-white sm:left-4 sm:top-4"
          aria-label="Назад"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
          Назад
        </button>
      )}
      {screen === "welcome" && <WelcomeScreen onRequest={hasActive ? () => setScreen("active") : requestAccess} loading={loading} hasActive={hasActive} />}
      {screen === "active" && data && <ActiveScreen data={data} onCopy={handleCopy} />}
      {screen === "expired" && (
        <ExpiredScreen attemptsLeft={data?.attempts_left ?? 1} onRequest={requestAccess} loading={loading} />
      )}
      {screen === "limit_exceeded" && (
        <LimitScreen retryAfter={data?.retry_after_seconds ?? 19380} />
      )}
      <Footer />
      {showDev && <DevSwitcher current={screen} set={handleDevSwitch} />}
    </main>
  );
}

function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/5 px-6 py-8 text-center">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-light text-white/35">
        <span className="inline-flex items-center gap-1.5">
          <Shield className="h-3 w-3" strokeWidth={1.5} />
          Без логов
        </span>
        <span className="text-white/15">·</span>
        <span>Без регистрации</span>
        <span className="text-white/15">·</span>
        <a href={TG_BOT} target="_blank" rel="noreferrer" className="hover:text-white/70 transition-colors">
          Поддержка
        </a>
        <span className="text-white/15">·</span>
        <span>© Aura Access 2026</span>
      </div>
    </footer>
  );
}
