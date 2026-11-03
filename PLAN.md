# Plano do PugotiCine

## Estado
Em implementação, 03/11/2026. Base de referência do servidor e web Jellyfin 10.11.10 fixada em submódulos. Aplicativo Node anterior preservado para referência de autenticação e migração. Compose de desenvolvimento usa imagem upstream para estabelecer a referência funcional local, com porta 3013 restrita ao notebook e volumes próprios.

## Decisões
Paridade completa com Jellyfin autorizada pelo usuário. Fontes e testes têm sincronização própria entre computadores. Nenhum banco de produção deve ser usado no desenvolvimento.

## Próximos passos
Compilar imagem própria dos submódulos, aplicar identidade PugotiCine, implementar autenticação PugotiLab com permissões equivalentes, registrar cenários PugotiQA e validar em navegador. Depois planejar importação dos quatro progressos e deploy isolado. O compose inicial ainda não foi executado e não constitui a aplicação final.

## Último handoff
Codex, 03/11/2026: fontes fixadas e configuração local inicial; faltam imagem própria, integração e validação.
