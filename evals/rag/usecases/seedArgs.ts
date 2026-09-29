import { resolveUseCaseIds } from "./ids";

const USAGE = "bun run eval:seed [-- --use-case <ids|all>]";

/**
 * Parse `eval:seed` arguments into the pack ids to seed. Throws an Error whose
 * message is ready to print. No arguments (or `all`) selects every known pack;
 * ids themselves are validated by the caller against the registry.
 */
export function parseSeedArgs(argv: string[], knownIds: string[]): string[] {
  let value: string | undefined;
  let sawUseCase = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--use-case") {
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
  if (!sawUseCase) return [...knownIds];

  return resolveUseCaseIds(value, knownIds);
}
