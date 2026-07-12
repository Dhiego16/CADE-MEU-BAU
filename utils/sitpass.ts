// ── Tarifa RMTC — atualizar manualmente quando mudar ──────────────────────────
export const TARIFA_INTEIRA = 4.30;

/** Parse seguro do saldo monetário brasileiro (ex: "1.234,56" → 1234.56) */
export const parseSaldoMonetario = (raw: string | undefined): number => {
  if (!raw) return 0;
  return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0;
};
