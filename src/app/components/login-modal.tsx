'use client';

import React, { useState } from 'react';
import { X, Lock, Mail, User, ShieldCheck, Sparkles, ArrowRight } from 'lucide-react';
import { FairValueLogo } from '../page';

export interface UserSession {
  name: string;
  email: string;
  initials: string;
  isLoggedIn: boolean;
  role?: string;
  loginTime: string;
}

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (session: UserSession) => void;
}

export default function LoginModal({ isOpen, onClose, onLoginSuccess }: LoginModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Lütfen e-posta ve şifrenizi girin.');
      return;
    }

    if (mode === 'register' && !name) {
      setError('Lütfen adınızı ve soyadınızı girin.');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      const userName = mode === 'register' ? name : (name || email.split('@')[0]);
      const initials = userName
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'TR';

      const session: UserSession = {
        name: userName,
        email,
        initials,
        isLoggedIn: true,
        role: 'Bireysel Yatırımcı',
        loginTime: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      };

      try {
        localStorage.setItem('fair_value_user', JSON.stringify(session));
      } catch {}

      onLoginSuccess(session);
      onClose();
    }, 400);
  };

  const handleDemoLogin = () => {
    const demoSession: UserSession = {
      name: 'Aytaç Parmaksız',
      email: 'aytac@fairvalue.ai',
      initials: 'AP',
      isLoggedIn: true,
      role: 'Kıdemli Fon Yöneticisi',
      loginTime: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    };

    try {
      localStorage.setItem('fair_value_user', JSON.stringify(demoSession));
    } catch {}

    onLoginSuccess(demoSession);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md bg-[#161a22] border border-[#2e3440] rounded-2xl shadow-2xl overflow-hidden divide-y divide-[#282d37]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Başlık Çubuğu */}
        <div className="p-5 flex items-center justify-between bg-[#12151b]">
          <div className="flex items-center gap-3">
            <FairValueLogo className="w-6 h-6 text-emerald-400" />
            <div>
              <span className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                FAIR <span className="text-emerald-400">VALUE</span>
              </span>
              <p className="text-[11px] text-slate-400 font-mono">
                {mode === 'login' ? 'Yatırımcı Girişi' : 'Yeni Hesap Oluştur'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#21262d] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 p-1.5 bg-[#12151b] border-b border-[#282d37] text-xs font-semibold">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(null); }}
            className={`py-2 rounded-lg transition cursor-pointer ${
              mode === 'login'
                ? 'bg-[#21262d] text-white shadow-sm font-bold border border-[#2e3440]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Giriş Yap
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(null); }}
            className={`py-2 rounded-lg transition cursor-pointer ${
              mode === 'register'
                ? 'bg-[#21262d] text-white shadow-sm font-bold border border-[#2e3440]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Kayıt Ol
          </button>
        </div>

        {/* Giriş Formu */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {mode === 'register' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Ad Soyad
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Aytaç Parmaksız"
                  className="w-full bg-[#12151b] border border-[#2e3440] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              E-Posta Adresi
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="yatirimci@example.com"
                className="w-full bg-[#12151b] border border-[#2e3440] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-slate-300">
                Şifre
              </label>
              <span className="text-[11px] text-slate-500 hover:text-emerald-400 cursor-pointer transition">
                Şifremi Unuttum?
              </span>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#12151b] border border-[#2e3440] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0"
              />
              <span>Beni Hatırla</span>
            </label>
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> 256-bit SSL
            </span>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md mt-2"
          >
            <span>{isSubmitting ? 'Doğrulanıyor...' : (mode === 'login' ? 'Giriş Yap' : 'Hesabımı Oluştur')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          {/* Hızlı Demo Girişi */}
          <div className="pt-2 border-t border-[#282d37]">
            <button
              type="button"
              onClick={handleDemoLogin}
              className="w-full py-2 bg-[#21262d] hover:bg-[#2b313d] text-[#f5c242] rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border border-[#2e3440] cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Hızlı Demo Girişi (Tek Tıkla Dene)</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
