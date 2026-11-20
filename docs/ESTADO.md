# Estado do projeto — Canvas Speed Controller Plus

## Objetivo
Extensão Chrome (MV3) que acelera/desacelera jogos HTML5/canvas hookando relógios
(`performance.now`, `Date.now`, `requestAnimationFrame`, timers) e `timeScale` de engines.

## Arquitetura (v3.7)
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

## Feito (2026-11-20, v3.6)
- Velocidade personalizada (campo numérico 0.25–16) no popup.
- Presets editáveis (globais, chave `settings`, até 8) — refletidos no popup e no painel flutuante.
- Auto-skip configurável por site: intervalo (100–10000 ms) e ponto de clique em % do canvas.
- Fechar o painel reseta velocidade/toggles, mas preserva a config do auto-skip.

## Feito (2026-11-20, v3.7)
- Corrigida aceleração "ao quadrado" (4x virava 16x em PIXI/Cocos): hooks de relógio + timeScale multiplicavam.
- Modo de aceleração por site (`speedMode`): `clock` (padrão, só relógio) ou `engine` (só timeScale, relógio real).
- Estilo `.sublabel` global no popup (textos de ajuda saíam em fonte grande).

## Pendências / riscos conhecidos
- Modo Relógio: engines que limitam o delta por frame (ex.: PIXI `maxElapsedMS` 100 ms) podem não passar de ~6x — usar modo Engine nesses casos. Validar em jogo real.
- Modo Engine em Phaser/CreateJS praticamente não acelera, e o reset não desfaz `targetFps`/`timingMode`.
- Após atualizar a extensão, abas já injetadas pedem recarga (instância antiga não conhece o modo).
- `new Date()` sem argumentos não é acelerado.
- `setInterval` já agendado mantém o ritmo antigo ao trocar velocidade.

## Próximo passo
Validar os dois modos em jogo real (Cocos/PIXI); considerar acelerar `new Date()` e reagendar `setInterval` ao trocar velocidade.
