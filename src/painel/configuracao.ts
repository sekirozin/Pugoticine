// Telas do Painel do Jellyfin 10.11.10 reproduzidas no PugotiCine: menu lateral (jellyfin-web
// src/apps/dashboard/components/drawer/sections/*.tsx), campos e textos em pt-BR (strings/pt-br.json) e valores
// padrão dos modelos do servidor (MediaBrowser.Model/Configuration/ServerConfiguration.cs, EncodingOptions.cs,
// TrickplayOptions.cs, XbmcMetadataOptions.cs, BrandingOptions.cs, LiveTv/LiveTvOptions.cs,
// MediaBrowser.Common/Net/NetworkConfiguration.cs).
// Cada página diz o que tem efeito de verdade no PugotiCine ("efeito"); o que só é guardado mostra um aviso claro.

export type TipoCampo = "texto" | "senha" | "numero" | "booleano" | "selecao" | "multipla" | "lista" | "textoLongo";
export interface Opcao { valor: string; rotulo: string }
export interface Campo {
  chave: string; tipo: TipoCampo; rotulo: string; ajuda?: string; padrao: unknown;
  opcoes?: Opcao[]; min?: number; max?: number; opcional?: boolean; maximoTexto?: number; validarItem?: "subrede" | "ip" | "url";
}
export interface Secao { titulo?: string; campos: Campo[] }
export type Efeito = { tipo: "real" | "parcial" | "salvo"; texto: string };
export interface Pagina {
  id: string; titulo: string; grupo: "Servidor" | "Dispositivos" | "TV ao Vivo" | "Plugins" | "Avançado";
  pai?: "Bibliotecas" | "Reprodução"; especial?: boolean; efeito: Efeito; secoes: Secao[];
}

const sn = (valor: string, rotulo: string): Opcao => ({ valor, rotulo });
const NAO_IMPLEMENTADO = "Ainda não implementado no PugotiCine: a configuração é salva, mas não tem efeito por enquanto.";

export const PAGINAS: Pagina[] = [
  { id: "painel", titulo: "Painel", grupo: "Servidor", especial: true, efeito: { tipo: "real", texto: "Visão geral com dados reais do servidor." }, secoes: [] },
  {
    id: "geral", titulo: "Geral", grupo: "Servidor",
    efeito: { tipo: "parcial", texto: "O nome do servidor já é usado pelo PugotiCine (Painel e título da página). Idioma, locais, Quick Connect e rendimento: " + NAO_IMPLEMENTADO },
    secoes: [
      { titulo: "Configurações", campos: [
        { chave: "ServerName", tipo: "texto", rotulo: "Nome do servidor", ajuda: "Este nome será usado para identificar o servidor e por padrão o nome do computador será usado.", padrao: "PugotiCine", maximoTexto: 80 },
        { chave: "UICulture", tipo: "selecao", rotulo: "Idioma preferido de exibição", padrao: "pt-BR", opcoes: [sn("pt-BR", "Português (Brasil)"), sn("en-US", "English (United States)"), sn("es", "Español"), sn("pt-PT", "Português (Portugal)")] }
      ] },
      { titulo: "Locais", campos: [
        { chave: "CachePath", tipo: "texto", rotulo: "Local do cache", ajuda: "Defina um local personalizado para os arquivos de cache como, por exemplo, imagens. Deixe em branco para usar o local padrão do servidor.", padrao: "", maximoTexto: 500 },
        { chave: "MetadataPath", tipo: "texto", rotulo: "Local dos metadados", ajuda: "Define um local personalizado para as artes e metadados baixados.", padrao: "", maximoTexto: 500 }
      ] },
      { titulo: "Conexão rápida", campos: [
        { chave: "QuickConnectAvailable", tipo: "booleano", rotulo: "Habilitar Quick Connect nesse servidor", padrao: true }
      ] },
      { titulo: "Rendimento", campos: [
        { chave: "LibraryScanFanoutConcurrency", tipo: "numero", rotulo: "Limite de tarefas paralelas do escaneamento de biblioteca", ajuda: "Número máximo de tarefas paralelas durante o escaneamento da biblioteca. Deixar vazio escolhe um limite com base na quantidade de núcleos.", padrao: null, opcional: true, min: 0, max: 64 },
        { chave: "ParallelImageEncodingLimit", tipo: "numero", rotulo: "Limite de codificação em paralelo de imagens", ajuda: "Número máximo de codificação de imagens que podem executar em paralelo. Deixar vazio escolhe um limite baseado na quantidade de núcleos.", padrao: null, opcional: true, min: 0, max: 64 }
      ] }
    ]
  },
  {
    id: "marca", titulo: "Marca", grupo: "Servidor",
    efeito: { tipo: "parcial", texto: "O código CSS personalizado é aplicado de verdade na interface. Imagem de abertura e aviso no login: " + NAO_IMPLEMENTADO + " (o login é feito pelo PugotiLab)." },
    secoes: [{ campos: [
      { chave: "SplashscreenEnabled", tipo: "booleano", rotulo: "Ativar imagem na tela de abertura", ajuda: "Imagens personalizadas devem ter uma proporção de 16x9 com um tamanho mínimo de 1920x1080.", padrao: false },
      { chave: "LoginDisclaimer", tipo: "textoLongo", rotulo: "Aviso legal no login", ajuda: "Um aviso será exibido na parte inferior da página de login.", padrao: "", maximoTexto: 4000 },
      { chave: "CustomCss", tipo: "textoLongo", rotulo: "Código CSS personalizado", ajuda: "Aplica a sua estilização CSS personalizada para a interface web.", padrao: "", maximoTexto: 50000 }
    ] }]
  },
  { id: "usuarios", titulo: "Usuários", grupo: "Servidor", especial: true, efeito: { tipo: "parcial", texto: "Lista quem já entrou (contas do PugotiLab: nome, senha e login são do PugotiLab). Têm efeito de verdade: desativar, acesso por biblioteca e classificação etária máxima/bloquear sem classificação. Ocultar, limite de bitrate, sessões simultâneas e acesso às salas: " + NAO_IMPLEMENTADO }, secoes: [] },
  { id: "bibliotecas", titulo: "Bibliotecas", grupo: "Servidor", pai: "Bibliotecas", especial: true, efeito: { tipo: "parcial", texto: "Adicionar, editar, remover e rastrear bibliotecas funciona de verdade (tipo, pastas, ativar e monitoramento em tempo real); séries e animes recebem o nome do episódio pelas regras do Jellyfin. Idioma/país dos metadados e atualização automática: " + NAO_IMPLEMENTADO + " Música e Livros: o PugotiCine só reproduz vídeo." }, secoes: [] },
  {
    id: "bibliotecas-exibicao", titulo: "Exibir", grupo: "Servidor", pai: "Bibliotecas", efeito: { tipo: "salvo", texto: NAO_IMPLEMENTADO },
    secoes: [{ campos: [
      { chave: "DateAddedBehavior", tipo: "selecao", rotulo: "Comportamento da data de adição para novo conteúdo", padrao: "0", opcoes: [sn("0", "Usar a data obtida na biblioteca"), sn("1", "Usar a data de criação do arquivo")] },
      { chave: "EnableFolderView", tipo: "booleano", rotulo: "Exibe uma visualização de pasta para exibir pastas de mídias", padrao: false },
      { chave: "DisplaySpecialsWithinSeasons", tipo: "booleano", rotulo: "Exibir especiais das temporadas em que estrearam", padrao: true },
      { chave: "EnableGroupingMoviesIntoCollections", tipo: "booleano", rotulo: "Agrupar filmes em coleções", padrao: false },
      { chave: "EnableGroupingShowsIntoCollections", tipo: "booleano", rotulo: "Agrupar shows em coleções", padrao: false },
      { chave: "EnableExternalContentInSuggestions", tipo: "booleano", rotulo: "Ativar conteúdo externo nas sugestões", padrao: true }
    ] }]
  },
  {
    id: "bibliotecas-metadados", titulo: "Metadados", grupo: "Servidor", pai: "Bibliotecas", efeito: { tipo: "salvo", texto: NAO_IMPLEMENTADO + " (hoje os metadados vêm do Radarr)." },
    secoes: [
      { titulo: "Idioma Preferido dos Metadados", campos: [
        { chave: "PreferredMetadataLanguage", tipo: "selecao", rotulo: "Idioma", padrao: "pt", opcoes: [sn("pt", "Português"), sn("en", "English"), sn("es", "Español"), sn("ja", "日本語")] },
        { chave: "MetadataCountryCode", tipo: "selecao", rotulo: "País/Região", padrao: "BR", opcoes: [sn("BR", "Brasil"), sn("PT", "Portugal"), sn("US", "Estados Unidos"), sn("JP", "Japão")] }
      ] },
      { titulo: "Imagem dos capítulos", campos: [
        { chave: "DummyChapterDuration", tipo: "numero", rotulo: "Intervalo", ajuda: "Intervalo, em segundos, entre capítulos gerados quando o arquivo não tem capítulos (0 desativa).", padrao: 0, min: 0, max: 3600 },
        { chave: "ChapterImageResolution", tipo: "selecao", rotulo: "Resolução", padrao: "MatchSource", opcoes: [sn("MatchSource", "Igual à fonte"), sn("P144", "144p"), sn("P240", "240p"), sn("P360", "360p"), sn("P480", "480p"), sn("P720", "720p"), sn("P1080", "1080p"), sn("P1440", "1440p"), sn("P2160", "2160p")] }
      ] }
    ]
  },
  {
    id: "bibliotecas-nfo", titulo: "Configurações de NFO", grupo: "Servidor", pai: "Bibliotecas", efeito: { tipo: "salvo", texto: NAO_IMPLEMENTADO },
    secoes: [{ campos: [
      { chave: "UserId", tipo: "texto", rotulo: "Salvar informações do que o usuário assiste aos NFO's para", ajuda: "Deixe em branco para Nenhum.", padrao: "", maximoTexto: 80 },
      { chave: "ReleaseDateFormat", tipo: "texto", rotulo: "Formato da data de lançamento", padrao: "yyyy-MM-dd", maximoTexto: 40 },
      { chave: "SaveImagePathsInNfo", tipo: "booleano", rotulo: "Salvar o local das imagens dentro dos arquivos nfo", padrao: true },
      { chave: "EnablePathSubstitution", tipo: "booleano", rotulo: "Ativar substituição de local", padrao: true },
      { chave: "EnableExtraThumbsDuplication", tipo: "booleano", rotulo: "Copiar extrafanart para campo de extrathumbs", padrao: false }
    ] }]
  },
  {
    id: "reproducao-transcodificacao", titulo: "Transcodificação", grupo: "Servidor", pai: "Reprodução",
    efeito: { tipo: "parcial", texto: "O player aplica: aceleração de hardware (Nenhum ou VAAPI, dispositivo VA-API, codecs de decodificação, codificação por hardware), contagem de threads, preset, CRF H.264, fila de muxing, aumento do downmix, limites de transcodificação e remoção de segmentos — a cada vídeo aberto. As demais opções: " + NAO_IMPLEMENTADO },
    secoes: [
      { titulo: "Aceleração de Hardware", campos: [
        { chave: "HardwareAccelerationType", tipo: "selecao", rotulo: "Aceleração de hardware", ajuda: "Ativar a aceleração de hardware pode causar instabilidade em alguns sistemas.", padrao: "none", opcoes: [sn("none", "Nenhum"), sn("amf", "AMD AMF"), sn("qsv", "Intel QuickSync (QSV)"), sn("nvenc", "NVIDIA NVENC"), sn("v4l2m2m", "Video4Linux2 (V4L2)"), sn("vaapi", "Video Acceleration API (VAAPI)"), sn("videotoolbox", "Apple VideoToolBox"), sn("rkmpp", "Rockchip MPP (RKMPP)")] },
        { chave: "VaapiDevice", tipo: "texto", rotulo: "Dispositivo VA-API", padrao: "/dev/dri/renderD128", maximoTexto: 200 },
        { chave: "QsvDevice", tipo: "texto", rotulo: "Dispositivo QSV", padrao: "", maximoTexto: 200 },
        { chave: "HardwareDecodingCodecs", tipo: "multipla", rotulo: "Ativar decodificação de hardware para", padrao: ["h264", "vc1"], opcoes: [sn("h264", "H264"), sn("hevc", "HEVC"), sn("mpeg2video", "MPEG2"), sn("mpeg4", "MPEG4"), sn("vc1", "VC1"), sn("vp8", "VP8"), sn("vp9", "VP9"), sn("av1", "AV1")] },
        { chave: "EnableDecodingColorDepth10Hevc", tipo: "booleano", rotulo: "Ativar decodificação de hardware HEVC 10-bit", padrao: true },
        { chave: "EnableDecodingColorDepth10Vp9", tipo: "booleano", rotulo: "Ativar decodificação de hardware VP9 10-bit", padrao: true },
        { chave: "EnableEnhancedNvdecDecoder", tipo: "booleano", rotulo: "Ativar decodificador NVDEC aprimorado", padrao: true },
        { chave: "PreferSystemNativeHwDecoder", tipo: "booleano", rotulo: "Prefira os decodificadores de hardware DXVA ou VA-API nativos do sistema operacional", padrao: true }
      ] },
      { titulo: "Opções de codificação de hardware", campos: [
        { chave: "EnableHardwareEncoding", tipo: "booleano", rotulo: "Ativar codificação por hardware", padrao: true },
        { chave: "EnableIntelLowPowerH264HwEncoder", tipo: "booleano", rotulo: "Ativar o codificador de hardware Intel H.264 de baixo processamento", padrao: false },
        { chave: "EnableIntelLowPowerHevcHwEncoder", tipo: "booleano", rotulo: "Ativar o codificador de hardware Intel HECV de baixo processamento", padrao: false }
      ] },
      { titulo: "Opções de formato de codificação", campos: [
        { chave: "AllowHevcEncoding", tipo: "booleano", rotulo: "Permitir codificação no formato HEVC", padrao: false },
        { chave: "AllowAv1Encoding", tipo: "booleano", rotulo: "Permitir codificação no formato AV1", padrao: false }
      ] },
      { titulo: "Mapeamento de tons", campos: [
        { chave: "EnableVppTonemapping", tipo: "booleano", rotulo: "Habilitar mapeamento de tom VPP", padrao: false },
        { chave: "VppTonemappingBrightness", tipo: "numero", rotulo: "Ganho de brilho do mapeamento de tom VPP", padrao: 16, min: 0, max: 100 },
        { chave: "VppTonemappingContrast", tipo: "numero", rotulo: "Ganho de contraste de mapeamento de tom VPP", padrao: 1, min: 1, max: 2 },
        { chave: "EnableVideoToolboxTonemapping", tipo: "booleano", rotulo: "Habilitar mapeamento de tons do VideoToolbox", padrao: false },
        { chave: "EnableTonemapping", tipo: "booleano", rotulo: "Ativar mapeamento de tons", padrao: false },
        { chave: "TonemappingAlgorithm", tipo: "selecao", rotulo: "Selecione o algoritmo de mapeamento de tons a ser usado", padrao: "bt2390", opcoes: ["none", "clip", "linear", "gamma", "reinhard", "hable", "mobius", "bt2390"].map(v => sn(v, v === "none" ? "Nenhum" : v === "bt2390" ? "BT.2390" : v[0].toUpperCase() + v.slice(1))) },
        { chave: "TonemappingMode", tipo: "selecao", rotulo: "Modo de mapeamento de tons", padrao: "auto", opcoes: [sn("auto", "Automático"), sn("max", "MAX"), sn("rgb", "RGB"), sn("lum", "LUM"), sn("itp", "ITP")] },
        { chave: "TonemappingRange", tipo: "selecao", rotulo: "Faixa de mapeamento de tom", padrao: "auto", opcoes: [sn("auto", "Automático"), sn("tv", "TV"), sn("pc", "PC")] },
        { chave: "TonemappingDesat", tipo: "numero", rotulo: "Dessaturação do Mapeamento de tom", padrao: 0, min: 0, max: 10 },
        { chave: "TonemappingPeak", tipo: "numero", rotulo: "Pico do Mapeamento de tom", padrao: 100, min: 0, max: 10000 },
        { chave: "TonemappingParam", tipo: "numero", rotulo: "Parâmetros de mapeamento de tom", padrao: 0, min: 0, max: 100 }
      ] },
      { titulo: "Transcodificação", campos: [
        { chave: "EncodingThreadCount", tipo: "selecao", rotulo: "Contagem de threads da transcodificação", padrao: "-1", opcoes: [sn("-1", "Automático"), ...Array.from({ length: 16 }, (_, i) => sn(String(i + 1), String(i + 1))), sn("0", "Máx")] },
        { chave: "TranscodingTempPath", tipo: "texto", rotulo: "Local de transcodificação", ajuda: "Pasta com os arquivos temporários da transcodificação. Deixe em branco para usar o padrão.", padrao: "", maximoTexto: 500 },
        { chave: "FallbackFontPath", tipo: "texto", rotulo: "Caminho da pasta da fonte substituta", padrao: "", maximoTexto: 500 },
        { chave: "EnableFallbackFont", tipo: "booleano", rotulo: "Ativar fontes alternativas", padrao: false },
        { chave: "EnableAudioVbr", tipo: "booleano", rotulo: "Habilitar a codificação de áudio VBR", padrao: false },
        { chave: "DownMixAudioBoost", tipo: "numero", rotulo: "Aumento do áudio ao executar downmix", padrao: 2, min: 0.5, max: 3 },
        { chave: "DownMixStereoAlgorithm", tipo: "selecao", rotulo: "Algoritmo Downmix Estéreo", padrao: "None", opcoes: [sn("None", "Nenhum"), sn("Dave750", "Dave750"), sn("NightmodeDialogue", "Diálogo noturno"), sn("Rfc7845", "RFC7845"), sn("Ac4", "AC-4")] },
        { chave: "MaxMuxingQueueSize", tipo: "numero", rotulo: "Tamanho máximo da fila de \"muxing\"", padrao: 2048, min: 128, max: 65536 },
        { chave: "EncoderPreset", tipo: "selecao", rotulo: "Preset de codificação", padrao: "auto", opcoes: ["auto", "veryslow", "slower", "slow", "medium", "fast", "faster", "veryfast", "superfast", "ultrafast"].map(v => sn(v, v === "auto" ? "Automático" : v)) },
        { chave: "H265Crf", tipo: "numero", rotulo: "Codificação CRF para H.265", padrao: 28, min: 0, max: 51 },
        { chave: "H264Crf", tipo: "numero", rotulo: "CRF de codificação H.264", padrao: 23, min: 0, max: 51 },
        { chave: "DeinterlaceMethod", tipo: "selecao", rotulo: "Método de desentrelaçamento", padrao: "yadif", opcoes: [sn("yadif", "Mais Um Filtro de Desentrelaçamento (YADIF)"), sn("bwdif", "Filtro de Desentrelaçamento Bob Weaver (BWDIF)")] },
        { chave: "DeinterlaceDoubleRate", tipo: "booleano", rotulo: "Dobra a taxa de quadros quando estiver desinterlaçando", padrao: false },
        { chave: "EnableSubtitleExtraction", tipo: "booleano", rotulo: "Permitir a extração da legenda em tempo real", padrao: true },
        { chave: "EnableThrottling", tipo: "booleano", rotulo: "Limites de Transcodificação", padrao: false },
        { chave: "EnableSegmentDeletion", tipo: "booleano", rotulo: "Remover segmentos", padrao: false },
        { chave: "ThrottleDelaySeconds", tipo: "numero", rotulo: "Limitar após", ajuda: "Segundos.", padrao: 180, min: 60, max: 3600 },
        { chave: "SegmentKeepSeconds", tipo: "numero", rotulo: "Tempo para manter seguimentos", ajuda: "Segundos.", padrao: 720, min: 60, max: 86400 }
      ] }
    ]
  },
  {
    id: "reproducao-retomar", titulo: "Retomar", grupo: "Servidor", pai: "Reprodução",
    efeito: { tipo: "parcial", texto: "A porcentagem máxima para retomar já decide quando um filme conta como assistido. Mínimos e audiolivros: " + NAO_IMPLEMENTADO },
    secoes: [{ campos: [
      { chave: "MinResumePct", tipo: "numero", rotulo: "Porcentagem mínima para retomar", ajuda: "Os títulos são considerados não assistidos se parados antes deste tempo.", padrao: 5, min: 0, max: 100 },
      { chave: "MaxResumePct", tipo: "numero", rotulo: "Porcentagem máxima para retomar", ajuda: "Os títulos são considerados totalmente assistidos se parados depois deste tempo.", padrao: 90, min: 1, max: 100 },
      { chave: "MinAudiobookResume", tipo: "numero", rotulo: "Resumo mínimo do audiolivro em minutos", padrao: 5, min: 0, max: 600 },
      { chave: "MaxAudiobookResume", tipo: "numero", rotulo: "Minutos faltando do Audiobook para retomada", padrao: 5, min: 0, max: 600 },
      { chave: "MinResumeDurationSeconds", tipo: "numero", rotulo: "Duração mínima para retomar", ajuda: "Em segundos. Títulos mais curtos não poderão ser retomados.", padrao: 300, min: 0, max: 86400 }
    ] }]
  },
  {
    id: "reproducao-streaming", titulo: "Transmissão", grupo: "Servidor", pai: "Reprodução",
    efeito: { tipo: "salvo", texto: "Salvo e disponível em /api/configuracao/reproducao; o player ainda não aplica o limite." },
    secoes: [{ campos: [
      { chave: "RemoteClientBitrateLimit", tipo: "numero", rotulo: "Limite do bitrate para streaming da internet (Mbps)", ajuda: "Um limite de bitrate opcional para todos os dispositivos fora da rede. Deixe vazio ou 0 para sem limite.", padrao: 0, min: 0, max: 1000 }
    ] }]
  },
  {
    id: "reproducao-trickplay", titulo: "Pré-visualizações de vídeo", grupo: "Servidor", pai: "Reprodução", efeito: { tipo: "salvo", texto: NAO_IMPLEMENTADO },
    secoes: [{ campos: [
      { chave: "EnableHwAcceleration", tipo: "booleano", rotulo: "Ativar decodificação por hardware", padrao: false },
      { chave: "EnableHwEncoding", tipo: "booleano", rotulo: "Ativar codificação MJPEG acelerada por hardware", padrao: false },
      { chave: "EnableKeyFrameOnlyExtraction", tipo: "booleano", rotulo: "Gerar imagens apenas de quadros-chave", padrao: false },
      { chave: "ScanBehavior", tipo: "selecao", rotulo: "Comportamento do Escaneamento", padrao: "NonBlocking", opcoes: [sn("NonBlocking", "Não Bloqueadora - enfileira a geração e depois retorna"), sn("Blocking", "Bloqueadora - enfileira a geração e bloqueia escaneamento até a conclusão")] },
      { chave: "ProcessPriority", tipo: "selecao", rotulo: "Prioridade do Processo", padrao: "BelowNormal", opcoes: [sn("High", "Alta"), sn("AboveNormal", "Acima do normal"), sn("Normal", "Normal"), sn("BelowNormal", "Abaixo do normal"), sn("Idle", "Ocioso")] },
      { chave: "Interval", tipo: "numero", rotulo: "Intervalo de imagens", ajuda: "Em milissegundos.", padrao: 10000, min: 1000, max: 600000 },
      { chave: "WidthResolutions", tipo: "lista", rotulo: "Resolução de largura", ajuda: "Uma largura por linha, em pixels.", padrao: ["320"] },
      { chave: "TileWidth", tipo: "numero", rotulo: "Largura do bloco", padrao: 10, min: 1, max: 100 },
      { chave: "TileHeight", tipo: "numero", rotulo: "Altura do bloco", padrao: 10, min: 1, max: 100 },
      { chave: "JpegQuality", tipo: "numero", rotulo: "Qualidade JPEG", padrao: 90, min: 1, max: 100 },
      { chave: "Qscale", tipo: "numero", rotulo: "Fator de qualidade (Qscale)", padrao: 4, min: 2, max: 31 },
      { chave: "ProcessThreads", tipo: "numero", rotulo: "Tarefas de processamento FFmpeg", padrao: 1, min: 0, max: 32 }
    ] }]
  },
  { id: "dispositivos", titulo: "Dispositivos", grupo: "Dispositivos", especial: true, efeito: { tipo: "real", texto: "Lista real dos navegadores que já acessaram o PugotiCine." }, secoes: [] },
  { id: "atividade", titulo: "Atividade", grupo: "Dispositivos", especial: true, efeito: { tipo: "real", texto: "Registro real de eventos do PugotiCine." }, secoes: [] },
  { id: "tv-ao-vivo", titulo: "TV ao Vivo", grupo: "TV ao Vivo", especial: true, efeito: { tipo: "salvo", texto: "TV ao Vivo " + NAO_IMPLEMENTADO.toLowerCase() }, secoes: [] },
  {
    id: "dvr", titulo: "DVR", grupo: "TV ao Vivo", efeito: { tipo: "salvo", texto: NAO_IMPLEMENTADO },
    secoes: [
      { campos: [
        { chave: "GuideDays", tipo: "selecao", rotulo: "Número de dias de dados do guia para baixar", padrao: "", opcoes: [sn("", "Automático"), ...Array.from({ length: 14 }, (_, i) => sn(String(i + 1), String(i + 1)))] },
        { chave: "RecordingPath", tipo: "texto", rotulo: "Local de gravação padrão", padrao: "", maximoTexto: 500 },
        { chave: "MovieRecordingPath", tipo: "texto", rotulo: "Local de gravação de filme", padrao: "", maximoTexto: 500 },
        { chave: "SeriesRecordingPath", tipo: "texto", rotulo: "Local de gravação de séries", padrao: "", maximoTexto: 500 }
      ] },
      { titulo: "Configurações Padrão de Gravações", campos: [
        { chave: "PrePaddingMinutes", tipo: "numero", rotulo: "Iniciar quando possível (minutos antes)", padrao: 0, min: 0, max: 120 },
        { chave: "PostPaddingMinutes", tipo: "numero", rotulo: "Parar quando possível (minutos após)", padrao: 0, min: 0, max: 120 }
      ] },
      { titulo: "Processamento Pós-Gravação", campos: [
        { chave: "RecordingPostProcessor", tipo: "texto", rotulo: "Aplicação de pós-processamento", padrao: "", maximoTexto: 500 },
        { chave: "RecordingPostProcessorArguments", tipo: "texto", rotulo: "Argumentos de linha de comando do pós-processador", padrao: "\"{path}\"", maximoTexto: 500 }
      ] },
      { titulo: "Salvando os metadados", campos: [
        { chave: "SaveRecordingNFO", tipo: "booleano", rotulo: "Salva metadados de EPG no NFO", padrao: true },
        { chave: "SaveRecordingImages", tipo: "booleano", rotulo: "Salva as imagens de EPG gravadas", padrao: true }
      ] }
    ]
  },
  {
    id: "plugins", titulo: "Plugins", grupo: "Plugins", especial: true, efeito: { tipo: "salvo", texto: "Plugins " + NAO_IMPLEMENTADO.toLowerCase() + " A lista de repositórios é salva." },
    secoes: [{ titulo: "Gerenciar Repositórios", campos: [
      { chave: "PluginRepositories", tipo: "lista", rotulo: "Repositórios", ajuda: "Um endereço por linha.", padrao: ["https://repo.jellyfin.org/files/plugin/manifest.json"], validarItem: "url" }
    ] }]
  },
  {
    id: "redes", titulo: "Redes", grupo: "Avançado",
    efeito: { tipo: "parcial", texto: "Têm efeito de verdade: Redes LAN (vazio = faixas privadas e Tailscale), Proxies conhecidos, Permitir conexões remotas e o filtro de IP remoto (lista branca/negra); o próprio servidor sempre passa e não dá para salvar algo que bloqueie você. Portas, HTTPS, URL base, vínculo de endereço, IPv4/IPv6, descoberta e URIs publicados: " + NAO_IMPLEMENTADO + " (são definidos pelo Docker e pelo proxy do PugotiLab)." },
    secoes: [
      { titulo: "Configurações da localização do servidor", campos: [
        { chave: "InternalHttpPort", tipo: "numero", rotulo: "Número da porta local de HTTP", padrao: 8096, min: 1, max: 65535 },
        { chave: "EnableHttps", tipo: "booleano", rotulo: "Habilitar HTTPS", padrao: false },
        { chave: "InternalHttpsPort", tipo: "numero", rotulo: "Número da porta local de HTTPS", padrao: 8920, min: 1, max: 65535 },
        { chave: "BaseUrl", tipo: "texto", rotulo: "URL Base", padrao: "", maximoTexto: 200 },
        { chave: "LocalNetworkAddresses", tipo: "lista", rotulo: "Vincular a um endereço de rede local", ajuda: "Um endereço IP por linha.", padrao: [], validarItem: "ip" },
        { chave: "LocalNetworkSubnets", tipo: "lista", rotulo: "Redes LAN", ajuda: "Uma rede por linha, no formato CIDR (ex.: 192.168.1.0/24).", padrao: [], validarItem: "subrede" },
        { chave: "KnownProxies", tipo: "lista", rotulo: "Proxies conhecidos", ajuda: "Um endereço ou rede por linha. Só destes o cabeçalho X-Forwarded-For é aceito.", padrao: [], validarItem: "subrede" }
      ] },
      { titulo: "Configurações HTTPS", campos: [
        { chave: "RequireHttps", tipo: "booleano", rotulo: "Necessita HTTPS", padrao: false },
        { chave: "CertificatePath", tipo: "texto", rotulo: "Local personalizado do certificado SSL", padrao: "", maximoTexto: 500 },
        { chave: "CertificatePassword", tipo: "senha", rotulo: "Senha do certificado", padrao: "", maximoTexto: 200 }
      ] },
      { titulo: "Configurações de acesso remoto", campos: [
        { chave: "EnableRemoteAccess", tipo: "booleano", rotulo: "Permitir conexões remotas a este servidor", padrao: true },
        { chave: "RemoteIPFilter", tipo: "lista", rotulo: "Filtro de endereço IP remoto", ajuda: "Um endereço ou rede por linha. Vale só para quem não é da rede local.", padrao: [], validarItem: "subrede" },
        { chave: "IsRemoteIPFilterBlacklist", tipo: "selecao", rotulo: "Modo do filtro de endereço IP remoto", padrao: "false", opcoes: [sn("false", "Lista branca"), sn("true", "Lista negra")] },
        { chave: "PublicHttpPort", tipo: "numero", rotulo: "Número da porta pública de HTTP", padrao: 8096, min: 1, max: 65535 },
        { chave: "PublicHttpsPort", tipo: "numero", rotulo: "Número da porta pública de HTTPS", padrao: 8920, min: 1, max: 65535 }
      ] },
      { titulo: "Protocolos IP", campos: [
        { chave: "EnableIPv4", tipo: "booleano", rotulo: "Ativar IPv4", padrao: true },
        { chave: "EnableIPv6", tipo: "booleano", rotulo: "Ativar IPv6", padrao: false }
      ] },
      { titulo: "Descoberta de Rede", campos: [
        { chave: "AutoDiscovery", tipo: "booleano", rotulo: "Habilitar Descobrimento Automático", padrao: true }
      ] },
      { titulo: "Configurações de Firewall e Proxy", campos: [
        { chave: "PublishedServerUriBySubnet", tipo: "lista", rotulo: "URIs de servidor publicados", ajuda: "Uma por linha, no formato rede=endereço.", padrao: [] }
      ] }
    ]
  },
  { id: "chaves", titulo: "Chaves da API", grupo: "Avançado", especial: true, efeito: { tipo: "real", texto: "Chaves reais: dão acesso de administrador à API pelo cabeçalho X-PugotiCine-Token." }, secoes: [] },
  { id: "backups", titulo: "Backups", grupo: "Avançado", especial: true, efeito: { tipo: "real", texto: "Criar, baixar, excluir e restaurar funcionam de verdade. Restaurar valida o backup, cria antes um backup de segurança e troca os bancos na próxima inicialização do PugotiCine (reinicie o container). Mídias e configurações de ambiente não entram no backup." }, secoes: [] },
  {
    id: "registros", titulo: "Registros", grupo: "Avançado", especial: true,
    efeito: { tipo: "real", texto: "Arquivos de registro reais do processo do PugotiCine; o aviso de resposta lenta é aplicado de verdade." },
    secoes: [{ campos: [
      { chave: "EnableSlowResponseWarning", tipo: "booleano", rotulo: "Registrar mensagem de aviso se o servidor demorou para responder", padrao: true },
      { chave: "SlowResponseThresholdMs", tipo: "numero", rotulo: "Tempo em milissegundos para que uma resposta seja considerada lenta", padrao: 500, min: 50, max: 600000 }
    ] }]
  },
  { id: "tarefas", titulo: "Tarefas Agendadas", grupo: "Avançado", especial: true, efeito: { tipo: "real", texto: "Tarefas do Jellyfin que existem no PugotiCine (varredura, metadados, limpeza de atividade, logs e temporários, otimizar banco). Iniciar e os gatilhos (diário, semanal, intervalo, na inicialização) funcionam de verdade. Tarefas de imagens de capítulos, trickplay, legendas e plugins: ainda não implementadas no PugotiCine." }, secoes: [] }
];

export class ErroValidacao extends Error {
  constructor(readonly campo: string, mensagem: string) { super(mensagem); }
}

export function pagina(id: string): Pagina | undefined { return PAGINAS.find(p => p.id === id); }
export function camposDe(p: Pagina): Campo[] { return p.secoes.flatMap(s => s.campos); }
export function padroes(p: Pagina): Record<string, unknown> {
  return Object.fromEntries(camposDe(p).map(c => [c.chave, Array.isArray(c.padrao) ? [...c.padrao] : c.padrao]));
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const ehIp = (v: string) => IPV4.test(v) || /^[0-9a-f:]+$/i.test(v) && v.includes(":");
const ehSubrede = (v: string) => { const [ip, mascara] = v.split("/"); return ehIp(ip) && (mascara === undefined || (/^\d+$/.test(mascara) && Number(mascara) <= (ip.includes(":") ? 128 : 32))); };
const ehUrl = (v: string) => { try { return ["http:", "https:"].includes(new URL(v).protocol); } catch { return false; } };

/** Valida e normaliza os valores enviados; campos ausentes ficam com o valor atual. */
export function validar(p: Pagina, entrada: Record<string, unknown>, atual: Record<string, unknown>): Record<string, unknown> {
  const resultado: Record<string, unknown> = { ...atual };
  for (const c of camposDe(p)) {
    if (!(c.chave in entrada)) continue;
    const v = entrada[c.chave];
    const erro = (msg: string) => { throw new ErroValidacao(c.chave, `${c.rotulo}: ${msg}`); };
    switch (c.tipo) {
      case "booleano":
        if (typeof v !== "boolean") erro("valor inválido.");
        resultado[c.chave] = v; break;
      case "numero": {
        if ((v === null || v === "") && c.opcional) { resultado[c.chave] = null; break; }
        const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
        if (!Number.isFinite(n)) erro("informe um número.");
        if (c.min !== undefined && n < c.min) erro(`o mínimo é ${c.min}.`);
        if (c.max !== undefined && n > c.max) erro(`o máximo é ${c.max}.`);
        resultado[c.chave] = n; break;
      }
      case "selecao":
        if (typeof v !== "string" || !c.opcoes!.some(o => o.valor === v)) erro("opção inválida.");
        resultado[c.chave] = v; break;
      case "multipla":
        if (!Array.isArray(v) || v.some(x => typeof x !== "string" || !c.opcoes!.some(o => o.valor === x))) erro("opção inválida.");
        resultado[c.chave] = [...new Set(v as string[])]; break;
      case "lista": {
        const itens = (Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : null);
        if (!itens || itens.some(x => typeof x !== "string")) erro("lista inválida.");
        const limpos = (itens as string[]).map(x => x.trim()).filter(Boolean);
        if (limpos.length > 200) erro("no máximo 200 itens.");
        for (const item of limpos) {
          if (c.validarItem === "ip" && !ehIp(item)) erro(`"${item}" não é um endereço IP.`);
          if (c.validarItem === "subrede" && !ehSubrede(item)) erro(`"${item}" não é uma rede válida (ex.: 192.168.1.0/24).`);
          if (c.validarItem === "url" && !ehUrl(item)) erro(`"${item}" não é um endereço http(s).`);
        }
        resultado[c.chave] = limpos; break;
      }
      default: {
        if (typeof v !== "string") erro("texto inválido.");
        const texto = c.tipo === "textoLongo" ? (v as string) : (v as string).trim();
        if (c.maximoTexto && texto.length > c.maximoTexto) erro(`no máximo ${c.maximoTexto} caracteres.`);
        if (c.chave === "ServerName" && !texto) erro("não pode ficar vazio.");
        resultado[c.chave] = texto;
      }
    }
  }
  if (p.id === "reproducao-retomar" && Number(resultado.MinResumePct) >= Number(resultado.MaxResumePct))
    throw new ErroValidacao("MinResumePct", "Porcentagem mínima para retomar: precisa ser menor que a máxima.");
  return resultado;
}
