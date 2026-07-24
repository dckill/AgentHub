type Sodium = typeof import('libsodium-wrappers')['default'];

let implementation: Sodium | null = null;
let ready: Promise<void> | null = null;

function ensureReady(): Promise<void> {
    if (!ready) {
        ready = import('libsodium-wrappers').then(async ({ default: sodium }) => {
            await sodium.ready;
            implementation = sodium;
        });
    }
    return ready;
}

const sodium = new Proxy({} as Sodium, {
    get(_target, property) {
        if (property === 'ready') {
            return ensureReady();
        }
        if (!implementation) {
            throw new Error('libsodium is not ready');
        }
        const value = Reflect.get(implementation, property, implementation);
        return typeof value === 'function' ? value.bind(implementation) : value;
    },
});

export default sodium;
