import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

// Límites de import de docs/ARCHITECTURE.md §4.4. Cada grupo de archivos
// redefine la regla completa, porque en flat config la última coincidencia
// reemplaza a las anteriores en lugar de combinarse con ellas.

const modulo = (ruta, motivo) => ({
  regex: `^@/${ruta}(/|$)`,
  message: motivo,
});

const OPENAI = {
  regex: "^openai(/|$)",
  message: "Solo src/server/llm/openai/ puede importar openai (ADR-0002).",
};

// Sin imports relativos hacia arriba: obliga a usar @/ y así los límites
// no se pueden saltear con "../../server".
const RELATIVO_HACIA_ARRIBA = {
  regex: "^\\.\\./",
  message: "Fuera de la carpeta actual, importá con el alias @/.",
};

const SERVIDOR = modulo(
  "server",
  "El código de servidor no se importa desde aquí.",
);
const UI = [
  modulo("features", "La UI no se importa desde aquí."),
  modulo("components", "La UI no se importa desde aquí."),
  modulo("app", "Las rutas de Next no se importan desde aquí."),
];

const limites = (files, prohibidos) => ({
  files,
  rules: {
    "no-restricted-imports": [
      "error",
      { patterns: [RELATIVO_HACIA_ARRIBA, ...prohibidos] },
    ],
  },
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: { "react/no-danger": "error" },
  },

  limites(["src/**/*.{ts,tsx}"], [OPENAI]),

  limites(
    ["src/domain/**/*.{ts,tsx}"],
    [
      OPENAI,
      SERVIDOR,
      ...UI,
      modulo("contracts", "domain no depende de contracts."),
      modulo("lib", "domain no depende de lib."),
      {
        regex: "^(react|react-dom|next)(/|$)",
        message: "domain es TypeScript puro: sin React ni Next.",
      },
    ],
  ),

  limites(
    ["src/contracts/**/*.{ts,tsx}"],
    [
      OPENAI,
      SERVIDOR,
      ...UI,
      modulo("lib", "contracts solo depende de domain."),
    ],
  ),

  limites(["src/server/**/*.{ts,tsx}"], [OPENAI, ...UI]),

  limites(
    ["src/server/interview/**/*.{ts,tsx}"],
    [
      OPENAI,
      ...UI,
      {
        regex: "^@/server/(?!llm/port$|interview(/|$))",
        message:
          "La entrevista solo depende del puerto @/server/llm/port, no de adaptadores ni de otras capas del servidor.",
      },
    ],
  ),

  limites(
    ["src/server/llm/openai/**/*.{ts,tsx}"],
    [
      ...UI,
      modulo("domain", "El adaptador no conoce el dominio (ADR-0002)."),
      modulo("contracts", "El adaptador no conoce los contratos HTTP."),
      {
        regex: "^@/server/(?!llm/port$|llm/openai(/|$))",
        message: "El adaptador solo depende del puerto @/server/llm/port.",
      },
    ],
  ),

  limites(
    ["src/{features,components,lib}/**/*.{ts,tsx}"],
    [
      OPENAI,
      SERVIDOR,
      modulo("app", "Las rutas de Next no se importan desde aquí."),
    ],
  ),

  limites(
    ["src/app/**/*.{ts,tsx}"],
    [
      OPENAI,
      {
        regex: "^@/server/(?!composition$|http(/|$))",
        message:
          "Las rutas de Next solo usan @/server/composition y @/server/http.",
      },
    ],
  ),

  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
