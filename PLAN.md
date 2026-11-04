# Plano do Pugoticine

## Histórico substituído: base inicial
Em implementação, 03/11/2026. Base de referência do servidor e web Jellyfin 10.11.10 fixada em submódulos. Aplicativo Node anterior preservado para referência de autenticação e migração. Compose de desenvolvimento usa imagem upstream para estabelecer a referência funcional local, com porta 3013 restrita ao notebook e volumes próprios.

## Decisões
Paridade completa com Jellyfin autorizada pelo usuário. Fontes e testes têm sincronização própria entre computadores. Nenhum banco de produção deve ser usado no desenvolvimento.

## Próximos passos antigos (substituídos)
Compilar imagem própria dos submódulos, aplicar identidade PugotiCine, implementar autenticação PugotiLab com permissões equivalentes, registrar cenários PugotiQA e validar em navegador. Depois planejar importação dos quatro progressos e deploy isolado. O compose inicial ainda não foi executado e não constitui a aplicação final.

## Handoff inicial preservado
Codex, 03/11/2026: fontes fixadas e configuração local inicial; faltam imagem própria, integração e validação.

## Decisão vigente

O Pugoticine continua como aplicativo Node. A decisão inicial de compilar um fork foi substituída por reimplementar funcionalidades tendo o Jellyfin como referência, conforme decisão do usuário registrada pelo Claude em 03/11. Arquivos experimentais do fork permanecem fora desta integração.

## Estado atual

Player HLS sob demanda, VAAPI, controles em tela cheia e salas sincronizadas já integrados. Painel administrativo ampliado para 22 telas; integração publicada no Docker local em http://127.0.0.1:3012, com health saudável e navegação real conferida no Chromium. Algumas configurações apenas persistem, com aviso na tela; não representam paridade funcional completa. Zima desligado por decisão do usuário: nenhum acesso autorizado até novo aviso.

## Próximos passos

Concluídos: checagem TypeScript, 20 testes de código e 5 testes de navegador (PQA-233, 231, 220, 221, 251). Backup íntegro em ~/IA/Backups/pugoticine-painel-20261103, com instruções de reversão; imagem anterior pugoticine:antes-painel-20261103. Em trabalho separado, aplicar configurações de reprodução no player, limpar segmentos antigos e limitar conversões simultâneas.

## Último handoff

Codex, 2026-11-03: painel de 22 telas integrado, testado com player/salas e publicado localmente na porta 3012; próximo: usuário conferir o menu Painel; funcionalidades apenas persistidas continuam sinalizadas.

## Incremento de temas — 04/11/2026

- Quatro temas solicitados pelo usuário implementados em Perfil → Tema. Tema 1 preserva o atual; 2 usa #101010/#FFFFFF/#C8FF00; 3 usa #651424/#FFFFFF/#FF5825; 4 usa #0E359D/#FFFFFF/#FF606A. Preferência persiste no navegador, sincroniza abas e mantém CSS personalizado de Marca prioritário.
- Base atualizada para 35a5b2b antes de editar, preservando navegação administrativa e catálogo de bibliotecas do Claude. Marca visível corrigida para Pugoticine no frontend; nomes e textos retornados pela API dependem da migração de backend coordenada pelo agente principal.
- PQA-270/271 passaram no Chromium com frontend deste worktree e backend local; teste real de arquivos servidos após deploy fica com o agente principal. REA analisou três fontes do drawer Jellyfin; evidências e limites em docs/navegacao-rea.md.
- Próximo: integrar este commit, registrar PQA-270/271 no catálogo central e publicar container local após os demais agentes. Nenhum acesso ao Zima.

### Último handoff deste incremento
Codex (agente navegação), 2026-11-04: quatro temas e seletor móvel validados; aguarda integração e deploy local pelo agente principal.

## Ajuste de temas — 04/11/2026

Decisão do usuário: os quatro temas compartilham fundo #101010 no modo escuro; modo claro usa fundo #f5f5f5. Cada tema conserva sua cor de destaque, independentemente do modo. Os dois seletores no Perfil persistem por navegador e sincronizam abas. PQA-272 cobre as oito combinações; PQA-270/271 foram atualizados para o fundo comum. Próximo: publicar no Docker local e conferir; Zima segue fora desta operação.

## Último handoff atualizado

Codex, 2026-11-04: quatro paletas separadas da aparência clara/escura; oito combinações testadas; próximo publicar no Docker local.
