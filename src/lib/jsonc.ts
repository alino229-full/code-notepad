function stripTrailingCommas(source: string): string {
  let result = "";
  let inString = false;
  let quote = "";
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    if (inString) {
      result += current;
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === quote) inString = false;
      continue;
    }
    if (current === '"' || current === "'") {
      inString = true;
      quote = current;
      result += current;
      continue;
    }
    if (current === ",") {
      let lookahead = index + 1;
      while (lookahead < source.length && /\s/.test(source[lookahead])) lookahead += 1;
      const next = source[lookahead];
      if (next === "}" || next === "]") continue;
    }
    result += current;
  }
  return result;
}

export function stripJsonComments(source: string): string {
  let result = "";
  let inString = false;
  let quote = "";
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (inString) {
      result += current;
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === quote) inString = false;
      continue;
    }
    if (current === '"' || current === "'") {
      inString = true;
      quote = current;
      result += current;
      continue;
    }
    if (current === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      result += "\n";
      continue;
    }
    if (current === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
      index += 1;
      continue;
    }
    result += current;
  }
  // Le retrait des virgules traînantes connaît l'état des chaînes pour ne pas
  // corrompre une valeur contenant «,} » ou «,] ».
  return stripTrailingCommas(result);
}
