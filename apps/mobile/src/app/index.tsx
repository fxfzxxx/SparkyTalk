import { STAGE_LABELS, type PlanRow } from '@sparkytalk/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { currentPosition, syncGeofences } from '@/lib/geofence';
import { getUserId } from '@/lib/session';

/** Worker's jobs for today, with one-tap "我在这个工地". */
export default function TodayScreen() {
  const [plan, setPlan] = useState<PlanRow[] | null>(null);
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getUserId()) {
      setError('先在「我」里设置用户');
      return;
    }
    setLoading(true);
    try {
      const res = await api.mySchedule();
      setPlan(res.plan);
      setDate(res.date);
      setError(null);
      await syncGeofences(res.plan).catch(() => false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload whenever the tab is shown, e.g. after switching user in 「我」.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function checkIn(row: PlanRow) {
    try {
      const here = await currentPosition();
      // First visit to a site with no map location (e.g. new subdivision): capture it now.
      if (here && !row.siteLocation) {
        await api.setSiteLocation(row.siteId, { location: here, geofence: null, source: 'onsite' });
      }
      await api.recordVisit({
        siteId: row.siteId,
        type: 'manual_checkin',
        at: new Date().toISOString(),
        location: here,
      });
      Alert.alert('已打卡', row.siteName);
      await load();
    } catch (err) {
      Alert.alert('打卡失败', err instanceof Error ? err.message : String(err));
    }
  }

  const active = plan?.filter((p) => p.status === 'planned') ?? [];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}>
          <ThemedText type="subtitle">今天 {date}</ThemedText>
          {error && <ThemedText themeColor="danger">{error}</ThemedText>}
          {plan && active.length === 0 && <ThemedText themeColor="textSecondary">今天没有安排</ThemedText>}
          {active.map((row) => (
            <ThemedView key={row.id} type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{row.siteName}</ThemedText>
              <ThemedText>
                {row.stage ? STAGE_LABELS[row.stage].zh : row.jobTitle}
                {row.notes ? ` · ${row.notes}` : ''}
              </ThemedText>
              {!row.siteLocation && (
                <ThemedText type="small" themeColor="textSecondary">
                  这个工地还没有定位，到场后点下面按钮即可设定
                </ThemedText>
              )}
              <Button title="我在这个工地" onPress={() => void checkIn(row)} />
            </ThemedView>
          ))}
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
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
});
