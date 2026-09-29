import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getUserId, setSession } from '@/lib/session';

/** Temporary dev login until real auth is chosen (CLAUDE.md: Auth 待定). */
export default function MeScreen() {
  const theme = useTheme();
  const [value, setValue] = useState(getUserId() ?? '');
  const [saved, setSaved] = useState(false);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">我</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          开发用户 ID（运行 db:seed 后会打印出来）
        </ThemedText>
        <TextInput
          value={value}
          onChangeText={(v) => {
            setValue(v);
            setSaved(false);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="x-dev-user-id"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
        <Button
          title={saved ? '已保存' : '保存'}
          onPress={() => void setSession(value).then(() => setSaved(true))}
        />
        <ThemedText type="small" themeColor="textSecondary">
          位置说明：只在今天安排的工地记录到场和离场，不做全天定位。
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  safeArea: { flex: 1, maxWidth: MaxContentWidth, padding: Spacing.three, gap: Spacing.three },
  input: { borderRadius: Spacing.two, padding: Spacing.three, fontSize: 16 },
});
