Cada agente escreve APENAS o seu arquivo aqui: `m2.json`, `m3.json`, etc.
Nunca edite `progress.json` — escrita concorrente perde trabalho.

Formato:
{ "status": "active|pass|fail", "owner": "m2 inimigos",
  "heartbeat": "<ISO 8601>", "round": 1,
  "gap": "o que ainda falta", "assumption": "premissa não validada, ou null" }

Atualize o heartbeat a cada passo relevante. Sem heartbeat por 15min o
dashboard te marca como "sem sinal" — que é o comportamento desejado, não
um bug: agente morto por limite de sessão não pode contar como ativo.
