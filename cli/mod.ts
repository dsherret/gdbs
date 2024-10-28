// 1. Bench environment
//   - This represents where a benchmark is running (ex. Linux machine, with a certain set of hardware)
// 2. Bench definition
// 3. Bench definition kind

type DefinitionKindsRecord = Record<string, BenchDefinitionKind<any, any>>;

export interface InitOptions<TDefinitionKinds extends DefinitionKindsRecord> {
  definitionKinds: TDefinitionKinds;
}


export interface BenchDefinition<TKind extends string> {
  kind: TKind;
}

export interface ReportData<TData> {
  name: string;
  data: TData;
}

export interface RunContext {
  cwd: string;
}

export interface BenchDefinitionKind<TDefinition extends BenchDefinition<string>, TData> {
  run(definition: TDefinition, context: RunContext): Promise<TData>;
  renderReport(report: ReportData<TData>): Promise<string>;
}

export function createContext<TDefinitionKinds extends DefinitionKindsRecord>(options: InitOptions<TDefinitionKinds>) {
  return new Context(options);
}

export class Context<
  TDefinitionKinds extends DefinitionKindsRecord,
  TBenchDefinitions = TDefinitionKinds[keyof TDefinitionKinds] extends BenchDefinitionKind<infer TDef, any> ? TDef : never
> {
  constructor(options: InitOptions<TDefinitionKinds>) {

  }

  defineBench(definition: TBenchDefinitions) {

  }
}