import React from 'react';

const SplashScreen: React.FC = () => (
  <div className="h-screen w-screen bg-black flex flex-col items-center justify-center p-10 overflow-hidden text-center">
    <div className="relative mb-8 flex flex-col items-center scale-110">
      <div className="w-40 h-40 bg-yellow-400 rounded-[3rem] flex items-center justify-center shadow-[0_0_50px_rgba(251,191,36,0.4)] mb-8 transform rotate-[-5deg] overflow-hidden">
        <img
          src="/logo.png"
          alt="Cadê meu Baú"
          className="w-32 h-32 object-contain"
          onError={e => {
            e.currentTarget.style.display = 'none';
            e.currentTarget.parentElement!.innerHTML = '<span class="text-8xl">🚍</span>';
          }}
        />
      </div>
      <div className="bg-yellow-400 text-black px-6 py-2 font-black italic text-2xl skew-x-[-12deg] shadow-[8px_8px_0px_rgba(251,191,36,0.3)] uppercase tracking-tighter">
        Cadê meu Baú?
      </div>
    </div>
    <div className="w-48 h-2 bg-white/10 rounded-full overflow-hidden relative">
      <div className="absolute top-0 left-0 h-full bg-yellow-400 w-1/2 animate-[loading_1.5s_infinite_linear]" />
    </div>
    <p className="mt-6 text-[10px] font-black uppercase tracking-[0.5em] text-slate-500 animate-pulse">
      Rastreando Linhas...
    </p>
    <style>{`@keyframes loading { from { left: -50%; } to { left: 100%; } }`}</style>
  </div>
);

export default SplashScreen;
