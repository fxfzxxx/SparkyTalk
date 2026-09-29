/**
 * Automatic site arrival/departure (CLAUDE.md §6).
 * Only enter/exit events for today's sites are recorded — no continuous tracking.
 */
import type { Geofence, PlanRow } from '@sparkytalk/shared';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { api } from '@/lib/api';
import { loadSession } from '@/lib/session';

const TASK = 'sparkytalk-site-geofence';
/** iOS monitors at most 20 regions per app. */
const MAX_REGIONS = 20;
const DEFAULT_RADIUS_M = 60;

TaskManager.defineTask<{ eventType: Location.GeofencingEventType; region: Location.LocationRegion }>(
  TASK,
  async ({ data, error }) => {
    if (error || !data?.region.identifier) return;
    await loadSession(); // the task can run without the UI, so restore identity first
    const type = data.eventType === Location.GeofencingEventType.Enter ? 'enter' : 'exit';
    try {
      await api.recordVisit({
        siteId: data.region.identifier,
        type,
        at: new Date().toISOString(),
        location: null,
      });
    } catch {
      // TODO: queue offline and retry when the network is back (工地信号差)
    }
  },
);

const EARTH_RADIUS_M = 6_371_000;

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** OS geofences are circles; a parcel polygon becomes its enclosing circle. */
export function fenceToCircle(fence: Geofence): { lat: number; lng: number; radiusM: number } {
  if (fence.kind === 'circle') return { ...fence.center, radiusM: fence.radiusM };
  const lat = fence.points.reduce((s, p) => s + p.lat, 0) / fence.points.length;
  const lng = fence.points.reduce((s, p) => s + p.lng, 0) / fence.points.length;
  const radiusM = Math.max(...fence.points.map((p) => distanceM({ lat, lng }, p)));
  return { lat, lng, radiusM: Math.max(radiusM, DEFAULT_RADIUS_M) };
}

/**
 * Registers geofences for the sites in today's plan. Safe to call repeatedly.
 * Returns false when background location isn't permitted; manual check-in still works.
 */
export async function syncGeofences(plan: PlanRow[]): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return false;
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (!bg.granted) return false;

  const regions = new Map<string, Location.LocationRegion>();
  for (const row of plan) {
    if (row.status !== 'planned' || regions.has(row.siteId)) continue;
    const circle = row.siteGeofence
      ? fenceToCircle(row.siteGeofence)
      : row.siteLocation
        ? { ...row.siteLocation, radiusM: DEFAULT_RADIUS_M }
        : null;
    if (!circle) continue;
    regions.set(row.siteId, {
      identifier: row.siteId,
      latitude: circle.lat,
      longitude: circle.lng,
      radius: circle.radiusM,
    });
  }

  const list = [...regions.values()].slice(0, MAX_REGIONS);
  if (list.length === 0) {
    if (await Location.hasStartedGeofencingAsync(TASK)) await Location.stopGeofencingAsync(TASK);
    return true;
  }
  await Location.startGeofencingAsync(TASK, list);
  return true;
}

/** "我在这个工地": current GPS position, used for manual check-in and first-visit site capture. */
export async function currentPosition() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return null;
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}
