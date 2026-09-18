# ROADMAP — Sword of Decay 3D

O jogo 2D avançou porque cada sessão tinha **critério de saída testável**
(ver `ROADMAP.md` na raiz). O push 3D vinha sem isso: rodadas de trabalho
bom, sem definição de pronto. Este arquivo corrige.

Regra herdada e não negociável: **nenhum critério aqui é "ficou bom".**
Todo item fecha com número, com ablação, ou com um humano jogando —
porque "passar na rubrica" já provou não ser a mesma coisa que "estar
pronto" (o 2D aprovou 8 de 8 módulos com a imagem ainda longe da barra).

---

## S1 — Fundação  `[x]` fechada

Determinismo em WebGL headless provado (byte-idêntico em 3 execuções no
SwiftShader e 2 na GPU), backend fixado, orçamento de frame medido, física
com gravidade assimétrica 1.92 + coyote + buffer, colisão AABB eixo a eixo,
nível do Mundo 1 com kishōtenketsu.

**Critério, atendido**: `node 3d/harness/traverse.mjs` diz CHEGOU.

## S2 — Produto jogável  `[x]` fechada

Título, vitória, derrota, reinício, HUD de vida, objetivo visível de longe,
som sintetizado (pulo, pouso, golpe, impacto, dano, morte, objetivo),
inimigos com telégrafo, combate com hitstop.

**Critério, atendido**: o fluxo título → fase → desfecho → reinício roda
sem erro, e o jogo está publicado num link acessível.

## S3 — A imagem parar de ler como protótipo  `[ ]` em andamento

Onde a maior parte do trabalho recente mora. A cadeia de causa do "não é
AAA" foi fechada por eliminação, e vale registrar porque custou caro:

1. ~~É pós-processamento~~ — a cadeia existe (oclusão própria, bloom,
   curva em S, split tone, vinheta, grão). Melhorou muito, não fechou.
2. ~~É relevo geométrico em Z~~ — **medido**: a essa câmera as faces de
   revelação de 0.06u dão 0px no centro do quadro. Triângulos invisíveis.
3. **É a silhueta e a face.** Resolvido em duas rodadas, com número:
   desvio da skyline 5.07px → 14.08px (Rot, o padrão-ouro interno: 17.09);
   junta horizontal contínua de 4 linhas atravessando 900px → 0 linhas.

### Critérios de saída da S3

- [x] Skyline da pedra acima de 70% da irregularidade do Rot — **82%**.
- [x] Zero junta horizontal contínua atravessando o quadro — **0**.
- [x] Palco em 2 draw calls e 2 programas, sem material novo.
- [ ] **O guerreiro lê a 1x.** Não basta ocupar ~100px: elmo, ombreira,
      espada e ciclo de passada têm que aparecer sem ampliação.
- [ ] **O impacto lê como matéria, não como magia.** Erro já cometido e
      corrigido no 2D; a correção é a mesma (matéria corroída é o evento,
      clarão de aço é acento).
- [ ] **Nada no muro lê como desenhado SOBRE a parede.** Rodada de poda em
      curso; o próprio autor dos escorridos apontou que eles falham nisso.

## S4 — Jogo, não fase  `[ ]` não começada

Hoje existe **uma** fase. O `lore.md` descreve 10 mundos de 12 fases.

- [ ] Montador de fases que consuma a gramática kishōtenketsu, como o
      `chunkAssembler` do 2D — a estrutura é o que impede fase genérica.
- [ ] Segundo tipo de inimigo, com silhueta OPOSTA à do primeiro
      (o 2D validou isso com um cenário `roster`: baixo-e-largo contra
      alto-e-ereto, testados como manchas pretas).
- [ ] Arco e flecha. O guerreiro tem os dois na lore e só a espada existe.
- [ ] Progressão entre fases.

**Critério de saída**: três fases jogáveis em sequência, cada uma com
torção própria, e `traverse.mjs` passando nas três.

## S5 — Validação com humano  `[ ]` não começada

O maior buraco do projeto inteiro, e ele não fecha com métrica.

Tudo o que sei da imagem veio de captura estática. Duas coisas que só o
playtest responde, e as duas decidem:

- [ ] A câmera embrulha o estômago? (`feel.mjs` mede 1.3 inversões/s e
      mediana 0.4 u/s² — **limiar calibrado por raciocínio, nunca
      validado com humano jogando**.)
- [ ] O telégrafo do inimigo dá tempo de reagir? (520ms contra ~250ms de
      reação visual — mas o número mede a DURAÇÃO do aviso, não se ele é
      percebido.)

**Critério de saída**: o dono joga do início ao fim e diz o que sentiu.
Nada aqui fecha sem isso.

---

## Métricas que já foram burladas

Mesma seção que o `TASKS.md` do 2D mantém, pelo mesmo motivo: passar na
métrica não é passar.

- **A variância de valor na face não deve perseguir o Rot.** O Rot tem 65%
  de variância de baixa frequência contra 25% da pedra, e fechar esse vão
  se compra com buraco preto — o que faria a rua do `ki` deixar de ler
  como ORDEM, que é justamente contra o que a torção mede. Alvo numérico
  perseguido sem entender a cena é o erro que este projeto mais repete.
- **`#play@N` mentia sobre o trecho da torção.** A poça do Rot matava no
  primeiro quadro e a câmera voltava pro spawn, então toda captura de lá
  mostrava a rua — e eu concluí daquilo que a parede não tinha variação.
  Corrigido com `#photo`. Instrumento quebrado produz conclusão errada com
  a mesma confiança de um bom.
