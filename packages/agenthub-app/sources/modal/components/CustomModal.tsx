import React from 'react';
import { BaseModal } from './BaseModal';
import { CustomModalConfig } from '../types';
import { CommandPaletteModal } from '@/components/CommandPalette/CommandPaletteModal';
import { CommandPalette } from '@/components/CommandPalette';
import { CenteredModalFrame } from './CenteredModalFrame';

interface CustomModalProps {
    config: CustomModalConfig;
    onClose: () => void;
}

export function CustomModal({ config, onClose }: CustomModalProps) {
    const Component = config.component;
    
    // Use special modal wrapper for CommandPalette with animation support
    if (Component === CommandPalette) {
        return <CommandPaletteWithAnimation config={config} onClose={onClose} />;
    }

    if (config.frame === false) {
        return (
            <BaseModal visible={true} accessibilityLabel={config.accessibilityLabel} onClose={onClose}>
                <Component {...config.props} onClose={onClose} />
            </BaseModal>
        );
    }
    
    return (
        <BaseModal visible={true} accessibilityLabel={config.accessibilityLabel} onClose={onClose}>
            <CenteredModalFrame maxWidth={520}>
                <Component {...config.props} onClose={onClose} />
            </CenteredModalFrame>
        </BaseModal>
    );
}

// Helper component to manage CommandPalette animation state
function CommandPaletteWithAnimation({ config, onClose }: CustomModalProps) {
    const [isClosing, setIsClosing] = React.useState(false);
    
    const handleClose = React.useCallback(() => {
        setIsClosing(true);
        // Wait for animation to complete before unmounting
        setTimeout(onClose, 200);
    }, [onClose]);
    
    return (
        <CommandPaletteModal visible={!isClosing} onClose={onClose}>
            <CommandPalette {...config.props} onClose={handleClose} />
        </CommandPaletteModal>
    );
}
