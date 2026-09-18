/**
 * Entry de browser do banco de ensaio do IMPACTO.
 *
 * O acerto dura ~10 quadros e some. Fotografar isso rodando o jogo de
 * verdade é loteria: não há como pedir ao `#play@N` que bata num inimigo
 * num quadro conhecido. Então este banco monta o MESMO palco (atmosfera,
 * cenário, luzes, cadeia de pós-processamento, guerreiro, inimigo) e
 * dispara o golpe num quadro escolhido, em passo fixo e sem rAF.
 *
 * Ele não substitui o jogo — ele só torna o evento fotografável. Todos os
 * módulos de render vêm do jogo por import; o que é duplicado aqui é
 * apenas a AMARRAÇÃO (o que `main.ts` faz no laço), porque amarração é o
 * que o banco precisa controlar.
 */
import * as THREE from "three";
import { createBladeArc, updateBladeArc } from "../src/render/BladeArc";
import { Atmosphere, buildBackdrop, buildForeground } from "../src/render/atmosphere";
import { Stage } from "../src/render/Stage";
import { Hero } from "../src/render/Hero";
import { EnemyRig } from "../src/render/EnemyArt";
import { Grade } from "../src/render/Grade";
import { Impact } from "../src/render/Impact";
import { Camera2p5D } from "../src/game/Camera";
import { Level } from "../src/game/Level";
import { Enemy } from "../src/game/Enemy";
import { WORLD1_1 } from "../levels/world1";

interface ShotConfig {
  shots: number[];
  frames: number;
  width: number;
  height: number;
  /** x do inimigo a ser golpeado. */
  enemyX: number;
}

declare global {
  interface Window {
    __SHOT_CONFIG__: ShotConfig;
  }
}

const DT = 1000 / 60;
/** Quadro do golpe em que a lâmina encosta (SWING.activeFrom em Combat). */
const HIT_AT = 4;
/** Quadros congelados: hitstop de 4 + o quadro do próprio acerto. */
const HOLD = 5;
const SWING_FRAMES = 18;

function main(): void {
  const cfg = window.__SHOT_CONFIG__;

  const canvas = document.createElement("canvas");
  canvas.width = cfg.width;
  canvas.height = cfg.height;
  document.body.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(cfg.width, cfg.height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const atmosphere = new Atmosphere();
  atmosphere.install(scene);
  scene.add(buildBackdrop(210));
  const foreground = buildForeground(210);
  scene.add(foreground);

  const level = new Level(WORLD1_1);
  const stage = new Stage(WORLD1_1);
  scene.add(stage.object);

  const hero = new Hero();
  scene.add(hero.object);

  const enemyY = level.groundBelow(cfg.enemyX, 60, 200) ?? 0;
  const enemy = new Enemy(level, cfg.enemyX, enemyY, 5);
  enemy.facing = -1;
  const enemyRig = new EnemyRig();
  scene.add(enemyRig.object);

  const impact = new Impact();
  scene.add(impact.object);

  // Réplica do arco de lâmina de `main.ts`: sem ele a foto não mostra o
  // clarão de aço que o impacto tem que ficar SUBORDINADO a.
  const bladeArc = createBladeArc();
  scene.add(bladeArc);

  const heroX = cfg.enemyX - 1.15;
  const heroY = level.groundBelow(heroX, 60, 200) ?? 0;
  hero.object.position.set(heroX, heroY, 0);

  const contact = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 24),
    new THREE.MeshBasicMaterial({ color: 0x0b0f08, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(heroX, heroY + 0.03, 0);
  scene.add(contact);

  const camera = new Camera2p5D(cfg.width, cfg.height);
  camera.snapTo({ x: heroX + 0.6, y: heroY, vx: 0, grounded: true });
  atmosphere.followShadow(heroX, heroY);

  const grade = new Grade(renderer, scene, camera.camera, cfg.width, cfg.height);
  grade.render();

  const hit = { x: enemy.x, y: enemy.y + enemy.box.h * 0.6, t: 1 };
  let fx: { x: number; y: number; t: number } | null = null;
  let swingFrame = 0;
  let hold = 0;
  let fired = false;

  const wanted = new Set(cfg.shots);
  const captured: Array<{ frame: number; png: string }> = [];
  // Orçamento medido, não estimado. `autoReset` desligado porque a cadeia
  // de pós faz vários `render()` por quadro e o contador zeraria em cada um.
  renderer.info.autoReset = false;
  const cost: Array<{ frame: number; calls: number; tris: number; pts: number; chk: number; grp: number }> = [];

  for (let f = 0; f < cfg.frames; f++) {
    const frozen = hold > 0;
    const dt = frozen ? 0 : DT;

    if (!frozen) {
      swingFrame++;
      if (!fired && swingFrame >= HIT_AT) {
        fired = true;
        enemy.kill();
        fx = { x: hit.x, y: hit.y, t: 1 };
        hold = HOLD;
      }
    } else {
      hold--;
    }

    if (fx && !frozen) {
      fx.t -= DT / 320;
      if (fx.t <= 0) fx = null;
    }

    impact.update(fx, 1, dt);
    enemyRig.update(enemy, dt);
    if (!frozen) enemy.update(dt, heroX, heroY);
    hero.update("idle", 1, 0, dt);
    stage.update(f);
    atmosphere.update();

    // Mesma função que o jogo usa. A bancada NÃO reimplementa o arco:
    // quando ela duplicava, os valores do jogo mudaram e ela continuou
    // fotografando os antigos — instrumento medindo outra coisa.
    updateBladeArc(bladeArc, swingFrame / SWING_FRAMES, heroX, heroY, 1);

    foreground.position.y = (camera.camera.position.y - 7.5) * 0.82;
    renderer.info.reset();
    grade.render();
    cost.push({
      frame: f,
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      pts: impact.object.children[0]!.visible ? 1 : 0,
      chk: impact.object.children[1]!.visible ? 1 : 0,
      grp: impact.object.visible ? 1 : 0,
    });

    if (wanted.has(f)) captured.push({ frame: f, png: canvas.toDataURL("image/png").split(",")[1] ?? "" });
  }

  const meta = document.createElement("script");
  meta.type = "text/plain";
  meta.id = "cost";
  meta.textContent = JSON.stringify(cost);
  document.body.appendChild(meta);

  const sink = document.createElement("script");
  sink.type = "text/plain";
  sink.id = "shots";
  sink.textContent = captured.map((c) => `${c.frame}|${c.png}`).join("\n");
  document.body.appendChild(sink);
  document.title = "OK:" + captured.length;
}

try {
  main();
} catch (e) {
  document.title = "ERR:" + String(e instanceof Error ? e.stack : e);
}
