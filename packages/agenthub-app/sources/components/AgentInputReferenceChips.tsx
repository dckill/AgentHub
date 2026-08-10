import * as React from 'react';
import { View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { FileReferenceChips } from './FileReferenceChips';
import { getComposerSupplementalSurfaceVisuals } from './composerVisuals';

interface AgentInputReferenceChipsProps {
    fileReferences?: string[];
    onFileReferencesChange?: (paths: string[]) => void;
    localFiles?: Array<{ name: string }>;
    onLocalFileRemove?: (index: number) => void;
}

export const AgentInputReferenceChips = React.memo((props: AgentInputReferenceChipsProps) => {
    const { theme } = useUnistyles();
    const supplementalVisuals = getComposerSupplementalSurfaceVisuals(theme);
    const hasFileReferences = Boolean(props.fileReferences && props.fileReferences.length > 0);
    const hasLocalFiles = Boolean(props.localFiles && props.localFiles.length > 0);

    if (!hasFileReferences && !hasLocalFiles) {
        return null;
    }

    const boxStyle = {
        backgroundColor: supplementalVisuals.backgroundColor,
        borderColor: supplementalVisuals.borderColor,
        borderWidth: 1,
        borderRadius: 12,
        padding: 8,
        marginBottom: 8,
    } as const;

    return (
        <>
            {hasFileReferences && (
                <View style={boxStyle}>
                    <FileReferenceChips
                        paths={props.fileReferences!}
                        onRemovePath={(path) => {
                            const updated = props.fileReferences!.filter((item) => item !== path);
                            props.onFileReferencesChange?.(updated);
                        }}
                    />
                </View>
            )}
            {hasLocalFiles && (
                <View style={boxStyle}>
                    <FileReferenceChips
                        paths={props.localFiles!.map((file) => file.name)}
                        onRemovePath={(name) => {
                            const index = props.localFiles!.findIndex((file) => file.name === name);
                            if (index >= 0) {
                                props.onLocalFileRemove?.(index);
                            }
                        }}
                    />
                </View>
            )}
        </>
    );
});
