import React from 'react';
import { ThemeTokens } from '../../types';
import { haptic } from '../../utils';

interface OnboardingModalProps {
  step: number;
  lightTheme: boolean;
  theme: ThemeTokens;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onFinish: () => void;
}

const STEPS = [
  {
    icon: '/localizacao.png',
    title: 'Bem-vindo ao Cadê meu Baú!',
    desc: 'Consulte em segundos quando o seu ônibus chega em qualquer ponto de Goiânia.',
    tip: null,
  },
  {
    icon: '/informacao.png',
    title: 'Encontre o número do ponto',
    desc: 'O número está na plaquinha fixada no poste do ponto de ônibus.',
    tip: 'Geralmente tem 5 dígitos. Ex: 31700, 42150',
  },
  {
    icon: '/buscar.png',
    title: 'Digite e busque',
    desc: 'Cole o número no campo "Número do Ponto" e toque em Localizar Baú.',
    tip: 'Os dados atualizam sozinhos a cada 20 segundos!',
  },
  {
    icon: '/favorito.png',
    title: 'Salve seus favoritos',
    desc: 'Toque na estrela de uma linha para salvá-la. Na próxima vez ela já aparece atualizada.',
    tip: 'Segure o dedo num card salvo para dar um apelido a ele.',
  },
];

const OnboardingModal: React.FC<OnboardingModalProps> = ({
  step, lightTheme, theme, onNext, onBack, onSkip, onFinish,
}) => {
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 bg-black/90 z-[200] flex items-end justify-center p-4"
      style={{ animation: 'slideUp 0.3s ease-out' }}
    >
      <div className={`${theme.card} border w-full max-w-sm rounded-[2rem] p-6 space-y-5`}>
        <div className="flex justify-center gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-yellow-400' : 'w-1.5 bg-white/20'}`}
            />
          ))}
        </div>

        <div className="text-center space-y-3">
          <img src={current.icon} alt="" className="mx-auto" style={{ width: 64, height: 64, objectFit: 'contain' }} />
          <p className="font-black text-lg uppercase tracking-tight text-white leading-tight">
            {current.title}
          </p>
          <p className={`text-sm ${theme.subtext} leading-relaxed`}>{current.desc}</p>
          {current.tip && (
            <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-2xl px-4 py-3">
              <p className="text-[11px] font-bold text-yellow-400 leading-relaxed">{current.tip}</p>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={onBack}
              className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border ${theme.subtext} ${lightTheme ? 'border-gray-300' : 'border-white/10'}`}
            >
              Voltar
            </button>
          )}
          <button
            onClick={() => {
              if (isLast) { onFinish(); haptic(50); }
              else { onNext(); haptic(30); }
            }}
            className="flex-1 bg-yellow-400 text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-transform"
          >
            {isLast ? 'Vamos lá!' : 'Próximo →'}
          </button>
        </div>

        {!isLast && (
          <button
            onClick={onSkip}
            className={`w-full text-center text-[9px] font-black uppercase tracking-widest ${theme.subtext} opacity-40`}
          >
            Pular tutorial
          </button>
        )}
      </div>
    </div>
  );
};

export default OnboardingModal;
