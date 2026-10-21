# Pugoticine

Servidor de mídia pessoal integrado à conta Pugotilab.

## Primeira versão

- Catálogo automático das pastas de filmes.
- Autenticação compartilhada pelo PugotiProfile.
- Reprodução direta de MP4/WebM e HLS por FFmpeg para MKV.
- Legendas externas SRT/VTT em português e inglês.
- Progresso individual e seção "Continuar assistindo".
- Interface responsiva.

## Desenvolvimento

```bash
npm install
MEDIA_ROOT=/caminho/dos/filmes npm run build
npm start
```

O serviço usa a porta `3012`. A publicação por domínio deve ser configurada manualmente no Cloudflare.
