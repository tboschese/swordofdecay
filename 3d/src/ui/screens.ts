/**
 * Fluxo de produto: título → jogo → vitória/derrota → reinício.
 *
 * Em DOM e não em geometria 3D, e isso é decisão, não preguiça:
 *
 *  - texto em canvas WebGL exige atlas de fonte ou textura, e o projeto
 *    proíbe asset externo — o DOM já tem tipografia de graça;
 *  - a tela de desfecho não precisa de perspectiva, sombra nem
 *    profundidade, então pagar um passe de render por ela é desperdício;
 *  - e o mais prático: mexer aqui não colide com nenhum módulo de render,
 *    que têm donos próprios.
 *
 * O tom vem da lore (`Lore/lore.md`): The Rot corrói carne, pedra e
 * memória, e o guerreiro também está em decay. A derrota não é "game
 * over", é a praga ganhando mais um pedaço.
 */

export type Screen = "title" | "playing" | "victory" | "defeat";

const CSS = `
#sod-ui {
  position: fixed; inset: 0; display: grid; place-items: center;
  font: 400 16px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #c9d2bb; letter-spacing: .04em; text-align: center;
  background: radial-gradient(ellipse at 50% 45%, rgba(14,18,12,.62), rgba(14,18,12,.93));
  z-index: 10; transition: opacity 260ms ease;
}
#sod-ui[hidden] { display: none; }
#sod-ui .card { max-width: 34rem; padding: 0 1.5rem; }
#sod-ui h1 {
  margin: 0 0 .4rem; font-size: clamp(2.2rem, 7vw, 4.2rem); font-weight: 600;
  letter-spacing: .16em; text-transform: uppercase; text-wrap: balance;
}
#sod-ui .rule { height: 1px; background: linear-gradient(90deg, transparent, #6b7a4a, transparent); margin: 1.1rem 0; }
#sod-ui .lore { color: #8d9a7e; font-size: .82rem; letter-spacing: .1em; text-transform: uppercase; }
#sod-ui .hint { margin-top: 1.6rem; color: #a8b394; font-size: .9rem; }
#sod-ui .hint b { color: #e2e9d2; font-weight: 600; }
#sod-ui .rot { color: #9dbe3f; }

/* HUD — fora do #sod-ui porque aparece durante o JOGO, não nas telas. */
#sod-hud {
  position: fixed; left: 1.1rem; top: 1rem; display: flex; gap: .38rem;
  z-index: 9; transition: opacity 200ms ease;
}
#sod-hud[hidden] { display: none; }
#sod-hud i {
  width: .95rem; height: .95rem; display: block;
  background: #c4402f; border: 1px solid #2a1a14;
  /* Losango, não coração: coração vermelho é vocabulário de jogo alegre.
     Aqui é uma lasca — o guerreiro também está em decay. */
  transform: rotate(45deg);
}
#sod-hud i.gone { background: #2b2f26; border-color: #1a1d16; }
@media (prefers-reduced-motion: reduce) { #sod-ui { transition: none; } }
`;

export class Screens {
  private readonly root: HTMLDivElement;
  private readonly hud: HTMLDivElement;
  private hudHp = -1;
  private current: Screen = "title";
  private sinceMs = 0;

  constructor() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement("div");
    this.root.id = "sod-ui";
    document.body.appendChild(this.root);

    this.hud = document.createElement("div");
    this.hud.id = "sod-hud";
    document.body.appendChild(this.hud);

    this.render();
  }

  get screen(): Screen {
    return this.current;
  }

  set(screen: Screen): void {
    if (screen === this.current) return;
    this.current = screen;
    this.sinceMs = 0;
    this.render();
  }

  /**
   * Devolve `true` quando o jogador confirma. A guarda de 400ms existe
   * porque sem ela o mesmo toque que mata dispensa a tela de derrota antes
   * de ela ser lida — erro que o projeto 2D já cometeu e corrigiu.
   */
  update(dtMs: number, confirmPressed: boolean): boolean {
    this.sinceMs += dtMs;
    if (this.current === "playing") return false;
    return this.sinceMs > 400 && confirmPressed;
  }

  /**
   * Vida. Só redesenha quando MUDA — reconstruir o DOM a cada quadro é
   * desperdício e ainda produz cintilação em alguns navegadores.
   */
  setHp(hp: number, max: number): void {
    if (hp === this.hudHp) return;
    this.hudHp = hp;
    let html = "";
    for (let i = 0; i < max; i++) html += `<i class="${i < hp ? "" : "gone"}"></i>`;
    this.hud.innerHTML = html;
  }

  private render(): void {
    this.hud.hidden = this.current !== "playing";
    if (this.current === "playing") {
      this.root.hidden = true;
      return;
    }
    this.root.hidden = false;
    const card =
      this.current === "title"
        ? `<h1>Sword of Decay</h1>
           <p class="lore">Ela corrói carne, pedra e memória</p>
           <div class="rule"></div>
           <p class="lore">Mundo 1 &middot; Terras Esquecidas</p>
           <p class="hint"><b>Z</b> para começar &nbsp;·&nbsp; <b>← →</b> andar &nbsp;·&nbsp; <b>Z</b> pular</p>`
        : this.current === "victory"
          ? `<h1>O portão caído</h1>
             <div class="rule"></div>
             <p class="lore">A vila ficou para trás. A praga, não.</p>
             <p class="hint"><b>Z</b> para jogar de novo</p>`
          : `<h1 class="rot">Consumido</h1>
             <div class="rule"></div>
             <p class="lore">O Rot leva mais um pedaço</p>
             <p class="hint"><b>Z</b> para tentar de novo</p>`;
    this.root.innerHTML = `<div class="card">${card}</div>`;
  }
}
