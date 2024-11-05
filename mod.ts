// 1. Bench environment
//   - This represents where a benchmark is running (ex. Linux machine, with a certain set of hardware)
// 2. Bench definition
// 3. Bench template

import { getCallerFromError } from "./error.ts";
import * as path from "@std/path";
import { ResultStore } from "./store.ts";

type TemplatesRecord = Record<string, BenchTemplate<BenchDefinition<string>, BaseBenchCase, unknown>>;

export interface InitOptions<TTemplates extends TemplatesRecord> {
  templates: TTemplates;
  root?: string;
}

export interface BenchDefinition<TTemplate extends string> {
  Template: TTemplate;
}

export interface ReportData<TCase, TData> {
  name: string;
  cases: { case: TCase; data: TData }[];
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
  TData,
> {
  collectCases(definition: TDefinition): Promise<TCase[]>;
  run(caseItems: TCase, context: RunContext): Promise<TData>;
  renderReport(report: ReportData<TCase, TData>): Promise<string>;
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

    setTimeout(() => {
      this.#run(Deno.args).catch((err) => {
        console.error(err);
        Deno.exit(1);
      });
    }, 0);
  }

  defineBench(definition: TBenchDefinitions) {
    const filePath = getCallerFromError(new Error());
    this.#definitions.push({
      filePath,
      definition,
    });
  }

  async #run(args: string[]) {
    if (args.length === 0) {
      for await (const caseGroup of this.#collectCases()) {
        const resultStore = new ResultStore(
          path.join(path.dirname(caseGroup.filePath), "__results__")
        );
        for (const caseItem of caseGroup.cases) {
          if (resultStore.get(caseItem.key) != null) {
            continue;
          }
          const result = await caseGroup.template.run(caseItem, {
            cwd: path.dirname(caseGroup.filePath),
          });
          resultStore.set(caseItem.key, {
            data: result,
          });
        }
      }
    } else {
      throw new Error("Unknown cli arguments.");
    }
  }

  async *#collectCases() {
    await this.#discoverBenchFiles();
    for (const definition of this.#definitions) {
      const Template = definition.definition.Template;
      const template = this.templates[Template];
      if (template == null) {
        throw new Error(
          `Unknown definition Template '${Template}' (Known: ${
            Object.keys(this.templates).join(", ")
          }). Ensure you specify this when creating a context.\n    at ${definition.filePath}`,
        );
      }
      const cases = await template.collectCases(definition.definition);
      yield {
        ...definition,
        template,
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
