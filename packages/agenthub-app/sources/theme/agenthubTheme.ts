export const agentHubTokens = {
    dark: {
        canvas: '#070A0B',
        canvasElevated: '#0B1012',
        surface: 'rgba(12, 17, 19, 0.72)',
        surfaceRaised: 'rgba(17, 24, 27, 0.84)',
        surfaceHover: '#182126',
        border: 'rgba(238, 248, 250, 0.13)',
        borderStrong: 'rgba(255, 202, 116, 0.52)',
        accent: '#FFB22E',
        accentDark: '#F6A21A',
        accentSoft: 'rgba(255, 178, 46, 0.12)',
        accentGlow: 'rgba(255, 178, 46, 0.32)',
        textPrimary: '#F3EFE7',
        textSecondary: '#C8C0B4',
        textMuted: '#7A8790',
        success: '#50C878',
        warning: '#FFB22E',
        danger: '#EF3D3D',
        info: '#5FA8FF',
    },
    light: {
        canvas: '#F6F9FA',
        canvasElevated: '#EEF4F6',
        surface: 'rgba(255, 255, 255, 0.62)',
        surfaceRaised: 'rgba(255, 255, 255, 0.88)',
        surfaceHover: '#F1F6F7',
        border: 'rgba(28, 44, 52, 0.14)',
        borderStrong: 'rgba(217, 144, 18, 0.36)',
        accent: '#D99012',
        accentDark: '#B76D00',
        accentSoft: 'rgba(217, 144, 18, 0.105)',
        accentGlow: 'rgba(217, 144, 18, 0.20)',
        textPrimary: '#0E1720',
        textSecondary: '#485866',
        textMuted: '#75828C',
        success: '#0F6F3E',
        warning: '#D99012',
        danger: '#BE332C',
        info: '#276DD4',
    },
} as const;

export const agentHubSpacing = {
    margins: {
        xs: 4,
        sm: 8,
        md: 12,
        lg: 16,
        xl: 24,
        xxl: 32,
    },
    borderRadius: {
        sm: 4,
        md: 6,
        lg: 8,
        xl: 10,
        xxl: 16,
    },
    iconSize: {
        small: 12,
        medium: 16,
        large: 20,
        xlarge: 24,
    },
} as const;

export const agentHubGlass = {
    blur: {
        sm: 12,
        md: 18,
        lg: 28,
    },
    saturation: 1.18,
} as const;

export const agentHubMotion = {
    fast: 120,
    normal: 180,
    slow: 260,
    easingStandard: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
} as const;

type AgentHubMode = keyof typeof agentHubTokens;

export function createAgentHubRuntimeTheme(mode: AgentHubMode) {
    const token = agentHubTokens[mode];
    const isDark = mode === 'dark';
    const canvasContrast = isDark ? agentHubTokens.dark.canvas : agentHubTokens.light.textPrimary;
    const primaryButtonBackground = token.accent;
    const primaryButtonTint = isDark ? '#080A0B' : '#111719';
    const terminalBackground = isDark ? '#090C0E' : '#1F211F';
    const codeSurfaceBackground = isDark ? '#090C0E' : '#FBFDFD';
    const codeSurfaceHeaderBackground = isDark ? '#10171A' : '#F1F6F7';

    return {
        dark: isDark,
        colors: {
            canvas: token.canvas,
            canvasElevated: token.canvasElevated,
            accent: token.accent,
            accentDark: token.accentDark,
            accentSoft: token.accentSoft,
            accentGlow: token.accentGlow,
            border: token.border,
            borderStrong: token.borderStrong,
            glass: {
                background: token.surface,
                raised: token.surfaceRaised,
                hover: token.surfaceHover,
                border: token.border,
                borderStrong: token.borderStrong,
                highlight: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.92)',
                edgeBright: isDark ? 'rgba(255, 255, 255, 0.26)' : 'rgba(255, 255, 255, 0.98)',
                edgeMuted: isDark ? 'rgba(255, 255, 255, 0.055)' : 'rgba(28, 44, 52, 0.085)',
                edgeWarm: isDark ? 'rgba(255, 196, 88, 0.12)' : 'rgba(217, 144, 18, 0.15)',
                reflection: isDark ? 'rgba(255, 255, 255, 0.065)' : 'rgba(255, 255, 255, 0.68)',
                shadow: isDark ? 'rgba(0, 0, 0, 0.58)' : 'rgba(62, 82, 90, 0.16)',
                blur: agentHubGlass.blur.md,
                saturation: agentHubGlass.saturation,
            },
            focus: {
                ring: token.borderStrong,
                glow: token.accentGlow,
            },
            overlay: {
                scrim: isDark ? 'rgba(2, 4, 5, 0.74)' : 'rgba(16, 22, 25, 0.28)',
                hover: token.surfaceHover,
            },

            //
            // Compatibility fields
            //

            text: token.textPrimary,
            textDestructive: token.danger,
            textSecondary: token.textSecondary,
            textMuted: token.textMuted,
            textLink: token.info,
            deleteAction: token.danger,
            warningCritical: token.danger,
            warning: token.warning,
            success: token.success,
            surface: token.surface,
            surfaceRaised: token.surfaceRaised,
            surfaceHover: token.surfaceHover,
            surfaceRipple: isDark ? 'rgba(255, 178, 46, 0.10)' : 'rgba(34, 49, 53, 0.07)',
            surfacePressed: token.accentSoft,
            surfaceSelected: token.accentSoft,
            surfacePressedOverlay: token.accentSoft,
            surfaceHigh: token.surfaceRaised,
            surfaceHighest: token.canvasElevated,
            divider: token.border,
            shadow: {
                color: isDark ? 'rgba(0, 0, 0, 0.58)' : 'rgba(52, 74, 75, 0.13)',
                opacity: isDark ? 0.38 : 0.18,
            },
            groupped: {
                background: isDark ? token.canvas : token.canvasElevated,
                chevron: token.textMuted,
                sectionTitle: token.textSecondary,
            },
            header: {
                background: token.canvasElevated,
                tint: token.textPrimary,
            },
            switch: {
                track: {
                    active: token.accent,
                    inactive: isDark ? 'rgba(109, 120, 130, 0.30)' : 'rgba(117, 130, 140, 0.22)',
                },
                thumb: {
                    active: isDark ? '#FFF1D6' : '#FFFDF8',
                    inactive: isDark ? '#D7E0E3' : '#F8FBFC',
                },
            },
            fab: {
                background: primaryButtonBackground,
                backgroundPressed: token.accentDark,
                icon: primaryButtonTint,
            },
            radio: {
                active: token.accent,
                inactive: token.textMuted,
                dot: token.accent,
            },
            modal: {
                border: token.border,
            },
            button: {
                primary: {
                    background: primaryButtonBackground,
                    tint: primaryButtonTint,
                    disabled: isDark ? 'rgba(109, 120, 130, 0.32)' : 'rgba(119, 128, 138, 0.26)',
                },
                secondary: {
                    tint: token.accent,
                },
            },
            input: {
                background: token.surfaceRaised,
                text: token.textPrimary,
                placeholder: isDark ? token.textMuted : token.textSecondary,
            },
            box: {
                warning: {
                    background: token.accentSoft,
                    border: token.warning,
                    text: token.warning,
                },
                error: {
                    background: isDark ? 'rgba(239, 61, 61, 0.15)' : 'rgba(199, 53, 46, 0.11)',
                    border: token.danger,
                    text: token.danger,
                },
            },
            status: {
                connected: token.success,
                connecting: token.info,
                disconnected: token.textMuted,
                error: token.danger,
                default: token.textMuted,
            },
            permission: {
                default: token.textMuted,
                acceptEdits: token.info,
                bypass: token.warning,
                plan: token.success,
                readOnly: token.textMuted,
                safeYolo: token.accentDark,
                yolo: token.danger,
            },
            permissionButton: {
                allow: {
                    background: token.success,
                    text: isDark ? token.canvas : '#FFFFFF',
                },
                deny: {
                    background: token.danger,
                    text: '#FFFFFF',
                },
                allowAll: {
                    background: token.info,
                    text: '#FFFFFF',
                },
                inactive: {
                    background: token.surfaceRaised,
                    border: token.border,
                    text: token.textMuted,
                },
                selected: {
                    background: token.accentSoft,
                    border: token.borderStrong,
                    text: token.textPrimary,
                },
            },
            codeSurface: {
                background: codeSurfaceBackground,
                headerBackground: codeSurfaceHeaderBackground,
                border: isDark ? 'rgba(238, 248, 250, 0.11)' : 'rgba(28, 44, 52, 0.12)',
                gutterBackground: isDark ? 'rgba(255, 255, 255, 0.026)' : 'rgba(28, 44, 52, 0.040)',
                gutterBorder: isDark ? 'rgba(255, 255, 255, 0.050)' : 'rgba(28, 44, 52, 0.085)',
                mutedText: token.textMuted,
            },
            diff: {
                outline: token.border,
                success: token.success,
                error: token.danger,
                addedBg: isDark ? 'rgba(80, 200, 120, 0.16)' : 'rgba(18, 131, 74, 0.12)',
                addedBorder: token.success,
                addedText: token.textPrimary,
                removedBg: isDark ? 'rgba(239, 61, 61, 0.16)' : 'rgba(190, 51, 44, 0.12)',
                removedBorder: token.danger,
                removedText: token.textPrimary,
                contextBg: codeSurfaceBackground,
                contextText: token.textPrimary,
                lineNumberBg: isDark ? 'rgba(255, 255, 255, 0.026)' : 'rgba(28, 44, 52, 0.040)',
                lineNumberText: token.textSecondary,
                hunkHeaderBg: isDark ? 'rgba(255, 178, 46, 0.12)' : 'rgba(217, 144, 18, 0.10)',
                hunkHeaderText: token.accent,
                leadingSpaceDot: isDark ? 'rgba(184, 176, 163, 0.16)' : 'rgba(66, 80, 87, 0.16)',
                inlineAddedBg: isDark ? 'rgba(80, 200, 120, 0.22)' : 'rgba(18, 131, 74, 0.16)',
                inlineAddedText: isDark ? '#BDF4CB' : '#0D5F35',
                inlineRemovedBg: isDark ? 'rgba(239, 61, 61, 0.22)' : 'rgba(190, 51, 44, 0.16)',
                inlineRemovedText: isDark ? '#FFC7C2' : '#7B1D18',
            },
            userMessageBackground: isDark ? 'rgba(255, 178, 46, 0.18)' : 'rgba(255, 249, 237, 0.78)',
            userMessageText: token.textPrimary,
            agentMessageText: token.textPrimary,
            agentEventText: token.textSecondary,
            syntaxKeyword: isDark ? '#5FA8FF' : '#2F73D9',
            syntaxString: isDark ? '#50C878' : '#0F6F3E',
            syntaxComment: token.textMuted,
            syntaxNumber: isDark ? '#FFD17A' : '#9A6400',
            syntaxFunction: isDark ? '#F6C96F' : '#955A00',
            syntaxBracket1: token.accent,
            syntaxBracket2: token.info,
            syntaxBracket3: token.success,
            syntaxBracket4: isDark ? '#FF7A4C' : '#B96E00',
            syntaxBracket5: isDark ? '#C9B6FF' : '#7156B8',
            syntaxDefault: token.textPrimary,
            gitBranchText: token.textSecondary,
            gitFileCountText: token.textMuted,
            gitAddedText: isDark ? token.success : '#0F6F3E',
            gitRemovedText: token.danger,
            terminal: {
                background: terminalBackground,
                prompt: token.accent,
                command: isDark ? '#F3EFE7' : '#FFF8EA',
                stdout: isDark ? '#D8D1C7' : '#F3EFE7',
                stderr: '#FFB86C',
                error: isDark ? '#FF7A72' : '#FFB3AA',
                emptyOutput: isDark ? '#776F64' : '#B8B0A3',
            },
        },
        ...agentHubSpacing,
        glass: agentHubGlass,
        motion: agentHubMotion,
    } as const;
}

export function getAgentHubRootBackground(mode: AgentHubMode) {
    return agentHubTokens[mode].canvas;
}
