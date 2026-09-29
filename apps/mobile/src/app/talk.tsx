import { describeAction, type CommandProposal } from '@sparkytalk/shared';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';

/**
 * Say or type what happened ("老板让我先去 Lot 23", "一楼拉线完成了") → AI proposal → confirm.
 * TODO: voice recording + speech-to-text (provider to be chosen, see CLAUDE.md 语音控制).
 */
export default function TalkScreen() {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<CommandProposal | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">说一句</ThemedText>
          <TextInput
            multiline
            value={text}
            onChangeText={setText}
            placeholder="例如：拉线完成了一楼加二楼主人套房，二楼其他打好洞了，还要半天"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          <Button
            title={busy && !proposal ? '解析中…' : '解析'}
            disabled={busy || !text.trim()}
            onPress={() => void run(async () => setProposal(await api.command(text.trim())))}
          />

          {proposal && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{proposal.summary}</ThemedText>
              {proposal.actions.map((a, i) => (
                <View key={i}>
                  <ThemedText>• {describeAction(a)}</ThemedText>
                  {proposal.issues
                    .filter((issue) => issue.index === i)
                    .map((issue) => (
                      <ThemedText key={issue.problem} type="small" themeColor="danger">
                        {issue.problem}
                      </ThemedText>
                    ))}
                </View>
              ))}
              <View style={styles.row}>
                <Button
                  title="确认"
                  disabled={busy || proposal.issues.length > 0}
                  onPress={() =>
                    void run(async () => {
                      await api.confirmCommand(proposal.proposalId);
                      setProposal(null);
                      setText('');
                      setMessage('已保存');
                    })
                  }
                />
                <Button
                  title="取消"
                  variant="secondary"
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      await api.reject(proposal.proposalId);
                      setProposal(null);
                    })
                  }
                />
              </View>
            </ThemedView>
          )}
          {message && <ThemedText themeColor="textSecondary">{message}</ThemedText>}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  safeArea: { flex: 1, maxWidth: MaxContentWidth },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  input: { minHeight: 96, borderRadius: Spacing.two, padding: Spacing.three, fontSize: 16 },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two },
});
