import { z } from "zod";
import { Fastify } from "../types";
import { db } from "@/storage/db";
import { getPublicUrl, ImageRef } from "@/storage/files";

export async function userRoutes(app: Fastify) {

    // Get user profile
    app.get('/v1/user/:id', {
        schema: {
            params: z.object({
                id: z.string()
            }),
            response: {
                200: z.object({
                    user: UserProfileSchema
                }),
                404: z.object({
                    error: z.literal('User not found')
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const { id } = request.params;

        // Fetch user
        const user = await db.account.findUnique({
            where: {
                id: id
            }
        });

        if (!user) {
            return reply.code(404).send({ error: 'User not found' });
        }

        return reply.send({
            user: buildUserProfile(user)
        });
    });

    // Search for users
    app.get('/v1/user/search', {
        schema: {
            querystring: z.object({
                query: z.string()
            }),
            response: {
                200: z.object({
                    users: z.array(UserProfileSchema)
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const { query } = request.query;

        // Search for users by username, first 10 matches
        const users = await db.account.findMany({
            where: {
                username: {
                    startsWith: query,
                    mode: 'insensitive'
                }
            },
            take: 10,
            orderBy: {
                username: 'asc'
            }
        });

        return reply.send({
            users: users.map(buildUserProfile)
        });
    });
};

// Shared Zod Schemas
const UserProfileSchema = z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string().nullable(),
    avatar: z.object({
        path: z.string(),
        url: z.string(),
        width: z.number().optional(),
        height: z.number().optional(),
        thumbhash: z.string().optional()
    }).nullable(),
    username: z.string(),
    bio: z.string().nullable()
});

function buildUserProfile(account: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
    avatar: ImageRef | null;
}) {
    const avatarJson = account.avatar;

    let avatar: z.infer<typeof UserProfileSchema>['avatar'] = null;
    if (avatarJson) {
        avatar = {
            path: avatarJson.path,
            url: getPublicUrl(avatarJson.path),
            width: avatarJson.width,
            height: avatarJson.height,
            thumbhash: avatarJson.thumbhash
        };
    }

    return {
        id: account.id,
        firstName: account.firstName || '',
        lastName: account.lastName,
        avatar,
        username: account.username || '',
        bio: null
    };
}
