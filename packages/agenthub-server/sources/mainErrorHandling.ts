/**
 * Keep the server launcher failure path non-zero without forcing an immediate
 * process exit that could skip pending cleanup handlers.
 */
export function handleMainError(
    error: unknown,
    setExitCode: (code: number) => void = (code) => {
        process.exitCode = code;
    },
): void {
    console.error(error);
    setExitCode(1);
}
