# Canvas Speed Controller Plus

Extensão para Chrome que controla a velocidade de animações em jogos HTML5 e conteúdo canvas diretamente no navegador.

🌐 **Site oficial:** [canvas-speed-controller-plus.vercel.app](https://canvas-speed-controller-plus.vercel.app)

## 📦 Instalação

### Modo Desenvolvedor (atual)

1. Baixe o [último release](https://github.com/MarcBuzatto/canvas-speed-extension/releases/latest) (`canvas-speed.zip`)
2. Extraia em uma pasta do seu computador
3. Abra `chrome://extensions/` no Chrome
4. Ative o **Modo do desenvolvedor** (canto superior direito)
5. Clique em **Carregar sem compactação** e selecione a pasta extraída
6. Pronto! O ícone aparece na barra de extensões

### Chrome Web Store
*Em breve*

## ✨ Recursos

- **Câmera lenta e aceleração (0.25x a 16x)** - Slider, campo de velocidade personalizada e até 8 presets editáveis
- **Configuração por site** - Cada jogo lembra a própria velocidade; os outros sites não são afetados
- **Auto-Skip configurável** - Intervalo (100 ms a 10 s) e ponto de clique no canvas, por site
- **Painel flutuante** - Troque a velocidade e o auto-skip direto na página do jogo
- **Estado persistente** - Preferências salvas via `chrome.storage.local`
- **100% privado** - Zero coleta de dados, tudo roda localmente
- **Ultra leve** - Sem dependências

## 🛠️ Desenvolvimento

- `npm test` — testes unitários (node:test, sem dependências)
- `npm run check` — checagem de sintaxe
- `npm run build` — gera `canvas-speed.zip` com apenas os arquivos da extensão

Arquitetura e pendências em [`docs/ESTADO.md`](docs/ESTADO.md).

## 🎮 Engines compatíveis

- Cocos Creator (2.x · 3.x)
- PixiJS
- Phaser (2 · 3)
- Spine (animações 2D)
- CreateJS
- Three.js
- Canvas API nativa
- Qualquer engine com `timeScale`

## 🔐 Privacidade

A extensão **NÃO** coleta, armazena ou transmite nenhum dado pessoal. Veja a [política de privacidade completa](https://canvas-speed-controller-plus.vercel.app/privacy.html).

## 📞 Suporte

- **Discord:** [discord.gg/b9ZJrypBra](https://discord.gg/b9ZJrypBra)
- **Site:** [canvas-speed-controller-plus.vercel.app](https://canvas-speed-controller-plus.vercel.app)

## 👤 Autor

Desenvolvido por **markizin**

## 📄 Licença

Todos os direitos reservados © 2026
