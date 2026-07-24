import * as z from 'zod';

//
// Schema
//

export const PurchasesSchema = z.object({
    activeSubscriptions: z.array(z.string()).describe('Active subscription product IDs'),
    entitlements: z.record(z.string(), z.boolean()).describe('Map of entitlement IDs to their active status'),
});

//
// NOTE: Purchases must be a flat object for forward/backward compatibility.
// The structure follows the same principles as settings:
// - Simple key-value pairs
// - No deep nesting
// - Preserved through schema changes
//

const PurchasesSchemaPartial = PurchasesSchema.passthrough().partial();

export type Purchases = z.infer<typeof PurchasesSchema>;

//
// Defaults
//

export const purchasesDefaults: Purchases = {
    activeSubscriptions: [],
    entitlements: {}
};
Object.freeze(purchasesDefaults);

//
// Resolving
//

export function purchasesParse(purchases: unknown): Purchases {
    const parsed = PurchasesSchemaPartial.safeParse(purchases);
    if (!parsed.success) {
        return { ...purchasesDefaults };
    }
    return { ...purchasesDefaults, ...parsed.data };
}