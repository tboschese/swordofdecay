# Pixi.js como alternativa — avaliação

**Veredito: não migrar. Adicionar um passe de pós-processamento ao canvas
2D atual.** Medido, não achado. Detalhe abaixo.

## A pergunta precisa ser reformulada

"Pixi ou Phaser" já está meio respondida: **Phaser está fora**. A
reescrita em `src/core|engine|game|render` substituiu Phaser por um
engine canvas 2D próprio, e o dono confirmou isso como oficial. O
`package.json` ainda lista `phaser`, mas nada em `src/game/` importa.

Então a pergunta real é: **canvas 2D próprio vs Pixi.js**.

## O que o Pixi realmente entrega

Pixi 8 (versão atual, 8.19.0) é um **renderizador** 2D WebGL/WebGPU — não
um framework de jogo. Não traz física, cena nem loop opinado. Isso é bom
aqui: a camada de gameplay já está escrita e é agnóstica de renderer.

O que ele daria de concreto:

1. **Shaders de fragmento como filtros.** Grade, bloom, neblina
   volumétrica, color cycling por LUT, aberração cromática — de graça na
   GPU. É o argumento forte, e é o que os módulos m5 (atmosfera) e m8
   (grade) do `AAA_BRIEF.md` querem.
2. **Iluminação com normal map.** Várias luzes dinâmicas com sombreamento
   por pixel. Isso vai *além* de SNES/Neo Geo — é look de indie moderno
   (Dead Cells, Blasphemous).
3. **Batching de sprites.** Milhares de sprites num punhado de draw calls.

## Por que isso não justifica migrar — o número

O argumento padrão pró-WebGL é "canvas 2D não aguenta efeito por pixel".
**A resolução lógica aqui é 384×224 = 86 mil pixels.** Isso é minúsculo:
um frame 1080p tem 24× mais pixels.

Medi um passe de grade completo — extração de brilho, bloom com blur
separável em ¼ de resolução, curva tonal filmica via LUT, e vinheta —
em JS puro sobre `Uint8ClampedArray`, no V8:

```
384x224 grade completo (bloom + curva + vinheta): 0.623 ms/frame
orçamento de 60fps: 16.667 ms  ->  3.7% do frame
```

**3.7% do orçamento de frame.** O passe de pós-processamento que
supostamente exigiria GPU cabe folgado na CPU nesta resolução.

*Limite honesto da medição*: 0.62ms é o custo de computação, medido em
Node/V8. O ida-e-volta `getImageData`/`putImageData` no browser é custo
adicional e **não foi medido** — estimo algo na casa de mais 0.5–1ms
somados, o que ainda deixaria o passe inteiro abaixo de 10% do frame.
Quem for dono do m8 deve medir isso de verdade antes de assumir.

E boa parte do grade nem precisa de acesso por pixel:
`globalCompositeOperation` do canvas 2D já tem `multiply`, `screen`,
`overlay` e `lighter`. Vinheta, banho de cor e glow saem desenhando
gradientes com blend, custo praticamente zero. Per-pixel só é necessário
pra curva tonal e LUT de paleta.

## O que a migração custaria

1. **`render/KnightRenderer.ts` são 48KB de comandos de desenho canvas 2D**
   — `fillRect`, paths, gradientes. Isso **não porta** pro Pixi. Ou é
   reescrito, ou continua desenhando num canvas offscreen que vira
   textura a cada frame (viável — o buffer do cavaleiro é 100×100 — mas
   aí você está usando Pixi só como compositor, que é exatamente a
   recomendação abaixo, sem precisar do Pixi).
2. **Terceira troca de engine em um mês.** Phaser → canvas próprio
   (21–22/jul) → Pixi. Cada troca gasta o orçamento em reescrever o que
   já funcionava em vez de em arte — e o baseline mostra que **o gap pro
   AAA é de arte, não de renderer**: as colinas são festões de cor sólida
   única porque ninguém as sombreou, não porque o canvas 2D não consiga.
3. **Risco no harness de determinismo.** A captura determinística
   (`shots/`) depende de o render ser byte-idêntico entre execuções —
   confirmado hoje com canvas 2D. WebGL via SwiftShader é reprodutível na
   prática (o `hero/` depende disso), mas é mais uma variável, e sem o
   determinismo nenhuma rodada fecha.

## Recomendação

**Manter canvas 2D. O m8 (grade) implementa o passe de pós em
`Uint8ClampedArray` + blend modes.** Zero dependência nova, zero
migração, e o efeito visual é idêntico — a esta resolução ninguém
distingue um bloom feito em CPU de um feito em GPU.

### Quando reabrir esta decisão

Gatilhos objetivos, não sensação:

- O passe de pós medido **no browser** passar de ~8ms/frame; ou
- o m5 precisar de **mais de ~4 luzes dinâmicas com normal map**; ou
- a contagem de sprites em tela passar de ~2000 (hoje o teto é ~350
  tiles + entidades, então isso está longe).

Se algum disparar, a saída **não é migrar o jogo inteiro**: é mover
apenas o passe final pra um quad fullscreen em WebGL, mantendo todo o
desenho em canvas 2D e usando o canvas como textura de entrada. São
~200 linhas contidas, não uma migração. O Pixi inteiro só se justifica se
os três gatilhos dispararem juntos.
