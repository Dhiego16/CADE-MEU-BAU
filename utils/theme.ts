import { ThemeTokens } from '../types';

export const buildTheme = (lightTheme: boolean): ThemeTokens => ({
  bg:          lightTheme ? 'bg-gray-100'            : 'bg-black',
  text:        lightTheme ? 'text-gray-900'           : 'text-white',
  card:        lightTheme ? 'bg-white border-gray-200'          : 'bg-slate-900 border-white/10',
  header:      lightTheme ? 'bg-white/90 border-gray-200'       : 'bg-slate-900/90 border-white/10',
  nav:         lightTheme ? 'bg-white border-gray-200 shadow-[0_-20px_60px_rgba(0,0,0,0.1)]' : 'bg-slate-900 border-white/10 shadow-[0_-20px_60px_rgba(0,0,0,1)]',
  input:       lightTheme ? 'bg-gray-100 border-gray-300 text-gray-900' : 'bg-black border-white/10 text-yellow-400',
  inputWrap:   lightTheme ? 'bg-white border-gray-200'          : 'bg-slate-900 border-white/5',
  subtext:     lightTheme ? 'text-gray-500'           : 'text-slate-500',
  divider:     lightTheme ? 'bg-gray-200'             : 'bg-white/5',
  inactiveNav: lightTheme ? 'text-gray-400'           : 'text-slate-600',
  timeCard1:   lightTheme ? 'bg-gray-100 border-gray-200'       : 'bg-black/60 border-white/5',
  timeCard2:   lightTheme ? 'bg-gray-50 border-gray-200'        : 'bg-black/30 border-white/5',
  destText:    lightTheme ? 'text-gray-900'           : 'text-white',
  stopBadge:   lightTheme ? 'text-gray-400'           : 'text-slate-600',
  historyBtn:  lightTheme ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-slate-800 border-white/10 text-yellow-400',
  saldoText:   lightTheme ? 'text-gray-900'           : 'text-white',
});
