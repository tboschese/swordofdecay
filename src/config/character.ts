import { ARCHETYPES, type MovementArchetype } from "./archetypes";
import type { CombatTypeId } from "./combat";

export interface WarriorConfig {
  label: string;
  description: string;
  archetype: MovementArchetype;
  combat: CombatTypeId[];
  color: number;
}

/**
 * Único personagem jogável de "Sword of Decay": guerreiro com espada
 * (corpo a corpo) e arco (flechas à distância) — os dois sempre ativos,
 * sem seleção de classe. Ver config/combat.ts pros números de dano/carga.
 */
export const WARRIOR: WarriorConfig = {
  label: "GUERREIRO",
  description: "armadura amaldiçoada · espada e flechas · pulo flutuante",
  archetype: ARCHETYPES.floaty,
  combat: ["sword", "projectile"],
  color: 0xc0c0c8,
};
