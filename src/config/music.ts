/**
 * Biblioteca de música por mood (DESIGN.md §3.1/§3.3, Sessão 6). Faixas CC0
 * de Juhani Junkala (ver ASSETS.md) — cada fase real do jogo declara um
 * `mood` que escolhe a faixa, em vez de tocar sempre a mesma música.
 */
export type Mood = "aventura" | "perigo" | "misterio" | "final";

interface MusicTrack {
  key: string;
  path: string;
}

export const MUSIC_TRACKS: Record<Mood, MusicTrack> = {
  // AAC 96k, não os .ogg originais de ~340kbps. Os arquivos somavam 20MB
  // para um jogo de 130KB — `misterio` sozinho tinha 14MB (5min24s a
  // 352kbps) e sozinho inviabilizaria a primeira carga em celular, que é
  // parte do critério de saída da Sessão 7 (3 dispositivos). Agora somam
  // 5.9MB. AAC e não Opus/Vorbis porque é o único com suporte parelho nos
  // três navegadores; o `final` já era .m4a desde sempre.
  aventura: { key: "music-aventura", path: "/assets/audio/music/aventura.m4a" },
  perigo: { key: "music-perigo", path: "/assets/audio/music/perigo.m4a" },
  misterio: { key: "music-misterio", path: "/assets/audio/music/misterio.m4a" },
  final: { key: "music-final", path: "/assets/audio/music/final.m4a" },
};

/**
 * 0.18, não os 0.35 herdados da versão Phaser. Aquele valor nunca tinha
 * sido ouvido de verdade — a trilha não tocava desde a migração (ver
 * `engine/audio.ts`), então 0.35 era um número que ninguém testou.
 * Ajustado no primeiro playtest com som: alto demais para trilha de fundo,
 * que deve ficar atrás do jogo e não competir com ele.
 */
export const MUSIC_VOLUME = 0.18;
