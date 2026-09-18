import { rng } from "../engine/rng";
import { applyRimLight, SKY_RIM } from "./RimLight";
/**
 * Renderizador procedural do guerreiro — porte 1:1 do "Knight Studio"
 * (Claude Design, projeto do usuário: idle/walk/run/jump/thrust/slash/
 * shot/cshot/hurt/die/defend/climb/bat, ver conversa de pivot M3).
 * Desenho 100% Canvas 2D orientado a pose paramétrica: `pose(anim, t)`
 * calcula ângulos de quadril/joelho/ombro/cotovelo por interpolação, e
 * `drawKnight` monta o personagem membro a membro (sel-out shading:
 * contorno colorido a partir do preenchimento, não preto chapado).
 * Mantido como porte fiel do original — não "simplificar" a matemática
 * de pose sem re-visualizar cada animação afetada.
 */

export type Pose = Record<string, any>;

export class KnightRenderer {
  static readonly LOGICAL = 100;
  static readonly DUR: Record<string, number> = { idle:2.4, walk:0.95, run:0.55, jump:1.25, land:0.18, thrust:0.6, slash:1.15, jthrust:1.3, jslash:1.35, shot:0.8, cshot:1.7, jshot:1.15, jcshot:1.6, climb:1.4, hurt:0.6, die:1.8, defend:1.6, bhurt:0.7, bfly:0.9, bdie:1.5, scene:5.0 };
  // `land` tem 3 passos de propósito: 1 quadro de compressão profunda, 1 de
  // volta, 1 passando do ponto. Mais quadros que isso viram um agachamento,
  // e aterrissagem não é agachamento — é o chão cobrando o pulo.
  private readonly STEPS: Record<string, number> = { idle:8, walk:10, run:10, jump:14, land:3, thrust:9, slash:14, jthrust:16, jslash:16, shot:10, cshot:18, jshot:14, jcshot:18, climb:12, hurt:8, die:16, defend:8, bhurt:8, bfly:8, bdie:16, scene:50 };

  private readonly C = {
      out:'#141010', outSoft:'#221a15',
      stD:'#31333a', stM:'#54575f', stL:'#7d818b', stH:'#9ea3ad',
      leD:'#38291a', leM:'#5a4126', leL:'#7b5a33',
      plD:'#6a201a', plM:'#992d24', plL:'#c0463a',
      visor:'#0b0a09',
      blD:'#4f5158', blM:'#787b83', blL:'#aab0b8',
      gold:'#b6924f', goldD:'#7a6234',
      dust:'#5a4d3d',
      rust:'#7a3f2c', rustD:'#4e2a1e',
      stB:'#42444b', stBd:'#2a2c31', stBl:'#5a5d65',
      leB:'#452f1c',

      // --- profundidade: ramp do membro DISTANTE -----------------------
      // A regra de 16 bits que faltava: o membro de trás cai DOIS degraus
      // do ramp, não um, e o ponto MAIS CLARO dele ainda fica abaixo da
      // MASSA do membro da frente. Com um degrau só (era stB contra stM,
      // 19 de luma) os dois membros ficam à mesma distância do fundo e a
      // passada vira mancha. Medido no cenário `run`, com fundo a ~45 de
      // luma, o corpo inteiro abaixo do cinto vivia entre 10 e 55 — as
      // duas pernas ABAIXO do próprio fundo, indistinguíveis.
      // stFar=54, stFarL=75 · contra stM=87, stL=130, stH=163.
      stFar:'#34363c', stFarL:'#484b53', stFarD:'#1d1f24',
      leFarM:'#241811', leFarD:'#150e0a',
      goldFar:'#4a3c20',
      stSpec:'#dfe5ee', stHH:'#bec5d1',
      goldHi:'#dcbc78',
      ember:'#7e2418', emberHot:'#b8422a',
      plHot:'#d95c45',
      leHi:'#95744a',

      // --- A Podridão (The Rot) ---------------------------------------
      // Região 1 é o começo da curva de tom: ESTRANHAMENTO, não monstro.
      // Por isso a paleta da praga é dessaturada e escura — fica abaixo
      // do vermelho do penacho em saturação, e abaixo do aço em valor, de
      // modo que só se lê como "algo errado" quando se olha, nunca como
      // efeito luminoso. Verde-bile e violeta-cadáver: as duas famílias
      // que não existem em nenhum outro lugar do personagem.
      rotD:'#1e2418',     // núcleo da corrosão (quase preto, esverdeado)
      rotM:'#3a4429',     // massa da mancha
      rotL:'#5c6b38',     // borda ativa, onde ainda está comendo o metal
      rotHi:'#8a9450',    // ponto vivo — usar com MUITA parcimônia
      rotEye:'#6f7a3a',   // brasa doente atrás da viseira
      rotEyeHot:'#a8b055',
      necro:'#2c2330',    // veias violeta-cadáver no couro
      necroL:'#463850',
      // aço já comido: cinza sem azul, morto
      stRot:'#3d3b36', stRotD:'#26251f'
  };

  private readonly buf: HTMLCanvasElement;
  private readonly bctx: CanvasRenderingContext2D;
  private _so: Record<string, string> = {};
  private _soSoft: Record<string, string> = {};
  smooth = false;
  frameIndex = 0;
  elapsedSec = 0;

  constructor() {
    this.buf = document.createElement('canvas');
    this.buf.width = KnightRenderer.LOGICAL;
    this.buf.height = KnightRenderer.LOGICAL;
    this.bctx = this.buf.getContext('2d')!;
  }

  tick(deltaMs: number): void {
    this.elapsedSec += deltaMs / 1000;
  }

  pose(anim: string, tRaw: number): Pose {
    const S = this.smooth ? tRaw : Math.floor(tRaw*this.STEPS[anim]!)/this.STEPS[anim]!;
    this.frameIndex = Math.floor(tRaw*this.STEPS[anim]!);
    // hipF/hipB = hip swing (deg, +forward); kneeF/kneeB = knee bend (deg)
    // armF/armB = shoulder swing; elbowF/elbowB = elbow bend
    const P: Pose = { bodyY:0, lean:0, plume:0, headTilt:0,
      hipF:0, hipB:0, kneeF:4, kneeB:4,
      armF:0, armB:0, elbowF:6, elbowB:6,
      armDirF:0, armDirB:0, elbowAdjF:0, elbowAdjB:0, swordTilt:44,
      dust:0, airborne:false, shake:0, slashArc:0, lungeX:0, thrustTrail:0,
      bow:0, bowAim:0, bowDraw:0, arrowFly:0, arrowPower:1,
      hurtFlash:0, knockX:0, dieAngle:0, dead:false,
      // squash & stretch: escala em torno dos PÉS (ver render()). 1 = neutro.
      // É isto que dá peso — sem volume deformando, um golpe lê como boneco
      // articulado. sqX>1 + sqY<1 = esmagado (impacto/aterrissagem);
      // sqX<1 + sqY>1 = esticado (ápice de pulo, extensão do golpe).
      sqX:1, sqY:1 };
    const tau = Math.PI*2;
    if(anim==='idle'){
      const b = Math.sin(S*tau);
      // secundária: o penacho ARRASTA atrás do corpo (defasagem de ~1/8 de
      // ciclo). Penacho em fase com o tronco lê como peça rígida colada.
      const lag = Math.sin(S*tau - 0.85);
      P.bodyY = -0.5 + b*0.5; P.plume = lag*2.6; P.armF = b*2; P.armB = -b*1.6;
      P.headTilt = Math.sin(S*tau - 0.45)*0.5;
      P.kneeF = 4; P.kneeB = 4;
      P.sqY = 1 - b*0.018; P.sqX = 1 + b*0.014;   // respiração
    } else if(anim==='walk'){
      const s = S*tau, sA = 17, kA = 30;
      P.hipF = sA*Math.sin(s);            P.hipB = sA*Math.sin(s+Math.PI);
      P.kneeF = 6 + Math.max(0,-Math.cos(s))*kA;      P.kneeB = 6 + Math.max(0,-Math.cos(s+Math.PI))*kA;
      P.bodyY = -0.5 - Math.abs(Math.sin(s))*1.2;
      P.armF = Math.sin(s+Math.PI)*13;    P.armB = Math.sin(s)*13;
      P.elbowF = 12; P.elbowB = 12;
      P.lean = 4; P.plume = Math.sin(s+0.5)*2.4;
    } else if(anim==='run'){
      const s = S*tau, sA = 32, kA = 55;
      P.hipF = sA*Math.sin(s);            P.hipB = sA*Math.sin(s+Math.PI);
      P.kneeF = 12 + Math.max(0,-Math.cos(s))*kA;     P.kneeB = 12 + Math.max(0,-Math.cos(s+Math.PI))*kA;
      // |sin| é simétrico: sobe e desce no mesmo ritmo, e corrida assim lê
      // como flutuação. Elevar a potência <1 faz o corpo despencar rápido no
      // contato e subir devagar — é a assimetria que dá peso.
      const bob = Math.pow(Math.abs(Math.sin(s)), 0.62);
      P.bodyY = -1 - bob*2.6;
      // no ponto mais baixo (pé plantado) o corpo esmaga; no ápice, estica.
      const contact = Math.pow(1-bob, 2.2);
      P.sqX = 1 + contact*0.09 - bob*0.03;
      P.sqY = 1 - contact*0.08 + bob*0.03;
      P.armF = Math.sin(s+Math.PI)*22;    P.armB = Math.sin(s)*22;
      P.elbowF = 30; P.elbowB = 30;
      P.lean = 14 - contact*3;                      // endireita levemente ao plantar
      P.plume = Math.sin(s-0.75)*3.0 - 2.5;         // arrasta atrás do galope
      P.headTilt = -contact*1.2;
      P.dust = (S % 0.5)/0.5;
    } else if(anim==='jump'){
      const u = S;
      let by, tuck=0, arm=0;
      if(u<0.13){ const k=u/0.13; by = -0.5 + 2.5*k; tuck = k*0.5;   // agacha (antecipação)
        P.sqX = 1 + k*0.10; P.sqY = 1 - k*0.09; }
      else if(u<0.42){ const k=(u-0.13)/0.29; by = 2 - 16*k; tuck = 0.5 - k*0.28; arm = -k*30;
        const st = Math.sin(k*Math.PI*0.5);                          // dispara esticando
        P.sqX = 1.10 - st*0.18; P.sqY = 0.91 + st*0.16; }
      else if(u<0.55){ by = -14; tuck = 0.72; arm = -30;             // ápice: volume volta ao normal
        P.sqX = 0.96; P.sqY = 1.04; }
      else if(u<0.85){ const k=(u-0.55)/0.30; by = -14 + 16*k; tuck = 0.72 - k*0.4; arm = -30 + k*26;
        P.sqX = 0.96 + k*0.02; P.sqY = 1.04 - k*0.02; }
      else { const k=(u-0.85)/0.15; by = 2 - 2.5*k; tuck = 0.32 - k*0.32;
        const land = Math.sin(k*Math.PI);                            // esmaga e volta
        P.sqX = 1 + land*0.16; P.sqY = 1 - land*0.14; P.dust = land*0.9; }
      P.bodyY = by; P.airborne = by < -4;
      P.hipF = tuck*24; P.hipB = tuck*15;
      P.kneeF = 6 + tuck*58; P.kneeB = 6 + tuck*46;
      P.armF = arm; P.armB = arm*0.55; P.elbowF = 10 + tuck*20; P.elbowB = 10;
      P.lean = 5; P.plume = -by*0.26 + (u<0.42 ? 5 : 0);   // penacho fica pra trás na subida
    } else if(anim==='land'){
      const u = S;
      // ATERRISSAGEM. Estado curto e próprio, disparado pelo PlayerAnimator
      // na transição ar→chão. O ciclo `jump` já tinha quadros de pouso no
      // fim, mas eles nunca tocavam: o estado virava walk/idle no mesmo
      // quadro em que o pé encostava. Um pulo sem preço no pouso lê como
      // descer um degrau, por mais bem desenhado que esteja o arco.
      // sq: envelope da compressão (morre em u=0.62)
      // os: o corpo PASSA do ponto ao voltar — é o follow-through que faz
      //     o peso parecer massa, e não uma mola perfeita.
      const sq = Math.max(0, 1 - u/0.62);
      const os = u>0.55 ? Math.sin(((u-0.55)/0.45)*Math.PI) : 0;
      P.sqX = 1 + sq*0.20 - os*0.05;
      P.sqY = 1 - sq*0.18 + os*0.05;
      P.bodyY = -0.5 + sq*4.2 - os*1.0;
      P.hipF = sq*30; P.hipB = -sq*16;
      P.kneeF = 6 + sq*44; P.kneeB = 6 + sq*40;
      P.lean = 6*sq;
      P.armF = -18*sq; P.armB = -10*sq;
      P.elbowF = 10 + sq*22; P.elbowB = 10 + sq*14;
      P.swordTilt = 44 - sq*16;
      // penacho continua descendo DEPOIS do corpo parar, e sobe atrasado
      P.plume = 11*sq - os*5;
      P.headTilt = 2.4*sq - os*1.2;
      P.dust = sq;
    } else if(anim==='thrust'){
      const u = S;
      // Ritmo de golpe, não rampa linear: 2 quadros de ANTECIPAÇÃO (recolhe
      // a espada e comprime como mola), 1 de transição, 3 CRAVADO (o hold é
      // o que faz o impacto pesar) e 2 de retorno com passagem do ponto
      // (follow-through). Sem o recuo o golpe lê como protótipo.
      let ext=0, lunge=0; // ext: 0=guarda 1=estocada plena, negativo=recuo
      if(u<0.28){ const k=u/0.28, e=1-Math.pow(1-k,2);                    // recolhe (rápido, depois assenta)
        ext = -0.5*e; lunge = -5*e;
        P.sqX = 1 + e*0.08; P.sqY = 1 - e*0.07; }                         // mola comprimindo
      else if(u<0.42){ const k=(u-0.28)/0.14, e=1-Math.pow(1-k,3);        // dispara
        ext = -0.5 + 1.5*e; lunge = -5 + 13*e;
        P.sqX = 1.08 - e*0.16; P.sqY = 0.93 + e*0.14; }                   // mola soltando: estica
      else if(u<0.70){ ext = 1; lunge = 8; P.sqX = 0.92; P.sqY = 1.07; }  // cravada (hold)
      else { const k=(u-0.70)/0.30;                                        // retorno com overshoot
        const os = Math.sin(k*Math.PI)*0.17;
        ext = (1-k) - os; lunge = 8*(1-k) - os*7;
        P.sqX = 0.92 + k*0.08; P.sqY = 1.07 - k*0.07; }
      P.armDirF = ext*-88; P.elbowAdjF = ext*40;
      P.armDirB = ext*-76; P.elbowAdjB = ext*40;
      P.swordTilt = 44 + ext*46;                     // 90 = horizontal, ponta pra frente
      P.lean = lunge; P.bodyY = -0.5 + Math.max(0,ext)*1.8 - Math.max(0,-ext)*1.4;
      P.lungeX = Math.max(0,ext)*4 + Math.min(0,ext)*5;   // só inclina — pés ficam no lugar
      P.hipF = ext*46; P.kneeF = 6 + ext*12;         // perna da frente avança
      P.hipB = ext*-30; P.kneeB = 6 + ext*38;        // trás estica
      // penacho arrasta: joga pra trás no recuo, chicoteia pra frente no golpe
      P.plume = -lunge*0.55 + (u<0.28 ? 4 : 0); P.headTilt = lunge*0.2;
      if(u>=0.42 && u<0.58) P.shake = 1;
      P.thrustTrail = (u>=0.42 && u<0.70) ? 1 : (u>=0.70&&u<0.80 ? 1-(u-0.70)/0.10 : 0);
    } else if(anim==='slash'){
      const u = S;
      // up: 0=guarda 1=erguida; dn: 0..1 descida. Valores NEGATIVOS de up
      // são o contra-movimento — a lâmina cai um instante antes de subir,
      // que é o que anuncia o golpe pro jogador.
      let up=0, dn=0, wob=0;
      if(u<0.10){ const k=u/0.10;                                             // ANTECIPAÇÃO: afunda e recua
        up = -0.16*k; P.sqX = 1 + k*0.09; P.sqY = 1 - k*0.08; }
      else if(u<0.34){ const k=(u-0.10)/0.24, e=1-Math.pow(1-k,2);            // ergue soltando a mola
        up = -0.16 + 1.16*e;
        P.sqX = 1.09 - e*0.17; P.sqY = 0.92 + e*0.16; }
      else if(u<0.50){ up = 1; P.shake = 0.6;                                 // segura no alto, tremendo
        P.sqX = 0.92; P.sqY = 1.08; }
      else if(u<0.58){ const k=(u-0.50)/0.08; up = 1; dn = k*k;               // desaba acelerando
        P.sqX = 0.92 + k*0.17; P.sqY = 1.08 - k*0.16; }
      else if(u<0.80){ dn = 1; up = 1;                                        // IMPACTO: esmaga e recupera
        const k=(u-0.58)/0.22, rec = Math.pow(1-k, 2);
        P.sqX = 1 + rec*0.15; P.sqY = 1 - rec*0.14;
        if(u<0.72){ P.dust = (u-0.58)/0.14; P.shake = 3; } }
      else { const k=(u-0.80)/0.20;                                           // recupera PASSANDO do ponto
        const os = Math.sin(k*Math.PI)*0.15;
        up = (1-k) - os; dn = (1-k) - os;
        wob = Math.sin(k*Math.PI*2)*3.5*(1-k); }                              // penacho oscila e assenta
      const arc = up*-122 + dn*166;                  // ângulo do braço: varredura mais ampla
      P.armDirF = arc; P.elbowAdjF = 12 - dn*10;
      P.armDirB = arc*0.92; P.elbowAdjB = 16 - dn*12;
      P.swordTilt = 44 - up*70 + dn*150;             // lâmina: bem atrás no alto → cravada à frente
      P.lean = -5*up + dn*24;
      P.bodyY = -0.5 + up*-1.5 + dn*5;               // estica e desaba
      P.lungeX = dn*4 - up*3;                        // só inclina — pés ficam no lugar
      P.hipF = dn*36 - up*6; P.kneeF = 6 + dn*30;
      P.hipB = -dn*20; P.kneeB = 6 + dn*42;
      // penacho como massa com inércia: recua ao erguer, chicoteia à frente
      // no corte, oscila ao parar. Em fase com o tronco ele lê como plástico.
      P.plume = -up*5 + dn*11 + wob; P.headTilt = -up*1 + dn*2.4;
      P.slashArc = (u>=0.50 && u<0.74) ? Math.max(dn, 0.15) : 0;
    } else if(anim==='jthrust'){
      const u = S;
      let by, tuck=0, ext=0;
      if(u<0.12){ const k=u/0.12; by = -0.5 + 2.5*k; tuck = k*0.5; }            // agacha
      else if(u<0.34){ const k=(u-0.12)/0.22; by = 2 - 16*k; tuck = 0.5 - k*0.2; } // sobe
      else if(u<0.66){ by = -14; tuck = 0.3;                                     // ápice
        ext = u<0.42 ? (u-0.34)/0.08 : (u<0.58 ? 1 : 1-(u-0.58)/0.08);
        if(u>=0.42 && u<0.50) P.shake = 1; }
      else if(u<0.88){ const k=(u-0.66)/0.22; by = -14 + 16*k; tuck = 0.3 + k*0.2; } // cai
      else { const k=(u-0.88)/0.12; by = 2 - 2.5*k; tuck = 0.5*(1-k); }          // aterrissa
      P.bodyY = by; P.airborne = by < -4;
      P.hipF = tuck*20 + ext*14; P.hipB = tuck*12 - ext*10;
      P.kneeF = 6 + tuck*50; P.kneeB = 6 + tuck*44 + ext*12;
      P.armDirF = ext*-88; P.elbowAdjF = ext*40;
      P.armDirB = ext*-76; P.elbowAdjB = ext*40;
      P.swordTilt = 44 + ext*46;                     // horizontal, ponta pra frente
      P.lungeX = ext*4;                              // só inclina — sem deslocar
      P.thrustTrail = ext>0.3 ? ext : 0;             // mesmo rastro da estocada normal
      P.lean = 4 + ext*10; P.plume = -by*0.22 - ext*3;
    } else if(anim==='jslash'){
      const u = S;
      let by, tuck=0, up=0, dn=0;
      if(u<0.12){ const k=u/0.12; by = -0.5 + 2.5*k; tuck = k*0.5; }             // agacha
      else if(u<0.34){ const k=(u-0.12)/0.22; by = 2 - 16*k; tuck = 0.5 - k*0.2; up = k; } // sobe erguendo
      else if(u<0.46){ by = -14; tuck = 0.3; up = 1; P.shake = 0.6; }            // ápice, carrega
      else if(u<0.60){ const k=(u-0.46)/0.14; by = -14 + 18*k; up = 1; dn = k;   // despenca cortando
        tuck = 0.3 - k*0.1; P.lungeX = k*8; }
      else if(u<0.80){ by = 4; up = 1; dn = 1; P.lungeX = 8;                     // IMPACTO no chão
        const rec = Math.pow(1-(u-0.60)/0.20, 2);
        P.sqX = 1 + rec*0.20; P.sqY = 1 - rec*0.17;                             // esmaga forte na queda
        if(u<0.72){ P.dust = (u-0.60)/0.12; P.shake = 3; } }
      else { const k=(u-0.80)/0.20; by = 4 - 4.5*k;                              // recupera com overshoot
        const os = Math.sin(k*Math.PI)*0.14;
        up = (1-k) - os; dn = (1-k) - os; P.lungeX = 8*(1-k); }
      P.bodyY = by; P.airborne = by < -4;
      const arc = up*-105 + dn*148;
      P.armDirF = arc; P.elbowAdjF = 10 - dn*8;
      P.armDirB = arc*0.92; P.elbowAdjB = 14 - dn*10;
      P.swordTilt = 44 - up*64 + dn*132;
      P.hipF = tuck*20 + dn*24; P.hipB = tuck*12 - dn*12;
      P.kneeF = 6 + tuck*40 + dn*20; P.kneeB = 6 + tuck*36 + dn*24;
      P.lean = -4*up + dn*20;
      P.plume = up*4 - dn*8 - by*0.15;
      P.slashArc = (u>=0.46 && u<0.70) ? Math.max(dn, 0.15) : 0;
    } else if(anim==='shot'){
      const u = S;
      let aim=0, draw=0, fly=0, rec=0;
      if(u<0.2){ aim = u/0.2; }                                            // ergue o arco
      else if(u<0.42){ aim = 1; draw = (u-0.2)/0.22; }                     // puxa a corda
      else if(u<0.5){ aim = 1; draw = 1; }                                 // mira
      else { aim = 1; fly = (u-0.5)/0.5; rec = Math.max(0,1-(u-0.5)/0.18); } // solta
      P.bow=1; P.bowAim=aim; P.bowDraw=draw; P.arrowFly=fly; P.arrowPower=1;
      P.lean = 2*aim - rec*3; P.bodyY = -0.5;
      P.hipF = aim*8; P.hipB = -aim*6; P.kneeF = 6; P.kneeB = 8;
      P.plume = -aim*1.5 + rec*2;
    } else if(anim==='cshot'){
      const u = S;
      let aim=0, draw=0, fly=0, rec=0;
      if(u<0.14){ aim = u/0.14; }                                          // ergue
      else if(u<0.48){ aim = 1; draw = (u-0.14)/0.34;                      // puxa fundo
        if(draw>0.85) P.shake = 0.5; }
      else if(u<0.6){ aim = 1; draw = 1; P.shake = 0.9; }                  // segura tremendo
      else { aim = 1; fly = (u-0.6)/0.4; rec = Math.max(0,1-(u-0.6)/0.12); // dispara
        if(u<0.66) P.shake = 1.6; }
      P.bow=1; P.bowAim=aim; P.bowDraw=draw; P.arrowFly=fly; P.arrowPower=2;
      P.lean = 4*aim - rec*6; P.bodyY = -0.5 + draw*1;
      P.hipF = aim*12; P.hipB = -aim*10; P.kneeF = 6 + draw*4; P.kneeB = 8 + draw*4;
      P.plume = -aim*2 - draw*2 + rec*3;
    } else if(anim==='jshot'){
      const u = S;
      // jump arc + quick shot at the apex
      let by, tuck=0, aim=0, draw=0, fly=0;
      if(u<0.12){ const k=u/0.12; by = -0.5 + 2.5*k; tuck = k*0.5; }             // agacha
      else if(u<0.32){ const k=(u-0.12)/0.20; by = 2 - 16*k; tuck = 0.5 - k*0.3; } // sobe
      else { const k=(u-0.32)/0.34; by = k<1 ? -14 : -14; }                      // flutua no ápice
      if(u>=0.66){ const k=(u-0.66)/0.22; by = -14 + 16*Math.min(1,k); tuck = 0.2 + Math.min(1,k)*0.3; }
      if(u>=0.88){ const k=(u-0.88)/0.12; by = 2 - 2.5*k; tuck = 0.5*(1-k); }
      // bow timeline during the float
      if(u>=0.20 && u<0.34){ aim=(u-0.20)/0.14; }
      else if(u>=0.34 && u<0.5){ aim=1; draw=(u-0.34)/0.16; }
      else if(u>=0.5 && u<0.56){ aim=1; draw=1; }
      else if(u>=0.56){ aim=1; fly=Math.min(1,(u-0.56)/0.4); }
      P.bodyY = by; P.airborne = by < -4;
      P.hipF = tuck*20 + aim*8; P.hipB = tuck*14 - aim*6;
      P.kneeF = 6 + tuck*48; P.kneeB = 6 + tuck*40;
      P.bow=1; P.bowAim=aim; P.bowDraw=draw; P.arrowFly=fly; P.arrowPower=1;
      P.lean = 3*aim; P.plume = -by*0.2 - aim*1.5;
    } else if(anim==='jcshot'){
      const u = S;
      // jump + charged shot: hangs longer, big arrow
      let by, tuck=0, aim=0, draw=0, fly=0;
      if(u<0.1){ const k=u/0.1; by = -0.5 + 2.5*k; tuck = k*0.5; }               // agacha
      else if(u<0.28){ const k=(u-0.1)/0.18; by = 2 - 16*k; tuck = 0.5 - k*0.3; } // sobe
      else { by = -14; tuck = 0.2; }                                             // flutua (hang time)
      if(u>=0.74){ const k=(u-0.74)/0.16; by = -14 + 16*Math.min(1,k); tuck = 0.2 + Math.min(1,k)*0.3; }
      if(u>=0.9){ const k=(u-0.9)/0.1; by = 2 - 2.5*k; tuck = 0.5*(1-k); }
      if(u>=0.18 && u<0.3){ aim=(u-0.18)/0.12; }
      else if(u>=0.3 && u<0.6){ aim=1; draw=(u-0.3)/0.3; if(draw>0.85) P.shake=0.5; }
      else if(u>=0.6 && u<0.7){ aim=1; draw=1; P.shake=0.9; }
      else if(u>=0.7){ aim=1; fly=Math.min(1,(u-0.7)/0.3); if(u<0.76) P.shake=1.4; }
      P.bodyY = by; P.airborne = by < -4;
      P.hipF = tuck*20 + aim*12; P.hipB = tuck*14 - aim*10;
      P.kneeF = 6 + tuck*48; P.kneeB = 6 + tuck*40;
      P.bow=1; P.bowAim=aim; P.bowDraw=draw; P.arrowFly=fly; P.arrowPower=2;
      P.lean = 5*aim; P.plume = -by*0.2 - aim*2 - draw*2;
    } else if(anim==='climb'){
      const s = S*Math.PI*2;
      // alternating reach: right hand + left foot up, then swap
      const ph = Math.sin(s);
      P.climb = 1;
      P.climbF = ph;                 // >0: front(left) limbs high
      P.bodyY = -2 + Math.abs(Math.sin(s))*1.2;   // slight bob per pull
      // legs step up the rungs, alternating (like a vertical walk)
      P.hipF = 8 + Math.max(0, ph)*10;   P.kneeF = 16 + Math.max(0, ph)*30;
      P.hipB = 8 + Math.max(0,-ph)*10;   P.kneeB = 16 + Math.max(0,-ph)*30;
      P.plume = Math.sin(s+0.5)*2;
      P.headTilt = 1.2;              // looking up
    } else if(anim==='hurt'){
      const u = S;
      P.hurtFlash = Math.max(0, 1 - u*1.5);                  // white/red flash fades fast
      const recoil = Math.sin(Math.min(1, u*1.6)*Math.PI);   // snap out then settle
      P.knockX = (1 - Math.pow(1-u, 2))*9;                   // slides back, ease-out
      P.lean = -13*recoil;                                   // torso thrown back
      P.bodyY = -0.5 - recoil*1.2;
      P.headTilt = -6*recoil;                                // head snaps back
      P.armF = 16*recoil; P.armB = -12*recoil; P.elbowF = 10; P.elbowB = 10;
      P.swordTilt = 44 + recoil*22;
      // o golpe ESMAGA no primeiro quadro, depois o corpo estica ao ser
      // jogado pra trás — sem isso o dano lê como um deslize lateral
      const imp = Math.max(0, 1 - u*4);
      P.sqX = 1 + imp*0.13 - recoil*0.05; P.sqY = 1 - imp*0.12 + recoil*0.05;
      P.plume = 11*recoil - imp*4;                           // penacho é jogado com atraso
    } else if(anim==='die'){
      const u = S;
      P.hurtFlash = Math.max(0, 0.9 - u*5);                  // brief flash on the hit
      P.dead = u > 0.6;
      let fall = 0;
      if(u<0.15){ const k=u/0.15;                            // impact + head snap
        P.headTilt = -8*k; P.plume = 10*k;
      } else if(u<0.6){ const k=(u-0.15)/0.45;               // topple back onto the ground
        fall = k; if(k>0.7) P.dust=(k-0.7)/0.3;              // dust as the back lands
      } else { const k=(u-0.6)/0.4;                          // lying still, plume settles
        fall = 1; P.plume = 6 + Math.sin(k*7)*2.5*(1-k);
      }
      const ease = fall<0.5 ? 2*fall*fall : 1-Math.pow(-2*fall+2,2)/2;
      P.dieAngle = -ease*90;                                 // rotates flat onto his back
      P.dieFall = ease;
      P.headTilt = -8 - ease*4;                              // head lolls back
      P.hipF = 4 + ease*8; P.hipB = 4 + ease*2;             // legs relax out straight (not up)
      P.kneeF = 6 + ease*10; P.kneeB = 6 + ease*6;
      P.armF = ease*28; P.armB = ease*14;                   // arms flop outward
      P.swordTilt = 44 + ease*38; P.lean = 0;
    } else if(anim==='defend'){
      const b = Math.sin(S*Math.PI*2);
      P.shield = 1;
      P.shieldRaise = 1 + Math.max(0,b)*0.1;    // subtle brace
      P.bodyY = -0.3 + b*0.25;                   // barely crouched — helmet clears the shield
      P.lean = 4;
      P.hipF = 6; P.hipB = 12;                   // braced, back leg planted
      P.kneeF = 18; P.kneeB = 24;
      P.headTilt = 1;
      P.plume = b*1.6;
    } else if(anim==='bhurt'){
      const u = S;
      P.shield = 1;
      const imp = Math.max(0, 1 - u*2.2);        // impact envelope, fades fast
      P.hurtFlash = 0;                            // sem vermelho: golpe foi aparado
      P.shieldRaise = 1 + imp*0.5;               // shield jolts up into the blow
      P.knockX = (1 - Math.pow(1-Math.min(1,u*1.4), 2))*6;   // skids back
      P.bodyY = 0.6 + imp*1.2;                   // compressed under the hit
      P.lean = 5 + imp*5;                        // braced hard into the shield
      P.hipF = 6; P.hipB = 14;
      P.kneeF = 20 + imp*8; P.kneeB = 28 + imp*8;
      P.headTilt = 1 - imp*3;                    // head ducks
      P.shake = imp*1.6;
      P.blockSpark = imp;                        // sparks off the shield face
      P.blockFlash = imp;                        // piscada BRANCA — golpe aparado, sem dano
      P.plume = 2 + imp*7;
    } else if(anim==='bfly'){
      const s = S*tau;
      P.bat = 1; P.airborne = true;
      // glides side to side and bobs — so there IS a direction of travel
      P.batX = Math.sin(s)*20;
      P.batY = -Math.abs(Math.cos(s))*4 + Math.sin(s*2)*1.4;
      // turn to FACE the horizontal direction it's heading (vx = d(batX))
      const vx = Math.cos(s);
      P.batYaw = Math.max(-1,Math.min(1, vx*1.15));
      P.batTilt = vx*0.12;   // slight bank into the turn
      P.batWing = Math.sin(s*2);
    } else if(anim==='bdie'){
      const u = S;
      P.bat = 1; P.airborne = true;
      if(u<0.14){ const k=u/0.14; P.batFlash = 1-k; P.batY = -2; P.batWing = 0.9; P.shake = 1.4; }
      else if(u<0.60){ const k=(u-0.14)/0.46; P.batFall = k*k; P.batSpin = k*2; P.batWing = 0.25; }
      else if(u<0.78){ P.batFall = 1; P.batPoof = (u-0.60)/0.18; P.batGone = u>0.65; }
      else { P.batPoof = 1; P.batGone = true; P.batFade = (u-0.78)/0.22; }
    }
    return P;
  }

  selOut(fill: string): string {
    if(!this._so) this._so = {};
    if(this._so[fill]) return this._so[fill];
    let v = this.C.out;
    if(typeof fill==='string' && fill[0]==='#' && fill.length===7){
      const n=parseInt(fill.slice(1),16), r=(n>>16)&255, g=(n>>8)&255, b=n&255, f=0.30;
      v='rgb('+Math.round(r*f+7)+','+Math.round(g*f+6)+','+Math.round(b*f+6)+')';
    }
    this._so[fill]=v; return v;
  }
  /**
   * Sel-out de INTERIOR: contorno a 58% do preenchimento em vez de 30%.
   *
   * Contorno quase preto é certo na borda EXTERNA — é ele que recorta a
   * silhueta contra o fundo — e errado entre peças do MESMO membro. Cada
   * bloco aqui tem 4-6px de largura, e `render()` entrega o buffer de
   * 100px num quadrado de 60px com vizinho-mais-próximo: 40% das colunas
   * são descartadas antes de chegar na tela. Com contorno a 30% o membro
   * perde duas colunas de seis pro preto e o que sobra é borrão.
   */
  selOutSoft(fill: string): string {
    if(this._soSoft[fill]) return this._soSoft[fill];
    let v = this.C.outSoft;
    if(typeof fill==='string' && fill[0]==='#' && fill.length===7){
      const n=parseInt(fill.slice(1),16), r=(n>>16)&255, g=(n>>8)&255, b=n&255, f=0.58;
      v='rgb('+Math.round(r*f)+','+Math.round(g*f)+','+Math.round(b*f)+')';
    }
    this._soSoft[fill]=v; return v;
  }
  blk(x: number, y: number, w: number, h: number, fill: string, light?: string, shade?: string, soft?: boolean): void {
    const c=this.bctx;
    c.fillStyle=soft?this.selOutSoft(fill):this.selOut(fill); c.fillRect(x-1,y-1,w+2,h+2);
    c.fillStyle=fill; c.fillRect(x,y,w,h);
    if(light){ c.fillStyle=light; c.fillRect(x,y,w,1); c.fillRect(x,y,1,h); }
    if(shade){ c.fillStyle=shade; c.fillRect(x,y+h-1,w,1); c.fillRect(x+w-1,y,1,h); }
  }
  r(x: number, y: number, w: number, h: number, fill: string): void { this.bctx.fillStyle=fill; this.bctx.fillRect(x,y,w,h); }
  // checkerboard dither — 16-bit style tone blending
  dith(x: number, y: number, w: number, h: number, fill: string): void { const c=this.bctx; c.fillStyle=fill; x=Math.round(x); y=Math.round(y);
    for(let i=0;i<w;i++) for(let j=0;j<h;j++) if(((i+j)&1)===0) c.fillRect(x+i,y+j,1,1); }

  drawBat(P: Pose): void {
    const c=this.bctx, C=this.C;
    const fur='#4a3b52', furL='#6f5a7d', furD='#322638', mem='#2a2333', memL='#3f3450';
    // pufe de poeira ao bater no chão
    if(P.batPoof){
      const p=P.batPoof, a=Math.max(0,1-(P.batFade||0))*(1-p*0.5);
      const r=3+p*11;
      c.fillStyle='rgba(150,135,110,'+(0.55*a)+')';
      const pts=[[-r,-2],[r,-2],[-r*0.6,-r*0.5-3],[r*0.6,-r*0.5-3],[0,-r*0.7-3]];
      for(const q of pts){ c.fillRect(Math.round(q[0]!)-1, Math.round(q[1]!)-1, 3, 3); }
      c.fillStyle='rgba(205,192,170,'+(0.45*a)+')';
      for(const q of pts){ c.fillRect(Math.round(q[0]!*0.55), Math.round(q[1]!*0.6)-1, 2, 2); }
    }
    if(P.batGone) return;
    c.save();
    c.translate((P.batX||0), -36 + (P.batY||0) + (P.batFall||0)*31);
    if(P.batTilt) c.rotate(P.batTilt);
    if(P.batSpin) c.rotate(P.batSpin*Math.PI);
    // yaw: foreshorten horizontally so it reads as turned toward its heading
    const yaw = P.batYaw||0;
    if(yaw) c.scale(1 - 0.34*Math.abs(yaw), 1);
    const hx = Math.round(yaw*2.4);   // slide the face/gaze toward direction of travel
    const wa=(P.batWing||0)*0.85;
    // asas de membrana — 2 segmentos por lado, batendo
    for(const s of [-1,1]){
      c.save();
      c.translate(s*4, -1);
      c.rotate(-s*wa);
      this.blk(s<0?-7:0, -1, 7, 4, mem, memL, furD);
      this.r(s<0?-6:1, 3, 5, 1, furD);             // recorte inferior
      c.translate(s*7, 0);
      c.rotate(-s*wa*0.8);
      this.blk(s<0?-7:0, -1, 7, 3, mem, memL, furD);
      this.r(s<0?-7:4, 2, 3, 1, furD);             // ponta recortada
      this.r(s<0?-7:6, -2, 1, 2, furL);            // garra da asa
      c.restore();
    }
    // corpo peludo
    this.blk(-5, -4, 10, 9, fur, furL, furD);
    this.r(-4, -4, 8, 1, furL);
    this.dith(-5, 2, 10, 2, furD);
    // orelhas
    this.blk(-5, -7, 2, 3, fur, furL, furD); this.r(-5, -8, 1, 2, fur);
    this.blk(3, -7, 2, 3, fur, furL, furD); this.r(4, -8, 1, 2, fur);
    // olhos vermelhos — deslocados na direção do voo (o olhar segue o movimento)
    this.r(-3+hx, -2, 2, 1, C.emberHot); this.r(1+hx, -2, 2, 1, C.emberHot);
    this.r(-3+hx, -2, 1, 1, '#e06a4a'); this.r(2+hx, -2, 1, 1, '#e06a4a');
    // focinho + presas
    this.r(-1+hx, 0, 2, 2, furD);
    this.r(-2+hx, 2, 1, 2, '#e8e2d5'); this.r(1+hx, 2, 1, 2, '#e8e2d5');
    // patinhas
    this.r(-3, 5, 1, 2, furD); this.r(2, 5, 1, 2, furD);
    // flash branco de dano
    if(P.batFlash){ c.fillStyle='rgba(255,255,255,'+(0.85*P.batFlash)+')'; c.fillRect(-14, -9, 28, 17); }
    c.restore();
  }

  /**
   * Perna. `back` = membro DISTANTE.
   *
   * O membro PRÓXIMO é um cilindro com ramp explícito de 4 valores ao
   * longo da largura — aresta quente / face iluminada / massa / sombra de
   * núcleo — e não um bloco chapado com uma linha clara de 1px. Duas
   * razões, as duas medidas na cena escura e não deduzidas:
   *
   *   1. detalhe de 1px é cara-ou-coroa. `render()` reduz o buffer de
   *      100px pra 60px com vizinho-mais-próximo, então 40% das colunas
   *      somem antes da tela. Toda aresta que PRECISA ler tem 2px.
   *   2. a sombra de núcleo (as duas colunas escuras do lado que encosta
   *      na perna de trás) é o que separa os dois membros onde eles se
   *      cruzam. Sem ela, dois cilindros do mesmo valor viram um só, por
   *      mais que o de trás esteja mais escuro.
   *
   * O membro distante desce dois degraus (C.stFar) e mantém aresta
   * própria — precisa existir contra o fundo, só que atrás.
   */
  drawLeg(hipX: number, hipY: number, hipAng: number, kneeAng: number, back: boolean): void {
    const C=this.C, c=this.bctx;
    const m = back?C.stFar:C.stM, l = back?C.stFarL:C.stL, d = back?C.stFarD:C.stD;
    c.save();
    c.translate(hipX, hipY);
    c.rotate(-hipAng*Math.PI/180);
    // thigh (cuisse) — stubby, with plate seam
    this.blk(-3, 0, 6, 5, m, l, d, !back);
    if(!back){
      this.r(-3, 0, 2, 5, C.stL);              // face iluminada (2px: sobrevive ao downscale)
      this.r(-3, 0, 1, 5, C.stH);              // aresta quente
      this.r( 1, 0, 2, 5, C.stD);              // sombra de núcleo
      this.r( 2, 0, 1, 5, C.stFarD);           // contato com a perna de trás
      this.r(-1, 2, 2, 1, C.stD);              // costura da placa (só sobre a massa)
      this.r(-2, 3, 1, 1, C.rust);
    } else {
      this.r(-3, 0, 1, 5, C.stFarL);           // aresta do distante: existe, mas abaixo da massa do próximo
      this.r( 2, 0, 1, 5, '#16181c');
      this.r(-3, 2, 6, 1, C.stFarD);           // costura
    }
    // knee cop
    c.translate(0, 4);
    c.rotate(kneeAng*Math.PI/180);
    this.blk(-2.5, 0, 5, 2, back?C.goldFar:C.goldD, back?C.goldD:C.gold, C.out, !back);
    if(!back) this.r(-2.5, 0, 2, 1, C.gold);   // joelho pega o céu
    // shin (greave) with center ridge
    this.blk(-2.5, 1, 5, 4, m, l, d, !back);
    if(!back){
      this.r(-2.5, 1, 2, 4, C.stL);
      this.r(-2.5, 1, 1, 4, C.stH);
      this.r( 1.5, 1, 1, 4, C.stD);
      this.dith(-0.5, 3, 2, 1, C.stD);         // greave curve blend
      this.r(1, 2, 2, 2, C.stRot); this.r(2, 3, 1, 1, C.rotD);   // greva comida
    } else {
      this.r(-2.5, 1, 1, 4, C.stFarL);
      this.r( 1.5, 1, 1, 4, '#16181c');
    }
    // Sabaton continua sendo SOMBRA — bota clara puxava o olho pro chão.
    // Mas o pé do membro próximo é o que conta a passada, e preto sobre
    // chão preto não conta nada: o plano de cima (peito do pé) vira pro
    // céu e pega luz, a sola continua fechada.
    this.blk(-3, 4, 8, 4, back?C.leFarD:'#4a3520', back?C.leFarM:C.leM, '#150e0a', !back);
    if(!back){
      this.r(-2, 4, 7, 1, C.leM);              // plano de cima
      this.r( 1, 4, 3, 1, C.leHi);             // biqueira pega o céu
      this.r(-3, 6, 8, 2, '#1a120d');          // sola: fechada
      this.r( 3, 6, 2, 1, '#120c08');          // ponta
    } else {
      this.r(-3, 4, 8, 1, C.leFarM);           // plano de cima, dois degraus abaixo
      this.r(-3, 6, 8, 2, '#120c08');
    }
    c.restore();
  }

  drawArm(sign: number, shX: number, shY: number, ang: number, elbow: number, withSword: boolean, back: boolean, tilt?: number): void {
    if(tilt===undefined) tilt = 44;
    const C=this.C, c=this.bctx;
    // Mesmo ramp de profundidade da perna: braço próximo é cilindro com
    // aresta quente + face iluminada de 2px + sombra de núcleo; braço
    // distante desce dois degraus. O braço de trás cruza POR CIMA do
    // torso (vai buscar o punho da espada) — a um degrau só ele ficava a
    // 19 de luma do peitoral e sumia dentro dele.
    const m = back?C.stFar:C.stM, l = back?C.stFarL:C.stL, d = back?C.stFarD:C.stD;
    c.save();
    c.translate(shX, shY);
    c.rotate((ang*sign)*Math.PI/180);
    // upper arm (rerebrace) — stubby
    this.blk(-2.5, 0, 5, 5, m, l, d, !back);
    if(!back){
      this.r(-2.5, 0, 2, 5, C.stL);
      this.r(-2.5, 0, 1, 5, C.stH);
      this.r( 1.5, 0, 1, 5, C.stD);
    } else {
      this.r(-2.5, 0, 1, 5, C.stFarL);
      this.r( 1.5, 0, 1, 5, '#16181c');
    }
    // couter (elbow) + bend
    c.translate(0, 5);
    c.rotate((elbow*sign)*Math.PI/180);
    // Couter: brilho de 2px de LARGURA (sobrevive ao downscale) mas de 1px
    // só de altura. Cheio, os dois cotovelos caem na linha do cinto e —
    // com a fivela e o punho — refazem a faixa clara atravessando a
    // barriga que esta arte já tinha corrigido uma vez.
    this.blk(-2.5, 0, 5, 2, back?C.goldFar:C.goldD, back?C.goldD:C.gold, C.out, !back);
    if(!back) this.r(-2.5, 0, 2, 1, C.gold);   // couter spec
    // forearm (vambrace)
    this.blk(-2, 1, 4, 5, m, l, d, !back);
    if(!back){
      this.r(-2, 1, 2, 5, C.stL);              // vambrace ridge
      this.r(-2, 1, 1, 5, C.stH);
      this.r( 1, 1, 1, 5, C.stD);
      this.dith(-1, 4, 2, 1, C.stD);           // vambrace curve blend
    } else {
      this.r(-2, 1, 1, 5, C.stFarL);
      this.r( 1, 1, 1, 5, '#16181c');
    }
    // Manopla escura. Em couro claro as duas manoplas caíam exatamente na
    // linha do cinto e, junto com a fivela e o punho da espada, formavam
    // uma faixa clara atravessando a barriga — o pior tipo de ruído, no
    // meio exato do personagem.
    this.blk(-2.5, 5, 5, 4, back?C.leFarM:'#3a2a1a', back?C.leD:C.leM, '#1a120d', !back);
    this.r(-2.5, 5, 5, 1, back?C.leFarM:C.leM); // cuff catch-light
    this.r(-2.5, 8, 5, 1, '#1a120d');
    if(!back){ this.r(1, 6, 2, 2, C.rotD); this.r(1, 6, 1, 1, C.rotM); }  // podridão no punho
    if(withSword){
      // fist pivot — blade points UP, slight outward wrist tilt
      c.translate(0, 7);
      c.rotate(((-(ang + elbow))*sign + tilt)*Math.PI/180); // counter chain + pose-driven tilt
      this.blk(-1, -1, 2, 4, C.leM, C.leL, C.leD);   // grip in fist
      this.r(-1, 0, 1, 1, C.leHi);                   // grip wrap glint
      this.r(-1.5, 3, 3, 2, C.gold);                 // pommel (below)
      this.r(-1, 3, 1, 1, C.ember);                  // pommel gem
      // crossguard — darkened tips
      this.blk(-5, -3, 10, 2, C.gold, C.goldHi, C.goldD);
      this.r(-5, -3, 1, 2, C.goldD); this.r(4, -3, 1, 2, C.goldD);
      // Lâmina picada, em decomposição. O specular corre só no TERÇO
      // superior: antes ia de ponta a ponta e era o pixel mais claro do
      // personagem inteiro — a espada roubava a leitura do guerreiro.
      this.blk(-2, -21, 4, 18, C.blM, C.blL, C.blD);
      this.r(1, -20, 1, 17, C.blD);                  // dark cutting edge (right)
      this.r(-2, -20, 1, 17, C.blL);                 // bright edge (left)
      this.r(0, -20, 1, 7, C.stHH);                  // fuller: brilho só perto da ponta
      this.r(0, -13, 1, 9, C.blM);
      this.r(-2, -9, 4, 1, C.rust);                  // rust nicks
      this.r(0, -15, 2, 1, C.rustD);
      this.r(-2, -12, 2, 1, C.rust);
      this.r(-1, -6, 2, 1, C.rustD);                 // pitting near guard
      // corrosão: mordidas que comem a SILHUETA da lâmina, não manchas
      // pintadas em cima — é a borda irregular que lê como metal doente.
      this.r(-2, -17, 2, 2, C.stRot); this.r(-2, -17, 1, 1, C.rotD);
      this.r(1, -11, 1, 3, C.stRotD); this.r(-2, -7, 1, 2, C.stRotD);
      this.r(0, -16, 1, 1, C.rotM);
      this.r(-2, -24, 4, 3, C.blD);                  // tapered tip
      this.r(-1, -25, 2, 1, C.blM);
      this.r(0, -23, 1, 2, C.stSpec);                // tip glint
    }
    c.restore();
  }

  drawKnight(P: Pose): void {
    const C=this.C, c=this.bctx;
    const by = P.bodyY, ln = P.lean;
    if(P.bat){ this.drawBat(P); return; }
    if(P.climb){ this.drawClimbBack(P, by); return; }

    // ---- BACK leg (in shadow) ----
    this.drawLeg(4, -12 + by, P.hipB, P.kneeB, true);
    // ---- FRONT leg ----
    this.drawLeg(-2, -12 + by, P.hipF, P.kneeF, false);

    c.save();
    c.translate(0, by);
    c.translate(0, 2);   // pernas mais curtas → tronco desce junto
    c.translate(0, -20); c.rotate(ln*Math.PI/180); c.translate(0, 20); // torso lean

    // ---- faulds (skirt lames) over the hips ----
    // Escurecidas de propósito: são a "cintura" entre o aço claro do torso
    // e as pernas. Se ficarem no mesmo valor do peito, torso/quadril/perna
    // viram uma massa só na escala real (~38px de altura na tela).
    this.blk(-8, -18, 16, 4, C.leD, C.leM, '#1d1410');
    this.r(-8, -18, 16, 1, C.leM);                   // lame catch-light
    this.blk(-8, -16, 7, 4, C.leD, C.leM, '#1d1410');// left tasset
    this.blk(1, -16, 7, 4, '#2e2015', C.leD, '#1d1410'); // right tasset (lado sombra)
    this.r(-8,-15,2,1,C.necro); this.r(6,-13,2,1,C.necro);  // veias violeta no couro

    // ---- surcoat / tabardo ----
    // Existe por três motivos, nesta ordem: (1) dá MASSA DE COR ao meio do
    // corpo, que era um borrão marrom sem estrutura; (2) rima com o vermelho
    // do penacho e fecha a composição em duas âncoras; (3) é onde a podridão
    // aparece primeiro sem virar monstro — pano apodrece antes de aço.
    // Valores propositalmente ABAIXO do penacho: o vermelho vivo é do
    // penacho (topo, ponto focal), o do tabardo é apodrecido e apagado.
    // Dois vermelhos do mesmo brilho brigariam e o olho não saberia onde ir.
    // Barra na altura do JOELHO, não abaixo: um tabardo mais longo tapava
    // a canela e a perna inteira virava um toco de bota. A perna precisa
    // de comprimento visível pra passada de corrida ler.
    const tbM='#5a1c17', tbL='#78241c', tbD='#33110f';
    this.blk(-5, -20, 10, 8, tbM, tbL, tbD);
    this.r(-5, -20, 1, 7, tbL);                      // dobra iluminada (esquerda)
    this.r( 4, -20, 1, 7, tbD);                      // dobra na sombra
    this.r(-1, -20, 1, 7, tbL);                      // vinco central
    this.dith(-4, -14, 8, 2, tbD);                   // sombra da barra
    // manchas: sangue velho escurecido e a mancha VERDE que não é sangue
    this.r(-3,-18,2,1,tbD); this.r(2,-16,2,1,tbD);
    this.r(1,-19,3,2,C.rotM); this.r(2,-19,1,1,C.rotL);   // a podridão comendo o pano
    this.r(-4,-15,2,2,C.rotD);
    // barra comida: o pano some em farrapos, sem borda reta
    this.r(-5,-13,2,2,C.rotD); this.r(2,-13,2,1,C.rotD);
    this.r(-3,-13,2,3,tbM); this.r(0,-13,2,2,tbD); this.r(3,-13,1,2,tbM);
    this.r(-3,-11,1,1,C.rotM); this.r(3,-12,1,1,C.rotM);
    this.r(1,-16,1,1,C.rotD); this.r(-2,-17,1,1,C.rotD);  // furos abertos

    // ---- belt ----
    this.blk(-8, -22, 16, 4, C.leD, C.leM, '#241811');
    this.r(-7,-20,2,1,'#241811'); this.r(3,-20,2,1,'#241811'); // stitching
    this.blk(-2, -21, 4, 3, C.gold, C.goldHi, C.goldD);  // buckle
    this.r(-1,-20,1,1,C.goldHi);                          // buckle glint

    // ---- cuirass: two overlapping plates (short chibi torso) ----
    this.blk(-9, -29, 18, 6, C.stM, C.stL, C.stD);        // upper chest
    this.r(-1, -29, 2, 6, C.stL);                          // center ridge highlight
    this.r(-1, -29, 1, 2, C.stSpec);                       // ridge spec
    this.r(-8, -28, 1, 4, C.stH);                          // left light
    this.r(7, -28, 1, 4, C.stD);                           // right shade
    this.blk(-8, -25, 16, 4, C.stM, C.stL, C.stD);         // lower chest (overlaps)
    this.r(-8, -25, 16, 1, C.stBd);                        // overlap shadow line
    this.dith(-8, -24, 16, 1, C.stD);                      // plate curvature blend
    // rivets + weathering + battle scars
    this.r(-6,-28,1,1,C.goldHi); this.r(5,-28,1,1,C.gold);
    this.r(3,-27,2,1,C.rust); this.r(-5,-24,1,1,C.rustD);
    this.r(2,-24,3,1,C.stBd); this.r(4,-23,2,1,C.stBd);    // diagonal scar
    this.r(-7,-27,1,2,C.rustD);                            // rust streak
    // ---- corrosão no peito: NÃO é ferrugem, é a coisa comendo a placa ----
    // Uma mancha grande e chapada leria como sujeira. O que lê como
    // apodrecimento é a borda: núcleo quase preto, halo médio, e uma linha
    // clara só onde ainda está avançando sobre o metal limpo.
    this.r(4,-29,4,3,C.stRot); this.r(5,-28,3,2,C.rotM);
    this.r(6,-28,1,1,C.rotD); this.r(4,-27,1,1,C.rotL);    // furo + frente ativa
    this.r(-7,-26,3,2,C.stRot); this.r(-6,-26,2,1,C.rotM);
    this.r(-6,-25,1,1,C.rotD);
    this.r(-9,-24,2,1,C.rotD); this.r(6,-23,3,1,C.rotD);   // borda inferior comida

    // ---- pauldrons (rounded, layered, gold-trimmed) ----
    // Alargadas até ±16: com o elmo em ±10 o OMBRO passa a ser a parte mais
    // larga do personagem. Antes elmo e ombro tinham a mesma largura e a
    // silhueta virava um retângulo — a cabeça engolia o corpo.
    // Também são o valor MAIS CLARO do boneco: viradas pro céu.
    // Empilhadas em escada estreita→larga→estreita: é isso que lê como
    // domo. Três retângulos do mesmo comprimento leem como prateleira.
    this.blk(-15, -32, 8, 3, C.stL, C.stH, C.stD);       // lame superior (a mais clara)
    this.r(-14,-32,5,1,C.stSpec);                        // spec catch do céu
    this.blk(-16, -30, 9, 3, C.stM, C.stL, C.stD);       // lame do meio (a mais larga)
    this.r(-16,-30,1,3,C.stH);
    this.r(-16,-28,9,1,C.goldD);                         // trim dourado
    this.blk(-14, -27, 7, 3, C.stB, C.stM, C.stBd);      // lame inferior (recua na sombra)
    // Ombro do fundo: UM degrau abaixo, não dois. A regra dos dois degraus
    // vale pra membros que se CRUZAM (perna com perna, braço sobre torso),
    // onde duas formas iguais precisam se separar. As espáldeiras estão
    // separadas pelo tronco inteiro — a dois degraus o ombro de trás virou
    // buraco preto e a silhueta perdeu o lado direito, que é justamente a
    // parte mais larga do personagem. Aqui basta apagar o brilho.
    this.blk(8, -32, 7, 3, C.stB, C.stM, C.stBd);        // ombro do fundo
    this.r(9,-32,4,1,C.stL);
    this.blk(7, -30, 9, 3, C.stB, C.stM, C.stBd);
    this.r(7,-28,9,1,C.goldFar);
    this.blk(8, -27, 7, 3, C.stBd, C.stB, '#1c1e22');
    this.r(-12,-31,1,1,C.goldHi); this.r(11,-31,1,1,C.goldD);
    // a espáldua da frente está sendo comida pela borda de fora — a
    // corrosão ataca a ARESTA, que é onde o metal fica exposto ao ar.
    this.r(-16,-29,2,2,C.stRot); this.r(-16,-28,1,1,C.rotD);
    this.r(-14,-26,3,2,C.stRot); this.r(-13,-26,2,1,C.rotM); this.r(-12,-25,1,1,C.rotL);
    this.r(14,-26,2,1,C.rotD);

    // ---- gorget (neck plates) — agora VISÍVEL, é o pescoço ----
    // Regra que estava faltando: o pescoço só existe se for MAIS ESCURO e
    // MAIS ESTREITO que a cabeça. Antes tinha o mesmo valor do queixo e as
    // duas peças viravam um bloco. A faixa preta no topo é a sombra que a
    // cabeça projeta — é ela que abre o entalhe na silhueta.
    this.blk(-5, -34, 10, 5, '#26282d', C.stD, '#15171a');
    this.r(-5,-34,10,2,'#101215');                       // sombra projetada pelo elmo
    this.r(-5,-31,10,1,'#15171a');                       // separação entre lames
    this.r(-5,-32,1,3,C.stB);                            // aresta iluminada
    // por baixo do gorget a podridão SOBE pro elmo — a origem está nele
    this.r(-6,-31,4,2,C.rotD); this.r(-5,-31,3,1,C.rotM);
    this.r(-4,-32,2,1,C.rotL);                           // frente ativa
    this.r(2,-31,4,2,C.rotD); this.r(3,-30,2,1,C.rotM);

    // ---- helmet ----
    // A escala caiu de 1.16 pra 1.04 e a largura de ±11 pra ±10: medido na
    // escala real, o elmo era TÃO largo quanto as espáldeiras e o corpo
    // inteiro sumia atrás dele. Chibi ainda é chibi — a cabeça continua
    // ~1/3 da altura — mas agora o ombro é a parte mais larga.
    const ht = P.headTilt;
    c.save(); c.translate(0, -36); c.rotate(ht*Math.PI/180); c.translate(0, 36);
    // Sobe 2px: abre um PESCOÇO visível (o gorget) entre a base do elmo e a
    // linha dos ombros. Sem esse vão a cabeça encostava direto na espáldua
    // e cabeça+ombro liam como um bloco só.
    c.translate(0, -2);
    c.translate(0, -32); c.scale(1.04, 1.04); c.translate(0, 32);
    // rounded dome (stacked narrowing rows, corners eroded for a rounder read)
    this.blk(-9, -51, 18, 10, C.stM, C.stL, C.stD);
    this.r(-8, -53, 16, 2, C.stM); this.r(-8, -53, 16, 1, C.stL);
    this.r(-5, -55, 10, 2, C.stM); this.r(-5, -55, 10, 1, C.stHH);
    this.r(-9, -50, 1, 9, C.stH);            // left light edge
    this.r(8, -50, 1, 9, C.stD);             // right shade edge
    // dithered tone transitions (16-bit shading)
    this.dith(-8, -46, 16, 2, C.stD);        // lower dome blend
    this.dith(-6, -53, 7, 1, C.stHH);        // top sheen blend
    // corner erosion (rounds the silhouette)
    this.r(-10,-52,2,1,C.out); this.r(8,-52,2,1,C.out);
    this.r(-9,-54,2,1,C.out); this.r(7,-54,2,1,C.out);
    // specular cluster upper-left
    this.r(-4,-54,3,1,C.stSpec); this.r(-6,-53,2,1,C.stSpec); this.r(-7,-51,1,2,C.stHH);
    this.r(4,-52,3,1,C.stBd); this.r(6,-51,2,1,C.stBd);     // old dent (right)
    // ---- a podridão subiu do pescoço e está na base do elmo ----
    // Ancorada embaixo e à direita: cresce PARA CIMA, contra a gravidade,
    // que é o detalhe que faz não parecer só sujeira acumulada.
    this.r(6,-47,3,4,C.stRot); this.r(7,-46,2,3,C.rotM);
    this.r(7,-45,1,1,C.rotD); this.r(6,-48,2,1,C.rotL);     // frente ativa subindo
    this.r(-8,-44,3,2,C.stRot); this.r(-7,-44,2,1,C.rotM);
    this.r(-8,-45,1,1,C.rotL);
    // brow band with rivets (gold — a barra clara que separa cúpula de viseira)
    this.r(-9, -43, 18, 2, C.gold); this.r(-9, -42, 18, 1, C.goldD);
    this.r(-7,-43,1,1,C.goldHi); this.r(-2,-43,1,1,C.goldHi); this.r(3,-43,1,1,C.goldHi); this.r(7,-43,1,1,C.goldHi);
    this.r(4,-43,3,1,C.rotM); this.r(5,-42,2,1,C.rotD);     // o ouro também está sendo comido
    // cheek guards
    this.blk(-10, -41, 3, 9, C.stD, C.stB, '#232529');
    this.blk(7, -41, 3, 9, C.stD, C.stB, '#232529');
    this.r(-10,-41,1,4,C.stBl); this.r(9,-41,1,4,C.stBd);   // cheek rim light/shade
    this.r(7,-35,3,2,C.stRot); this.r(8,-34,2,1,C.rotD);    // bochecha direita corroída
    // ---- viseira em TRÊS FAIXAS ----
    // Antes era um retângulo preto de 16x9 — o maior elemento do
    // personagem, e vazio. Preto puro não é desenho, é buraco. Agora:
    // barra de olhos escura, e queixo de aço com respiros. Três valores
    // empilhados leem como rosto mesmo reduzido a 16px de altura.
    this.r(-7, -41, 14, 6, C.visor);          // recesso dos olhos
    this.r(-7, -41, 14, 1, '#000000');
    this.blk(-7, -35, 14, 4, C.stB, C.stM, C.stBd);   // queixo (beaver)
    this.r(-7, -35, 14, 1, C.stBl);           // aresta iluminada do queixo
    this.r(-5, -33, 2, 1, '#0a0a0a'); this.r(-1, -33, 2, 1, '#0a0a0a'); this.r(3, -33, 2, 1, '#0a0a0a');
    this.r(-6, -32, 12, 1, C.stBd);
    // nose guard (vertical bar) — só até a barra de olhos
    this.r(-1, -43, 2, 7, C.stM); this.r(-1, -43, 1, 7, C.stL);
    this.r(-1, -43, 1, 2, C.stSpec);                         // nasal top glint
    // ---- olhos: brasa doente, não vazio ----
    // Um par de brasas dessaturadas dentro do preto. Fazem duas coisas de
    // uma vez: dão foco ao rosto na escala pequena (era o buraco preto) e
    // dizem que tem algo errado com ele sem nenhum sinal grotesco.
    this.r(-6, -40, 5, 4, '#040404');
    this.r(2, -40, 5, 4, '#040404');
    this.r(-5, -39, 3, 2, C.rotEye); this.r(3, -39, 3, 2, C.rotEye);
    this.r(-4, -39, 2, 1, C.rotEyeHot); this.r(4, -39, 2, 1, C.rotEyeHot);
    this.r(-5, -37, 3, 1, C.rotD); this.r(3, -37, 3, 1, C.rotD);   // vazamento por baixo

    // ---- plume / crest (fuller red horsehair arcing back) ----
    const sway = P.plume;
    this.blk(-1, -57, 5, 4, C.goldD, C.gold, C.out);   // crest holder
    this.r(0, -57, 1, 1, C.goldHi);
    const N = 11;
    for(let i=0;i<N;i++){
      const k = i/(N-1);
      const px = 2 - i*1.0 + sway*(0.08+k*0.3);
      const py = -57 - Math.sin(k*Math.PI*0.55)*10 - k*2;
      const w = 4 - (i>8?1:0);
      // value ramp: dark root → hot mid → deep tip
      const col = k<0.2 ? C.plD : (k<0.55 ? C.plM : (k<0.8 ? C.plL : C.plM));
      this.blk(px, py, w, 5, col, (k>0.3&&k<0.85)?C.plHot:C.plL, C.plD);
      if(i%3===1) this.r(px+1, py+1, 1, 3, C.plD);      // strand grooves
    }
    // stray wisps at the tip
    const wx = 2 - (N-1)*1.0 + sway*0.38;
    this.r(wx-2, -69, 1, 3, C.plD);
    this.r(wx-3, -66, 1, 2, C.plM);
    c.restore(); // helmet tilt
    c.restore(); // torso lean

    // ---- rastro do golpe carregado (crescente atrás da lâmina) ----
    if(P.thrustTrail>0){
      // rastro RETO de perfuração: linhas de velocidade horizontais na altura da lâmina
      const tt = P.thrustTrail;
      const bx = 14 + (P.lungeX||0);            // começa à frente do punho
      const byl = -26 + by;                      // linha da lâmina (horizontal na estocada)
      c.save();
      // cunha central branca (extensão da ponta)
      c.fillStyle = 'rgba(255,255,255,'+(0.9*tt)+')';
      c.fillRect(bx, byl-1, 26*tt, 3);
      c.fillRect(bx+26*tt, byl, Math.max(2,8*tt), 1);   // ponta afinando
      c.fillStyle = 'rgba(238,243,248,'+(0.75*tt)+')';
      c.fillRect(bx-2, byl-2, 20*tt, 1);
      c.fillRect(bx-2, byl+2, 20*tt, 1);
      // risquinhos de velocidade acima/abaixo
      c.fillStyle = 'rgba(201,210,220,'+(0.6*tt)+')';
      c.fillRect(bx+4, byl-4, 12*tt, 1);
      c.fillRect(bx+6, byl+4, 10*tt, 1);
      c.restore();
    }
    if(P.slashArc>0){
      // rastro só à FRENTE da lâmina: cunha curta que estende o alcance do corte
      const shx=-9, shy=-26+by;
      const rad=Math.PI/180;
      const aCur=P.swordTilt*rad;                       // ângulo REAL da lâmina no mundo
      if(aCur > 0.5){                                   // só quando a lâmina já aponta pra frente/baixo
        // crescente de energia estilo Sonic Boom: meia-lua sólida com camadas
        const drawCrescent = (Ro: number, thick: number, color: string) => {
          const a1 = aCur + 0.18;                        // ponta dianteira (à frente da lâmina)
          const a0 = aCur - 1.55;                        // ponta traseira (arco bem aberto)
          const steps = 16;
          c.beginPath();
          for(let i=0;i<=steps;i++){ const t=i/steps, a=a0+(a1-a0)*t;
            c.lineTo(shx+Math.sin(a)*Ro, shy+Math.cos(a)*Ro); }
          for(let i=steps;i>=0;i--){ const t=i/steps, a=a0+(a1-a0)*t;
            const r = Ro - thick*Math.sin(t*Math.PI);    // afina nas pontas
            c.lineTo(shx+Math.sin(a)*r, shy+Math.cos(a)*r); }
          c.closePath();
          c.fillStyle = color;
          c.fill();
        };
        drawCrescent(74, 26, '#3a4048');  // contorno aço-frio (sel-out)
        drawCrescent(73, 24, '#c9d2dc');  // borda gelo
        drawCrescent(69, 18, '#eef3f8');  // corpo branco
        drawCrescent(64, 12, '#ffffff');  // núcleo
        // faíscas na ponta dianteira
        c.fillStyle='#ffffff';
        const tx = shx+Math.sin(aCur+0.24)*48, ty = shy+Math.cos(aCur+0.24)*48;
        c.fillRect(Math.round(tx), Math.round(ty), 2, 2);
        c.fillRect(Math.round(tx+3), Math.round(ty+4), 1, 1);
        c.fillStyle='#c9d2dc';
        c.fillRect(Math.round(tx-2), Math.round(ty+6), 1, 1);
      }
    }

    if(P.bow){
      this.drawBowPose(P, by, ln);
    } else if(P.shield){
      // DEFEND: sword hidden behind the body; shield clearly gripped, braced in front
      this.drawShield(P, by);
    } else {
      // ---- BACK arm reaching across to the hilt (over torso, under sword) ----
      this.drawArm(-1, 8, -26 + by, -30 + P.armB*0.12 + ln*0.3 + P.armDirB, -25 + P.elbowAdjB, false, true);
      // ---- FRONT arm (two-hand grip, sword held forward) ----
      this.drawArm(1, -9, -26 + by, -22 + P.armF*0.15 + ln*0.3 + P.armDirF, -16 + P.elbowAdjF, true, false, P.swordTilt);
    }
  }

  drawShield(P: Pose, by: number): void {
    const C=this.C, c=this.bctx;
    const raise = P.shieldRaise || 1;
    c.save();
    c.translate(4, -27 + by);
    c.rotate((8*raise)*Math.PI/180);          // tilt for depth (top leans toward viewer)
    // soft shadow the shield casts onto the torso behind it (left edge)
    c.fillStyle = 'rgba(0,0,0,0.33)';
    c.fillRect(-15, -13, 5, 26);
    // shield body: heater shape (wide flat top, curving to a point) — larger
    const rows = [
      [-11,-15,22,3],[-11,-12,22,3],[-11,-9,22,3],[-10,-6,20,3],
      [-9,-3,18,3],[-7,0,14,3],[-5,3,10,3],[-3,6,6,3],[-1,9,3,2]
    ];
    for(const row of rows){ this.blk(row[0]!, row[1]!, row[2]!, row[3]!, C.stM, C.stL, C.stD); }
    // rim: bright top/left highlight, dark right/bottom
    this.r(-11,-15,22,1,C.stH);
    this.r(-11,-15,1,15,C.stL);
    this.r(10,-15,1,14,C.stBd);
    // faded red emblem: cross
    this.r(-2,-14,4,22,C.plD); this.r(-1,-14,2,22,C.plM);   // vertical
    this.r(-9,-6,18,3,C.plD); this.r(-9,-6,18,1,C.plM);     // horizontal
    // central boss (dome)
    this.blk(-4,-6,9,8,C.stL,C.stH,C.stD);
    this.blk(-3,-5,7,6,C.goldD,C.gold,C.out);
    this.r(-1,-3,2,2,C.stH);
    // rust + battle scars
    this.r(-8,-11,1,1,C.rust); this.r(6,-8,1,1,C.rustD); this.r(-6,4,2,1,C.rust);
    this.r(7,-13,1,4,C.rustD);                    // a gouge on the rim
    this.r(-9,1,2,1,C.rust);
    this.dith(-9, 0, 16, 2, C.stD);               // lower curve shading
    this.dith(-10, -14, 8, 1, C.stHH);            // top-left sheen
    // block-impact sparks flying off the shield face
    if(P.blockSpark){
      const s = P.blockSpark, d = (1-s)*5;
      c.fillStyle = '#fff8dc';
      c.fillRect(11+d, -7, 2, 2); c.fillRect(13+d*1.3, -12, 1, 1); c.fillRect(12+d*1.2, -1, 1, 1);
      c.fillStyle = C.goldHi;
      c.fillRect(14+d*1.5, -4, 1, 1); c.fillRect(10+d, -14, 1, 1);
      c.fillStyle = C.emberHot;
      c.fillRect(12+d*1.4, -10, 1, 1); c.fillRect(13+d, 2, 1, 1);
    }
    c.restore();
  }

  drawClimbBack(P: Pose, by: number): void {
    const C=this.C, c=this.bctx;
    const ph = P.climbF;                              // >0: left limbs high

    // ===== LEGS (back view, boots point straight down) =====
    const legBack = (sx: number, up: number, back: boolean) => {
      const m=back?C.stB:C.stM, l=back?C.stBl:C.stL, d=back?C.stBd:C.stD;
      const hipY = -13 + by;
      this.blk(sx-3, hipY, 6, 5, m, l, d);            // shorter thigh (chibi)
      this.r(sx-2, hipY+4, 5, 2, C.goldD);            // knee cop
      const shinH = Math.max(2, 4 - up*4);            // raised foot => shorter shin (same step delta)
      this.blk(sx-2, hipY+5, 5, shinH, m, l, d);      // shin
      const footY = hipY+5+shinH;
      this.blk(sx-3, footY, 7, 4, back?C.leB:C.leM, back?C.leM:C.leL, C.leD);  // boot (flat, down)
      this.r(sx-3, footY+3, 7, 1, C.leD);
    };
    legBack(-5, ph>0?1:0, false);                     // left
    legBack(5,  ph>0?0:1, true);                      // right

    // ===== tassets + belt (back) =====
    this.blk(-8, -19, 16, 5, C.leM, C.leL, C.leD);
    this.blk(-8, -23, 16, 4, C.leD, C.leM, '#241811');

    // ===== backplate (solid, no gap) =====
    this.blk(-9, -34, 18, 12, C.stM, C.stL, C.stD);
    this.r(-1, -34, 2, 12, C.stL);                    // spine highlight
    this.r(-8, -33, 1, 10, C.stL);
    this.r(7, -33, 1, 10, C.stD);
    c.strokeStyle = C.leD; c.lineWidth = 2;           // X straps
    c.beginPath(); c.moveTo(-7,-33); c.lineTo(7,-24); c.moveTo(7,-33); c.lineTo(-7,-24); c.stroke();
    this.r(-1,-29,2,2,C.gold);
    this.r(4,-31,1,1,C.rust); this.r(-5,-26,1,1,C.rustD);

    // ===== pauldrons =====
    this.blk(-14, -35, 7, 5, C.stL, C.stH, C.stD);
    this.blk(7, -35, 7, 5, C.stL, C.stH, C.stD);

    // ===== (no visible neck from behind — helmet sits on the trunk) =====

    // ===== HELMET from behind (clean solid dome, no face) =====
    const ht = P.headTilt;
    c.save(); c.translate(0, 6); c.translate(0, -40); c.rotate(ht*Math.PI/180); c.translate(0, 40);
    // chibi: mesma escala de cabeça da vista frontal, ancorada na base do elmo
    c.translate(0, -40); c.scale(1.16, 1.16); c.translate(0, 40);
    this.blk(-10, -54, 20, 14, C.stM, C.stL, C.stD);  // dome
    this.r(-9, -56, 18, 2, C.stM); this.r(-9, -56, 18, 1, C.stL);
    this.r(-6, -58, 12, 2, C.stM); this.r(-6, -58, 12, 1, C.stL);
    this.r(-10, -53, 1, 13, C.stL);                   // left light edge
    this.r(9, -53, 1, 13, C.stD);                     // right shade edge
    this.r(-10, -42, 20, 2, C.gold); this.r(-10, -41, 20, 1, C.goldD);  // base rim
    this.r(-7,-49,1,1,C.rust); this.r(6,-51,1,1,C.rustD);
    // ---- back-of-helm detail: riveted spine ridge + hanging mail aventail ----
    this.r(-1, -54, 2, 12, C.stL);                    // center spine ridge
    this.r(-1, -54, 1, 12, C.stH);
    this.r(-1, -52, 2, 1, C.gold); this.r(-1, -47, 2, 1, C.gold); this.r(-1, -43, 2, 1, C.gold);  // spine rivets
    this.r(-8, -50, 1, 1, C.gold); this.r(7, -50, 1, 1, C.gold);      // side rivets
    // mail aventail (chainmail curtain) draping the neck at the back
    for(let mx=-8; mx<=6; mx+=3){
      this.blk(mx, -40, 3, 3, C.stBd, C.stB, '#1c1e22');
      this.r(mx+1, -39, 1, 1, C.stBl);
    }
    for(let mx=-6; mx<=4; mx+=3){
      this.blk(mx, -38, 3, 2, C.stBd, C.stB, '#1c1e22');
    }
    // plume up the center-back of the helm
    const sway = P.plume;
    this.blk(-2, -61, 5, 5, C.goldD, C.gold, C.out);  // crest holder
    for(let i=0;i<9;i++){
      const k = i/8;
      const px = -1 + sway*(0.1+k*0.25);
      const py = -61 - i*2.3;
      const col = i%3===0 ? C.plL : (i%3===1 ? C.plM : C.plD);
      this.blk(px-1, py, 4, 4, col, C.plL, C.plD);
    }
    c.restore();

    // ===== HANDS: simple gauntlets gripping the rails at the sides =====
    const railHand = (dir: number, gy: number, back: boolean) => {
      const m=back?C.stB:C.stM, l=back?C.stBl:C.stL, d=back?C.stBd:C.stD;
      const railX = dir*11, bodyX = dir*7;
      const x0 = Math.min(bodyX, railX)-1, w = Math.abs(railX-bodyX)+2;
      this.blk(x0, gy-1, w, 3, m, l, d);              // short horizontal arm stub
      this.blk(railX-2, gy-3, 5, 6, back?C.leB:C.leM, back?C.leM:C.leL, C.leD);  // fist
      this.r(railX-2, gy-3, 5, 1, C.gold);            // gold knuckles
    };
    const hi = -30 + by, lo = -22 + by;
    railHand(-1, ph>0 ? hi : lo, false);              // left hand
    railHand(1,  ph>0 ? lo : hi, true);               // right hand
  }

  drawBowPose(P: Pose, by: number, _ln: number): void {
    const C=this.C, c=this.bctx;
    const sh = -28 + by;                 // shoulder line (aim is horizontal here)
    const aim = P.bowAim, draw = P.bowDraw;
    const big = P.arrowPower>1;
    // bow held well out front on the extended lead arm
    const bowX = -6 + aim*24;            // pushes forward as we raise
    const bowY = sh;                     // horizontal aim
    const nock = bowX - 6 - draw*10;     // string/arrow nock drawn back toward cheek

    // ---- LEAD (front) arm: extends straight forward to grip the bow ----
    c.save();
    c.translate(-8, sh);
    const la = Math.atan2(bowY-sh, bowX-(-8));
    c.rotate(la);
    const ll = Math.hypot(bowX-(-8), bowY-sh);
    this.blk(0, -2.5, ll*0.55, 5, C.stM, C.stL, C.stD, true);      // upper arm
    this.blk(ll*0.5, -2.5, ll*0.55, 5, C.stM, C.stL, C.stD, true); // forearm
    this.r(0, -2.5, ll, 2, C.stL);                           // face iluminada (2px) ao longo do braço
    this.r(0, -2.5, ll, 1, C.stH);                           // aresta quente
    this.r(0,  1.5, ll, 1, C.stD);                           // sombra de núcleo
    this.blk(ll-3, -2.5, 5, 5, C.leM, C.leL, C.leD);         // grip hand
    c.restore();

    // ---- the BOW: tall recurve arc ----
    c.save();
    c.translate(bowX, bowY);
    const H = 17;                                            // half-height of the bow
    const limb = (dir: number) => {
      for(let i=0;i<=H;i++){ const t=i/H;
        // belly curves back toward archer, tips recurve forward (+x)
        const x = Math.round(Math.sin(t*Math.PI*0.62)*5 - (t>0.8?(t-0.8)*18:0));
        const y = Math.round(dir*i);
        c.fillStyle = i%5===4 ? C.gold : C.leD;             // wrapped grip bands
        c.fillRect(x-1, y-1, 3, 2);
        c.fillStyle = C.leM; c.fillRect(x, y-1, 1, 1);      // sheen
      }
    };
    limb(1); limb(-1);
    // riser (thicker grip)
    this.blk(3, -5, 4, 10, C.leM, C.leL, C.leD);
    this.r(4, -3, 2, 6, C.gold);
    // tip nocks
    const topX = Math.round(Math.sin(1*Math.PI*0.62)*5 - 0.2*18);
    this.r(topX-1, -H-1, 2, 2, C.blL); this.r(topX-1, H, 2, 2, C.blL);
    // string: top tip -> nock -> bottom tip
    c.strokeStyle = '#e4dac2'; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(topX, -H); c.lineTo(nock - bowX, 0); c.lineTo(topX, H);
    c.stroke();
    c.restore();

    // ---- arrow ----
    if(!P.noArrow)
    if(P.arrowFly>0){
      const dist = P.arrowFly * (big ? 92 : 70);
      this.drawArrow(bowX + dist, bowY, P.arrowPower);
      // speed streak trailing the arrow
      c.fillStyle = big ? '#f2e9d8' : '#cabfa6';
      c.globalAlpha = 0.55*(1-P.arrowFly);
      c.fillRect(bowX+2, Math.round(bowY), Math.round(dist-4), 1);
      if(big){ c.fillRect(bowX+2, Math.round(bowY)-2, Math.round(dist-8), 1); c.fillRect(bowX+2, Math.round(bowY)+2, Math.round(dist-8), 1); }
      c.globalAlpha = 1;
    } else {
      // nocked arrow: from the drawn nock through the bow, tip forward
      const alen = bowX - nock + 14;
      this.drawArrow(nock, bowY, P.arrowPower, alen);
      if(big && draw>0.6){                                   // charged head pulse on the arrowhead
        c.fillStyle = '#ffffff'; c.globalAlpha = 0.35+0.35*Math.sin(this.elapsedSec*46);
        c.fillRect(Math.round(nock+alen)-1, Math.round(bowY)-2, 3, 3);
        c.globalAlpha = 1;
      }
    }

    // ---- DRAW (back) arm: bent, hand pulls the string to the cheek ----
    c.save();
    c.translate(8, sh);
    const da = Math.atan2(bowY-sh, nock-8);
    c.rotate(da);
    const dl = Math.max(7, Math.hypot(nock-8, bowY-sh));
    this.blk(0, -2.5, dl*0.6, 5, C.stFar, C.stFarL, C.stFarD); // upper arm (membro distante)
    this.blk(dl-5, -2.5, 5, 5, C.leFarM, C.leD, C.leFarD);     // drawing hand
    c.restore();
    // raised elbow of the draw arm (chicken-wing)
    this.blk(8, sh-6, 5, 5, C.stFar, C.stFarL, C.stFarD);
  }

  drawArrow(x: number, y: number, power: number, len?: number): void {
    const c=this.bctx, C=this.C;
    len = len || (power>1 ? 20 : 16);
    x = Math.round(x); y = Math.round(y);
    // shaft
    c.fillStyle = C.leL; c.fillRect(x-len, y, len, 1);
    // head
    c.fillStyle = power>1 ? C.blL : C.blM;
    c.fillRect(x, y-1, 2, 3); c.fillRect(x+2, y, 1, 1);
    if(power>1){ c.fillStyle=C.blL; c.fillRect(x-1,y-2,2,5); }   // bigger charged head
    // fletching
    c.fillStyle = C.plM;
    c.fillRect(x-len, y-1, 3, 1); c.fillRect(x-len, y+1, 3, 1);
  }

  drawArrowAngled(x: number, y: number, angle: number, power: number): void {
    const c=this.bctx, C=this.C;
    const len = power>1 ? 18 : 15;
    c.save();
    c.translate(Math.round(x), Math.round(y));
    c.rotate(angle);
    c.fillStyle = C.leL;  c.fillRect(-len, 0, len, 1);            // haste
    c.fillStyle = C.blM;  c.fillRect(0, -1, 2, 3); c.fillRect(2, 0, 1, 1);  // ponta
    c.fillStyle = C.plM;  c.fillRect(-len, -1, 3, 1); c.fillRect(-len, 1, 3, 1);  // penas
    c.restore();
  }

  /**
   * Renderiza o quadro atual centrado nos pés (feetX, feetY em pixels de
   * tela), escalado pra caber num quadrado de `sizePx` lado (a arte é
   * "chibi": personagem ocupa ~65-70% da altura do buffer 100x100).
   */
  render(
    ctx: CanvasRenderingContext2D,
    feetX: number,
    feetY: number,
    facing: 1 | -1,
    anim: string,
    t: number,
    sizePx: number,
  ): void {
    const c = this.bctx;
    const L = KnightRenderer.LOGICAL;
    c.clearRect(0, 0, L, L);

    const P = this.pose(anim, t);
    const cx = 50, groundY = 74;

    c.save();
    const shk = P.shake ? Math.round((rng.random() - 0.5) * 2 * P.shake) : 0;
    const dieF = P.dieFall || 0;
    c.translate(cx + shk, groundY + (P.shake ? Math.round((rng.random() - 0.5) * P.shake) : 0));
    c.scale(0.9, 0.9);
    if (facing < 0) c.scale(-1, 1);
    // Squash & stretch em torno dos PÉS (a origem já está no chão): é o que
    // dá volume/peso ao corpo. Aplicado aqui e não em drawKnight porque
    // precisa deformar TUDO junto — armadura, espada e penacho — senão o
    // personagem lê como peças rígidas empilhadas.
    if (P.sqX !== 1 || P.sqY !== 1) c.scale(P.sqX ?? 1, P.sqY ?? 1);
    c.translate((P.lungeX || 0) - (P.knockX || 0), 0);
    if (dieF) {
      c.translate(0, 24 * dieF);
      c.translate(0, -28);
      c.rotate(((P.dieAngle || 0) * Math.PI) / 180);
      c.translate(0, 28);
    }
    this.drawKnight(P);
    c.restore();

    if (P.hurtFlash > 0) {
      c.fillStyle = 'rgba(200,40,30,' + 0.32 * P.hurtFlash + ')';
      c.fillRect(0, 0, L, L);
    }
    if (P.blockFlash > 0) {
      c.fillStyle = 'rgba(255,255,255,' + 0.5 * P.blockFlash + ')';
      c.fillRect(0, 0, L, L);
    }

    // Rim light: o horizonte e a fonte de luz da cena, entao a borda
    // voltada pra cima pega o ceu. Sem isso o guerreiro afunda no chao
    // escuro e a cena inteira fica sem specular (medido: 0.1% nas altas).
    applyRimLight(c, L, L, SKY_RIM);

    const scale = sizePx / L;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.buf,
      Math.round(feetX - cx * scale),
      Math.round(feetY - groundY * scale),
      L * scale,
      L * scale,
    );
  }
}
