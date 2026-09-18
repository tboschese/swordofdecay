/**
 * Câmera 2.5D.
 *
 * Em plataforma 3D a câmera é metade do game feel, e três coisas a
 * quebram — as três estão tratadas aqui de propósito:
 *
 * 1. **Seguir Y cru embrulha o estômago.** A cada pulo a tela sobe e
 *    desce junto e o quadro nunca descansa. Mas ignorar Y faz o jogador
 *    sumir na queda longa. A saída é FOLGA: a câmera só persegue Y quando
 *    o alvo sai de uma janela; dentro dela, fica parada.
 * 2. **Sem antecipação o jogador cai no que não deu pra ver.** O olhar se
 *    desloca na direção do movimento — mas amortecido, senão a câmera
 *    chicoteia toda vez que se troca de direção.
 * 3. **Sem `snapTo`, o respawn vira uma varredura** atravessando o mapa
 *    inteiro, que desorienta e demora.
 *
 * Toda suavização usa `1 - exp(-lambda * dt)`, nunca `lerp(a, b, 0.1)`
 * cru: o segundo muda de comportamento com o framerate, então a câmera
 * ficaria mais grudada em máquina rápida — o mesmo jogo com dois feels.
 */
import * as THREE from "three";
import type { CameraRig, CameraTarget } from "../contracts";
import { CAMERA, MOVE } from "./tuning";

/** Suavização independente de framerate. */
function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

export class Camera2p5D implements CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private lookX = 0;
  private centerY = 0;
  private ahead = 0;
  /** Distância atual — respira entre `distanceNear` e `distanceFar`. */
  private dist: number = CAMERA.distanceFar;
  /** Última direção com movimento. O viés de antecipação parado precisa
   *  apontar pra algum lado, e "o último lado" é o palpite certo. */
  private lastDir: 1 | -1 = 1;

  constructor(width: number, height: number) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, width / height, 0.1, 400);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  snapTo(t: CameraTarget): void {
    this.lookX = t.x;
    this.centerY = t.y + CAMERA.height;
    this.ahead = 0;
    this.dist = CAMERA.distanceNear;
    this.apply();
  }

  update(t: CameraTarget, dtMs: number): void {
    const dt = dtMs / 1000;

    // ENQUADRAMENTO DINÂMICO. O quadro abre quando ele corre e quando está
    // no ar, e fecha quando ele para. Ver `CAMERA` em tuning.ts pro
    // raciocínio e pra medição que o motivou.
    //
    // Correr e estar no ar entram por MÁXIMO, não por soma: pulo parado
    // precisa de quadro aberto tanto quanto corrida rasa, e somar os dois
    // faria a corrida com pulo abrir demais.
    const speed01 = Math.min(1, Math.abs(t.vx) / MOVE.maxSpeed);
    const open = Math.max(speed01, t.grounded ? 0 : CAMERA.airborneZoom);
    const wantDist = CAMERA.distanceNear + (CAMERA.distanceFar - CAMERA.distanceNear) * open;
    this.dist = damp(this.dist, wantDist, CAMERA.zoomLambda, dt);

    if (t.vx > 0.4) this.lastDir = 1;
    else if (t.vx < -0.4) this.lastDir = -1;

    // Antecipação proporcional à velocidade, com amortecimento próprio —
    // mais lento que o seguimento em X, senão a troca de direção chicoteia.
    // O termo `lookAheadIdle` mantém um viés mesmo parado: tira o guerreiro
    // do centro exato, onde ele parece alvo de mira em vez de personagem.
    const wantAhead =
      (t.vx / MOVE.maxSpeed) * CAMERA.lookAhead + this.lastDir * CAMERA.lookAheadIdle;
    this.ahead = damp(this.ahead, wantAhead, CAMERA.lookAheadLambda, dt);
    this.lookX = damp(this.lookX, t.x + this.ahead, CAMERA.followLambda, dt);

    // Y com FOLGA: o alvo pode subir e descer dentro da janela sem mover a
    // câmera. É isso que faz um pulo comum não balançar a tela, e ainda
    // assim a queda longa não perder o jogador.
    const eye = t.y + CAMERA.height;
    const slack = CAMERA.verticalSlack;
    let wantY = this.centerY;
    if (eye > this.centerY + slack) wantY = eye - slack;
    else if (eye < this.centerY - slack) wantY = eye + slack;
    // No chão a câmera se REASSENTA na altura de descanso; sem isso, uma
    // sequência de pulos a deixa presa alta e o chão vai pro rodapé.
    //
    // Mas com lambda PRÓPRIO e mais lento. A primeira versão trocava o alvo
    // de uma vez ao encostar no chão, e medido em `3d/harness/feel.mjs` isso
    // dava p99 de aceleração vertical em 89 u/s² contra mediana de 0.46 —
    // razão de 200x, ou seja um solavanco a cada pouso. Reassentar é uma
    // acomodação lenta, não um evento; quem tem que ser rápido é o
    // acompanhamento de queda, pra não perder o jogador do quadro.
    let lambda: number = CAMERA.verticalLambda;
    if (t.grounded) {
      wantY = eye;
      lambda = CAMERA.settleLambda;
    }
    this.centerY = damp(this.centerY, wantY, lambda, dt);

    this.apply();
  }

  private apply(): void {
    this.camera.position.set(this.lookX, this.centerY, this.dist);
    // Inclinação como TANGENTE vezes a distância atual, não um deslocamento
    // fixo. É isso que mantém o ângulo constante enquanto o zoom respira —
    // pitch que oscila junto com o zoom é a forma mais nauseante de
    // movimento de câmera que existe.
    this.camera.lookAt(this.lookX, this.centerY - this.dist * CAMERA.pitchTan, 0);
  }
}
