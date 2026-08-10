type WritableStdin = {
    writable?: boolean;
    write: (line: string) => void;
};

/** Serialize exactly one Codex JSON-RPC message and write it only to a live stdin. */
export function writeCodexTransportMessage({
    stdin,
    message,
}: {
    stdin?: WritableStdin | null;
    message: unknown;
}): boolean {
    if (!stdin?.writable) {
        return false;
    }
    stdin.write(`${JSON.stringify(message)}\n`);
    return true;
}
