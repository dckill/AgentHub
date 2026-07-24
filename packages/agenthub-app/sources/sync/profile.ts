import * as z from 'zod';

//
// Schema
//

export const ImageRefSchema = z.object({
    width: z.number(),
    height: z.number(),
    thumbhash: z.string(),
    path: z.string(),
    url: z.string()
});

export const ProfileSchema = z.object({
    id: z.string(),
    timestamp: z.number(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    avatar: ImageRefSchema.nullable(),
});

export type ImageRef = z.infer<typeof ImageRefSchema>;
export type Profile = z.infer<typeof ProfileSchema>;

//
// Defaults
//

export const profileDefaults: Profile = {
    id: '',
    timestamp: 0,
    firstName: null,
    lastName: null,
    avatar: null,
};
Object.freeze(profileDefaults);

//
// Parsing
//

export function profileParse(profile: unknown): Profile {
    const parsed = ProfileSchema.safeParse(profile);
    if (!parsed.success) {
        console.error('Failed to parse profile:', parsed.error);
        return { ...profileDefaults };
    }
    return parsed.data;
}

//
// Utility functions
//

export function getDisplayName(profile: Profile): string | null {
    if (profile.firstName || profile.lastName) {
        return [profile.firstName, profile.lastName].filter(Boolean).join(' ');
    }
    return null;
}

export function getAvatarUrl(profile: Profile): string | null {
    if (profile.avatar?.url) {
        return profile.avatar.url;
    }
    return null;
}