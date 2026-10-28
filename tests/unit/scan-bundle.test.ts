import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { escanear } from "../../scripts/scan-bundle.mjs";

// El escaneo del bundle (PLAN F8.4) tiene que encontrar un centinela inyectado.
// Los centinelas se arman en tiempo de ejecución para que el escaneo de
// secretos del repo no los confunda con keys reales.

const conFormaDeKey = ["s", "k-", "proj-", "C".repeat(24)].join("");

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "scan-bundle-"));
  await mkdir(path.join(dir, "chunks"));
  await writeFile(path.join(dir, "chunks", "app.js"), "console.log('hola')");
  await writeFile(
    path.join(dir, "estilos.css"),
    ".a{-webkit-mask-image:none;mask-size:cover}",
  );
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("scan-bundle", () => {
  it("un bundle limpio no tiene hallazgos, aunque el CSS use mask-", async () => {
    expect(await escanear(dir)).toEqual([]);
  });

  it("encuentra un string con forma de key en un chunk anidado", async () => {
    await writeFile(
      path.join(dir, "chunks", "x.js"),
      `const k="${conFormaDeKey}"`,
    );
    expect(await escanear(dir)).toEqual([
      {
        archivo: path.join(dir, "chunks", "x.js"),
        que: "key con forma de OpenAI",
      },
    ]);
  });

  it("encuentra el nombre de la variable de la key", async () => {
    await writeFile(
      path.join(dir, "chunks", "y.js"),
      ["process.env.OPENAI", "API", "KEY"].join("_"),
    );
    expect(await escanear(dir)).toHaveLength(1);
  });

  it("encuentra el valor de una variable sensible definida, sin repetirlo", async () => {
    const centinela = `centinela-${"9".repeat(12)}`;
    await writeFile(path.join(dir, "chunks", "z.js"), `x="${centinela}"`);
    const hallazgos = await escanear(dir, { ACCESS_CODE: centinela });
    expect(hallazgos).toEqual([
      {
        archivo: path.join(dir, "chunks", "z.js"),
        que: "el valor de ACCESS_CODE",
      },
    ]);
    expect(JSON.stringify(hallazgos)).not.toContain(centinela);
  });
});
