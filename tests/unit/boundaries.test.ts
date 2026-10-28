import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Ejecuta ESLint sobre archivos virtuales para comprobar los límites de
// import de docs/ARCHITECTURE.md §4.4 sin crear archivos en src/.

const eslint = new ESLint({ cwd: process.cwd() });

async function reglasVioladas(filePath: string, codigo: string) {
  const [resultado] = await eslint.lintText(codigo, { filePath });
  return (resultado?.messages ?? []).map((m) => m.ruleId);
}

const importar = (especificador: string) =>
  `import * as m from "${especificador}";\nexport const usado = m;\n`;

describe("límites de import", () => {
  it.each([
    ["src/features/chat/composer.tsx", "@/server/interview/engine"],
    ["src/features/chat/composer.tsx", "../../server/interview/engine"],
    ["src/server/interview/engine.ts", "openai"],
    ["src/server/interview/engine.ts", "@/server/llm/openai/client"],
    ["src/server/interview/engine.ts", "@/server/llm/fake/client"],
    ["src/domain/requirement/schema.ts", "react"],
    ["src/domain/requirement/schema.ts", "@/contracts/interview"],
    ["src/server/llm/openai/client.ts", "@/domain/requirement/schema"],
    ["src/app/api/interview/route.ts", "@/server/security/access"],
  ])("%s no puede importar %s", async (archivo, especificador) => {
    expect(await reglasVioladas(archivo, importar(especificador))).toContain(
      "no-restricted-imports",
    );
  });

  it.each([
    ["src/server/llm/openai/client.ts", "openai"],
    ["src/server/llm/openai/client.ts", "@/server/llm/port"],
    ["src/server/interview/engine.ts", "@/server/llm/port"],
    ["src/server/interview/engine.ts", "@/domain/requirement/schema"],
    ["src/features/chat/composer.tsx", "@/domain/session/reducer"],
    ["src/app/api/interview/route.ts", "@/server/composition"],
    ["src/app/api/interview/route.ts", "@/server/http/interview-handler"],
  ])("%s puede importar %s", async (archivo, especificador) => {
    expect(
      await reglasVioladas(archivo, importar(especificador)),
    ).not.toContain("no-restricted-imports");
  });

  it("prohíbe dangerouslySetInnerHTML", async () => {
    const codigo =
      'export const C = () => <div dangerouslySetInnerHTML={{ __html: "x" }} />;\n';
    expect(
      await reglasVioladas("src/features/chat/message.tsx", codigo),
    ).toContain("react/no-danger");
  });
}, 60_000);
