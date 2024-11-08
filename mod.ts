// 1. Bench environment
//   - This represents where a benchmark is running (ex. Linux machine, with a certain set of hardware)
// 2. Bench definition
// 3. Bench template

import { getCallerFromError } from "./error.ts";
import * as path from "@std/path";
import { ResultStore } from "./store.ts";

type TemplatesRecord = Record<
  string,
  BenchTemplate<BenchDefinition<string>, BaseBenchCase, unknown>
>;

export interface InitOptions<TTemplates extends TemplatesRecord> {
  templates: TTemplates;
  root?: string;
}

export interface BenchDefinition<TTemplate extends string> {
  template: TTemplate;
}

export interface ReportData<TCase, TResult> {
  cases: { caseItem: TCase; result: TResult | undefined }[];
}

export interface RunContext {
  cwd: string;
}

export interface BaseBenchCase {
  key: string;
  setup?(): Promise<void>;
}

export interface BenchTemplate<
  TDefinition extends BenchDefinition<string>,
  TCase extends BaseBenchCase,
  TResult,
> {
  collectCases(definition: TDefinition): Promise<TCase[]> | TCase[];
  systemSupportsCase?(caseItem: TCase): Promise<boolean> | boolean;
  run(caseItems: TCase, context: RunContext): Promise<TResult> | TResult;
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

export class Context<
  TTemplate extends TemplatesRecord,
  TBenchDefinitions extends BenchDefinition<string> =
    TTemplate[keyof TTemplate] extends BenchTemplate<infer TDef, BaseBenchCase, unknown>
      ? TDef
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
    for await (const caseGroup of this.#collectCases()) {
      const resultStore = new ResultStore(caseGroup.resultsDirPath);
      console.error(`Running ${caseGroup.name}...`)
      for (const caseItem of caseGroup.cases) {
        const supported = (await caseGroup.template.systemSupportsCase?.(caseItem)) ?? true;
        if (!supported) {
          continue;
        }
        if (resultStore.get(caseItem.key) != null) {
          continue;
        }
        const result = await caseGroup.template.run(caseItem, {
          cwd: path.dirname(caseGroup.filePath),
        });
        resultStore.set(caseItem.key, result);
      }
    }
  }

  async *collectBenchResults(): AsyncIterable<{
    name: string;
    dirPath: string;
    cases: {
      // todo: type this...
      caseItem: unknown,
      result: unknown | undefined,
    }[],
  }> {
    for await (const caseGroup of this.#collectCases()) {
      const resultStore = new ResultStore(caseGroup.resultsDirPath);
      yield {
        name: caseGroup.name,
        dirPath: caseGroup.dirPath,
        cases: caseGroup.cases.map(caseItem => ({
          caseItem,
          result: resultStore.get(caseItem.key),
        }))
      };
    }
  }

  async *#collectCases() {
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
      const cases = await template.collectCases(definition.definition);
      const testDirPath = path.dirname(definition.filePath);
      const relativeTestDirPath = path.relative(this.#root, testDirPath);
      yield {
        name: relativeTestDirPath.replace(/[\\\/]/g, "::"),
        dirPath: testDirPath,
        ...definition,
        template,
        resultsDirPath: path.join(testDirPath, "__results__"),
        cases,
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
  const pending = [root];
  while (pending.length > 0) {
    const dir = pending.pop()!;
    const subDirs = Deno.readDirSync(dir);
    const currentPending = [];
    let found = false;
    for (const entry of subDirs) {
      if (entry.isDirectory) {
        currentPending.push(`${dir}/${entry.name}`);
      } else if (entry.isFile && entry.name === fileName) {
        yield `${dir}/${entry.name}`;
        found = true;
        break;
      }
    }
    if (!found) {
      if (currentPending.length === 0) {
        throw new Error(
          `Couldn't find ${fileName} in directory tree of ${dir}. ${fileName} must exist in the ${dir} or any of its parents.`,
        );
      }
      pending.push(...currentPending);
    }
  }
}
