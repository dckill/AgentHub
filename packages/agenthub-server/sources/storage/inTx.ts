import { Prisma } from "@prisma/client";
import { delay } from "@/utils/delay";
import { db } from "@/storage/db";

export type Tx = Prisma.TransactionClient;

const symbol = Symbol();

type AfterTxCallback = () => void | Promise<void>;

export function afterTx(tx: Tx, callback: AfterTxCallback) {
    let callbacks = (tx as any)[symbol] as AfterTxCallback[];
    callbacks.push(callback);
}

export async function inTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    let counter = 0;
    let wrapped = async (tx: Tx) => {
        (tx as any)[symbol] = [];
        let result = await fn(tx);
        let callbacks = (tx as any)[symbol] as AfterTxCallback[];
        return { result, callbacks };
    }
    while (true) {
        try {
            let result = await db.$transaction(wrapped, { isolationLevel: 'Serializable', timeout: 10000 });
            for (let callback of result.callbacks) {
                try {
                    await callback();
                } catch (e) { // Ignore errors in callbacks because they are used mostly for notifications
                    console.error(e);
                }
            }
            return result.result;
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError) {
                if (e.code === 'P2034' && counter < 3) {
                    counter++;
                    await delay(counter * 100);
                    continue;
                }
            }
            throw e;
        }
    }
}
