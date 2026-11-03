# Menu do Jellyfin 10.11.10 → PugotiCine

Este documento é o inventário das telas do menu do Jellyfin e do que o PugotiCine já tem de cada uma (o "braço 2").

- **Referência:** fontes em `motor/web` (jellyfin-web) e `motor/servidor` (servidor), versão 10.11.10.
- **Caminhos abaixo:** os de `web/` são relativos a `motor/web/src`; os de `Controllers/` a `motor/servidor/Jellyfin.Api/Controllers`.
- **REA:** não foi preciso usar nesta rodada. O código-fonte cobriu as três áreas, e as evidências do REA em `~/IA/Analises/jellyfin-20261103` confirmam a mesma arquitetura (controllers da API acima, `SessionManager`, `ScheduledTasks`).

Legenda: ✅ existe no PugotiCine · 🟡 parcial · ❌ não existe.

## Menu lateral

| Item | Jellyfin | PugotiCine |
|---|---|---|
| Início | linhas "Continuar assistindo", "Próximo", "Adicionados recentemente" e bibliotecas | ✅ início com "Continuar assistindo" e a biblioteca |
| Mídia: Filmes / Séries / Animes | uma entrada por biblioteca (`/Library/VirtualFolders`) | 🟡 só "Filmes" (séries e animes dependem do catálogo novo, passo 4 do braço 1) |
| Administração: Painel | `web/apps/dashboard` (rotas em `web/apps/dashboard/routes/_asyncRoutes.ts:5-34`) | 🟡 Painel inicial feito nesta rodada (ver abaixo) |
| Administração: Gerenciador de Metadados | `web/apps/dashboard/routes/routes.tsx:42` (`edititemmetadata`) + `web/components/metadataEditor/` | ❌ |
| Usuário: Configurações | `web/apps/stable/routes/user/settings/index.tsx` + `web/controllers/user/{display,home,playback,subtitles,controls}` | ❌ (perfil é do PugotiLab) |
| Sair | encerra a sessão | ✅ |

## Painel (Administração)

| Tela do Jellyfin | O que faz | Web | Servidor | PugotiCine |
|---|---|---|---|---|
| Visão geral: Servidor | nome, versão, sistema; reiniciar e desligar | `web/apps/dashboard/components/widgets/ServerInfoWidget`, `features/system/api/useRestartServer.ts:11`, `useShutdownServer.ts:11` | `SystemController.cs:71` (`GetSystemInfo`) | ✅ servidor, versão, Node, FFmpeg, CPU, carga e memória. Reiniciar/desligar ❌ (no Zima isso fica com o Docker) |
| Visão geral: Contagens | itens por tipo | `features/metrics/api/useItemCounts.ts:15` | `LibraryController.cs:450` (`GetItemCounts`) | ✅ filmes, tamanho, legendas, pessoas com atividade |
| Visão geral: Dispositivos/Sessões ativas | quem está assistindo; pausar e mandar mensagem | `features/sessions/api/useSessions.ts:16`, `usePlayPauseSession.ts`, `useSendMessage.ts` | `SessionController.cs:55` (`GetSessions`) | 🟡 "Assistindo agora" pelo progresso gravado a cada 15 s (menos de 60 s e não concluído). Sem controle remoto. A lista exata de sessões HLS fica para integrar com o `GerenciadorHls` (braço 1) |
| Visão geral: Atividade | registro de eventos | `features/activity/api/useLogEntries.ts:14` | `ActivityLogController.cs:43` | 🟡 atividade de reprodução (quem, o quê, quanto, quando). Login, erros e varreduras ❌ |
| Visão geral: Tarefas em execução | tarefas agendadas rodando | `features/tasks/hooks/useLiveTasks`, `api/useStartTask.ts:14` | `ScheduledTasksController.cs:40` e `:98` | 🟡 lista das duas tarefas (varredura, metadados Radarr) com última e próxima. Executar = "Escanear biblioteca" |
| Visão geral: Caminhos | caminhos do servidor e espaço em disco | `features/storage/api/useSystemStorage.ts:13` | `SystemController.cs:84` (`GetSystemStorage`) | ✅ mídia e dados com espaço livre/total |
| Bibliotecas | criar, renomear e remover bibliotecas; caminhos; opções; escanear | `features/libraries/api/useVirtualFolders.ts:8`, `useRenameVirtualFolder.ts`, `useRemoveVirtualFolder.ts` | `LibraryStructureController.cs:60`, `LibraryController.cs:334` (`RefreshLibrary`) | 🟡 uma biblioteca fixa (`MEDIA_ROOT`) com "Escanear". Várias bibliotecas dependem do catálogo novo (braço 1, passo 4) |
| Bibliotecas › Exibição / Metadados / NFO | idioma e país, provedores, leitura de NFO | `routes/libraries/{display,metadata,nfo}.tsx`, `useCultures.ts:8`, `useCountries.ts:8` | `LocalizationController` | ❌ |
| Usuários | lista, criar, perfil, acesso às bibliotecas, controle parental, senha | `routes/users/*` | `UserController.cs` | ❌ (contas vêm do PugotiLab; dá para listar quem já usou e ter permissões por biblioteca) |
| Reprodução › Transcodificação / Streaming / Retomada / Trickplay | aceleração por hardware, threads, limite de taxa, % para retomar | `routes/playback/*` | `ConfigurationController` (encoding) | ❌ (é do braço 1: player) |
| Tarefas agendadas | lista, executar, gatilhos | `routes/tasks/*`, `features/tasks/api/*` | `ScheduledTasksController.cs` | 🟡 só a exibição no Painel |
| Logs | arquivos de log do servidor | `features/logs/api/useServerLogs.ts:8`, `useServerLog.ts:12` | `SystemController.cs:150` | ❌ (o log do container sai no `docker logs`) |
| Dispositivos, Chaves de API, Backups, Branding, Plugins, TV ao vivo, Rede | gestão avançada | `routes/{devices,keys,backups,branding,plugins,livetv}`, `_legacyRoutes.ts:6-20` | controllers de mesmo nome | ❌ (prioridade baixa) |

## Gerenciador de Metadados (Administração)

| O que faz | Web | Servidor | PugotiCine |
|---|---|---|---|
| Árvore das bibliotecas com os itens | `web/components/metadataEditor/metadataEditor.js:404-407` (`getItem`, `getRootFolder`) | `ItemsController` | ❌ |
| Editar campos: título, título original e de ordenação, data de adição, ano, data de estreia, nota da comunidade e da crítica, tagline, sinopse, classificação, gêneros, estúdios, tags, pessoas, idioma e país, travar dados | `metadataEditor.template.html` (ids `txtName`, `txtOriginalName`, `txtSortName`, `txtProductionYear`, `txtPremiereDate`, `txtOverview`, `listGenres`, `listStudios`, `listTags`, `peopleList`, `chkLockData`…), salvar em `metadataEditor.js:52` | `ItemUpdateController.cs:75` (`UpdateItem`), `:148` (`GetMetadataEditorInfo`) | ❌ (hoje só lê do Radarr; não há edição persistente) |
| Identificar (buscar o título certo no TMDb/IMDb e aplicar) | `web/components/itemidentifier` | `ItemLookupController.cs:88` (busca de filme), `:248` (`ApplySearchCriteria`) | ❌ |
| Atualizar metadados (substituir tudo ou só o que falta) | `web/components/refreshdialog` | `ItemRefreshController.cs:61` | 🟡 atualização global do Radarr a cada varredura |
| Imagens: pôster, fundo e logo; buscar remotas ou enviar | `web/components/imageeditor`, `imageDownloader` | `ImageController.cs:353`, `RemoteImageController.cs:66` | ❌ (pôster/fundo vêm como URL do Radarr, sem cache local) |
| Tipo de conteúdo da pasta | `metadataEditor.js:56-58` (`Items/{id}/ContentType`) | `ItemUpdateController` | ❌ |

## Configurações do usuário

| Tela | O que guarda | Web | Servidor | PugotiCine |
|---|---|---|---|---|
| Perfil | nome, senha, imagem | `web/apps/stable/routes/user/userprofile.tsx` | `UserController.cs` | ✅ no PugotiLab (link "Perfil") |
| Exibição | idioma, formato de data, tema, telas | `web/controllers/user/display` | `DisplayPreferencesController.cs:114` | ❌ |
| Início | quais seções aparecem e em que ordem | `web/controllers/user/home` | `DisplayPreferencesController` | ❌ |
| Reprodução | idioma de áudio preferido, faixa padrão, lembrar áudio e legenda, próximo episódio automático, qualidade máxima, canais de áudio, normalização, pular ±N s, modo cinema | `web/components/playbackSettings/playbackSettings.js:277-318` (`AudioLanguagePreference`, `PlayDefaultAudioTrack`, `RememberAudioSelections`, `RememberSubtitleSelections`, `EnableNextEpisodeAutoPlay`, `allowedAudioChannels`, `skipForwardLength`, `skipBackLength`…) | `UserController.cs:492` (`UpdateUserConfiguration`) | ❌ (o player escolhe por sessão) |
| Legendas | idioma preferido, modo (padrão, sempre, só forçadas, nenhuma), aparência | `web/components/subtitlesettings/subtitlesettings.js:82-94` (`SubtitleLanguagePreference`, `SubtitleMode`, `setSubtitleAppearanceSettings`) | `UserController.cs:492` | ❌ |
| Controles | gamepad, rolagem suave | `web/controllers/user/controls` | (local) | ❌ |

## Plano por fases (braço 2)

Prioridade: o que dá valor já com o app atual (filmes, progresso, login PugotiLab, admin/user).

1. **Painel, visão geral** ✅ (esta rodada, PQA-230/231): servidor, contagens, assistindo agora, atividade, biblioteca com "Escanear", tarefas e armazenamento. Só para administrador.
2. **Configurações do usuário › Reprodução e Legendas.** Preferências guardadas por usuário no SQLite (idioma de áudio e legenda, modo de legenda, qualidade padrão, lembrar faixas, pular ±s), expostas em `GET/PUT /api/me/preferencias`. O player do braço 1 lê essas preferências quando integrar. Umas 3 h.
3. **Gerenciador de Metadados (filmes).** Edição persistente (título, ano, sinopse, gêneros, nota, travar dados) sobre o Radarr, mais "Identificar" (TMDb por título/ano) e cache local de pôster/fundo. Umas 1 a 2 sessões.
4. **Painel › Usuários e acesso.** Lista de quem usa (PugotiLab), papel admin/user e bibliotecas permitidas, depois do catálogo com várias bibliotecas. Umas 3 h.
5. **Painel › Atividade completa e logs.** Eventos (login, varredura, erro de reprodução) num registro próprio e leitura do log do servidor. Umas 2 h.
6. **Painel › Sessões exatas.** Lista das sessões HLS do `GerenciadorHls` (modo direto/remux/transcode, FFmpeg ativo) e botão para encerrar. Fazer junto com o braço 1.

## Achado fora do escopo (corrigido nesta branch)

O `public/ambient-effects.js` injetava `body>*:not(#pugotilab-ambient)…{position:relative}`. Por causa do `#id` dentro do `:not()`, essa regra vencia as classes e deixava `relative` a barra do topo, o menu, o **modal do player** e o aviso. O conteúdo descia uns 370 px e o player abria abaixo da página, não por cima.

A correção usa `:where(...)`, que zera a especificidade. O PQA-231 verifica que `.topbar` e `#player-modal` voltaram a ser `fixed`.
