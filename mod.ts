import { getCallerFromError } from "./error.ts";
import * as path from "@std/path";
import { ResultStore } from "./store.ts";
import * as esbuild from "esbuild";
import { denoPlugins } from "@luca/esbuild-deno-loader";
import CodeBlockWriter from "code-block-writer";
import { serveDir } from "@std/http/file-server"

type TemplatesRecord = Record<
  string,
  BenchTemplate<BenchDefinition<string>, BaseBenchScenario, unknown, unknown>
>;

export interface InitOptions<TTemplates extends TemplatesRecord> {
  templates: TTemplates;
  root?: string;
}

export interface BenchDefinition<TTemplate extends string> {
  template: TTemplate;
}

export interface ReportData<TScenario, TResult> {
  scenarios: ReportDataScennarioResult<TScenario, TResult>[];
}

export interface ReportDataScennarioResult<TScenario, TResult> {
  scenario: TScenario;
  result: TResult | undefined;
}

export interface RunContext {
  cwd: string;
}

export interface BaseBenchScenario {
  key: string;
}

export interface BenchTemplate<
  TDefinition extends BenchDefinition<string>,
  TScenario extends BaseBenchScenario,
  TResult,
  TFrontendResult
> {
  frontendFilePath: string;
  collectScenarios(definition: TDefinition): Promise<TScenario[]> | TScenario[];
  systemSupportsScenario?(scenario: TScenario): Promise<boolean> | boolean;
  run(scenario: TScenario, context: RunContext): Promise<TResult> | TResult;
  mapForFrontend(reportData: ReportData<TScenario, TResult>): Promise<TFrontendResult> | TFrontendResult;
}

export function createContext<TTemplates extends TemplatesRecord>(
  options: InitOptions<TTemplates>,
) {
  const root = options.root ?? path.dirname(getCallerFromError(new Error()));
  return new Context({
    ...options,
    root,
  });
}

interface BenchDefinitionWithPath<TBenchDefinition> {
  filePath: string;
  definition: TBenchDefinition;
}

type ExtractScenario<TTemplate> = TTemplate[keyof TTemplate] extends
  BenchTemplate<any, infer TScenario, any, any>
  ? TScenario
  : never;

type ExtractResult<TTemplate> = TTemplate[keyof TTemplate] extends
  BenchTemplate<any, any, infer TResult, any>
  ? TResult
  : never;

export class Context<
  TTemplate extends TemplatesRecord,
  TBenchDefinitions extends BenchDefinition<string> =
    TTemplate[keyof TTemplate] extends
      BenchTemplate<infer TDef, BaseBenchScenario, unknown, unknown> ? TDef
      : never,
> {
  readonly templates: TTemplate;
  readonly #root: string;
  #definitions: BenchDefinitionWithPath<TBenchDefinitions>[] = [];

  constructor(options: InitOptions<TTemplate>) {
    this.templates = options.templates;
    this.#root = options.root ?? path.dirname(getCallerFromError(new Error()));
  }

  defineBench(definition: TBenchDefinitions) {
    const filePath = getCallerFromError(new Error());
    this.#definitions.push({
      filePath,
      definition,
    });
  }

  async runBenchmarks() {
    for await (const scenarioGroup of this.#collectScenarioGroups()) {
      const resultStore = new ResultStore(scenarioGroup.resultsDirPath);
      console.error(`Running ${scenarioGroup.name}...`);
      for (const scenario of scenarioGroup.scenarios) {
        const supported =
          (await scenarioGroup.template.systemSupportsScenario?.(scenario)) ?? true;
        if (!supported) {
          continue;
        }
        if (resultStore.get(scenario.key) != null) {
          continue;
        }
        const result = await scenarioGroup.template.run(scenario, {
          cwd: path.dirname(scenarioGroup.filePath),
        });
        resultStore.set(scenario.key, result);
      }
    }
  }

  async buildFrontend(opts: {
    outputDir: string;
    dev: boolean;
  }) {
    opts.outputDir = path.resolve(opts.outputDir);
    if (opts.dev) {
      let socket: WebSocket | undefined;
      const server = Deno.serve((req) => {
        if (req.headers.get("upgrade") === "websocket") {
          const details = Deno.upgradeWebSocket(req);
          socket = details.socket;
          return details.response;
        }
        return serveDir(req, {
          fsRoot: opts.outputDir,
        })
      });
      while (true) {
        console.error("Building...");
        await this.#build({
          outputDir: opts.outputDir,
          devPort: server.addr.port,
        });
        if (socket != null) {
          socket.send("reload");
          socket = undefined;
        }
        using watcher = Deno.watchFs(this.#root, { recursive: true });
        console.error("Watching...");
        const iterator = watcher[Symbol.asyncIterator]();
        while (true) {
          const event = await iterator.next();
          // ignore events in the output directory
          const value = event.value as Deno.FsEvent;
          if (!value.paths.every((p) => p.startsWith(opts.outputDir))) {
            break;
          }
        }
      }
    } else {
      await this.#build({
        outputDir: opts.outputDir,
        devPort: undefined,
      });
    }
  }

  async #build(opts: {
    outputDir: string;
    devPort: number | undefined;
  }) {
    const benches = [];
    const outputDir = opts.outputDir;
    Deno.mkdirSync(outputDir, { recursive: true });
    for await (const benchResult of this.collectBenchResults()) {
      const template = benchResult.template;
      const templateName = this.#getTemplateName(template);
      const data = template.mapForFrontend({
        scenarios: benchResult.results,
      });
      Deno.writeTextFileSync(path.join(outputDir, `data${benches.length}.json`), JSON.stringify(data));
      benches.push({
        name: benchResult.name,
        templateName,
      })
    }

    const outputFilePath = path.join(outputDir, "website.ts");
    const writer = new CodeBlockWriter();
    Deno.writeTextFileSync(path.join(outputDir, "benches.json"), JSON.stringify(benches));
    writer.writeLine(`import benches from "./benches.json" with { type: "json" };`);
    for (const [name, template] of Object.entries(this.templates)) {
      writer.writeLine(`import template_${name} from "${path.relative(outputDir, template.frontendFilePath).replaceAll("\\", "/")}";`);
    }
    for (const name of Object.keys(this.templates)) {
      writer.write(`const templates = `).inlineBlock(() => {
        writer.writeLine(`"${name}": template_${name},`);
      }).write(";").newLine();
    }
    writer.writeLine(`const body = document.body;`)
    writer.write(`for (let i = 0; i < benches.length; i++)`).block(() => {
      writer.writeLine(`const bench = benches[i];`);
      writer.writeLine(`const div = document.createElement("div");`);
      writer.writeLine(`const title = document.createElement("h2");`);
      writer.writeLine(`title.textContent = bench.name;`);
      writer.writeLine(`div.appendChild(title)`);
      writer.writeLine(`const template = templates[bench.templateName];`);
      writer.writeLine(`fetch("./data" + i + ".json").then(res => res.json()).then(data => `).inlineBlock(() => {
        writer.writeLine(`const element = template({ data });`);
        writer.writeLine(`div.appendChild(element);`);
      }).write(").catch(err => ").inlineBlock(() => {
        writer.writeLine(`const error = document.createElement("p");`);
        writer.writeLine(`error.textContent = String(err);`);
        writer.writeLine(`div.appendChild(error);`);
      }).write(");").newLine();
      writer.writeLine(`body.appendChild(div);`);
    });
    if (opts.devPort != null) {
      writer.writeLine(`const ws = new WebSocket("ws://localhost:${opts.devPort}");`);
      writer.writeLine(`ws.onmessage = () => location.reload();`);
      writer.write(`ws.onclose = async () => `).inlineBlock(() => {
        // check for when the server is back online
        writer.write("while (true)").block(() => {
          writer.writeLine("await new Promise((resolve) => setTimeout(resolve, 1_000));");
          writer.write(`await fetch("http://localhost:${opts.devPort}/", { signal: AbortSignal.timeout(1000) }).then(() => `).inlineBlock(() => {
            writer.writeLine("location.reload();");
          }).write(").catch(() => {});");
        });
      }).write(";").newLine();
    }
    Deno.writeTextFileSync(outputFilePath, writer.toString());
    Deno.writeTextFileSync(path.join(outputDir, "index.html"), `<!DOCTYPE html><html><body><script type="module" src="./website.js"></script></body></html>`);
    await esbuild.build({
      plugins: [...denoPlugins()],
      entryPoints: [path.toFileUrl(outputFilePath).toString()],
      outfile: path.join(outputDir, "website.js"),
      bundle: true,
      format: "esm",
    });
  }

  #getTemplateName(template: BenchTemplate<any, any, any, any>) {
    for (const [name, t] of Object.entries(this.templates)) {
      if (t === template) {
        return name;
      }
    }
    throw new Error("Template not found.");
  }

  async *collectBenchResults(): AsyncIterable<{
    name: string;
    dirPath: string;
    template: BenchTemplate<BenchDefinition<string>, BaseBenchScenario, unknown, unknown>;
    results: ReportDataScennarioResult<ExtractScenario<TTemplate>, ExtractResult<TTemplate>>[];
  }> {
    for await (const scenarioGroup of this.#collectScenarioGroups()) {
      const resultStore = new ResultStore(scenarioGroup.resultsDirPath);
      const results: ReportDataScennarioResult<ExtractScenario<TTemplate>, ExtractResult<TTemplate>>[] = [];
      for (const scenario of scenarioGroup.scenarios) {
        const result = resultStore.get(scenario.key);
        if (result != null) {
          results.push({
            scenario: scenario as ExtractScenario<TTemplate>,
            result,
          });
        }
      }
      yield {
        name: scenarioGroup.name,
        dirPath: scenarioGroup.dirPath,
        template: scenarioGroup.template,
        results,
      };
    }
  }

  async *#collectScenarioGroups() {
    await this.#discoverBenchFiles();
    for (const definition of this.#definitions) {
      const template = this.templates[definition.definition.template];
      if (template == null) {
        throw new Error(
          `Unknown template '${template}' (Known: ${
            Object.keys(this.templates).join(", ")
          }). Ensure you specify this when creating a context.\n    at ${definition.filePath}`,
        );
      }
      const scenarios = await template.collectScenarios(definition.definition);
      const testDirPath = path.dirname(definition.filePath);
      const relativeTestDirPath = path.relative(this.#root, testDirPath);
      yield {
        name: relativeTestDirPath.replace(/[\\\/]/g, "::"),
        dirPath: testDirPath,
        ...definition,
        template,
        resultsDirPath: path.join(testDirPath, "__results__"),
        scenarios,
      };
    }
  }

  async #discoverBenchFiles() {
    for (
      const benchPath of discoverFilesInDirs(
        path.join(this.#root, "benches"),
        "__bench__.ts",
      )
    ) {
      await import(path.toFileUrl(benchPath).toString());
    }
    this.#definitions.sort((a, b) => a.filePath.localeCompare(b.filePath));
  }
}

function* discoverFilesInDirs(root: string, fileName: string) {
  const pendingDirs = [root];
  while (pendingDirs.length > 0) {
    const dir = pendingDirs.pop()!;
    const childEntries = Deno.readDirSync(dir);
    const currentPendingDirs = [];
    let found = false;
    let hadChildEntry = false;
    for (const entry of childEntries) {
      hadChildEntry = true;
      if (entry.isDirectory) {
        currentPendingDirs.push(`${dir}/${entry.name}`);
      } else if (entry.isFile && entry.name === fileName) {
        yield `${dir}/${entry.name}`;
        found = true;
        break;
      }
    }
    if (!found) {
      if (currentPendingDirs.length === 0 && hadChildEntry) {
        throw new Error(
          `Couldn't find ${fileName} in directory tree of ${dir}. ${fileName} must exist in ${dir} or any of its ancestor directories.`,
        );
      }
      pendingDirs.push(...currentPendingDirs);
    }
  }
}
