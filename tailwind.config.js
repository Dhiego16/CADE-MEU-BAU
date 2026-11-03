/** @type {import('tailwindcss').Config} */
export default {
  // Lê as classes direto do código. Classes montadas por pedaços (`bg-${x}`) NÃO são
  // encontradas: use sempre a classe inteira (ex.: x ? 'bg-red-500' : 'bg-green-500').
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
    './types.ts',
    './constants.ts',
  ],
  theme: { extend: {} },
  plugins: [],
};
