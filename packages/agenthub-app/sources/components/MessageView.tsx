import * as React from "react";
import { Image, Pressable, ScrollView, View, Text } from "react-native";
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MarkdownView } from "./markdown/MarkdownView";
import { FileReferenceChips } from "./FileReferenceChips";
import { t } from '@/text';
import { Message, UserTextMessage, AgentTextMessage, ToolCallMessage, ImageData } from "@/sync/typesMessage";
import { Metadata } from "@/sync/storageTypes";
import { layout } from "./layout";
import { ToolView } from "./tools/ToolView";
import { AgentEvent } from "@/sync/typesRaw";
import { sync } from '@/sync/sync';
import { Option } from './markdown/MarkdownView';
import { useChatScale } from '@/hooks/useScale';
import { parseLocalCommandMessage, isUserSlashCommandEcho } from './parseLocalCommandMessage';
import { GlassSurface } from '@/components/glass';
import { getAgentEventVisuals, getToolSurfaceVisuals, getUserMessageVisuals } from './messageSurfaceVisuals';


export const MessageView = (props: {
  message: Message;
  metadata: Metadata | null;
  sessionId: string;
  getMessageById?: (id: string) => Message | null;
  interactiveOptionsMessageId?: string | null;
}) => {
  return (
    <View style={styles.messageContainer} renderToHardwareTextureAndroid={true}>
      <View style={styles.messageContent}>
        <RenderBlock
          message={props.message}
          metadata={props.metadata}
          sessionId={props.sessionId}
          getMessageById={props.getMessageById}
          interactiveOptionsMessageId={props.interactiveOptionsMessageId}
        />
      </View>
    </View>
  );
};

// RenderBlock function that dispatches to the correct component based on message kind
function RenderBlock(props: {
  message: Message;
  metadata: Metadata | null;
  sessionId: string;
  getMessageById?: (id: string) => Message | null;
  interactiveOptionsMessageId?: string | null;
}): React.ReactElement | null {
  switch (props.message.kind) {
    case 'user-text':
      return <UserTextBlock message={props.message} metadata={props.metadata} sessionId={props.sessionId} />;

    case 'agent-text':
      return <AgentTextBlock
        message={props.message}
        sessionId={props.sessionId}
        showOptions={props.message.id === props.interactiveOptionsMessageId}
      />;

    case 'tool-call':
      return <ToolCallBlock
        message={props.message}
        metadata={props.metadata}
        sessionId={props.sessionId}
        getMessageById={props.getMessageById}
      />;

    case 'agent-event':
      if (props.message.event.type === 'ready') {
        return null;
      }
      return <AgentEventBlock event={props.message.event} metadata={props.metadata} />;


    default:
      // Exhaustive check - TypeScript will error if we miss a case
      const _exhaustive: never = props.message;
      throw new Error(`Unknown message kind: ${_exhaustive}`);
  }
}

function UserTextBlock(props: {
  message: UserTextMessage;
  metadata: Metadata | null;
  sessionId: string;
}) {
  const { s } = useChatScale();
  const { theme } = useUnistyles();
  const userVisuals = getUserMessageVisuals(theme);
  const handleOptionPress = React.useCallback((option: Option) => {
    sync.sendMessage(props.sessionId, option.title, { source: 'option' });
  }, [props.sessionId]);

  const text = props.message.displayText || props.message.text;
  const isClaudeFlavor = !props.metadata?.flavor || props.metadata.flavor === 'claude';
  if (isClaudeFlavor && isUserSlashCommandEcho(props.message.text, props.message.localId != null)) {
    return null;
  }

  const parsed = parseLocalCommandMessage(text);
  if (parsed.kind === 'caveat' || parsed.kind === 'goal-confirmation') {
    return null;
  }
  if (parsed.kind === 'goal-run') {
    return (
      <View style={[styles.userMessageContainer, { paddingHorizontal: s(16) }]}>
        <Pressable
          style={[
            styles.userMessageBubble,
            styles.goalMessageBubble,
            {
              borderRadius: s(12),
              paddingHorizontal: s(12),
              paddingVertical: s(4),
              backgroundColor: userVisuals.backgroundColor,
              borderColor: userVisuals.borderColor,
            },
          ]}
        >
          <MarkdownView
            markdown={parsed.goal}
            onOptionPress={handleOptionPress}
            sessionId={props.sessionId}
            variant="user"
            showOptions={false}
          />
        </Pressable>
        <View style={styles.goalSentRow}>
          <Ionicons name="locate-outline" size={s(16)} color={styles.goalSentText.color} />
          <Text style={[styles.goalSentText, { fontSize: s(14) }]}>{t('message.sentAsGoal')}</Text>
        </View>
      </View>
    );
  }
  if (parsed.kind === 'command-run') {
    return (
      <View style={[styles.userMessageContainer, { paddingHorizontal: s(16) }]}>
        {parsed.args ? (
          <Pressable
            style={[
              styles.userMessageBubble,
              styles.commandMessageBubble,
              {
                borderRadius: s(12),
                paddingHorizontal: s(12),
                paddingVertical: s(4),
                backgroundColor: userVisuals.backgroundColor,
                borderColor: userVisuals.borderColor,
              },
            ]}
          >
            <MarkdownView
              markdown={parsed.args}
              onOptionPress={handleOptionPress}
              sessionId={props.sessionId}
              variant="user"
              showOptions={false}
            />
          </Pressable>
        ) : null}
        <View style={[styles.commandChip, { borderRadius: s(10), paddingHorizontal: s(10), paddingVertical: s(2), borderColor: userVisuals.borderColor }]}>
          <Text style={[styles.commandChipText, { fontSize: s(13) }]}>/{parsed.commandName}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.userMessageContainer, { paddingHorizontal: s(16) }]}>
      <Pressable
        style={[
          styles.userMessageBubble,
          {
            borderRadius: s(12),
            paddingHorizontal: s(12),
            paddingVertical: s(4),
            backgroundColor: userVisuals.backgroundColor,
            borderColor: userVisuals.borderColor,
          },
        ]}
      >
        <MarkdownView
          markdown={parsed.text}
          onOptionPress={handleOptionPress}
          sessionId={props.sessionId}
          variant="user"
          showOptions={false}
        />
        {props.message.images && props.message.images.length > 0 && (
          <UserImageReferences images={props.message.images} />
        )}
        {props.message.fileReferences && props.message.fileReferences.length > 0 && (
            <View style={styles.fileRefContainer}>
                <FileReferenceChips
                    paths={props.message.fileReferences}
                    onRemovePath={() => {}}
                />
            </View>
        )}
      </Pressable>
    </View>
  );
}

function UserImageReferences(props: {
  images: ImageData[];
}) {
  const { s } = useChatScale();

  if (props.images.length === 0) {
    return null;
  }

  return (
    <View style={styles.imageRefContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.imageRefScroller}
        contentContainerStyle={styles.imageRefContent}
      >
        {props.images.map((image, index) => {
          const name = image.name || image.mimeType || `image-${index + 1}`;
          const dimensions = image.width && image.height ? `${image.width}x${image.height}` : null;
          const source = image.data ? { uri: `data:${image.mimeType};base64,${image.data}` } : undefined;
          return (
            <View key={`${name}-${index}`} style={[styles.imageRefChip, { maxWidth: s(150) }]}>
              {source && (
                <Image
                  source={source}
                  style={[styles.imageRefThumb, { width: s(56), height: s(56), borderRadius: s(6) }]}
                  resizeMode="cover"
                />
              )}
              <View style={styles.imageRefText}>
                <Text style={[styles.imageRefName, { fontSize: s(12) }]} numberOfLines={1}>
                  {name}
                </Text>
                {dimensions && (
                  <Text style={[styles.imageRefMeta, { fontSize: s(11) }]} numberOfLines={1}>
                    {dimensions}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function AgentTextBlock(props: {
  message: AgentTextMessage;
  sessionId: string;
  showOptions: boolean;
}) {
  const { s } = useChatScale();
  const handleOptionPress = React.useCallback((option: Option) => {
    sync.sendMessage(props.sessionId, option.title, { source: 'option' });
  }, [props.sessionId]);

  // Hide thinking messages
  if (props.message.isThinking) {
    return null;
  }

  return (
    <View style={[styles.agentMessageContainer, { marginHorizontal: s(16) }]}>
      <MarkdownView
        markdown={props.message.text}
        onOptionPress={handleOptionPress}
        sessionId={props.sessionId}
        variant="agent"
        showOptions={props.showOptions}
      />
    </View>
  );
}

function AgentEventBlock(props: {
  event: AgentEvent;
  metadata: Metadata | null;
}) {
  const { s } = useChatScale();
  const { theme } = useUnistyles();
  const eventVisuals = getAgentEventVisuals(theme);
  if (props.event.type === 'switch') {
    return (
      <View style={styles.agentEventContainer}>
        <View style={[styles.agentEventPill, { backgroundColor: eventVisuals.backgroundColor, borderColor: eventVisuals.borderColor }]}>
          <Text style={[styles.agentEventText, { fontSize: s(14), color: eventVisuals.textColor }]}>{t('message.switchedToMode', { mode: props.event.mode })}</Text>
        </View>
      </View>
    );
  }
  if (props.event.type === 'message') {
    return (
      <View style={styles.agentEventContainer}>
        <View style={[styles.agentEventPill, { backgroundColor: eventVisuals.backgroundColor, borderColor: eventVisuals.borderColor }]}>
          <Text style={[styles.agentEventText, { fontSize: s(14), color: eventVisuals.textColor }]}>{props.event.message}</Text>
        </View>
      </View>
    );
  }
  if (props.event.type === 'limit-reached') {
    const formatTime = (timestamp: number): string => {
      try {
        const date = new Date(timestamp * 1000); // Convert from Unix timestamp
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return t('message.unknownTime');
      }
    };

    return (
      <View style={styles.agentEventContainer}>
        <View style={[styles.agentEventPill, { backgroundColor: eventVisuals.backgroundColor, borderColor: eventVisuals.borderColor }]}>
          <Text style={[styles.agentEventText, { fontSize: s(14), color: eventVisuals.textColor }]}>
            {t('message.usageLimitUntil', { time: formatTime(props.event.endsAt) })}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.agentEventContainer}>
      <View style={[styles.agentEventPill, { backgroundColor: eventVisuals.backgroundColor, borderColor: eventVisuals.borderColor }]}>
        <Text style={[styles.agentEventText, { fontSize: s(14), color: eventVisuals.textColor }]}>{t('message.unknownEvent')}</Text>
      </View>
    </View>
  );
}

function ToolCallBlock(props: {
  message: ToolCallMessage;
  metadata: Metadata | null;
  sessionId: string;
  getMessageById?: (id: string) => Message | null;
}) {
  const { s } = useChatScale();
  const { theme } = useUnistyles();
  const toolSurfaceVisuals = getToolSurfaceVisuals(theme);
  if (!props.message.tool) {
    return null;
  }
  return (
    <GlassSurface
      tone="raised"
      style={[
        styles.toolContainer,
        {
          marginHorizontal: s(8),
          borderRadius: s(12),
          backgroundColor: toolSurfaceVisuals.backgroundColor,
          borderColor: toolSurfaceVisuals.borderColor,
          shadowColor: toolSurfaceVisuals.shadowColor,
        },
      ]}
    >
      <ToolView
        tool={props.message.tool}
        metadata={props.metadata}
        messages={props.message.children}
        sessionId={props.sessionId}
        messageId={props.message.id}
      />
    </GlassSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  messageContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  messageContent: {
    flexDirection: 'column',
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    maxWidth: layout.maxWidth,
    overflow: 'hidden',
  },
  userMessageContainer: {
    maxWidth: '100%',
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  userMessageBubble: {
    backgroundColor: theme.colors.userMessageBackground,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
    maxWidth: '100%',
  },
  goalMessageBubble: {
    marginBottom: 6,
  },
  commandMessageBubble: {
    marginBottom: 6,
  },
  goalSentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    maxWidth: '100%',
    opacity: 0.72,
  },
  goalSentText: {
    color: theme.colors.agentEventText,
    fontSize: 14,
  },
  commandChip: {
    backgroundColor: theme.colors.userMessageBackground,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 10,
    marginBottom: 12,
    maxWidth: '100%',
    opacity: 0.65,
  },
  commandChipText: {
    color: theme.colors.input.text,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  agentMessageContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    maxWidth: '100%',
  },
  agentEventContainer: {
    marginHorizontal: 8,
    alignItems: 'center',
    paddingVertical: 8,
  },
  agentEventText: {
    color: theme.colors.agentEventText,
    fontSize: 14,
  },
  agentEventPill: {
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  toolContainer: {
    marginHorizontal: 8,
    marginBottom: 12,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  debugText: {
    color: theme.colors.agentEventText,
    fontSize: 12,
  },
  fileRefContainer: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: theme.colors.surfacePressed,
  },
  imageRefContainer: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: theme.colors.surfacePressed,
  },
  imageRefScroller: {
    maxHeight: 74,
  },
  imageRefContent: {
    gap: 8,
    paddingVertical: 2,
  },
  imageRefChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceHigh,
    padding: 6,
  },
  imageRefThumb: {
    backgroundColor: theme.colors.surfacePressed,
  },
  imageRefText: {
    minWidth: 0,
    flexShrink: 1,
  },
  imageRefName: {
    color: theme.colors.text,
    fontWeight: '600',
  },
  imageRefMeta: {
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
}));
