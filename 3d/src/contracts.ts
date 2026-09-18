/**
 * Interfaces entre os módulos do push 3D.
 *
 * Existe pra que os donos de módulo possam trabalhar em paralelo sem
 * esperar o núcleo ficar pronto — e sem inventar cada um a sua forma de
 * conversar com ele. Quem mexe aqui avisa todo mundo: este arquivo é o
 * único ponto de acoplamento entre os módulos.
 */
import type * as THREE from "three";

// ── Nível ─────────────────────────────────────────────────────────────

/** Bloco sólido do palco. Jogabilidade é XY; `depth` é só imagem. */
export interface Block {
  /** Canto esquerdo em X, base em Y. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Material/papel do bloco — o palco decide como isso vira imagem. */
  kind: BlockKind;
}

export type BlockKind =
  /** Pedra da vila: o chão confiável. */
  | "stone"
  /** Madeira: telhado, viga, tábua. Lê como mais frágil que pedra. */
  | "timber"
  /** Corroído pelo Rot: perigoso de encostar, e a lore visível. */
  | "rot";

export interface LevelData {
  id: string;
  /** Nome curto pra tela e pro log. */
  title: string;
  blocks: Block[];
  spawn: { x: number; y: number };
  goal: { x: number; y: number };
  /** Zonas de dano por contato (poças do Rot, espinhos de raiz). */
  hazards: Array<{ x: number; y: number; w: number; h: number }>;
  /** Aldeões corrompidos. `range` é o quanto ele patrulha pra cada lado. */
  enemies: Array<{ x: number; y: number; range?: number }>;
}

// ── Câmera (m2) ───────────────────────────────────────────────────────

/** O que a câmera sabe sobre o alvo. Nada além disto. */
export interface CameraTarget {
  x: number;
  y: number;
  /** Velocidade horizontal, pra antecipar o que vem pela frente. */
  vx: number;
  grounded: boolean;
}

export interface CameraRig {
  /** Passo fixo. Recebe dt em ms. */
  update(target: CameraTarget, dtMs: number): void;
  /** Coloca a câmera no lugar sem suavizar (spawn, respawn, corte). */
  snapTo(target: CameraTarget): void;
  readonly camera: THREE.PerspectiveCamera;
  resize(width: number, height: number): void;
}

// ── Guerreiro (m5) ────────────────────────────────────────────────────

export type HeroAnim = "idle" | "run" | "jump" | "fall" | "land" | "hurt";

export interface HeroRig {
  readonly object: THREE.Object3D;
  /** Passo fixo. `facing` é -1 ou 1. */
  update(anim: HeroAnim, facing: 1 | -1, speed01: number, dtMs: number): void;
}

// ── Palco (m4) ────────────────────────────────────────────────────────

export interface StageRig {
  readonly object: THREE.Object3D;
  /** Chamado por quadro; existe pro Rot poder respirar sem usar relógio. */
  update(frame: number): void;
}

// ── Atmosfera e luz (m6) ──────────────────────────────────────────────

export interface AtmosphereRig {
  /** Configura fundo, névoa e adiciona as luzes na cena. */
  install(scene: THREE.Scene): void;
  update(frame: number): void;
  /** Alvo que a luz principal deve acompanhar, pra sombra não sair do mapa. */
  followShadow(x: number, y: number): void;
}
