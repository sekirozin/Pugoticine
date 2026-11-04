# Menu do Jellyfin 10.11.10 → Pugoticine

Este documento é o inventário das telas do menu do Jellyfin e do que o Pugoticine já tem de cada uma (o "braço 2").

- **Referência:** fontes em `motor/web` (jellyfin-web) e `motor/servidor` (servidor), versão 10.11.10.
- **Caminhos abaixo:** os de `web/` são relativos a `motor/web/src`; os de `Controllers/` a `motor/servidor/Jellyfin.Api/Controllers`.
- **REA:** não foi preciso usar nesta rodada. O código-fonte cobriu as três áreas, e as evidências do REA em `~/IA/Analises/jellyfin-20261103` confirmam a mesma arquitetura (controllers da API acima, `SessionManager`, `ScheduledTasks`).

Legenda: ✅ existe no Pugoticine · 🟡 parcial · ❌ não existe.

## Menu lateral

| Item | Jellyfin | Pugoticine |
|---|---|---|
| Início | linhas "Continuar assistindo", "Próximo", "Adicionados recentemente" e bibliotecas | ✅ início com "Continuar assistindo" e a biblioteca |
| Mídia: Filmes / Séries / Animes | uma entrada por biblioteca (`/Library/VirtualFolders`) | 🟡 o catálogo já é a soma das bibliotecas do Painel (cada item tem `bibliotecaId`/`bibliotecaNome`); uma entrada por biblioteca no menu principal fica para quem cuida do menu |
| Administração: Painel | `web/apps/dashboard` (rotas em `web/apps/dashboard/routes/_asyncRoutes.ts:5-34`); `AppLayout.tsx`/`AppDrawer.tsx` (gaveta de 240 px) | ✅ como no Jellyfin: o menu do Painel substitui o menu lateral (240 px no computador, gaveta no celular); o topo da gaveta volta ao Início (PQA-234) |
| Administração: Gerenciador de Metadados | `web/apps/dashboard/routes/routes.tsx:42` (`edititemmetadata`) + `web/components/metadataEditor/` | ❌ |
| Usuário: Configurações | `web/apps/stable/routes/user/settings/index.tsx` + `web/controllers/user/{display,home,playback,subtitles,controls}` | ❌ (perfil é do Pugotilab) |
| Sair | encerra a sessão | ✅ |

## Painel (Administração)

Rodada 3 (03/11/2026). Toda tela mostra no topo o que tem efeito; o que só é salvo traz "ainda não implementado no Pugoticine".

| Aba | Jellyfin (referência) | Funciona de verdade | Só salva / não existe |
|---|---|---|---|
| Painel (visão geral) | `SystemController`, `LibraryController.GetItemCounts`, `SessionController` | servidor, versão, contagens, discos, atividade, tarefas, bibliotecas reais | reiniciar/desligar (Docker) |
| Geral | `ServerConfiguration` | nome do servidor (título e Painel) | idioma, caminhos, Quick Connect, rendimento |
| ~~Marca~~ | `BrandingOptions` | removida (04/11/2026) | — |
| Usuários | `UserController`, `UserPolicy` | lista de quem entrou; ativo/desativado; acesso por biblioteca; classificação etária máxima; bloquear sem classificação (lista e rotas de mídia) | ocultar, bitrate, sessões, salas; nome/senha/login são do Pugotilab |
| Bibliotecas | `LibraryStructureController`, `LibraryController.RefreshLibrary` | adicionar/editar/remover, tipo, várias pastas (seletor dentro de `PUGOTICINE_PASTAS_PERMITIDAS`), ativar, monitoramento em tempo real, rastrear cada uma ou todas; séries/animes com nome de episódio | idioma/país e atualização automática de metadados; Música e Livros (só vídeo) |
| Bibliotecas › Exibição / Metadados / NFO | `routes/libraries/{display,metadata,nfo}` | — | tudo salvo (metadados vêm do Radarr) |
| Reprodução › Transcodificação | `EncodingOptions` | aplicado pelo player (braço 1, `7e79edf`) | parte dos campos |
| Reprodução › Retomar | `ServerConfiguration` | % máxima para concluir | mínimos, audiolivros |
| Reprodução › Streaming / Trickplay | | — | salvos |
| Dispositivos | `DevicesController` | lista real dos navegadores | — |
| Atividade | `ActivityLogController` | eventos reais (reprodução, login, bibliotecas, tarefas, backups, configuração) | — |
| TV ao Vivo / DVR | `LiveTvController` | — | M3U/XMLTV não feitos: exigem o player tocar transmissões contínuas |
| Plugins | `PluginsController`, `PackageController` | instalados (nenhum) e integrações embutidas | catálogo indisponível (plugins são .NET); repositórios salvos |
| Redes | `NetworkConfiguration`, `IPBasedAccessValidationMiddleware` | Redes LAN, Proxies conhecidos (X-Forwarded-For), Permitir remoto, filtro de IP lista branca/negra; não deixa salvar algo que bloqueie você | portas, HTTPS, URL base, IPv4/6, descoberta |
| Chaves da API | `ApiKeyController` | criar/revogar; `X-Pugoticine-Token`/`X-Emby-Token` | — |
| Backups | `BackupController`, `BackupService` | criar, baixar, excluir e restaurar (validado, com backup de segurança, aplicado ao reiniciar) | mídias e variáveis do container não entram |
| Registros | `SystemController.GetServerLogs` | arquivos reais; aviso de resposta lenta | — |
| Tarefas Agendadas | `ScheduledTasksController`, `TaskTriggerInfo` | 6 tarefas (escanear, metadados Radarr, limpar atividade, limpar logs, limpar temporários, otimizar banco), iniciar, gatilhos diário/semanal/intervalo/inicialização | tarefas de capítulos, trickplay, legendas, plugins |

## Gerenciador de Metadados (Administração)

| O que faz | Web | Servidor | Pugoticine |
|---|---|---|---|
| Árvore das bibliotecas com os itens | `web/components/metadataEditor/metadataEditor.js:404-407` (`getItem`, `getRootFolder`) | `ItemsController` | ❌ |
| Editar campos: título, título original e de ordenação, data de adição, ano, data de estreia, nota da comunidade e da crítica, tagline, sinopse, classificação, gêneros, estúdios, tags, pessoas, idioma e país, travar dados | `metadataEditor.template.html` (ids `txtName`, `txtOriginalName`, `txtSortName`, `txtProductionYear`, `txtPremiereDate`, `txtOverview`, `listGenres`, `listStudios`, `listTags`, `peopleList`, `chkLockData`…), salvar em `metadataEditor.js:52` | `ItemUpdateController.cs:75` (`UpdateItem`), `:148` (`GetMetadataEditorInfo`) | ❌ (hoje só lê do Radarr; não há edição persistente) |
| Identificar (buscar o título certo no TMDb/IMDb e aplicar) | `web/components/itemidentifier` | `ItemLookupController.cs:88` (busca de filme), `:248` (`ApplySearchCriteria`) | ❌ |
| Atualizar metadados (substituir tudo ou só o que falta) | `web/components/refreshdialog` | `ItemRefreshController.cs:61` | 🟡 atualização global do Radarr a cada varredura |
| Imagens: pôster, fundo e logo; buscar remotas ou enviar | `web/components/imageeditor`, `imageDownloader` | `ImageController.cs:353`, `RemoteImageController.cs:66` | ❌ (pôster/fundo vêm como URL do Radarr, sem cache local) |
| Tipo de conteúdo da pasta | `metadataEditor.js:56-58` (`Items/{id}/ContentType`) | `ItemUpdateController` | ❌ |

## Configurações do usuário

| Tela | O que guarda | Web | Servidor | Pugoticine |
|---|---|---|---|---|
| Perfil | nome, senha, imagem | `web/apps/stable/routes/user/userprofile.tsx` | `UserController.cs` | ✅ no Pugotilab (link "Perfil") |
| Exibição | idioma, formato de data, tema, telas | `web/controllers/user/display` | `DisplayPreferencesController.cs:114` | ❌ |
| Início | quais seções aparecem e em que ordem | `web/controllers/user/home` | `DisplayPreferencesController` | ❌ |
| Reprodução | idioma de áudio preferido, faixa padrão, lembrar áudio e legenda, próximo episódio automático, qualidade máxima, canais de áudio, normalização, pular ±N s, modo cinema | `web/components/playbackSettings/playbackSettings.js:277-318` (`AudioLanguagePreference`, `PlayDefaultAudioTrack`, `RememberAudioSelections`, `RememberSubtitleSelections`, `EnableNextEpisodeAutoPlay`, `allowedAudioChannels`, `skipForwardLength`, `skipBackLength`…) | `UserController.cs:492` (`UpdateUserConfiguration`) | ❌ (o player escolhe por sessão) |
| Legendas | idioma preferido, modo (padrão, sempre, só forçadas, nenhuma), aparência | `web/components/subtitlesettings/subtitlesettings.js:82-94` (`SubtitleLanguagePreference`, `SubtitleMode`, `setSubtitleAppearanceSettings`) | `UserController.cs:492` | ❌ |
| Controles | gamepad, rolagem suave | `web/controllers/user/controls` | (local) | ❌ |

## Plano por fases (braço 2)

Prioridade: o que dá valor já com o app atual (filmes, progresso, login Pugotilab, admin/user).

1. **Painel, visão geral** ✅ (esta rodada, PQA-230/231): servidor, contagens, assistindo agora, atividade, biblioteca com "Escanear", tarefas e armazenamento. Só para administrador.
2. **Configurações do usuário › Reprodução e Legendas.** Preferências guardadas por usuário no SQLite (idioma de áudio e legenda, modo de legenda, qualidade padrão, lembrar faixas, pular ±s), expostas em `GET/PUT /api/me/preferencias`. O player do braço 1 lê essas preferências quando integrar. Umas 3 h.
3. **Gerenciador de Metadados (filmes).** Edição persistente (título, ano, sinopse, gêneros, nota, travar dados) sobre o Radarr, mais "Identificar" (TMDb por título/ano) e cache local de pôster/fundo. Umas 1 a 2 sessões.
4. **Painel › Usuários e acesso.** Lista de quem usa (Pugotilab), papel admin/user e bibliotecas permitidas, depois do catálogo com várias bibliotecas. Umas 3 h.
5. **Painel › Atividade completa e logs.** Eventos (login, varredura, erro de reprodução) num registro próprio e leitura do log do servidor. Umas 2 h.
6. **Painel › Sessões exatas.** Lista das sessões HLS do `GerenciadorHls` (modo direto/remux/transcode, FFmpeg ativo) e botão para encerrar. Fazer junto com o braço 1.

## Achado fora do escopo (corrigido nesta branch)

O `public/ambient-effects.js` injetava `body>*:not(#pugotilab-ambient)…{position:relative}`. Por causa do `#id` dentro do `:not()`, essa regra vencia as classes e deixava `relative` a barra do topo, o menu, o **modal do player** e o aviso. O conteúdo descia uns 370 px e o player abria abaixo da página, não por cima.

A correção usa `:where(...)`, que zera a especificidade. O PQA-231 verifica que `.topbar` e `#player-modal` voltaram a ser `fixed`.

## Rodada 2 (03/11): Painel completo

O Painel tem o mesmo menu do Jellyfin, com os mesmos grupos e itens, e uma tela por item:
- **Fonte do menu:** `web/apps/dashboard/components/drawer/sections/*.tsx`.
- **Campos e textos:** `strings/pt-br.json`.
- **Valores padrão:** dos modelos do servidor (`ServerConfiguration.cs`, `EncodingOptions.cs`, `TrickplayOptions.cs`, `XbmcMetadataOptions.cs`, `BrandingOptions.cs`, `LiveTvOptions.cs`, `NetworkConfiguration.cs`).
- **Grupos:** Servidor, Dispositivos, TV ao Vivo, Plugins e Avançado. O drawer do Jellyfin também tem "Tarefas Agendadas" em Avançado, e a tela foi incluída.

O REA não foi necessário.

**Onde fica cada parte:**
- Esquema das telas: `src/painel/configuracao.ts`.
- Banco: `src/painel/banco.ts` (arquivo `painel.db`, separado do de progresso e do das salas).
- Rotas: `src/painel/rotas.ts`.
- Telas: `public/painel.js`.

Só administrador acessa. Usuário comum recebe 403 em todas as rotas `/api/painel*` e em `/api/configuracao/reproducao`.

| Tela | Faz de verdade | Só salva (aviso na tela) |
|---|---|---|
| Painel | visão geral real (servidor, contagens, assistindo agora, atividade, biblioteca, tarefas, discos) | — |
| Geral | Nome do servidor (título da página e Painel) | idioma, locais de cache e metadados, Quick Connect, limites de rendimento |
| ~~Marca~~ | removida em 04/11/2026 (serviço próprio) | — |
| Usuários | lista de quem já entrou (Pugotilab); **Desativar este usuário** bloqueia o acesso (403); excluir da lista | ocultar, limite de bitrate, sessões simultâneas, acesso às salas (SyncPlay) |
| Bibliotecas › Bibliotecas | lista e **Rastrear Todas as Bibliotecas** | adicionar, renomear e remover (precisa do catálogo com várias bibliotecas) |
| Bibliotecas › Exibir / Metadados / NFO | — | todos os campos |
| Reprodução › Transcodificação | — (gravado e exposto em `GET /api/configuracao/reproducao`) | todos os campos; o braço do player liga |
| Reprodução › Retomar | **Porcentagem máxima** decide quando o filme conta como assistido | mínimos e audiolivro |
| Reprodução › Transmissão / Trickplay | — (Transmissão exposta para o player) | todos os campos |
| Dispositivos | lista real (navegador, sistema, IP, último acesso), excluir um ou todos | — |
| Atividade | registro real: entrou, começou a reproduzir, configuração alterada, tarefa, chave, backup, usuário; filtro Todos/Usuário/Sistema; retenção de 30 dias | — |
| TV ao Vivo / DVR | — | campos do DVR; sintonizadores e guia aparecem desativados |
| Plugins | — | lista de repositórios |
| Redes | — | todos os campos (portas e HTTPS ficam com o Docker e o proxy do Pugotilab) |
| Chaves da API | criar (o token aparece uma vez; só o hash é guardado), usar por `X-Pugoticine-Token` (acesso de admin), revogar | — |
| Backups | criar (`.tar` com cópias consistentes de `pugoticine.db`, `painel.db` e `salas.db` + `manifest.json`), baixar, excluir | restaurar (responde 501 com aviso) |
| Registros | arquivos `log_AAAAMMDD.log` reais do processo (7 dias) e leitura; aviso de **resposta lenta** aplicado | — |
| Tarefas Agendadas | Varrer a biblioteca e Atualizar metadados do Radarr: última e próxima execução, duração, resultado, **Executar** | — |

O Pugoticine também ganhou duas coisas novas:
- `GET /api/servidor`, que qualquer pessoa logada lê: nome do servidor e versão. (A aba Marca foi removida em 04/11/2026: o Pugoticine é um serviço próprio.)
- O limite de "assistido" no `store.saveProgress`, que antes era fixo em 90% e agora vem de Retomar.
