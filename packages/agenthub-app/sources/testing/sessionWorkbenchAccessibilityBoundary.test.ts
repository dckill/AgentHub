import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../components/AgentInput.tsx'), 'utf8');

function section(start: string, end: string): string {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end, startIndex + start.length);
    expect(startIndex).toBeGreaterThanOrEqual(0);
    expect(endIndex).toBeGreaterThan(startIndex);
    return source.slice(startIndex, endIndex);
}

function expectNamedButton(target: string): void {
    expect(target).toContain('accessibilityRole="button"');
    expect(target).toContain('accessibilityLabel=');
}

function expectFullTouchTarget(target: string): void {
    expect(target).toContain('minHeight: 44');
    expect(target).toMatch(/(?:minWidth: (?:44|actionRowLayout\.actionIconMinWidth|36)|minWidth,)/);
}

describe('session workbench accessibility boundary', () => {
    it('contains the full session shell in one main landmark', () => {
        const sessionView = fs.readFileSync(path.resolve(__dirname, '../-session/SessionView.tsx'), 'utf8');

        expect(sessionView).toContain('<View role="main" style={{ flex: 1 }}>');
        expect(sessionView).toContain('<View role="main" style={{ flex: 1, flexDirection: \'row\' }}>');
        expect(sessionView.match(/role="main"/g)).toHaveLength(2);
    });

    it('uses the theme contrast token for disconnected composer status', () => {
        const sessionView = fs.readFileSync(path.resolve(__dirname, '../-session/SessionView.tsx'), 'utf8');

        expect(sessionView).toContain("color: sessionStatus.state === 'disconnected' ? theme.colors.textSecondary");
        expect(sessionView).toContain("dotColor: sessionStatus.state === 'disconnected' ? theme.colors.textSecondary");
    });

    it('presents the mobile file browser portal as a named modal dialog', () => {
        const drawer = fs.readFileSync(path.resolve(__dirname, '../components/DirectoryTreeDrawer.tsx'), 'utf8');

        expect(drawer).toContain('role="dialog"');
        expect(drawer).toContain('aria-modal');
        expect(drawer).toContain("accessibilityLabel={selectedFile?.name ?? t('directoryTree.title')}");
    });

    it('names and sizes the session header navigation actions', () => {
        const header = fs.readFileSync(path.resolve(__dirname, '../components/ChatHeaderView.tsx'), 'utf8');

        expect(header).toMatch(/<Pressable[\s\S]{0,180}onPress=\{handleBackPress\}[\s\S]{0,180}accessibilityRole="button"[\s\S]{0,120}accessibilityLabel=\{t\('common\.back'\)\}/);
        expect(header).toMatch(/backButton:\s*\{[\s\S]{0,120}minWidth: 44,[\s\S]{0,80}minHeight: 44,/);
        expect(header).toMatch(/headerIconButton:\s*\{[\s\S]{0,120}minWidth: 44,[\s\S]{0,80}minHeight: 44,/);
        expect(header).not.toContain("sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'");
        expect(header).not.toContain('getSpaceKeyActivationProps');
    });

    it('names and sizes device and working-folder context actions', () => {
        const machine = section('{/* Machine chip */}', '{/* Path chip */}');
        const workingFolder = section('{/* Path chip */}', '{/* File reference chips */}');

        expectNamedButton(machine);
        expectFullTouchTarget(machine);
        expectNamedButton(workingFolder);
        expectFullTouchTarget(workingFolder);
    });

    it('names and sizes every composer rail action', () => {
        const markers = [
            ['{/* File reference picker button', '{/* Slash command button */}'],
            ['{/* Slash command button */}', '{/* Settings button */}'],
            ['{/* Settings button */}', '{/* Abort button */}'],
            ['{/* Abort button */}', '{/* Context compaction button */}'],
        ] as const;

        for (const [start, end] of markers) {
            const action = section(start, end);
            expectNamedButton(action);
            expectFullTouchTarget(action);
        }

        const context = section('function ContextRingButton', '// Git Status Button Component');
        const git = source.slice(source.indexOf('function GitStatusButton'));
        expectNamedButton(context);
        expectFullTouchTarget(context);
        expectNamedButton(git);
        expectFullTouchTarget(git);
    });

    it('names the send action and exposes its disabled state', () => {
        const send = section('{/* Send/Voice button', 'function ContextRingButton');

        expect(send).toContain('accessibilityRole="button"');
        expect(send).toContain("accessibilityLabel={t('agentInput.send')}");
        expect(send).toContain('accessibilityState={{ disabled: !canPressSendButton, busy: props.isSending }}');
        expect(send).toContain('width: Math.max(46, sendChrome.size)');
        expect(send).toContain('height: Math.max(46, sendChrome.size)');
        expect(source).toContain("paddingTop={Platform.OS === 'web' ? 11 : 8}");
        expect(source).toContain("paddingBottom={Platform.OS === 'web' ? 11 : 8}");
    });

    it('preserves the original composer visuals while left-aligning actions without displacing send', () => {
        expect(source).toMatch(/actionButtonsContainer:\s*\{[\s\S]{0,180}justifyContent: 'flex-start',[\s\S]{0,80}minHeight: 54,[\s\S]{0,80}paddingVertical: 4,/);
        expect(source).toMatch(/actionButtonsLeft:\s*\{[\s\S]{0,180}gap: 8,[\s\S]{0,100}justifyContent: 'flex-start',[\s\S]{0,100}minHeight: 54,/);
        expect(source).toMatch(/actionButtonsViewport:\s*\{[\s\S]{0,140}flex: 1,[\s\S]{0,60}minWidth: 0,[\s\S]{0,60}height: 54,/);
        expect(source).toMatch(/actionButtonsRail:\s*\{[\s\S]{0,160}justifyContent: 'flex-start',[\s\S]{0,80}flex: 1,[\s\S]{0,60}minWidth: 0,[\s\S]{0,60}minHeight: 54,/);
        expect(source).toMatch(/sendButton:\s*\{[\s\S]{0,180}flexShrink: 0,/);
        const git = source.slice(source.indexOf('function GitStatusButton'));
        expect(source).toContain('showsHorizontalScrollIndicator={false}');
        expect(source).toContain('minWidth: 44');
        expect(source).not.toContain('actionRowLayout.gitStatusMinWidth');
        expect(git).toContain('minWidth: 44');
    });

    it('exposes composer overlays as named menu and radio structures', () => {
        const slashMenu = fs.readFileSync(path.resolve(__dirname, '../components/SlashCommandMenu.tsx'), 'utf8');
        const attachmentMenu = fs.readFileSync(path.resolve(__dirname, '../components/AttachmentMenu.tsx'), 'utf8');
        const settings = section('{/* Settings overlay */}', '{/* Connection status');

        expect(slashMenu).toContain('accessibilityRole="menu"');
        expect(slashMenu).toContain("accessibilityLabel={t('slashCommands.help')}");
        expect(slashMenu).toContain('accessibilityRole="menuitem"');
        expect(attachmentMenu).toContain('accessibilityRole="menu"');
        expect(attachmentMenu).toContain('accessibilityRole="menuitem"');
        expect(settings.match(/role="radiogroup"/g)).toHaveLength(3);
        expect(settings.match(/accessibilityRole="radio"/g)).toHaveLength(3);
        expect(settings.match(/accessibilityState=\{\{ checked: isSelected \}\}/g)).toHaveLength(3);
        expect(settings.match(/aria-checked=\{isSelected\}/g)).toHaveLength(3);
        expect(settings.match(/minHeight: 44/g)).toHaveLength(3);
        expect(settings).not.toContain('color: isSelected ? theme.colors.radio.active : theme.colors.text');
    });

    it('keeps attachment, slash, and settings overlays mutually exclusive', () => {
        const attachment = section('{/* File reference picker button', '{/* Slash command button */}');
        const slash = section('{/* Slash command button */}', '{/* Settings button */}');
        const settingsHandler = section('// Handle settings button press', '// Handle settings selection');

        expect(attachment).toContain('setShowSettings(false)');
        expect(slash).toContain('setShowSettings(false)');
        expect(settingsHandler).toContain('setAttachmentMenuOpen(false)');
        expect(settingsHandler).toContain('setSlashMenuOpen(false)');
    });
});
