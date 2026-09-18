# Sword of Decay

Jogo de ação e plataforma com duas implementações no mesmo repositório:

- **3D/2.5D (`3d/`)** — direção principal atual, construída com Three.js.
- **2D (`src/`)** — protótipo maduro em Canvas 2D e referência validada de
  física, combate, montagem de fases e direção de arte.

O 2D não é código descartável: o 3D reutiliza seus contratos de movimento,
estrutura kishōtenketsu e ferramentas de avaliação. O plano atual está em
[`3d/ROADMAP.md`](3d/ROADMAP.md); o histórico e as decisões do 2D estão em
[`ROADMAP.md`](ROADMAP.md) e [`DESIGN.md`](DESIGN.md).

## Requisitos

- Node.js 20 ou mais recente
- npm
- Um navegador com WebGL para jogar o 3D

```bash
npm install
```

## Rodar localmente

Versão 3D, direção principal:

```bash
npm run dev:3d
```

Versão 2D:

```bash
npm run dev:2d
```

`npm run dev` continua sendo um alias histórico para o 2D.

## Verificação

Antes de integrar mudanças, rode:

```bash
npm run check
```

Esse comando:

1. compila e empacota o 2D;
2. verifica os tipos e gera o HTML autocontido do 3D;
3. valida a estrutura e a alcançabilidade da fase 2D;
4. executa a travessia automatizada da fase 3D.

Comandos individuais:

| Comando | Resultado |
| --- | --- |
| `npm run build:2d` | Gera `dist/` |
| `npm run build:3d` | Gera `3d/build/sword-of-decay-3d.html` |
| `npm run validate` | Valida a fase 2D |
| `npm run test:smoke:3d` | Confirma que a fase 3D é atravessável |
| `npm run typecheck:3d` | Verifica somente o TypeScript do 3D |

Os harnesses visuais ficam em `shots/` (2D) e `3d/harness/` (3D). Alguns
dependem de Chrome/Chromium headless instalado localmente; consulte o cabeçalho
do script antes de executá-lo.

## Estrutura

```text
src/             jogo 2D e engine Canvas
3d/src/          jogo 3D/2.5D e render Three.js
3d/levels/       dados das fases 3D
3d/harness/      smoke tests e medições do 3D
scripts/         validação estrutural do 2D
shots/           captura e análise visual do 2D
public/assets/   áudio e assets estáticos do 2D
```

## Estado do produto

O 3D tem uma fase com fluxo de título, gameplay, combate e desfecho. A próxima
etapa é concluir a legibilidade visual da S3 e então avançar para três fases,
segundo inimigo, arco e progressão, conforme o roadmap 3D.

Capturas, bundles e relatórios gerados não devem ser misturados com mudanças de
código sem intenção explícita. O repositório contém um histórico grande de
capturas 2D já selecionadas; preserve-o até que seja feita uma curadoria em um
commit separado.
