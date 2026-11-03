// Entrada (stdin): uma linha por caso, "tipo<TAB>raiz da biblioteca<TAB>caminho completo", tipo = tv | filme.
// Saída (stdout): uma linha JSON por caso, com o que o Jellyfin 10.11.10 conclui, usando as mesmas chamadas do servidor:
//   tv    → LibraryManager.FillMissingEpisodeNumbersFromPath: EpisodeResolver.Resolve(caminho, false, null, null, null);
//           temporada ausente → SeasonPathParser.Parse(pasta, pasta da série, true, true); série → SeriesResolver.Resolve.
//   filme → VideoResolver.ResolveFile (nome/ano/extra do arquivo) e ResolveDirectory (nome/ano da pasta do filme).
using System.Text.Json;
using Emby.Naming.Common;
using Emby.Naming.TV;
using Emby.Naming.Video;

var opcoes = new NamingOptions();
var episodios = new EpisodeResolver(opcoes);
var json = new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
// "--opcoes": exporta os dados do NamingOptions (expressões, extensões, regras) para o PugotiCine usar os mesmos.
if (args.Contains("--opcoes"))
{
    object Expr(EpisodeExpression e) => new { e.Expression, e.IsByDate, e.IsOptimistic, e.IsNamed, e.SupportsAbsoluteEpisodeNumbers, e.DateTimeFormats };
    Console.WriteLine(JsonSerializer.Serialize(new
    {
        origem = "Emby.Naming NamingOptions, Jellyfin 10.11.10",
        opcoes.VideoFileExtensions, opcoes.StubFileExtensions, opcoes.AudioFileExtensions, opcoes.SubtitleFileExtensions,
        StubTypes = opcoes.StubTypes.Select(s => new { s.Token, s.StubType }),
        opcoes.CleanDateTimes, opcoes.CleanStrings,
        EpisodeExpressions = opcoes.EpisodeExpressions.Select(Expr),
        MultipleEpisodeExpressions = opcoes.MultipleEpisodeExpressions.Select(Expr),
        VideoExtraRules = opcoes.VideoExtraRules.Select(r => new { ExtraType = r.ExtraType.ToString(), RuleType = r.RuleType.ToString(), r.Token, MediaType = r.MediaType.ToString() })
    }, new JsonSerializerOptions(json) { WriteIndented = true }));
    return;
}
string? linha;
while ((linha = Console.ReadLine()) is not null)
{
    var partes = linha.Split('\t');
    if (partes.Length != 3) continue;
    var (tipo, raiz, caminho) = (partes[0], partes[1].Length > 1 ? partes[1].TrimEnd('/') : partes[1], partes[2]);
    var relativo = Path.GetRelativePath(raiz, caminho);
    var primeiraPasta = relativo.Contains('/') ? Path.Combine(raiz, relativo.Split('/')[0]) : null;
    object resultado;
    if (tipo == "tv")
    {
        var ep = episodios.Resolve(caminho, false, null, null, null);
        var pasta = Path.GetDirectoryName(caminho)!;
        int? temporadaPasta = null;
        if (primeiraPasta is not null && pasta != primeiraPasta)
            temporadaPasta = SeasonPathParser.Parse(pasta, primeiraPasta, true, true).SeasonNumber;
        resultado = new
        {
            tipo, caminho = relativo,
            video = VideoResolver.IsVideoFile(caminho, opcoes),
            serie = primeiraPasta is null ? null : SeriesResolver.Resolve(opcoes, primeiraPasta).Name,
            temporada = ep?.SeasonNumber ?? temporadaPasta,
            temporadaArquivo = ep?.SeasonNumber,
            temporadaPasta,
            episodio = ep?.EpisodeNumber,
            episodioFinal = ep?.EndingEpisodeNumber,
            porData = ep?.IsByDate ?? false,
            ano = ep?.Year, mes = ep?.Month, dia = ep?.Day
        };
    }
    else
    {
        var arquivo = VideoResolver.ResolveFile(caminho, opcoes, raiz);
        var pastaFilme = primeiraPasta is null ? null : VideoResolver.ResolveDirectory(primeiraPasta, opcoes, true, raiz);
        resultado = new
        {
            tipo, caminho = relativo,
            video = VideoResolver.IsVideoFile(caminho, opcoes),
            nomeArquivo = arquivo?.Name, anoArquivo = arquivo?.Year, extra = arquivo?.ExtraType?.ToString(),
            nomePasta = pastaFilme?.Name, anoPasta = pastaFilme?.Year
        };
    }
    Console.WriteLine(JsonSerializer.Serialize(resultado, json));
}
