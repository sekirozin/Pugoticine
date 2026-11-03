// Converte expressões regulares do .NET (como o Jellyfin as escreve) para RegExp do JavaScript com o mesmo resultado.
// Diferenças tratadas:
//  - "\w", "\d": no .NET valem para qualquer letra/dígito Unicode; no JS só ASCII → classes \p{...} com a flag "u".
//  - "]" logo no início de uma classe ("[][ ._-]") é literal no .NET; no JS "[]" é classe vazia → vira "\]".
//  - Chaves literais ("{" que não é quantificador) precisam de escape na flag "u".
//  - Escape de pontuação comum ("\,", "\ ") é literal no .NET e erro no JS com "u" → vira o próprio caractere.
//  - Numeração de grupos: no .NET os grupos sem nome são numerados primeiro e os com nome depois; no JS, na ordem em
//    que aparecem. `grupoNet(m, n)` devolve o grupo n como o .NET numera.
// Grupo atômico "(?>...)" não existe no JS; o único uso (pasta de temporada) é tratado onde aparece.
const PALAVRA = String.raw`\p{L}\p{Mn}\p{Nd}\p{Pc}`;
const SINTAXE = new Set([..."^$\\.*+?()[]{}|/"]);
const SINTAXE_CLASSE = new Set([..."\\]^-["]);
/** Escape que o JS com "u" aceita; pontuação comum escapada no .NET vira o próprio caractere. */
function escape(caractere: string, dentroDaClasse: boolean): string {
  if (/[0-9A-Za-z]/.test(caractere) || (dentroDaClasse ? SINTAXE_CLASSE : SINTAXE).has(caractere))
    return "\\" + caractere;
  return caractere;
}

export interface RegexNet {
  regex: RegExp;
  /** Para cada número de grupo do .NET (1..n), o índice correspondente no resultado do JS. */
  mapaGrupos: number[];
}

export function converterRegexNet(origem: string, ignorarMaiusculas = true): RegexNet {
  let saida = "";
  const grupos: { nome: string | null }[] = [];
  for (let i = 0; i < origem.length; i++) {
    const c = origem[i];
    if (c === "\\") {
      const proximo = origem[i + 1];
      if (proximo === "w") saida += `[${PALAVRA}]`;
      else if (proximo === "W") saida += `[^${PALAVRA}]`;
      else if (proximo === "d") saida += String.raw`\p{Nd}`;
      else if (proximo === "D") saida += String.raw`\P{Nd}`;
      else saida += escape(proximo, false);
      i++;
      continue;
    }
    if (c === "[") {
      // Copia a classe inteira, tratando "]" inicial e \w/\d dentro dela.
      let classe = "[";
      let j = i + 1;
      if (origem[j] === "^") { classe += "^"; j++; }
      if (origem[j] === "]") { classe += "\\]"; j++; }
      for (; j < origem.length && origem[j] !== "]"; j++) {
        if (origem[j] === "\\") {
          const e = origem[j + 1];
          classe += e === "w" ? PALAVRA : e === "d" ? String.raw`\p{Nd}` : escape(e, true);
          j++;
        }
        else if (origem[j] === "[") classe += "\\[";
        else classe += origem[j];
      }
      saida += classe + "]";
      i = j;
      continue;
    }
    if (c === "(") {
      if (origem[i + 1] !== "?") grupos.push({ nome: null });
      else if (origem[i + 2] === "<" && origem[i + 3] !== "=" && origem[i + 3] !== "!") {
        const fim = origem.indexOf(">", i);
        grupos.push({ nome: origem.slice(i + 3, fim) });
      }
      else if (origem[i + 2] === ">") throw new Error(`Grupo atômico não suportado: ${origem}`);
      saida += c;
      continue;
    }
    if (c === "{" && !/^\{\d+(,\d*)?\}/.test(origem.slice(i))) { saida += "\\{"; continue; }
    if (c === "}" && !/\{\d+(,\d*)?$/.test(origem.slice(0, i))) { saida += "\\}"; continue; }
    saida += c;
  }
  // .NET: sem nome primeiro, depois os com nome; JS: ordem de aparição.
  const ordemJs = grupos.map((g, indice) => ({ ...g, js: indice + 1 }));
  const mapaGrupos = [0, ...ordemJs.filter(g => g.nome === null).map(g => g.js), ...ordemJs.filter(g => g.nome !== null).map(g => g.js)];
  // "d": índices dos grupos (o Jellyfin olha o caractere depois do episódio final).
  return { regex: new RegExp(saida, ignorarMaiusculas ? "iud" : "ud"), mapaGrupos };
}

/** Grupo n como o .NET numera (0 = correspondência inteira). */
export function grupoNet(resultado: RegExpExecArray, mapa: number[], n: number): string | undefined {
  return n === 0 ? resultado[0] : resultado[mapa[n]];
}
