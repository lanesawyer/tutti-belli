import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const astroFiles = readdirSync("src", { recursive: true, encoding: "utf8" })
  .filter((path) => path.endsWith(".astro"))
  .map((path) => join("src", path));

describe("third-party stylesheets and scripts", () => {
  it("are pinned with an integrity hash", () => {
    const unpinned: string[] = [];
    for (const file of astroFiles) {
      const tags = readFileSync(file, "utf8").match(/<(link|script)\b[^>]*>/g) ?? [];
      for (const tag of tags) {
        if (/(href|src)="https?:\/\//.test(tag) && !/integrity="sha(384|512)-/.test(tag)) {
          unpinned.push(`${file}: ${tag.replace(/\s+/g, " ")}`);
        }
      }
    }
    expect(astroFiles.length).toBeGreaterThan(0);
    expect(unpinned).toEqual([]);
  });
});
