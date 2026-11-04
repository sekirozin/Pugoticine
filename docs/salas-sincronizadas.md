# Salas de filme sincronizadas (Pugoticine)

O pedido: assistir junto com outras pessoas do PugotiLab. A pessoa cria uma sala e convida usuários. A sala pode ser de três tipos:
- **pública**, que aparece para todos;
- **com senha**, que aparece para todos mas pede senha;
- **privada**, que não aparece para quem não foi convidado.

A referência foi o SyncPlay do Jellyfin 10.11.10. Bastou ler o código-fonte que temos em `motor/`; o REA não foi necessário.

## Como o SyncPlay do Jellyfin funciona

### Servidor (`motor/servidor`)
- **Grupos:** `Emby.Server.Implementations/SyncPlay/SyncPlayManager.cs` cria, entra, sai e lista grupos (`JoinGroup` :140, `LeaveGroup` :206, `ListGroups` :259) e encaminha os pedidos de reprodução ao grupo (`HandleRequest` :318). Não há senha nem grupo privado: a lista mostra os grupos visíveis ao usuário.
- **Membros:** `MediaBrowser.Controller/SyncPlay/GroupMember.cs`. Cada membro guarda o `Ping` (:46) e se está carregando, `IsBuffering` (:52).
- **Grupo:** `Emby.Server.Implementations/SyncPlay/Group.cs`. O ping padrão é `DefaultPing = 500` ms (:91). `GetHighestPing` (:445) devolve o maior ping. `IsBuffering` (:475) diz se alguém está carregando, a menos que o membro tenha `IgnoreGroupWait`.
- **Estados do grupo:** `MediaBrowser.Controller/SyncPlay/GroupStates/`: `Idle`, `Waiting`, `Paused` e `Playing`.
  - O **Unpause** no `PlayingGroupState` (:62) agenda o início para daqui a `max(maior ping × 2, DefaultPing)`. O comando leva o instante combinado (`When`), e todos começam juntos.
  - **Seek** (:108) e **Buffer** (:117) levam o grupo ao `WaitingGroupState`. Ali ninguém avança até todos avisarem **Ready**. O `Unpause` no Waiting (:203) força o início quando a espera não pode continuar.

### Cliente (`motor/web/src/plugins/syncPlay/core`)
- **Sincronia de relógio:** `timeSync/TimeSync.js`.
  - Faz pings ao servidor, de 1 em 1 s nos três primeiros e depois de minuto em minuto (:12–14).
  - Cada medida guarda a diferença de relógio e o atraso da rede (`Measurement`, :19–34). Vale a medida com o menor atraso.
  - `remoteDateToLocal` e `localDateToRemote` (:205–215) convertem os horários entre servidor e navegador.
- **Correção de deriva:** `PlaybackCore.js`.
  - Os limites (:40–70) são: `minDelaySpeedToSync` 60 ms, `maxDelaySpeedToSync` 3000 ms, `speedToSyncDuration` 1000 ms e `minDelaySkipToSync` 400 ms.
  - Em `syncPlaybackTime` (:520–610), uma diferença entre 60 ms e 3 s ajusta a velocidade do vídeo para `1 + diferença/1000` durante 1 s (**SpeedToSync**). Acima disso, o vídeo pula para a posição do grupo (**SkipToSync**).
  - No Jellyfin essa correção vem desligada por padrão (`enableSyncCorrection` = false, :69). No Pugoticine ela fica sempre ligada, porque o pedido é manter a diferença abaixo de 1 s.

## Desenho no Pugoticine

### Servidor: `src/salas/salas.ts` (lógica) e `src/salas/rotas.ts` (HTTP)

**Tipos de sala**
- **Pública:** aparece na lista e qualquer pessoa entra.
- **Com senha:** aparece na lista e pede a senha. O servidor guarda só o hash scrypt, com sal, e compara em tempo constante.
- **Privada:** não aparece na lista e, para quem não tem acesso, responde 404, como se não existisse. Entram o dono, os convidados (por `username` do PugotiLab) e quem tem o código de convite (link `/?sala=<id>&convite=<código>`).

Quem entra com senha ou com o código passa a ter acesso permanente (`participantes`).

**Controle:** por padrão, todos os participantes controlam a reprodução, como no SyncPlay. O dono pode criar a sala no modo "só eu controlo". Avisar que está carregando ou pronto continua permitido para todos.

**Estados da reprodução:** `parado`, `pausado`, `tocando` e `aguardando` (o "Waiting" do SyncPlay).
- **Tocar:** todos aguardam ficar prontos. Depois o início é agendado para `max(maior ping × 2, 500 ms)`.
- **Pular:** com o vídeo tocando, todos aguardam carregar o ponto novo. Com o vídeo pausado, só muda a posição.
- **Alguém travou** (comando `carregando`): o grupo para e espera.
- **Limite de espera:** quem não responde em 10 s é ignorado, como o `IgnoreGroupWait`.

**Tempo real:** SSE (`/api/salas/:id/eventos`) para o servidor avisar as mudanças e POST (`/comandos`) para enviar comandos. O Node já serve SSE sem dependência nova; WebSocket exigiria uma biblioteca ou implementar o protocolo à mão. O relógio do servidor fica em `/api/salas/tempo`.

**Persistência:** as salas ficam em SQLite (`data/salas.db`). A presença de cada pessoa e o estado da reprodução ficam em memória e recomeçam pausados depois de reiniciar o servidor.

### Cliente: `public/salas.js` e `public/salas.css`
- **Onde fica na tela:** como o SyncPlay do jellyfin-web (`src/scripts/libraryMenu.js:49`, ícone `groups` no cabeçalho, antes de transmitir, busca e usuário), o botão "Salas de Filmes" fica na barra superior, à direita, antes da busca e do perfil, e não no menu lateral. Ele acende (ponto verde) quando a pessoa está numa sala e abre o painel para listar, criar, entrar, convidar, copiar o link de convite, escolher o filme e encerrar a sala.
- **Sincronização:**
  - mede o relógio com pings (8 medidas, vale a de menor atraso) e informa o ping a cada 5 s;
  - inicia o vídeo no instante combinado e aplica os estados recebidos do servidor;
  - corrige a deriva a cada 500 ms com SpeedToSync e SkipToSync.
- **Ações no player:** o que a pessoa faz no `<video id="player">` vira comando para a sala (play, pause, pular, travou carregando). O que o próprio módulo faz é ignorado por uma janela curta, para não gerar laço.
- **Barra da sala:** dentro do player aparece a barra "Sala: nome · estado · pessoas". Ela fica em `#player-acoes-topo` quando o player tiver esse espaço; sem ele, no topo do player.

**Ganchos no `app.js`** (as únicas mudanças fora dos arquivos das salas):
- `window.pugoticine = { abrirPlayer, fecharPlayer, midias, perfil, midiaAberta }`;
- o evento `pugoticine:pronto` depois do bootstrap.

O `index.html` carrega `salas.js` e `salas.css`.

## Testes
- **`src/salas/salas.test.ts` (PQA-250):**
  - visibilidade dos três tipos, senha só em hash, convite e código de convite;
  - permissões e persistência;
  - estados como os do SyncPlay: início agendado pelo maior ping, espera por quem carrega, limite de espera, pulo, troca de filme e sala em que só o dono controla.
- **`test/browser-salas.mjs` (PQA-251):** Chromium do sistema com duas pessoas ao mesmo tempo, contra o compose nas portas 3032/3035.
  - mael não vê a sala privada e a senha errada é recusada;
  - play, pause e pulo feitos por um aparecem no outro;
  - a diferença entre os dois fica abaixo de 1 s (medido: 2 a 46 ms tocando);
  - uma deriva provocada de cerca de 1,1 s é corrigida para menos de 0,3 s.

Para rodar:
```
PUGOTICINE_MIDIA=~/IA/Fontes/Pugoticine-midia-teste docker compose -p pugoticine-salas -f compose.desenvolvimento.yml -f dev/compose.salas.yml up -d --build
npx tsx --test src/salas/salas.test.ts
node test/browser-salas.mjs
docker compose -p pugoticine-salas -f compose.desenvolvimento.yml -f dev/compose.salas.yml down
```

## Pendências
- **Fila de filmes:** o SyncPlay tem fila (`QueueCore`); a sala tem um filme por vez.
- **Chat e reações** na sala.
- **Notificar o convidado** fora do Pugoticine, por exemplo pelo PugotiLab. Hoje o convite aparece na lista de salas da pessoa.
- **Usuários conhecidos:** o convite aceita qualquer `username` válido. O Pugoticine não tem a lista de usuários do PugotiLab para conferir se ele existe.
