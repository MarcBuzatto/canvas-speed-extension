# Política de Privacidade - Canvas Speed Controller Plus

**Última atualização:** 19 de abril de 2026

## Resumo

A extensão "Canvas Speed Controller Plus" NÃO coleta, armazena ou transmite nenhum tipo de dado pessoal dos usuários. Toda a funcionalidade roda 100% localmente no navegador do usuário.

## Dados que NÃO são coletados

- Nome, e-mail ou qualquer informação de identificação pessoal
- Histórico de navegação ou URLs visitadas
- Conteúdo de páginas
- Informações financeiras, de saúde ou autenticação
- Localização ou endereço IP
- Comunicações pessoais
- Atividade do usuário (cliques, digitação, rolagem)

## Armazenamento Local

A extensão salva APENAS as seguintes preferências localmente (via `chrome.storage.local`) no navegador do próprio usuário:

- Velocidade de animação escolhida (ex: 1x, 2x, 3x)
- Estado do toggle de auto-skip (ativado/desativado)

Esses dados NUNCA são enviados para servidores externos, terceiros ou qualquer outro lugar fora do dispositivo do usuário. O usuário pode apagá-los a qualquer momento removendo a extensão.

## Permissões solicitadas e justificativas

- **activeTab:** Necessária para injetar o script de controle de velocidade na aba ativa quando o usuário clica na extensão.
- **scripting:** Usada para injetar o código de controle de velocidade no contexto da página.
- **storage:** Usada para salvar localmente a preferência de velocidade do usuário entre sessões.
- **host_permissions (`<all_urls>`):** Necessária pois o usuário pode querer controlar a velocidade de animações em qualquer site com conteúdo HTML5/canvas.

## Compartilhamento de Dados

Nenhum dado é compartilhado, vendido ou transferido a terceiros, pois nenhum dado é coletado.

## Código Aberto

O código-fonte está disponível para auditoria pública.

## Contato

Para dúvidas sobre esta política:
- Discord: https://discord.gg/b9ZJrypBra
- Desenvolvedor: markizin

## Alterações

Qualquer alteração nesta política será refletida aqui com data de atualização. A versão em vigor é sempre a mais recente.
