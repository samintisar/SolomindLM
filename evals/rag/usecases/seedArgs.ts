import { resolveUseCaseIds } from "./ids";

const USAGE = "bun run eval:seed [-- --use-case <ids|all>] [--reingest]";

export interface SeedArgs {
  packIds: string[];
  /** Re-process sources whose content is unchanged (after an ingestion fix) */
  reingest: boolean;
}

/**
 * Parse `eval:seed` arguments into the pack ids to seed and the reingest flag.
 * Throws an Error whose message is ready to print. No `--use-case` (or `all`)
 * selects every known pack; ids themselves are validated by the caller against
 * the registry.
 */
export function parseSeedArgs(argv: string[], knownIds: string[]): SeedArgs {
  let value: string | undefined;
  let sawUseCase = false;
  let reingest = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--reingest") {
      reingest = true;
    } else if (arg === "--use-case") {
      sawUseCase = true;
      value = argv[i + 1];
      i++;
    } else if (arg.startsWith("--use-case=")) {
      sawUseCase = true;
      value = arg.slice("--use-case=".length);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option ${arg}. Usage: ${USAGE}`);
    } else {
      throw new Error(`Unexpected argument ${arg}. Usage: ${USAGE}`);
    }
  }
  const packIds = sawUseCase ? resolveUseCaseIds(value, knownIds) : [...knownIds];
  return { packIds, reingest };
}
