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
  aventura: { key: "music-aventura", path: "/assets/audio/music/aventura.ogg" },
  perigo: { key: "music-perigo", path: "/assets/audio/music/perigo.ogg" },
  misterio: { key: "music-misterio", path: "/assets/audio/music/misterio.ogg" },
  final: { key: "music-final", path: "/assets/audio/music/final.m4a" },
};

export const MUSIC_VOLUME = 0.35;
