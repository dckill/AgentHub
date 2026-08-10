import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../components/AgentInput.tsx'), 'utf8');
const inputTextFieldSource = fs.readFileSync(path.resolve(__dirname, '../components/AgentInputTextField.tsx'), 'utf8');
const menuButtonsSource = fs.readFileSync(path.resolve(__dirname, '../components/AgentInputMenuButtons.tsx'), 'utf8');
const actionButtonsSource = fs.readFileSync(path.resolve(__dirname, '../components/AgentInputActionButtons.tsx'), 'utf8');
const sendButtonSource = fs.readFileSync(path.resolve(__dirname, '../components/AgentInputSendButton.tsx'), 'utf8');
const actionRailSource = fs.readFileSync(path.resolve(__dirname, '../components/AgentInputActionRail.tsx'), 'utf8');

function section(start: string, end: string): string {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end, startIndex + start.length);
    expect(startIndex).toBeGreaterThanOrEqual(0);
    expect(endIndex).toBeGreaterThan(startIndex);
    return source.slice(startIndex, endIndex);
}

function sectionFrom(target: string, start: string, end: string): string {
    const startIndex = target.indexOf(start);
    const endIndex = target.indexOf(end, startIndex + start.length);
    expect(startIndex).toBeGreaterThanOrEqual(0);
    expect(endIndex).toBeGreaterThan(startIndex);
    return target.slice(startIndex, endIndex);
}

function actionSection(start: string, end: string): string {
    const startIndex = actionButtonsSource.indexOf(start);
    const endIndex = actionButtonsSource.indexOf(end, startIndex + start.length);
    expect(startIndex).toBeGreaterThanOrEqual(0);
    expect(endIndex).toBeGreaterThan(startIndex);
    return actionButtonsSource.slice(startIndex, endIndex);
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
        const context = fs.readFileSync(path.resolve(__dirname, '../components/AgentInputContextChips.tsx'), 'utf8');
        const machine = sectionFrom(context, '/* Machine chip */', '/* Path chip */');
        const workingFolder = sectionFrom(context, '/* Path chip */', '        </View>\n    );');

        expectNamedButton(machine);
        expectFullTouchTarget(machine);
        expectNamedButton(workingFolder);
        expectFullTouchTarget(workingFolder);
    });

    it('names and sizes every composer rail action', () => {
        const markers = [
            ['{/* File reference picker button', '{/* Slash command button */}'],
            ['{/* Slash command button */}', '        </>'],
        ] as const;

        for (const [start, end] of markers) {
            const action = sectionFrom(menuButtonsSource, start, end);
            expectNamedButton(action);
            expectFullTouchTarget(action);
        }

        const settings = sectionFrom(menuButtonsSource, '{/* Settings button */}', '        </>');
        const abort = sectionFrom(actionRailSource, 'accessibilityRole="button"\n                                    accessibilityLabel={t(\'slashCommands.abort\')}', '</Pressable>');
        expectNamedButton(settings);
        expectFullTouchTarget(settings);
        expectNamedButton(abort);
        expectFullTouchTarget(abort);

        const context = actionSection('export function ContextRingButton', 'export function GitStatusButton');
        const git = actionButtonsSource.slice(actionButtonsSource.indexOf('export function GitStatusButton'));
        expectNamedButton(context);
        expectFullTouchTarget(context);
        expectNamedButton(git);
        expectFullTouchTarget(git);
    });

    it('names the send action and exposes its disabled state', () => {
        const send = sendButtonSource;

        expect(send).toContain('accessibilityRole="button"');
        expect(send).toContain("accessibilityLabel={t('agentInput.send')}");
        expect(send).toContain('accessibilityState={{ disabled: !canPressSendButton, busy: isSending }}');
        expect(send).toContain('width: Math.max(46, sendChrome.size)');
        expect(send).toContain('height: Math.max(46, sendChrome.size)');
        expect(inputTextFieldSource).toContain("paddingTop={Platform.OS === 'web' ? 11 : 8}");
        expect(inputTextFieldSource).toContain("paddingBottom={Platform.OS === 'web' ? 11 : 8}");
    });

    it('keeps composer icons in contiguous 32px slots without displacing send', () => {
        expect(actionRailSource).toMatch(/container:\s*\{[\s\S]{0,180}justifyContent: 'flex-start'(?: as const)?,[\s\S]{0,80}minHeight: 54,[\s\S]{0,80}paddingVertical: 4,/);
        expect(actionRailSource).toMatch(/left:\s*\{[\s\S]{0,180}gap: 0,[\s\S]{0,100}justifyContent: 'flex-start'(?: as const)?,[\s\S]{0,100}minHeight: 54,/);
        expect(actionRailSource).toMatch(/viewport:\s*\{[\s\S]{0,140}flex: 1,[\s\S]{0,60}minWidth: 0,[\s\S]{0,60}height: 54,/);
        expect(actionRailSource).toMatch(/rail:\s*\{[\s\S]{0,160}justifyContent: 'flex-start'(?: as const)?,[\s\S]{0,80}flex: 1,[\s\S]{0,60}minWidth: 0,[\s\S]{0,60}minHeight: 54,/);
        expect(sendButtonSource).toMatch(/sendButton:\s*\{[\s\S]{0,180}flexShrink: 0,/);
        const rail = sectionFrom(`${menuButtonsSource}\n${actionRailSource}`, '{/* File reference picker button', '                    <AgentInputSendButton');
        const git = actionButtonsSource.slice(actionButtonsSource.indexOf('export function GitStatusButton'));
        const gitBadge = fs.readFileSync(path.resolve(__dirname, '../components/GitStatusBadge.tsx'), 'utf8');
        expect(actionRailSource).toContain('showsHorizontalScrollIndicator={false}');
        expect(rail.match(/minWidth: actionRowLayout\.actionIconMinWidth/g)).toHaveLength(4);
        expect(rail).not.toContain('minWidth: 44');
        expect(source).not.toContain('actionRowLayout.gitStatusMinWidth');
        expect(git).toContain('minWidth: actionRowLayout.actionIconMinWidth');
        expect(git).toContain('paddingHorizontal: 0');
        expect(git).toContain('justifyContent: \'flex-start\'');
        expect(git).toContain('iconSlotWidth={actionRowLayout.actionIconMinWidth}');
        expect(gitBadge).toContain('iconSlotWidth?: number');
        expect(gitBadge).toContain('width: iconSlotWidth');
        expect(gitBadge).toContain('justifyContent: \'center\'');
    });

    it('exposes composer overlays as named menu and radio structures', () => {
        const slashMenu = fs.readFileSync(path.resolve(__dirname, '../components/SlashCommandMenu.tsx'), 'utf8');
        const attachmentMenu = fs.readFileSync(path.resolve(__dirname, '../components/AttachmentMenu.tsx'), 'utf8');
        const radioOption = fs.readFileSync(path.resolve(__dirname, '../components/AgentInputRadioOption.tsx'), 'utf8');
        const settings = fs.readFileSync(path.resolve(__dirname, '../components/AgentInputSettingsOverlay.tsx'), 'utf8');

        expect(slashMenu).toContain('accessibilityRole="menu"');
        expect(slashMenu).toContain("accessibilityLabel={t('slashCommands.help')}");
        expect(slashMenu).toContain('accessibilityRole="menuitem"');
        expect(attachmentMenu).toContain('accessibilityRole="menu"');
        expect(attachmentMenu).toContain('accessibilityRole="menuitem"');
        expect(settings.match(/role="radiogroup"/g)).toHaveLength(3);
        expect(settings.match(/<AgentInputRadioOption/g)).toHaveLength(3);
        expect(radioOption).toContain('accessibilityRole="radio"');
        expect(radioOption).toContain('accessibilityState={{ checked: selected }}');
        expect(radioOption).toContain('aria-checked={selected}');
        expect(radioOption).toContain('minHeight: 44');
        expect(settings).not.toContain('color: isSelected ? theme.colors.radio.active : theme.colors.text');
    });

    it('keeps attachment, slash, and settings overlays mutually exclusive', () => {
        const attachment = sectionFrom(menuButtonsSource, '{/* File reference picker button', '{/* Slash command button */}');
        const slash = sectionFrom(menuButtonsSource, '{/* Slash command button */}', '        </>');
        const menuHandlers = section('<AgentInputActionRail', '                    />');
        const settingsHandler = section('// Handle settings button press', '// Handle settings selection');

        expect(menuHandlers).toContain('setShowSettings(false)');
        expect(menuHandlers).toContain('setSlashMenuOpen(false)');
        expect(menuHandlers).toContain('setAttachmentMenuOpen(false)');
        expect(settingsHandler).toContain('setAttachmentMenuOpen(false)');
        expect(settingsHandler).toContain('setSlashMenuOpen(false)');
    });
});
