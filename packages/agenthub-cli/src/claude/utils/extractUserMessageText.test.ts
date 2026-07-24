import { describe, it, expect } from 'vitest'
import { extractUserMessageText } from './extractUserMessageText'
import type { RawJSONLines } from '../types'

const asLine = (value: unknown) => value as RawJSONLines

describe('extractUserMessageText', () => {
    it('extracts text from a string-content user message', () => {
        expect(extractUserMessageText(asLine({
            type: 'user',
            uuid: 'u1',
            message: { content: 'Hello there' },
        }))).toBe('Hello there')
    })

    it('extracts and joins text blocks from an array-content user message', () => {
        expect(extractUserMessageText(asLine({
            type: 'user',
            uuid: 'u1',
            message: { content: [{ type: 'text', text: 'Fix ' }, { type: 'text', text: 'the bug' }] },
        }))).toBe('Fix the bug')
    })

    it('normalizes surrounding and internal whitespace', () => {
        expect(extractUserMessageText(asLine({
            type: 'user',
            uuid: 'u1',
            message: { content: '  multi\n  line   input  ' },
        }))).toBe('multi line input')
    })

    it('ignores tool_result blocks (tool output, not typed input)', () => {
        expect(extractUserMessageText(asLine({
            type: 'user',
            uuid: 'u1',
            message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'output' }] },
        }))).toBeNull()
    })

    it('extracts only the text blocks when mixed with tool_result blocks', () => {
        expect(extractUserMessageText(asLine({
            type: 'user',
            uuid: 'u1',
            message: { content: [
                { type: 'tool_result', tool_use_id: 't1', content: 'output' },
                { type: 'text', text: 'and then continue' },
            ] },
        }))).toBe('and then continue')
    })

    it('ignores sidechain (subagent) messages', () => {
        expect(extractUserMessageText(asLine({
            type: 'user',
            uuid: 'u1',
            isSidechain: true,
            message: { content: 'subagent prompt' },
        }))).toBeNull()
    })

    it('ignores meta messages', () => {
        expect(extractUserMessageText(asLine({
            type: 'user',
            uuid: 'u1',
            isMeta: true,
            message: { content: 'meta content' },
        }))).toBeNull()
    })

    it('returns null for whitespace-only content', () => {
        expect(extractUserMessageText(asLine({
            type: 'user',
            uuid: 'u1',
            message: { content: '   \n  ' },
        }))).toBeNull()
    })

    it('returns null for non-user line types', () => {
        expect(extractUserMessageText(asLine({ type: 'assistant', uuid: 'a1' }))).toBeNull()
        expect(extractUserMessageText(asLine({ type: 'summary', summary: 's', leafUuid: 'l1' }))).toBeNull()
        expect(extractUserMessageText(asLine({ type: 'system', uuid: 'sys1' }))).toBeNull()
    })
})
