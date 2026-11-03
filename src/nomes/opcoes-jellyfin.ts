// Gerado por ferramentas/oraculo-nomes (--opcoes) a partir do NamingOptions do Jellyfin 10.11.10. Não editar à mão.
// Para atualizar: rode o oráculo com --opcoes e regenere este arquivo.
export interface ExpressaoJellyfin {
  Expression: string; IsByDate: boolean; IsOptimistic: boolean; IsNamed: boolean;
  SupportsAbsoluteEpisodeNumbers: boolean; DateTimeFormats: string[];
}
export interface OpcoesJellyfin {
  origem: string;
  VideoFileExtensions: string[]; StubFileExtensions: string[]; AudioFileExtensions: string[]; SubtitleFileExtensions: string[];
  StubTypes: { Token: string; StubType: string }[];
  CleanDateTimes: string[]; CleanStrings: string[];
  EpisodeExpressions: ExpressaoJellyfin[]; MultipleEpisodeExpressions: ExpressaoJellyfin[];
  VideoExtraRules: { ExtraType: string; RuleType: "Filename" | "Suffix" | "Regex" | "DirectoryName"; Token: string; MediaType: string }[];
}
export const OPCOES_JELLYFIN: OpcoesJellyfin = {
  "origem": "Emby.Naming NamingOptions, Jellyfin 10.11.10",
  "VideoFileExtensions": [
    ".001",
    ".3g2",
    ".3gp",
    ".amv",
    ".asf",
    ".asx",
    ".avi",
    ".bin",
    ".bivx",
    ".divx",
    ".dv",
    ".dvr-ms",
    ".f4v",
    ".fli",
    ".flv",
    ".ifo",
    ".img",
    ".iso",
    ".m2t",
    ".m2ts",
    ".m2v",
    ".m4v",
    ".mkv",
    ".mk3d",
    ".mov",
    ".mp4",
    ".mpe",
    ".mpeg",
    ".mpg",
    ".mts",
    ".mxf",
    ".nrg",
    ".nsv",
    ".nuv",
    ".ogg",
    ".ogm",
    ".ogv",
    ".pva",
    ".qt",
    ".rec",
    ".rm",
    ".rmvb",
    ".strm",
    ".svq3",
    ".tp",
    ".ts",
    ".ty",
    ".viv",
    ".vob",
    ".vp3",
    ".webm",
    ".wmv",
    ".wtv",
    ".xvid"
  ],
  "StubFileExtensions": [
    ".disc"
  ],
  "AudioFileExtensions": [
    ".669",
    ".3gp",
    ".aa",
    ".aac",
    ".aax",
    ".ac3",
    ".act",
    ".adp",
    ".adplug",
    ".adx",
    ".afc",
    ".amf",
    ".aif",
    ".aiff",
    ".alac",
    ".amr",
    ".ape",
    ".ast",
    ".au",
    ".awb",
    ".cda",
    ".cue",
    ".dmf",
    ".dsf",
    ".dsm",
    ".dsp",
    ".dts",
    ".dvf",
    ".eac3",
    ".ec3",
    ".far",
    ".flac",
    ".gdm",
    ".gsm",
    ".gym",
    ".hps",
    ".imf",
    ".it",
    ".m15",
    ".m4a",
    ".m4b",
    ".mac",
    ".med",
    ".mka",
    ".mmf",
    ".mod",
    ".mogg",
    ".mp2",
    ".mp3",
    ".mpa",
    ".mpc",
    ".mpp",
    ".mp+",
    ".msv",
    ".nmf",
    ".nsf",
    ".nsv",
    ".oga",
    ".ogg",
    ".okt",
    ".opus",
    ".pls",
    ".ra",
    ".rf64",
    ".rm",
    ".s3m",
    ".sfx",
    ".shn",
    ".sid",
    ".stm",
    ".strm",
    ".ult",
    ".uni",
    ".vox",
    ".wav",
    ".wma",
    ".wv",
    ".xm",
    ".xsp",
    ".ymf"
  ],
  "SubtitleFileExtensions": [
    ".ass",
    ".mks",
    ".sami",
    ".smi",
    ".srt",
    ".ssa",
    ".sub",
    ".sup",
    ".vtt"
  ],
  "StubTypes": [
    {
      "Token": "dvd",
      "StubType": "dvd"
    },
    {
      "Token": "hddvd",
      "StubType": "hddvd"
    },
    {
      "Token": "bluray",
      "StubType": "bluray"
    },
    {
      "Token": "brrip",
      "StubType": "bluray"
    },
    {
      "Token": "bd25",
      "StubType": "bluray"
    },
    {
      "Token": "bd50",
      "StubType": "bluray"
    },
    {
      "Token": "vhs",
      "StubType": "vhs"
    },
    {
      "Token": "HDTV",
      "StubType": "tv"
    },
    {
      "Token": "PDTV",
      "StubType": "tv"
    },
    {
      "Token": "DSR",
      "StubType": "tv"
    }
  ],
  "CleanDateTimes": [
    "(.+[^_\\,\\.\\(\\)\\[\\]\\-])[_\\.\\(\\)\\[\\]\\-](19[0-9]{2}|20[0-9]{2})(?![0-9]+|\\W[0-9]{2}\\W[0-9]{2})([ _\\,\\.\\(\\)\\[\\]\\-][^0-9]|).*(19[0-9]{2}|20[0-9]{2})*",
    "(.+[^_\\,\\.\\(\\)\\[\\]\\-])[ _\\.\\(\\)\\[\\]\\-]+(19[0-9]{2}|20[0-9]{2})(?![0-9]+|\\W[0-9]{2}\\W[0-9]{2})([ _\\,\\.\\(\\)\\[\\]\\-][^0-9]|).*(19[0-9]{2}|20[0-9]{2})*"
  ],
  "CleanStrings": [
    "^\\s*(?<cleaned>.+?)[ _\\,\\.\\(\\)\\[\\]\\-](3d|sbs|tab|hsbs|htab|mvc|HDR|HDC|UHD|UltraHD|4k|ac3|dts|custom|dc|divx|divx5|dsr|dsrip|dutch|dvd|dvdrip|dvdscr|dvdscreener|screener|dvdivx|cam|fragment|fs|hdtv|hdrip|hdtvrip|internal|limited|multi|subs|ntsc|ogg|ogm|pal|pdtv|proper|repack|rerip|retail|cd[1-9]|r5|bd5|bd|se|svcd|swedish|german|read.nfo|nfofix|unrated|ws|telesync|ts|telecine|tc|brrip|bdrip|480p|480i|576p|576i|720p|720i|1080p|1080i|2160p|hrhd|hrhdtv|hddvd|bluray|blu-ray|x264|x265|h264|h265|xvid|xvidvd|xxx|www.www|AAC|DTS|\\[.*\\])([ _\\,\\.\\(\\)\\[\\]\\-]|$)",
    "^(?<cleaned>.+?)(\\[.*\\])",
    "^\\s*(?<cleaned>.+?)\\WE[0-9]+(-|~)E?[0-9]+(\\W|$)",
    "^\\s*\\[[^\\]]+\\](?!\\.\\w+$)\\s*(?<cleaned>.+)",
    "^\\s*(?<cleaned>.+?)\\s+-\\s+[0-9]+\\s*$",
    "^\\s*(?<cleaned>.+?)(([-._ ](trailer|sample))|-(scene|clip|behindthescenes|deleted|deletedscene|featurette|short|interview|other|extra))$"
  ],
  "EpisodeExpressions": [
    {
      "Expression": ".*(\\\\|\\/)(?<seriesname>((?![Ss]([0-9]+)[][ ._-]*[Ee]([0-9]+))[^\\\\\\/])*)?[Ss](?<seasonnumber>[0-9]+)[][ ._-]*[Ee](?<epnumber>[0-9]+)([^\\\\/]*)$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": "[\\._ -]()[Ee][Pp]_?([0-9]+)([^\\\\/]*)$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": false,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": "[^\\\\/]*?()\\.?[Ee]([0-9]+)\\.([^\\\\/]*)$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": false,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": "(?<year>[0-9]{4})[._ -](?<month>[0-9]{2})[._ -](?<day>[0-9]{2})",
      "IsByDate": true,
      "IsOptimistic": false,
      "IsNamed": false,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": [
        "yyyy.MM.dd",
        "yyyy-MM-dd",
        "yyyy_MM_dd",
        "yyyy MM dd"
      ]
    },
    {
      "Expression": "(?<day>[0-9]{2})[._ -](?<month>[0-9]{2})[._ -](?<year>[0-9]{4})",
      "IsByDate": true,
      "IsOptimistic": false,
      "IsNamed": false,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": [
        "dd.MM.yyyy",
        "dd-MM-yyyy",
        "dd_MM_yyyy",
        "dd MM yyyy"
      ]
    },
    {
      "Expression": ".*[\\\\\\/]((?<seriesname>[^\\\\/]+?)\\s)?[Ss](?:eason)?\\s*(?<seasonnumber>[0-9]+)\\s+[Ee](?:pisode)?\\s*(?<epnumber>[0-9]+).*$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": ".*[\\\\\\/](?![Ee]pisode)(?<seriesname>[\\w\\s]+?)\\s(?<epnumber>[0-9]{1,4})(-(?<endingepnumber>[0-9]{2,4}))*[^\\\\\\/x]*$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": "[\\\\\\/\\._ \\[\\(-]([0-9]+)x([0-9]+(?:(?:[a-i]|\\.[1-9])(?![0-9]))?)([^\\\\\\/]*)$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": false,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": ".*[\\\\\\/]?.*?(\\[.*?\\])+.*?(?<seriesname>[-\\w\\s]+?)[\\s_]*-[\\s_]*(?<epnumber>[0-9]+).*$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": "[\\\\/._ -](?<seriesname>(?![0-9]+[0-9][0-9])([^\\\\\\/_])*)[\\\\\\/._ -](?<seasonnumber>[0-9]+)(?<epnumber>[0-9][0-9](?:(?:[a-i]|\\.[1-9])(?![0-9]))?)([._ -][^\\\\\\/]*)$",
      "IsByDate": false,
      "IsOptimistic": true,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": false,
      "DateTimeFormats": []
    },
    {
      "Expression": "[\\/._ -]p(?:ar)?t[_. -]()([ivx]+|[0-9]+)([._ -][^\\/]*)$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": false,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": "[Ee]pisode (?<epnumber>[0-9]+)(-(?<endingepnumber>[0-9]+))?[^\\\\\\/]*$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": ".*(\\\\|\\/)[sS]?(?<seasonnumber>[0-9]+)[xX](?<epnumber>[0-9]+)[^\\\\\\/]*$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": ".*(\\\\|\\/)[sS](?<seasonnumber>[0-9]+)[x,X]?[eE](?<epnumber>[0-9]+)[^\\\\\\/]*$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": ".*(\\\\|\\/)(?<seriesname>((?![sS]?[0-9]{1,4}[xX][0-9]{1,3})[^\\\\\\/])*)?([sS]?(?<seasonnumber>[0-9]{1,4})[xX](?<epnumber>[0-9]+))[^\\\\\\/]*$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": ".*(\\\\|\\/)(?<seriesname>[^\\\\\\/]*)[sS](?<seasonnumber>[0-9]{1,4})[xX\\.]?[eE](?<epnumber>[0-9]+)[^\\\\\\/]*$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": ".*[\\\\\\/](?<epnumber>[0-9]+)(-(?<endingepnumber>[0-9]+))*\\.\\w+$",
      "IsByDate": false,
      "IsOptimistic": true,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": "([0-9]+)-([0-9]+)",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": false,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": ".*(\\\\|\\/)(?<epnumber>[0-9]{1,3})(-(?<endingepnumber>[0-9]{2,3}))*\\s?-\\s?[^\\\\\\/]*$",
      "IsByDate": false,
      "IsOptimistic": true,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": ".*(\\\\|\\/)(?<epnumber>[0-9]{1,3})(-(?<endingepnumber>[0-9]{2,3}))*\\.[^\\\\\\/]+$",
      "IsByDate": false,
      "IsOptimistic": true,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": ".*[\\\\\\/][^\\\\\\/]* - (?<epnumber>[0-9]{1,3})(-(?<endingepnumber>[0-9]{2,3}))*[^\\\\\\/]*$",
      "IsByDate": false,
      "IsOptimistic": true,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": "[Ss]eason[\\._ ](?<seasonnumber>[0-9]+)[\\\\\\/](?<epnumber>[0-9]{1,3})([^\\\\\\/]*)$",
      "IsByDate": false,
      "IsOptimistic": true,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": "(.*(\\\\|\\/))*(?<seriesname>.+)\\/[Ss](eason)?[\\. _\\-]*(?<seasonnumber>[0-9]+)",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": "(.*(\\\\|\\/))*(?<seriesname>.+)[\\. _\\-]+[sS](eason)?[\\. _\\-]*(?<seasonnumber>[0-9]+)",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": "(?:\\[(?:[^\\]]+)\\]\\s*)?(?<seriesname>\\[[^\\]]+\\]|[^[\\]]+)\\s*\\[(?<epnumber>[0-9]+)\\]",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    }
  ],
  "MultipleEpisodeExpressions": [
    {
      "Expression": ".*(\\\\|\\/)[sS]?(?<seasonnumber>[0-9]{1,4})[xX](?<epnumber>[0-9]{1,3})((-| - )[0-9]{1,4}[eExX](?<endingepnumber>[0-9]{1,3}))+[^\\\\\\/]*$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": ".*(\\\\|\\/)[sS]?(?<seasonnumber>[0-9]{1,4})[xX](?<epnumber>[0-9]{1,3})((-| - )[0-9]{1,4}[xX][eE](?<endingepnumber>[0-9]{1,3}))+[^\\\\\\/]*$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": ".*(\\\\|\\/)[sS]?(?<seasonnumber>[0-9]{1,4})[xX](?<epnumber>[0-9]{1,3})((-| - )?[xXeE](?<endingepnumber>[0-9]{1,3}))+[^\\\\\\/]*$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": ".*(\\\\|\\/)[sS]?(?<seasonnumber>[0-9]{1,4})[xX](?<epnumber>[0-9]{1,3})(-[xE]?[eE]?(?<endingepnumber>[0-9]{1,3}))+[^\\\\\\/]*$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": ".*(\\\\|\\/)(?<seriesname>((?![sS]?[0-9]{1,4}[xX][0-9]{1,3})[^\\\\\\/])*)?([sS]?(?<seasonnumber>[0-9]{1,4})[xX](?<epnumber>[0-9]{1,3}))((-| - )[0-9]{1,4}[xXeE](?<endingepnumber>[0-9]{1,3}))+[^\\\\\\/]*$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": ".*(\\\\|\\/)(?<seriesname>((?![sS]?[0-9]{1,4}[xX][0-9]{1,3})[^\\\\\\/])*)?([sS]?(?<seasonnumber>[0-9]{1,4})[xX](?<epnumber>[0-9]{1,3}))((-| - )[0-9]{1,4}[xX][eE](?<endingepnumber>[0-9]{1,3}))+[^\\\\\\/]*$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": ".*(\\\\|\\/)(?<seriesname>((?![sS]?[0-9]{1,4}[xX][0-9]{1,3})[^\\\\\\/])*)?([sS]?(?<seasonnumber>[0-9]{1,4})[xX](?<epnumber>[0-9]{1,3}))((-| - )?[xXeE](?<endingepnumber>[0-9]{1,3}))+[^\\\\\\/]*$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": ".*(\\\\|\\/)(?<seriesname>((?![sS]?[0-9]{1,4}[xX][0-9]{1,3})[^\\\\\\/])*)?([sS]?(?<seasonnumber>[0-9]{1,4})[xX](?<epnumber>[0-9]{1,3}))(-[xX]?[eE]?(?<endingepnumber>[0-9]{1,3}))+[^\\\\\\/]*$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": ".*(\\\\|\\/)(?<seriesname>[^\\\\\\/]*)[sS](?<seasonnumber>[0-9]{1,4})[xX\\.]?[eE](?<epnumber>[0-9]{1,3})((-| - )?[xXeE](?<endingepnumber>[0-9]{1,3}))+[^\\\\\\/]*$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    },
    {
      "Expression": ".*(\\\\|\\/)(?<seriesname>[^\\\\\\/]*)[sS](?<seasonnumber>[0-9]{1,4})[xX\\.]?[eE](?<epnumber>[0-9]{1,3})(-[xX]?[eE]?(?<endingepnumber>[0-9]{1,3}))+[^\\\\\\/]*$",
      "IsByDate": false,
      "IsOptimistic": false,
      "IsNamed": true,
      "SupportsAbsoluteEpisodeNumbers": true,
      "DateTimeFormats": []
    }
  ],
  "VideoExtraRules": [
    {
      "ExtraType": "Trailer",
      "RuleType": "DirectoryName",
      "Token": "trailers",
      "MediaType": "Video"
    },
    {
      "ExtraType": "ThemeVideo",
      "RuleType": "DirectoryName",
      "Token": "backdrops",
      "MediaType": "Video"
    },
    {
      "ExtraType": "ThemeSong",
      "RuleType": "DirectoryName",
      "Token": "theme-music",
      "MediaType": "Audio"
    },
    {
      "ExtraType": "BehindTheScenes",
      "RuleType": "DirectoryName",
      "Token": "behind the scenes",
      "MediaType": "Video"
    },
    {
      "ExtraType": "DeletedScene",
      "RuleType": "DirectoryName",
      "Token": "deleted scenes",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Interview",
      "RuleType": "DirectoryName",
      "Token": "interviews",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Scene",
      "RuleType": "DirectoryName",
      "Token": "scenes",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Sample",
      "RuleType": "DirectoryName",
      "Token": "samples",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Short",
      "RuleType": "DirectoryName",
      "Token": "shorts",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Featurette",
      "RuleType": "DirectoryName",
      "Token": "featurettes",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Unknown",
      "RuleType": "DirectoryName",
      "Token": "extras",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Unknown",
      "RuleType": "DirectoryName",
      "Token": "extra",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Unknown",
      "RuleType": "DirectoryName",
      "Token": "other",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Clip",
      "RuleType": "DirectoryName",
      "Token": "clips",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Trailer",
      "RuleType": "Filename",
      "Token": "trailer",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Sample",
      "RuleType": "Filename",
      "Token": "sample",
      "MediaType": "Video"
    },
    {
      "ExtraType": "ThemeSong",
      "RuleType": "Filename",
      "Token": "theme",
      "MediaType": "Audio"
    },
    {
      "ExtraType": "Trailer",
      "RuleType": "Suffix",
      "Token": "-trailer",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Trailer",
      "RuleType": "Suffix",
      "Token": ".trailer",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Trailer",
      "RuleType": "Suffix",
      "Token": "_trailer",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Trailer",
      "RuleType": "Suffix",
      "Token": "- trailer",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Sample",
      "RuleType": "Suffix",
      "Token": "-sample",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Sample",
      "RuleType": "Suffix",
      "Token": ".sample",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Sample",
      "RuleType": "Suffix",
      "Token": "_sample",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Sample",
      "RuleType": "Suffix",
      "Token": "- sample",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Scene",
      "RuleType": "Suffix",
      "Token": "-scene",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Clip",
      "RuleType": "Suffix",
      "Token": "-clip",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Interview",
      "RuleType": "Suffix",
      "Token": "-interview",
      "MediaType": "Video"
    },
    {
      "ExtraType": "BehindTheScenes",
      "RuleType": "Suffix",
      "Token": "-behindthescenes",
      "MediaType": "Video"
    },
    {
      "ExtraType": "DeletedScene",
      "RuleType": "Suffix",
      "Token": "-deleted",
      "MediaType": "Video"
    },
    {
      "ExtraType": "DeletedScene",
      "RuleType": "Suffix",
      "Token": "-deletedscene",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Featurette",
      "RuleType": "Suffix",
      "Token": "-featurette",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Short",
      "RuleType": "Suffix",
      "Token": "-short",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Unknown",
      "RuleType": "Suffix",
      "Token": "-extra",
      "MediaType": "Video"
    },
    {
      "ExtraType": "Unknown",
      "RuleType": "Suffix",
      "Token": "-other",
      "MediaType": "Video"
    }
  ]
};
