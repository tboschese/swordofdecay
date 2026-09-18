/**
 * Entry do jogo 3D. Amarra os módulos e roda o laço.
 *
 * A ordem importa: a atmosfera instala fundo e névoa ANTES de qualquer
 * geometria entrar, senão o primeiro quadro sai sem névoa e pisca.
 */
import * as THREE from "three";

// Rede de segurança de diagnóstico: erro em módulo ESM morre silencioso e
// a página fica preta sem dizer por quê. Isto joga a mensagem no título,
// que o harness lê com --dump-dom.
window.addEventListener("error", (e) => { document.title = "ERR:" + e.message; });
window.addEventListener("unhandledrejection", (e) => { document.title = "REJ:" + String(e.reason); });
import { Game } from "./game/Game";
import { Camera2p5D } from "./game/Camera";
import { Keyboard } from "./engine/input";
import { GameLoop } from "./engine/loop";
import { Stage } from "./render/Stage";
import { Hero } from "./render/Hero";
import { Atmosphere, buildBackdrop, buildForeground } from "./render/atmosphere";
import { DepthCues } from "./render/DepthCues";
import { WORLD1_1 } from "../levels/world1";
import { Level } from "./game/Level";
import { Screens } from "./ui/screens";
import { EnemyRig } from "./render/EnemyArt";
import { GoalMarker } from "./render/Goal";
import { Grade } from "./render/Grade";
import { Motes } from "./render/Motes";
import { createBladeArc, updateBladeArc } from "./render/BladeArc";
import { Impact } from "./render/Impact";
import { sfx, unlock as unlockAudio, setEnabled as setAudioEnabled } from "./engine/audio";

const root = document.getElementById("game-root") ?? document.body;
const canvas = document.createElement("canvas");
root.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const atmosphere = new Atmosphere();
atmosphere.install(scene);

// `&nobg` esconde o fundo. Existe pro harness: renderizando com e sem, a
// DIFERENÇA entre as duas imagens é exatamente a máscara do plano de fundo
// — sem chutar banda de altura, que foi como o projeto 2D errou três vezes
// a mesma métrica. O renderizador é a autoridade sobre o que ele desenhou.
const backdrop = buildBackdrop(210);
if (!location.hash.includes("nobg")) scene.add(backdrop);

const foreground = buildForeground(210);
scene.add(foreground);

const stage = new Stage(WORLD1_1);
scene.add(stage.object);

const hero = new Hero();
scene.add(hero.object);

/**
 * Sombra de contato: o instrumento de leitura de profundidade.
 * Em plataforma 3D o defeito nº1 é o jogador não saber onde vai pousar. Ela
 * fica no CHÃO e nunca colada nos pés — colada, sobe junto no pulo e deixa
 * de informar exatamente no momento em que mais importa.
 */
const contact = new THREE.Mesh(
  new THREE.CircleGeometry(0.5, 24),
  new THREE.MeshBasicMaterial({ color: 0x0b0f08, transparent: true, opacity: 0.45, depthWrite: false }),
);
contact.rotation.x = -Math.PI / 2;
scene.add(contact);

/**
 * Ajudas de leitura de profundidade — o defeito nº1 do gênero é o jogador
 * não saber onde vai pousar. O módulo nasceu sem quem o chamasse (o dono
 * caiu antes de reportar a fiação), então a chamada foi deduzida da API.
 */
const cues = new DepthCues(new Level(WORLD1_1));

const camera = new Camera2p5D(window.innerWidth, window.innerHeight);
const keys = new Keyboard();
const game = new Game(WORLD1_1, keys, { camera, stage, hero, atmosphere });
scene.add(cues.object);

// Um rig por inimigo. Poucos inimigos por fase, então instanciar é honesto;
// se virar dezena, isto vira instancing.
const enemyRigs = game.enemies.map(() => {
  const r = new EnemyRig();
  scene.add(r.object);
  return r;
});

/**
 * Impacto: o que sai do corpo quando a lâmina abre um aldeão. Era uma
 * esfera clara que crescia — que lê como MAGIA, o mesmo erro que o jogo 2D
 * já corrigiu uma vez. Agora é matéria em decomposição; ver `Impact.ts`.
 */
const impact = new Impact();
scene.add(impact.object);

const bladeArc = createBladeArc();
scene.add(bladeArc);

const motes = new Motes();
scene.add(motes.object);

const goalMarker = new GoalMarker(WORLD1_1.goal.x, new Level(WORLD1_1).groundBelow(WORLD1_1.goal.x, 60, 200) ?? 0);
scene.add(goalMarker.object);

const grade = new Grade(renderer, scene, camera.camera, window.innerWidth, window.innerHeight);

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.resize(window.innerWidth, window.innerHeight);
  grade.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", resize);
resize();

/** Aquecimento: a Fase 0 mediu 19.7ms de compilação de shader no quadro 0.
 *  Renderizar uma vez antes do laço tira esse engasgo do primeiro pulo. */
// Aquecimento: a Fase 0 mediu 19.7ms de compilação de shader no quadro 0,
// e a cadeia de pós-processamento acrescenta vários shaders novos. Render
// uma vez ANTES do laço tira o engasgo do primeiro pulo.
grade.render();

let frameCount = 0;
const screens = new Screens();
// `#play` pula o cartaz. Existe pro harness: captura de tela de jogo com o
// cartaz por cima mede o cartaz, e foi assim que o projeto 2D passou duas
// rodadas sem conseguir julgar o proprio jogo.
// `#play` pula o cartaz; `#play@120` ainda posiciona o guerreiro naquele x.
// O segundo existe porque o trecho do Rot fica a 120u do spawn e nenhuma
// captura chegava la — mesmo buraco de cobertura que no projeto 2D deixou
// agua, espinho e objetivo sem nunca serem fotografados.
if (location.hash.startsWith("#play")) {
  screens.set("playing");
  const at = /@(-?[\d.]+)/.exec(location.hash);
  if (at) {
    const x = Number(at[1]);
    // `groundBelow(x, y, maxDepth)` procura chao ate `maxDepth` ABAIXO de
    // `y`. Chamar com y=40 e o maxDepth padrao de 40 fazia a condicao
    // `y - top < maxDepth` dar 40 < 40 = falso, e chao no nivel zero era
    // rejeitado — o teleporte caia no fallback e ia parar no spawn.
    const top = game.level.groundBelow(x, 60, 200) ?? 0;
    game.player.teleportTo(x, top + 0.2);
    // Snap obrigatório: sem ele a câmera parte do spawn e leva segundos
    // pra chegar, e uma captura curta fotografa a viagem em vez do destino.
    camera.snapTo({ x, y: top + 0.2, vx: 0, grounded: true });
  }
}

/**
 * O jogo só corre em "playing". Nas telas de desfecho a física fica
 * PARADA — sem isso o guerreiro continua caindo atrás do cartaz e o
 * jogador volta pra um mundo que andou sem ele.
 */
const loop = new GameLoop(
  (dt) => {
    const confirm = keys.justDown("KeyZ");
    if (screens.screen !== "playing") {
      if (screens.update(dt, confirm)) {
        // O Z que sai do cartaz É o gesto de usuário que libera autoplay.
        // Tocar som antes disso é bloqueado pelo navegador, então o áudio
        // nasce aqui e não no boot.
        unlockAudio();
        if (screens.screen !== "title") game.restart();
        screens.set("playing");
      }
      keys.endFrame();
      return;
    }
    game.update(dt);
    const st = game.state;
    if (st.reachedGoal) screens.set("victory");
    // Três mortes fecham a fase: sem consequência, morrer não custa nada e
    // a torção do Rot deixa de ser uma decisão.
    else if (st.deaths >= 3) screens.set("defeat");
  },
  () => {
    const p = game.player;
    hero.object.position.set(p.x, p.y, 0);
    for (let i = 0; i < enemyRigs.length; i++) enemyRigs[i]!.update(game.enemies[i]!, 16.6667);

    updateBladeArc(bladeArc, game.combat.swingT, p.x, p.y, p.facing);

    screens.setHp(game.state.hp, 3);
    goalMarker.update(frameCount++);
    motes.update(frameCount, camera.camera.position.x, camera.camera.position.y);

    // `dt = 0` durante o hitstop: a matéria congela junto com o mundo, e
    // é o quadro parado com o jorro no ar que entrega o peso.
    impact.update(game.hitFx, p.facing, game.combat.frozen ? 0 : 16.6667);
    cues.update(
      { x: p.x, y: p.y, vx: p.vx, vy: p.vy, grounded: p.grounded, box: p.box },
      p.facing,
      16.6667,
    );

    const top = game.level.groundBelow(p.x, p.y + 0.05);
    if (top === null) {
      contact.visible = false;
    } else {
      contact.visible = true;
      const air = Math.max(0, p.y - top);
      const k = Math.max(0.3, 1 - air * 0.09);
      contact.position.set(p.x, top + 0.03, 0);
      contact.scale.setScalar(k);
      (contact.material as THREE.MeshBasicMaterial).opacity = 0.45 * k;
    }
    grade.render();
  },
);
loop.start();
