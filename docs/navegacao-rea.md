# Navegação e temas — 04/11/2026

## Estado integrado

A base `35a5b2b` já incorpora o menu administrativo do Claude: substitui o menu comum dentro da sidebar e usa drawer fixo de 240 px no desktop. O trabalho dos temas preserva essa implementação, o catálogo de bibliotecas e as demais mudanças posteriores à primeira integração do painel.

## Referência REA

A pedido do usuário, o REA analisou três fontes da tag local Jellyfin Web 10.11.10. A análise foi estática, sem executar o Jellyfin nem acessar o Zima:

```sh
/home/sekironote/IA/Ferramentas/node/bin/node scripts/rea.mjs analyze-javascript-application /home/sekironote/IA/Fontes/jellyfin-web-10.11.10 \
  --source-path src/apps/dashboard/components/drawer/AppDrawer.tsx \
  --source-path src/apps/dashboard/AppLayout.tsx \
  --source-path src/components/ResponsiveDrawer.tsx \
  --detail summary --max-heap-mb 512 \
  --evidence_output /home/sekironote/IA/Analises/pugoticine-temas-20261104/rea/drawer.evidence.json --format json
```

Executado em `/home/sekironote/IA/Ferramentas/rea-jellyfin`. Resumo salvo em `~/IA/Analises/pugoticine-temas-20261104/rea/drawer-summary.json`.

- Evidência principal: `ev_e13d7d8c06e7a59cf3294c56cedeb75b4859bb562da4224c064de4827e23e660`.
- Evidência do resumo: `ev_910fe3e160d4c4ba2898b59a3121f654d34c7de2749e246a0d1f038893eb26a4`.
- 3 fontes analisadas, 7.858 bytes, zero falhas de parsing; 957 arquivos inventariados ficaram fora do escopo. Cobertura global e relações semânticas parciais. Não demonstra paridade completa de comportamento.
- Leitura direta complementar: `AppDrawer.tsx` compõe os grupos Servidor, Dispositivos, TV ao Vivo, Plugins e Avançado. `ResponsiveDrawer.tsx` define largura 240 e modo permanente no desktop, móvel no celular. `AppLayout.tsx` monta a navegação administrativa como layout próprio.

## Temas

Seletor **Perfil → Tema**, disponível para usuários comuns e administradores. Preferência deste navegador em `localStorage` (`pugoticine:tema`), aplicada no `<head>` antes da primeira pintura. Sincroniza mudanças entre abas. Sem acesso ao armazenamento, a troca funciona na sessão e informa que não pôde persistir.

| Tema | Fundo | Texto | Destaque |
|---|---|---|---|
| 1 — Atual | Visual original | Visual original | Visual original |
| 2 — Lima | `#101010` | `#FFFFFF` | `#C8FF00` |
| 3 — Vinho | `#651424` | `#FFFFFF` | `#FF5825` |
| 4 — Azul | `#0E359D` | `#FFFFFF` | `#FF606A` |

As superfícies e bordas derivam da paleta. Botões preenchidos nos temas 2–4 usam texto `#101010`, com contraste verificado ≥4,5:1. Catálogo, painel, salas, partículas e controles do player acompanham a preferência; imagem do vídeo e legendas mantêm seu tratamento próprio. Estilos base e temas usam camadas CSS, permitindo que o CSS personalizado de Marca prevaleça sem `!important`.

A validação móvel revelou um problema anterior: a grade das fileiras expandia o viewport de 390 para 524 px e empurrava Perfil para fora da tela. Corrigido no dono da grade com `minmax(0,1fr)` e `min-width:0`.

## Verificação

`test/browser-temas.mjs` (PQA-270/271), Chromium do sistema: quatro paletas, persistência ao recarregar, sincronização entre abas, contraste dos botões, CSS personalizado e celular 390×844. Testado com frontend do worktree interceptado pelo Playwright e backend local existente; nenhuma mudança no container 3012 nesta etapa. Capturas em `~/IA/Analises/pugoticine-temas-20261104/`.

```sh
PUGOTICINE_FRONTEND="$PWD/public" \
PUGOTICINE_CAPTURAS=/home/sekironote/IA/Analises/pugoticine-temas-20261104 \
/home/sekironote/IA/Ferramentas/node/bin/node test/browser-temas.mjs
```

Depois do deploy local, executar o mesmo teste sem `PUGOTICINE_FRONTEND` para validar os arquivos efetivamente servidos pelo container.
