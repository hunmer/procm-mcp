import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
export type ThemeStyle = "default" | "vercel" | "twitter" | "untitled" | "orion" | "cyberpunk" | "candyland";

const STORAGE_KEY = "procm-theme";
const STYLE_STORAGE_KEY = "procm-theme-style";
const CUSTOM_CSS_STORAGE_KEY = "procm-theme-custom-css";
const REMOTE_CSS_STORAGE_PREFIX = "procm-theme-css-";
const STYLE_IDS: Partial<Record<ThemeStyle, string>> = {
  vercel: "418a8650-514e-483b-a8cd-2c6e619ee97c",
  twitter: "abb2128e-7392-4ec7-880c-ef68a0051da3",
  untitled: "9a78ab7f-244b-42f3-888c-bced88ce4703",
  orion: "15f114bb-f87b-4b22-a5d6-78cd461d3319",
  cyberpunk: "c5d8fe6a-807f-4da8-981c-cfd2aaf3e1bf",
  candyland: "26f36512-7e14-406f-87e5-9b3355ac06e8",
};

function readStoredTheme(): Theme {
  if (typeof localStorage !== "undefined") {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  }
  // Default to dark to match the previous dashboard look.
  return "dark";
}

function readStoredStyle(): ThemeStyle {
  if (typeof localStorage !== "undefined") {
    const v = localStorage.getItem(STYLE_STORAGE_KEY);
    if (["default", "vercel", "twitter", "untitled", "orion", "cyberpunk", "candyland"].includes(v ?? "")) return v as ThemeStyle;
  }
  return "default";
}

function readStoredCustomCss(): string {
  return typeof localStorage !== "undefined" ? localStorage.getItem(CUSTOM_CSS_STORAGE_KEY) ?? "" : "";
}

// Apply the theme class to <html> synchronously. Call once before render to
// avoid a flash of the wrong theme on load.
export function initTheme(): Theme {
  const theme = readStoredTheme();
  applyTheme(theme, readStoredStyle(), readStoredCustomCss());
  return theme;
}

function applyTheme(theme: Theme, style: ThemeStyle, customCss = "") {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.remove("theme-default", "theme-vercel", "theme-twitter", "theme-untitled", "theme-orion", "theme-cyberpunk", "theme-candyland");
  root.classList.add(`theme-${style}`);
  let customStyle = document.getElementById("procm-custom-theme-css") as HTMLStyleElement | null;
  if (customCss) {
    if (!customStyle) {
      customStyle = document.createElement("style");
      customStyle.id = "procm-custom-theme-css";
      document.head.appendChild(customStyle);
    }
    customStyle.textContent = customCss;
  } else {
    customStyle?.remove();
  }
}

async function loadRemoteStyle(style: ThemeStyle) {
  const id = STYLE_IDS[style];
  const existing = document.getElementById("procm-remote-theme-css");
  if (!id) {
    existing?.remove();
    return;
  }
  const cacheKey = `${REMOTE_CSS_STORAGE_PREFIX}${style}`;
  const inject = (css: string) => {
    if (!document.documentElement.classList.contains(`theme-${style}`)) return;
    const current = document.getElementById("procm-remote-theme-css");
    const node = current as HTMLStyleElement | null ?? document.createElement("style");
    node.id = "procm-remote-theme-css";
    node.textContent = css;
    if (!current) document.head.appendChild(node);
    const custom = document.getElementById("procm-custom-theme-css");
    if (custom) document.head.appendChild(custom);
  };
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) inject(cached);
  } catch {
    // Ignore unavailable localStorage.
  }
  try {
    const response = await fetch(`https://shadcnthemer.com/r/themes/${id}.json`);
    if (!response.ok) return;
    const json = await response.json() as { cssVars?: { theme?: Record<string, string>; light?: Record<string, string>; dark?: Record<string, string> } };
    const vars = json.cssVars;
    if (!vars) return;
    const block = (name: string, values?: Record<string, string>) => values ? `${name}{${Object.entries(values).map(([k, v]) => `--${k}:${v};`).join("")}}` : "";
    const css = `${block(":root", { ...vars.theme, ...vars.light })}${block(".dark", { ...vars.theme, ...vars.dark })}`;
    inject(css);
    try {
      localStorage.setItem(cacheKey, css);
    } catch {
      // Ignore storage quota or privacy-mode errors.
    }
  } catch {
    // Keep the local fallback palette when the theme service is unavailable.
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());
  const [style, setStyle] = useState<ThemeStyle>(() => readStoredStyle());
  const [customCss, setCustomCss] = useState(() => readStoredCustomCss());

  // Keep <html> in sync whenever the state changes, and persist the choice.
  useEffect(() => {
    applyTheme(theme, style, customCss);
    void loadRemoteStyle(style);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage may be unavailable (private mode); ignore.
    }
    try {
      localStorage.setItem(STYLE_STORAGE_KEY, style);
      localStorage.setItem(CUSTOM_CSS_STORAGE_KEY, customCss);
    } catch {
      // localStorage may be unavailable (private mode); ignore.
    }
  }, [theme, style, customCss]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return { theme, setTheme, style, setStyle, customCss, setCustomCss, toggle };
}
