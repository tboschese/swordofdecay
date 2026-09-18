# baseline — rodada 0 — FALHA

Julgado contra a rubrica do `AAA_BRIEF.md` e os critérios testáveis do
`DESIGN.md`, com a referência de ofício sendo SNES, Neo Geo e 2D de PS1.
Não houve comparação com captura real de jogo publicado — não temos
acesso a essa arte, e inventar a comparação é proibido (`hero/CRITIC.md`).

## O que medi

```
frame inteiro (vista_f260)
  valor        media 0.58   sd 0.27   p01 0.05   p50 0.58   p99 0.94
  distribuicao sombra 7.5%   meio 56.0%   alta 36.5%
  faixas       0.52  0.89  0.57  0.35    amplitude 0.55

por região (32x32)
  chão            2 tons no matiz dominante · 46% chapado
  colina distante 1 tom                      · 88% chapado
  céu             3 tons                     · 88% chapado
  colina do meio  6 tons                     · 20% chapado
```

## O que eu vejo

O frame lê como protótipo de plataforma ensolarado, não como um mundo
comido por uma praga. As colinas de parallax são **festões idênticos
repetidos** — mesmo arco, mesma largura, mesma fase — e o olho trava no
período em menos de um segundo. Nenhum artista de fundo de Neo Geo repetiu
um arco assim; os silhuetas de Metal Slug quebram o contorno com
assimetria e detalhe irregular justamente pra matar a periodicidade.

A camada distante é **uma cor sólida só**. Isso não é perspectiva
atmosférica, é preenchimento: distância em arte 16/32-bit se faz
*dessaturando em direção à cor do céu e comprimindo a faixa de valor*,
não clareando o mesmo verde saturado. Como está, a colina de trás lê como
"verde mais perto do branco", não como "morro longe na neblina".

O chão tem 2 tons: um lábio claro no topo e o preenchimento. É gramática
de tile de NES. O vocabulário de 32-bit pra um tile de chão é lábio
iluminado, corpo com textura quebrando o preenchimento, banda de oclusão
escura logo abaixo do lábio, e variação de borda pra que tiles vizinhos
não se repitam idênticos — nada disso está presente, e o tile repete sem
uma única variante ao longo de toda a tela.

O guerreiro **não está apoiado no mundo**: não há sombra de contato nem
oclusão sob os pés, então ele flutua sobre a linha do chão. Não existe
camada de primeiro plano ocluindo nada, então a profundidade é toda por
escala e nunca por sobreposição. E a temperatura de cor é uniforme — tudo
na mesma família verde-ciano, sem a separação quente/frio entre luz e
sombra que é o tell mais forte do look "32-bit": em SOTN é exatamente isso
que faz a cantaria ler como esculpida em vez de pintada.

## O maior gap

**A estrutura de valor está em oposição direta à lore.** 36.5% do frame
está nas altas, 7.5% na sombra, média 0.58. Isso é uma imagem *high-key*,
de dia claro. The Rot corrói carne, pedra e memória; a fase é o começo da
curva de tom das 10 regiões, que é estranhamento e negação — não alegria.
Nenhuma quantidade de detalhe de tile conserta isso, porque o problema não
é resolução de detalhe, é a curva.

O que corrige: reconstruir a cena **em valor primeiro** (policy #1 do
`hero/BRIEF.md`, que este projeto já aprendeu a duras penas). Alvo de
partida: massa de sombra em torno de 30-40%, altas abaixo de 10% e
reservadas a specular real, média perto de 0.35-0.40, mantendo p99 alto
pra que ainda exista brilho. Junto disso, separar temperatura — luz
puxando quente, sombra puxando fria/violeta — que é o que dá volume sem
precisar de mais um tom de verde.

Isso é trabalho de m5 (atmosfera) e m8 (grade), **e não exige redesenhar
um único asset**. Por isso vem primeiro: é global, é barato, e todo o
resto passa a ser julgado dentro dele. Ajustar tile e sprite antes da
curva é calibrar contra um alvo que vai mudar — que foi exatamente o erro
que queimou o punho da espada por três rodadas.

## O que já funciona

A colina do meio tem 6 tons e só 20% de área chapada — alguém já
sombreou aquela camada de verdade, e ela é a prova de que o renderer
canvas 2D não é a limitação. O parallax se move em camadas corretamente,
e a silhueta do guerreiro, apesar de pequena, é legível e distinta do
cenário. Não quebrem a camada do meio pra "uniformizar" com as outras: o
caminho é as outras subirem até ela.
