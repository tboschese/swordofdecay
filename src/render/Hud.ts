/**
 * HUD de produto. Módulo m7 do push AAA (absorve a Sessão 7 do ROADMAP).
 *
 * O que estava aqui antes era leitura de debug — `accel 420 maxSpd 115
 * coyote 120ms buffer 150ms vx 0 vy 0 grounded yes` — ocupando duas
 * barras que somavam ~20% de uma tela de 224px de altura. Isso é viewport
 * de dev, não produto, e contaminava toda captura de arte.
 *
 * Regras de ofício aplicadas aqui:
 *
 * **HUD não recebe grade.** É desenhado depois do passe de pós, sem
 * vinheta nem grão. Interface é leitura, não cena; sujar a UI com o grão
 * da imagem é erro de amador que aparece na hora em qualquer captura.
 *
 * **Nada de texto onde um ícone serve.** Vida em pips discretos lê mais
 * rápido que "5/5" e é o vocabulário do gênero desde o SNES.
 *
 * **Contorno escuro em tudo.** O fundo é claro no horizonte e escuro no
 * chão; sem contorno a UI some em metade da fase.
 *
 * O painel de debug continua existindo, agora atrás da tecla F1 e
 * desligado por padrão — ele é útil pra ajustar game feel, só não pode
 * ser o estado normal da tela.
 */
import { WARRIOR } from "../config/character";

export interface HudState {
  hp: number;
  maxHp: number;
  coins: number;
  hasKey: boolean;
  /** 0..1 — carga da espada ou do arco em andamento; null se não há carga. */
  charge: number | null;
  invulnerable: boolean;
}

export interface DebugState {
  accel: number;
  maxSpeed: number;
  vx: number;
  vy: number;
  grounded: boolean;
}

const PIP_W = 7;
const PIP_H = 8;
const PIP_GAP = 2;
const MARGIN = 6;

export class Hud {
  showDebug = false;

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {}

  /** Contorno de 1px em volta do texto — garante leitura sobre qualquer fundo. */
  private outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string): void {
    ctx.fillStyle = "#0b0d0a";
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx || dy) ctx.fillText(text, x + dx, y + dy);
      }
    }
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  render(ctx: CanvasRenderingContext2D, s: HudState, debug: DebugState): void {
    ctx.save();
    ctx.textBaseline = "top";

    // ---- vida em pips. Cheio quente, vazio afundado e frio.
    for (let i = 0; i < s.maxHp; i++) {
      const x = MARGIN + i * (PIP_W + PIP_GAP);
      const y = MARGIN;
      const filled = i < s.hp;

      ctx.fillStyle = "#0b0d0a";
      ctx.fillRect(x - 1, y - 1, PIP_W + 2, PIP_H + 2);

      if (filled) {
        // Gradiente dentro do pip: 3 tons, mesmo critério de tile do
        // DESIGN.md §2.1. Um retângulo chapado denunciaria a UI.
        ctx.fillStyle = "#8c2f28";
        ctx.fillRect(x, y, PIP_W, PIP_H);
        ctx.fillStyle = "#c4503a";
        ctx.fillRect(x, y, PIP_W, PIP_H - 3);
        ctx.fillStyle = "#e8836a";
        ctx.fillRect(x + 1, y + 1, PIP_W - 3, 2);
      } else {
        ctx.fillStyle = "#25292a";
        ctx.fillRect(x, y, PIP_W, PIP_H);
        ctx.fillStyle = "#171a1b";
        ctx.fillRect(x + 1, y + 1, PIP_W - 2, PIP_H - 3);
      }
    }

    // ---- moedas, canto superior direito
    ctx.font = "8px monospace";
    ctx.textAlign = "right";
    const coinX = this.width - MARGIN;
    ctx.fillStyle = "#0b0d0a";
    ctx.fillRect(coinX - 26, MARGIN - 1, 27, 10);
    ctx.fillStyle = "#c9a227";
    ctx.beginPath();
    ctx.arc(coinX - 21, MARGIN + 4, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f0d878";
    ctx.beginPath();
    ctx.arc(coinX - 21.7, MARGIN + 3.2, 1.4, 0, Math.PI * 2);
    ctx.fill();
    this.outlinedText(ctx, String(s.coins), coinX - 2, MARGIN + 1, "#e9e3d6");

    // ---- chave: só aparece quando existe. UI não anuncia o que você não tem.
    if (s.hasKey) {
      const kx = coinX - 40;
      ctx.fillStyle = "#0b0d0a";
      ctx.fillRect(kx - 5, MARGIN - 1, 11, 10);
      ctx.fillStyle = "#d8c46a";
      ctx.beginPath();
      ctx.arc(kx, MARGIN + 3, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(kx - 0.8, MARGIN + 4, 1.6, 5);
      ctx.fillRect(kx, MARGIN + 7, 3, 1.4);
    }

    // ---- barra de carga: aparece só durante a carga, junto do jogador
    if (s.charge !== null && s.charge > 0.04) {
      const bw = 34, bh = 3;
      const bx = Math.round((this.width - bw) / 2);
      const by = this.height - 22;
      ctx.fillStyle = "#0b0d0a";
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle = "#2a2f28";
      ctx.fillRect(bx, by, bw, bh);
      const full = s.charge >= 1;
      ctx.fillStyle = full ? "#f0d878" : "#7f9a5e";
      ctx.fillRect(bx, by, Math.round(bw * Math.min(1, s.charge)), bh);
      if (full) {
        ctx.fillStyle = "#fff6d0";
        ctx.fillRect(bx, by, bw, 1);
      }
    }

    ctx.textAlign = "left";

    if (this.showDebug) {
      ctx.font = "8px monospace";
      const lines = [
        `${WARRIOR.label}  accel ${debug.accel}  maxSpd ${debug.maxSpeed}`,
        `vx ${debug.vx.toFixed(0)}  vy ${debug.vy.toFixed(0)}  grounded ${debug.grounded ? "sim" : "nao"}`,
      ];
      ctx.fillStyle = "#000000cc";
      ctx.fillRect(MARGIN, this.height - 26, 210, 22);
      ctx.fillStyle = "#9fd08a";
      lines.forEach((l, i) => ctx.fillText(l, MARGIN + 3, this.height - 24 + i * 10));
    }

    ctx.restore();
  }

  /**
   * SUPERADO por `render/Screens.ts` — não usar para vitória nem derrota.
   *
   * Uma faixa central de 52px em 224 é caixa de diálogo, não desfecho:
   * gasta 76% do quadro e diz o resultado só por texto, então trocar as
   * duas legendas de lugar deixaria as duas telas idênticas. Vitória e
   * derrota se distinguem por TOM (temperatura, direção da poeira,
   * vinheta, corrosão) e isso vive em `Screens.renderVictory` /
   * `Screens.renderDefeat`.
   *
   * Continua aqui porque `TilemapGame.renderHud` ainda chama enquanto o
   * hook das telas não está ligado — remover antes disso quebraria o
   * build de outro dono. Depois do hook, apagar.
   */
  renderCenterMessage(ctx: CanvasRenderingContext2D, title: string, sub: string): void {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cy = this.height / 2;

    ctx.fillStyle = "rgba(8,10,8,0.78)";
    ctx.fillRect(0, cy - 26, this.width, 52);
    ctx.fillStyle = "#3c4438";
    ctx.fillRect(0, cy - 26, this.width, 1);
    ctx.fillRect(0, cy + 25, this.width, 1);

    ctx.font = "12px monospace";
    this.outlinedText(ctx, title, this.width / 2, cy - 7, "#e9e3d6");
    ctx.font = "8px monospace";
    this.outlinedText(ctx, sub, this.width / 2, cy + 10, "#968d7b");
    ctx.restore();
  }
}
