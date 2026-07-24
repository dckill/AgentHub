import * as React from 'react';
import { ToolCall } from '@/sync/typesMessage';
import { ToolSectionView } from '../../tools/ToolSectionView';
import { CommandView } from '@/components/CommandView';
import { Metadata } from '@/sync/storageTypes';
import { parseBashToolResult, truncateTerminalOutput } from '@/utils/terminalResult';

export const BashView = React.memo((props: { tool: ToolCall, metadata: Metadata | null }) => {
    const { input } = props.tool;
    const parsed = parseBashToolResult({
        state: props.tool.state,
        result: props.tool.result,
        startedAt: props.tool.startedAt,
        completedAt: props.tool.completedAt,
    });

    return (
        <>
            <ToolSectionView>
                <CommandView 
                    command={input.command}
                    stdout={truncateTerminalOutput(parsed.stdout)}
                    stderr={truncateTerminalOutput(parsed.stderr)}
                    error={truncateTerminalOutput(parsed.error)}
                    hideEmptyOutput
                />
            </ToolSectionView>
        </>
    );
});
