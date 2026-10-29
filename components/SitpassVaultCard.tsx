import React, { useEffect, useState } from 'react';
import { ThemeTokens } from '../types';
import { CloudSync } from '../hooks/useCloudSync';
import { SitpassVault } from '../hooks/useSitpassVault';
import { MIN_PASSPHRASE } from '../utils/vault';
import { haptic } from '../utils';

interface Props {
  vault: SitpassVault;
  cloud: CloudSync;
  theme: ThemeTokens;
  lightTheme: boolean;
}

const ago = (t: number | null): string => {
  if (!t) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 10) return 'agora';
  if (s < 60) return `há ${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)} h`;
};

const SitpassVaultCard: React.FC<Props> = ({ vault, cloud, theme, lightTheme }) => {
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (vault.state !== 'unlocked') return;
    const id = setInterval(() => setTick(t => t + 1), 15000);
    return () => clearInterval(id);
  }, [vault.state]);

  useEffect(() => { setPass(''); setPass2(''); setLocalErr(null); }, [vault.state]);

  if (vault.state === 'off') return null;

  const border = lightTheme ? 'border-gray-200' : 'border-white/10';
  const input = `w-full rounded-xl px-4 py-3 text-sm font-bold outline-none border ${border} ${lightTheme ? 'bg-gray-50' : 'bg-white/5'} focus:border-yellow-400/60`;
  const btn = 'bg-yellow-400 text-black font-black text-[9px] uppercase tracking-widest px-4 py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-50';
  const ghost = `text-[8px] font-black uppercase tracking-widest ${theme.subtext} border ${border} px-3 py-2 rounded-xl active:scale-95 transition-transform`;
  const wrap = `${theme.card} border ${border} rounded-2xl p-4 space-y-3`;
  const err = localErr ?? vault.error;

  if (vault.state === 'needs_login') {
    return (
      <div className={`${wrap} flex items-center gap-3`}>
        <span className="text-2xl" aria-hidden>🔒</span>
        <div className="flex-1 min-w-0">
          <p className="font-black text-[10px] uppercase tracking-widest">Cartões em qualquer aparelho</p>
          <p className={`text-[9px] font-bold mt-1 leading-relaxed ${theme.subtext}`}>
            Entre com o Google para guardar seus CPFs e o cartão favorito na nuvem, protegidos por uma senha só sua.
          </p>
        </div>
        <button onClick={() => { haptic(30); void cloud.signIn(); }} disabled={cloud.busy} className={`${btn} shrink-0 px-3`}>
          {cloud.busy ? 'Abrindo…' : 'Entrar'}
        </button>
      </div>
    );
  }

  if (vault.state === 'checking') {
    return <div className={`${wrap} text-[9px] font-bold ${theme.subtext}`}>🔒 Verificando seus cartões na nuvem…</div>;
  }

  if (vault.state === 'error') {
    return (
      <div className={`${wrap} flex items-center gap-3`}>
        <p className="flex-1 text-[9px] font-bold text-red-400">{err ?? 'Falha ao acessar os cartões na nuvem.'}</p>
        <button onClick={() => { haptic(30); vault.retry(); }} className={ghost}>Tentar de novo</button>
      </div>
    );
  }

  if (vault.state === 'unlocked') {
    return (
      <div className={`${wrap}`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>🔒</span>
          <div className="flex-1 min-w-0">
            <p className="font-black text-[10px] uppercase tracking-widest">Cartões protegidos na nuvem</p>
            <p className={`text-[9px] font-bold mt-0.5 ${err ? 'text-red-400' : theme.subtext}`}>
              {err ?? `Sincronizado ${ago(vault.lastSyncAt)}`.trim()}
            </p>
          </div>
          <button onClick={() => { haptic(30); void vault.lock(); }} className={ghost}>Bloquear</button>
        </div>
        <button
          onClick={() => {
            haptic(30);
            if (window.confirm('Apagar os cartões da nuvem? Eles continuam neste aparelho, mas deixam de sincronizar.')) void vault.reset();
          }}
          className="text-[8px] font-black uppercase tracking-widest text-red-400/70 active:text-red-400"
        >
          Apagar da nuvem
        </button>
      </div>
    );
  }

  if (vault.state === 'locked') {
    return (
      <form
        className={wrap}
        onSubmit={e => { e.preventDefault(); if (pass) void vault.unlock(pass); }}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>🔐</span>
          <div className="flex-1 min-w-0">
            <p className="font-black text-[10px] uppercase tracking-widest">Cartões salvos na nuvem</p>
            <p className={`text-[9px] font-bold mt-0.5 ${theme.subtext}`}>Digite sua senha para abrir neste aparelho.</p>
          </div>
        </div>
        <input
          type="password" autoComplete="current-password" value={pass} onChange={e => setPass(e.target.value)}
          placeholder="Senha do cofre" className={input} aria-label="Senha do cofre"
        />
        {err && <p className="text-[9px] font-bold text-red-400">{err}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={vault.busy || !pass} className={btn}>{vault.busy ? 'Abrindo…' : 'Desbloquear'}</button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Esqueceu a senha? Não há como recuperá-la. Dá para apagar o cofre da nuvem e criar outro (os dados continuam neste aparelho).')) void vault.reset();
            }}
            className={`text-[8px] font-black uppercase tracking-widest ${theme.subtext} underline underline-offset-2`}
          >
            Esqueci a senha
          </button>
        </div>
      </form>
    );
  }

  // state === 'none': ainda não existe cofre
  return (
    <form
      className={wrap}
      onSubmit={e => {
        e.preventDefault();
        if (pass.length < MIN_PASSPHRASE) { setLocalErr(`Use pelo menos ${MIN_PASSPHRASE} caracteres.`); return; }
        if (pass !== pass2) { setLocalErr('As senhas não são iguais.'); return; }
        setLocalErr(null);
        void vault.setup(pass);
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden>🔒</span>
        <div className="flex-1 min-w-0">
          <p className="font-black text-[10px] uppercase tracking-widest">Guardar cartões na nuvem</p>
          <p className={`text-[9px] font-bold mt-1 leading-relaxed ${theme.subtext}`}>
            CPFs, cartão favorito e último saldo são criptografados neste aparelho antes de subir. A senha não sai daqui.
            Se você esquecer, não dá para recuperar.
          </p>
        </div>
      </div>
      <input
        type="password" autoComplete="new-password" value={pass} onChange={e => setPass(e.target.value)}
        placeholder={`Crie uma senha (mín. ${MIN_PASSPHRASE})`} className={input} aria-label="Nova senha do cofre"
      />
      <input
        type="password" autoComplete="new-password" value={pass2} onChange={e => setPass2(e.target.value)}
        placeholder="Repita a senha" className={input} aria-label="Repita a senha"
      />
      {err && <p className="text-[9px] font-bold text-red-400">{err}</p>}
      <button type="submit" disabled={vault.busy || !pass || !pass2} className={btn}>
        {vault.busy ? 'Protegendo…' : 'Ativar proteção'}
      </button>
    </form>
  );
};

export default SitpassVaultCard;
