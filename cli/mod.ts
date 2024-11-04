// 1. Bench environment
//   - This represents where a benchmark is running (ex. Linux machine, with a certain set of hardware)
// 2. Bench definition
// 3. Bench definition kind

import { getCallerFromError } from "./error.ts";
import * as path from "@std/path";

type DefinitionKindsRecord = Record<string, BenchDefinitionKind<any, any, any>>;

export interface InitOptions<TDefinitionKinds extends DefinitionKindsRecord> {
  definitionKinds: TDefinitionKinds;
  root?: string;
}


export interface BenchDefinition<TKind extends string> {
  kind: TKind;
}

export interface ReportData<TCase, TData> {
  name: string;
  cases: { case: TCase, data: TData; }[];
}

export interface RunContext {
  cwd: string;
}

export interface BaseBenchCase {
  setup?(): Promise<void>;
}

export interface BenchDefinitionKind<TDefinition extends BenchDefinition<string>, TCase extends BaseBenchCase, TData> {
  collectCases(definition: TDefinition): Promise<TCase[]>;
  run(cases: TCase, context: RunContext): Promise<TData>;
  renderReport(report: ReportData<TCase, TData>): Promise<string>;
}

export function createContext<TDefinitionKinds extends DefinitionKindsRecord>(options: InitOptions<TDefinitionKinds>) {
  const root = options.root ?? path.dirname(getCallerFromError(new Error()));
  return new Context({
    ...options,
    root,
  });
}

interface BenchDefinitionWithPath<TBenchDefinition> {
  filePath: string;
  definition: TBenchDefinition,
}

export class Context<
  TDefinitionKinds extends DefinitionKindsRecord,
  TBenchDefinitions extends BenchDefinition<string> = TDefinitionKinds[keyof TDefinitionKinds] extends BenchDefinitionKind<infer TDef, any, any> ? TDef : never
> {
  readonly #definitionKinds: TDefinitionKinds;
  readonly #root: string;
  #definitions: BenchDefinitionWithPath<TBenchDefinitions>[] = [];

  constructor(options: InitOptions<TDefinitionKinds>) {
    this.#definitionKinds = options.definitionKinds;
    this.#root = options.root ?? path.dirname(getCallerFromError(new Error()));

    setTimeout(() => {
      this.#run(Deno.args).catch(err => {
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

  async #run(args: string []) {
    if (args.length === 0) {
      for await (const caseGroup of this.#collectCases()) {
        for (const caseItem of caseGroup.cases) {
          const result = await caseGroup.definitionKind.run(caseItem, {
            cwd: path.dirname(caseGroup.filePath),
          });
          console.log(result);
        }
      }
    } else {
      throw new Error("Unknown cli arguments.")
    }
  }

  async *#collectCases() {
    await this.#discoverBenchFiles();
    for (const definition of this.#definitions) {
      const kind = definition.definition.kind;
      const definitionKind = this.#definitionKinds[kind];
      if (definitionKind == null) {
        throw new Error(`Unknown definition kind '${kind}' (Known: ${Object.keys(this.#definitionKinds).join(", ")}). Ensure you specify this when creating a context.\n    at ${definition.filePath}`);
      }
      const cases = await definitionKind.collectCases(definition.definition);
      yield {
        ...definition,
        definitionKind,
        cases,
      };
    }
  }

  async #discoverBenchFiles() {
    for (const benchPath of discoverFilesInDirs(path.join(this.#root, "benches"), "__bench__.ts")) {
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
        throw new Error(`Couldn't find ${fileName} in directory tree of ${dir}. ${fileName} must exist in the ${dir} or any of its parents.`);
      }
      pending.push(...currentPending);
    }
  }
}