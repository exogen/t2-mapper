/** Assumed dropped-flag auto-return delays; servers do not transmit these. */
export const FLAG_RETURN_SECONDS = {
  CTF: 45,
  LCTF: 25,
  LakRabbit: 25,
} as const;
