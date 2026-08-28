// Minimal but complete ANSI SGR (color/style) escape parser for rendering
// terminal output (vite / eslint / webpack colored logs, etc.) in the browser.
//
// We tokenize an input string into a list of plain-text "segments", each
// carrying the foreground/background/intensity attributes in effect at that
// point. Non-SGR control sequences (cursor moves, screen clears, OSC titles…)
// are dropped: they carry no visible glyphs and only matter for a real TTY's
// cursor model, which a log viewer doesn't emulate.

export interface AnsiStyle {
  fg: string | null;
  bg: string | null;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  inverse: boolean;
}

export interface AnsiSegment {
  text: string;
  style: AnsiStyle;
}

const ESC = "\x1b";

// Standard 16-color palette. Index is (code - 30) for the normal set and
// (code - 90) for the bright set. Values approximate the common GNOME/Xterm
// defaults, which read well on a dark terminal surface.
const NORMAL = [
  "#000000", "#cc0000", "#4e9a06", "#c4a000",
  "#3465a4", "#75507b", "#06989a", "#d3d7cf",
];
const BRIGHT = [
  "#555753", "#ef2929", "#8ae234", "#fce94f",
  "#729fcf", "#ad7fa8", "#34e2e2", "#eeeeec",
];

// Resolve a 256-color index to an RGB string (xterm palette: 0-15 = the 16
// base colors, 16-231 = a 6x6x6 cube, 232-255 = a grayscale ramp).
function color256(n: number): string {
  if (n < 0) n = 0;
  if (n > 255) n = 255;
  if (n < 8) return NORMAL[n];
  if (n < 16) return BRIGHT[n - 8];
  if (n < 232) {
    const c = n - 16;
    const ramp = (x: number) => (x === 0 ? 0 : 55 + x * 40);
    const r = ramp(Math.floor(c / 36) % 6);
    const g = ramp(Math.floor(c / 6) % 6);
    const b = ramp(c % 6);
    return `rgb(${r}, ${g}, ${b})`;
  }
  const v = 8 + (n - 232) * 10;
  return `rgb(${v}, ${v}, ${v})`;
}

function baseStyle(): AnsiStyle {
  return {
    fg: null,
    bg: null,
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    strike: false,
    inverse: false,
  };
}

// Apply one SGR parameter run (the text between ESC[ and m) to a style,
// returning a new style. Codes 38/48 consume the following params for the
// extended-color forms (38;5;n or 38;2;r;g;b) and advance the cursor.
function applySgr(prev: AnsiStyle, paramsStr: string): AnsiStyle {
  const s: AnsiStyle = { ...prev };
  // An empty parameter list (ESC[m) is equivalent to ESC[0m (reset).
  const params =
    paramsStr === ""
      ? [0]
      : paramsStr.split(";").map((p) => (p === "" ? 0 : parseInt(p, 10)));
  for (let i = 0; i < params.length; i++) {
    switch (params[i]) {
      case 0:
        Object.assign(s, baseStyle());
        break;
      case 1:
        s.bold = true;
        break;
      case 2:
        s.dim = true;
        break;
      case 3:
        s.italic = true;
        break;
      case 4:
        s.underline = true;
        break;
      case 9:
        s.strike = true;
        break;
      case 22:
        s.bold = false;
        s.dim = false;
        break;
      case 23:
        s.italic = false;
        break;
      case 24:
        s.underline = false;
        break;
      case 29:
        s.strike = false;
        break;
      case 7:
        s.inverse = true;
        break;
      case 27:
        s.inverse = false;
        break;
      case 39:
        s.fg = null;
        break;
      case 49:
        s.bg = null;
        break;
      case 38:
      case 48: {
        const target = params[i] === 38 ? "fg" : "bg";
        const mode = params[i + 1];
        if (mode === 5) {
          // 38;5;n -> 256-color
          s[target] = color256(params[i + 2] ?? 0);
          i += 2;
        } else if (mode === 2) {
          // 38;2;r;g;b -> truecolor
          s[target] = `rgb(${params[i + 2] ?? 0}, ${params[i + 3] ?? 0}, ${params[i + 4] ?? 0})`;
          i += 4;
        }
        break;
      }
      default: {
        const c = params[i];
        if (c >= 30 && c <= 37) s.fg = NORMAL[c - 30];
        else if (c >= 90 && c <= 97) s.fg = BRIGHT[c - 90];
        else if (c >= 40 && c <= 47) s.bg = NORMAL[c - 40];
        else if (c >= 100 && c <= 107) s.bg = BRIGHT[c - 100];
        break;
      }
    }
  }
  return s;
}

// Tokenize a string containing ANSI escape sequences into styled segments.
// Carriage returns (\r) are dropped: each log entry is already a single line,
// and a real terminal's CR-overwrite behaviour can't be reproduced in HTML.
export function tokenizeAnsi(input: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  let style = baseStyle();
  let buf = "";
  let i = 0;

  const flush = () => {
    if (buf !== "") {
      segments.push({ text: buf, style });
      buf = "";
    }
  };

  while (i < input.length) {
    const ch = input[i];

    if (ch !== ESC) {
      if (ch !== "\r") buf += ch;
      i++;
      continue;
    }

    const next = input[i + 1];

    // CSI: ESC [ params? intermediate? final
    if (next === "[") {
      let j = i + 2;
      const pStart = j;
      // parameter bytes 0x30-0x3F (digits, ;, :, <, =, >, ?)
      while (j < input.length) {
        const cc = input.charCodeAt(j);
        if (cc >= 0x30 && cc <= 0x3f) j++;
        else break;
      }
      const paramsStr = input.slice(pStart, j);
      // intermediate bytes 0x20-0x2F
      while (j < input.length) {
        const cc = input.charCodeAt(j);
        if (cc >= 0x20 && cc <= 0x2f) j++;
        else break;
      }
      if (j < input.length) {
        const finalByte = input[j];
        j++; // consume final byte (0x40-0x7E)
        if (finalByte === "m") {
          flush();
          style = applySgr(style, paramsStr);
        }
        // non-SGR CSI sequences (cursor moves, erases…) are silently dropped
        i = j;
        continue;
      }
      // No final byte (truncated at EOF): drop the partial escape and stop.
      i = j;
      continue;
    }

    // OSC: ESC ] … (BEL | ST) — window title / hyperlink sequences; drop.
    if (next === "]") {
      let j = i + 2;
      while (j < input.length) {
        if (input[j] === "\x07") {
          j++;
          break;
        }
        if (input[j] === ESC && input[j + 1] === "\\") {
          j += 2;
          break;
        }
        j++;
      }
      i = j;
      continue;
    }

    // Other multi-byte ESC sequences (charset selection ESC ( X, ESC =, ESC
    // M, …): skip ESC + one optional intermediate + final.
    if (next !== undefined && "()*+/".includes(next)) {
      i += 3;
      continue;
    }
    i += 2; // ESC + single-byte sequence
  }

  flush();
  return segments;
}

// Strip every ANSI escape sequence, returning plain text. Used for clipboard
// copies, where the raw escape codes would be unwanted noise.
export function stripAnsi(input: string): string {
  return tokenizeAnsi(input)
    .map((s) => s.text)
    .join("");
}
