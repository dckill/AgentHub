import axios from 'axios'
import { logger } from '@/ui/logger'
import { Expo, ExpoPushMessage } from 'expo-server-sdk'
import type { Metadata } from './types'
import { configuration } from '@/configuration'

export interface PushToken {
    id: string
    token: string
    createdAt: number
    updatedAt: number
}

export type SessionNotificationKind = 'done' | 'permission' | 'question'

function getPathBasename(path: string | null | undefined): string | null {
    const trimmed = path?.trim()
    if (!trimmed) {
        return null
    }

    const segments = trimmed.split(/[\\/]/).filter(Boolean)
    return segments[segments.length - 1] || null
}

function getProjectTitle(metadata: Metadata | null | undefined): string {
    const name = metadata?.name?.trim()
    if (name) {
        return name
    }

    return getPathBasename(metadata?.path) ?? '会话'
}

function getSessionTitle(metadata: Metadata | null | undefined): string {
    const summaryText = metadata?.summary?.text?.trim()
    if (summaryText) {
        return summaryText
    }

    const lastUserMessage = metadata?.lastUserMessage?.trim()
    if (lastUserMessage) {
        return lastUserMessage
    }

    return getProjectTitle(metadata)
}

function getProviderLabel(provider: unknown): string {
    switch (provider) {
        case 'codex':
            return 'Codex'
        case 'claude':
            return 'Claude Code'
        default:
            return '智能体'
    }
}

function getRequestDetail(data: Record<string, any> | undefined): string | null {
    const provider = getProviderLabel(data?.provider)
    const tool = typeof data?.tool === 'string' ? data.tool.trim() : ''
    const type = data?.type ?? (tool === 'AskUserQuestion' ? 'question_request' : (tool ? 'permission_request' : null))

    if (type === 'permission_request') {
        return tool ? `${provider} 请求执行：${tool}` : `${provider} 需要授权`
    }

    if (type === 'question_request') {
        return `${provider} 需要你确认`
    }

    return null
}

function getSessionNotificationUrl(data: Record<string, any> | undefined): `/session/${string}` | null {
    const sessionId = data?.sessionId
    if (typeof sessionId !== 'string') {
        return null
    }

    const trimmedSessionId = sessionId.trim()
    if (!trimmedSessionId) {
        return null
    }

    return `/session/${encodeURIComponent(trimmedSessionId)}`
}

export function getSessionNotificationTitle(
    kind: SessionNotificationKind
): string {
    switch (kind) {
        case 'done':
            return '✅ 任务完成'
        case 'permission':
            return '🔐 需要授权'
        case 'question':
            return '💬 需要你确认'
    }
}

export function getSessionNotificationBody(
    metadata: Metadata | null | undefined,
    data?: Record<string, any>
): string {
    const parts = [
        getProjectTitle(metadata),
        getSessionTitle(metadata),
        getRequestDetail(data),
    ].filter((part): part is string => !!part?.trim())

    return parts.filter((part, index) => parts.indexOf(part) === index).join(' · ')
}

export function getSessionNotificationCopy(
    kind: SessionNotificationKind,
    metadata: Metadata | null | undefined,
    data?: Record<string, any>
): { title: string; body: string } {
    return {
        title: getSessionNotificationTitle(kind),
        body: getSessionNotificationBody(metadata, data),
    }
}

export class PushNotificationClient {
    private readonly token: string
    private readonly baseUrl: string
    private readonly expo: Expo

    constructor(token: string, baseUrl: string = configuration.serverUrl) {
        this.token = token
        this.baseUrl = baseUrl
        this.expo = new Expo()
    }

    /**
     * Fetch all push tokens for the authenticated user.
     * Retries up to 3 times with exponential backoff on transient errors.
     */
    async fetchPushTokens(): Promise<PushToken[]> {
        const maxAttempts = 3
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const response = await axios.get<{ tokens: PushToken[] }>(
                    `${this.baseUrl}/v1/push-tokens`,
                    {
                        headers: {
                            'Authorization': `Bearer ${this.token}`,
                            'Content-Type': 'application/json',
                            'X-AgentHub-Client': `cli-daemon/${configuration.currentCliVersion}`
                        }
                    }
                )

                logger.debug(`Fetched ${response.data.tokens.length} push tokens`)

                // Log token information
                response.data.tokens.forEach((token, index) => {
                    logger.debug(`[PUSH] Token ${index + 1}: id=${token.id}, created=${new Date(token.createdAt).toISOString()}, updated=${new Date(token.updatedAt).toISOString()}`)
                })

                return response.data.tokens
            } catch (error) {
                logger.debug(`[PUSH] [ERROR] Failed to fetch push tokens (attempt ${attempt}/${maxAttempts}):`, error)
                if (attempt < maxAttempts) {
                    const delay = 1000 * Math.pow(2, attempt - 1) // 1s, 2s
                    await new Promise(resolve => setTimeout(resolve, delay))
                }
            }
        }
        logger.debug('[PUSH] [ERROR] All push token fetch attempts failed')
        return []
    }

    /**
     * Send push notification via Expo Push API with retry
     * @param messages - Array of push messages to send
     */
    async sendPushNotifications(messages: ExpoPushMessage[]): Promise<void> {
        logger.debug(`Sending ${messages.length} push notifications`)

        // Filter out invalid push tokens
        const validMessages = messages.filter(message => {
            if (Array.isArray(message.to)) {
                return message.to.every(token => Expo.isExpoPushToken(token))
            }
            return Expo.isExpoPushToken(message.to)
        })

        if (validMessages.length === 0) {
            logger.debug('No valid Expo push tokens found')
            return
        }

        // Create chunks to respect Expo's rate limits
        const chunks = this.expo.chunkPushNotifications(validMessages)

        for (const chunk of chunks) {
            // Retry with exponential backoff for 5 minutes
            const startTime = Date.now()
            const timeout = 300000 // 5 minutes
            let attempt = 0
            
            while (true) {
                try {
                    const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk)
                    
                    // Log any errors but don't throw
                    const errors = ticketChunk.filter(ticket => ticket.status === 'error')
                    if (errors.length > 0) {
                        const errorDetails = errors.map(e => ({ message: e.message, details: e.details }))
                        logger.debug('[PUSH] Some notifications failed:', errorDetails)
                    }
                    
                    // If all notifications failed, throw to trigger retry
                    if (errors.length === ticketChunk.length) {
                        throw new Error('All push notifications in chunk failed')
                    }
                    
                    // Success - break out of retry loop
                    break
                } catch (error) {
                    const elapsed = Date.now() - startTime
                    if (elapsed >= timeout) {
                        logger.debug('[PUSH] Timeout reached after 5 minutes, giving up on chunk')
                        break
                    }
                    
                    // Calculate exponential backoff delay
                    attempt++
                    const delay = Math.min(1000 * Math.pow(2, attempt), 30000) // Max 30 seconds between retries
                    const remainingTime = timeout - elapsed
                    const waitTime = Math.min(delay, remainingTime)
                    
                    if (waitTime > 0) {
                        logger.debug(`[PUSH] Retrying in ${waitTime}ms (attempt ${attempt})`)
                        await new Promise(resolve => setTimeout(resolve, waitTime))
                    }
                }
            }
        }

        logger.debug(`Push notifications sent successfully`)
    }

    /**
     * Send a push notification to all registered devices for the user
     * @param title - Notification title
     * @param body - Notification body
     * @param data - Additional data to send with the notification
     */
    sendToAllDevices(title: string, body?: string, data?: Record<string, any>): void {
        logger.debug(`[PUSH] sendToAllDevices called with title: "${title}", body: "${body ?? ''}"`);
        
        // Execute async operations without awaiting
        (async () => {
            try {
                // Fetch all push tokens
                logger.debug('[PUSH] Fetching push tokens...')
                const tokens = await this.fetchPushTokens()
                logger.debug(`[PUSH] Fetched ${tokens.length} push tokens`)
                
                // Log token details for debugging
                tokens.forEach((token, index) => {
                    logger.debug(`[PUSH] Using token ${index + 1}: id=${token.id}`)
                })

                if (tokens.length === 0) {
                    logger.debug('No push tokens found for user')
                    return
                }

                // Create messages for all tokens
                const messages: ExpoPushMessage[] = tokens.map((token, index) => {
                    logger.debug(`[PUSH] Creating message ${index + 1} for token`)
                    return {
                        to: token.token,
                        title,
                        body: body && body.length > 0 ? body : undefined,
                        data,
                        // TODO: For brutalist session artwork, attach rich media via a public HTTPS image URL.
                        // Bundled app asset paths / require(...) / local file paths will not work in push payloads.
                        // iOS also needs a Notification Service Extension to render richContent.image reliably.
                        sound: 'default',
                        priority: 'high'
                    }
                })

                // Send notifications
                logger.debug(`[PUSH] Sending ${messages.length} push notifications...`)
                await this.sendPushNotifications(messages)
                logger.debug('[PUSH] Push notifications sent successfully')
            } catch (error) {
                logger.debug('[PUSH] Error sending to all devices:', error)
            }
        })()
    }

    sendSessionNotification(params: {
        kind: SessionNotificationKind
        metadata: Metadata | null | undefined
        data?: Record<string, any>
    }): void {
        const { title, body } = getSessionNotificationCopy(params.kind, params.metadata, params.data)
        const sessionTitle = getSessionTitle(params.metadata)
        const url = getSessionNotificationUrl(params.data)
        this.sendToAllDevices(title, body, {
            ...params.data,
            kind: params.kind,
            sessionTitle,
            ...(url ? { url } : {}),
        })
    }
}
