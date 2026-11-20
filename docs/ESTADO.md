# Estado do projeto — Canvas Speed Controller Plus

## Objetivo
Extensão Chrome (MV3) que acelera/desacelera jogos HTML5/canvas hookando relógios
(`performance.now`, `Date.now`, `requestAnimationFrame`, timers) e `timeScale` de engines.

## Arquitetura (v3.5)
- `inject.js` — funções que rodam na página (world MAIN). Fonte única; autocontidas (serializadas pelo `executeScript`).
- `core.js` — estado por site (`chrome.storage.local`, chave `site:<host>`), validação de velocidade e `applySiteState`.
- `background.js` — `importScripts(inject.js, core.js)`; reaplica em frames novos do site e trata comandos do painel.
- `popup.js` — UI; usa `inject.js` + `core.js` via `<script>`.
- `content-bridge.js` — ponte ISOLATED painel → background, com guarda contra registro duplo.
- Testes: `npm test` (node:test, sem deps). Sintaxe: `npm run check`.

## Feito (2026-11-20)
- Estado por site (antes global: acelerava qualquer site visitado).
- Câmera lenta (< 1x) funciona; reset não faz o relógio voltar (sem delta negativo).
- Reset de `timeScale` só nos objetos alterados pela extensão; injetar em 1x não mexe no jogo.
- Auto-skip usa `setInterval` original (antes clicava 10x mais rápido em 10x).
- Bridge não duplica mensagens; painel do background agora igual ao do popup (com auto-skip).
- Background valida mensagens (painel ativo, frame topo, velocidade finita e limitada).
- Vazamento de listeners do painel corrigido; acessibilidade básica no popup.

## Pendências / riscos conhecidos
- Possível aceleração "ao quadrado" em engines com `timeScale` (Cocos/PIXI) — hook de tempo + timeScale somam. Validar num jogo real.
- `new Date()` sem argumentos não é acelerado.
- `setInterval` já agendado mantém o ritmo antigo ao trocar velocidade.

## Próximo passo
Validar em jogo real (Cocos/PIXI) e decidir sobre o modo de aceleração; features sugeridas no histórico da conversa.
