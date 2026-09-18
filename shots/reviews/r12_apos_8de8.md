# rodada 12 — 8/8 aprovados, e ainda NÃO é AAA

Escrito depois de os oito módulos passarem, justamente porque passar na
rubrica interna não é a mesma coisa que atingir a barra. Esta review
existe pra dizer o que os critérios que eu mesmo escrevi não capturaram.

## O que medi

```
run_f080 — media 0.38  sd 0.19  p01 0.02  p99 0.84
           sombra 24.7%  meio 70.8%  alta 4.5%
           amplitude entre faixas 0.36
```

Tudo dentro de faixa. E é exatamente esse o problema desta review: os
números não veem o defeito abaixo.

## O maior gap

**O plano de jogo é a parte MENOS legível da imagem.**

Amplie `shots/out/z_judge.png`. A camada em que o guerreiro efetivamente
anda — o chão, a plataforma, os 40px de baixo — é a mais escura, a mais
ruidosa e a de menor contraste interno do quadro. O fundo (mata, névoa,
ruínas) é mais legível que o piso onde a ação acontece.

Isso inverte a hierarquia que um plataforma precisa. Em Metal Slug e em
SOTN o plano de jogo é o mais claro e o mais nítido; o fundo recua por
valor e por foco. Aqui recuou o contrário: o cenário ficou bonito e o
palco ficou sujo.

Não é preciosismo estético, é problema de jogabilidade. O jogador precisa
ler beirada de plataforma, buraco e inimigo no chão em movimento, a 60fps,
e hoje tudo isso compete com textura de entulho na mesma frequência do
personagem.

**O que corrige**: separar o plano de jogo do fundo por VALOR e por
FREQUÊNCIA — clarear a superfície jogável, baixar a densidade de corte de
valor nela (o dono do m1 já identificou a alavanca exata: a distribuição
de vigor em `lipRow`, hoje 33/33/33), e deixar o entulho de alta
frequência para o primeiro plano e para o fundo, onde ele não disputa
leitura com a ação.

Isso contradiz em parte o que eu pedi ao m1 nesta rodada — eu mandei
quebrar a linha contínua e ele quebrou bem, com medição. O erro foi meu
ao não dizer *em qual camada* a quebra podia acontecer sem custo.

## Outros três, em ordem, sem virar lista de cinco

1. **Não há âncora de cor.** Tudo é verde-acinzentado. Fantasia sombria de
   verdade guarda um ou dois acentos saturados pro olho ancorar — SOTN tem
   ouro e sangue. Aqui só as moedas e o penacho, ambos pequenos.
2. **O personagem ocupa pouco do quadro.** 60px numa tela de 224 de altura,
   com muito céu vazio. Metal Slug enche muito mais o quadro de ação.
3. **A plataforma é uma fita chapada.** Ganhou cantoneira de metal, mas não
   tem espessura nem sombra própria projetada no que está atrás.

## O que já está no nível — não quebrar

A silhueta da mata com copas mastigadas, a perspectiva atmosférica entre
camadas, o hitstop (4 frames no normal, ~10 no carregado, medido no
relógio do mundo), a tela de título, e a leitura do guerreiro contra o
fundo. Esses cinco sobrevivem a comparação com arte publicada.

## Nota de método

Oito módulos passaram e a imagem ainda não é AAA. Isso significa que a
rubrica tinha um buraco: ela media cada superfície isoladamente e nunca
perguntou **qual camada tem que ganhar a atenção**. Toda métrica em
`measure.mjs` é global ao frame ou local a uma região escolhida à mão;
nenhuma compara o plano de jogo com o fundo.

Próxima métrica a construir: contraste e frequência de corte do plano de
jogo contra o plano de fundo, como razão. Sem ela este defeito continuaria
invisível para o instrumento.
