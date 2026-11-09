import { useSyncExternalStore } from 'react';
import { z } from 'zod';

const KEY = 'asset-layer-overrides-v1';

const layerOverrideSchema = z.object({
  liquid: z.number().finite().min(0).max(1e15),
  staked: z.number().finite().min(0).max(1e15),
  collateral: z.number().finite().min(0).max(1e15),
  borrowUsd: z.number().finite().min(0).max(1e15),
});

const overrideMapSchema = z.record(z.string().regex(/^[A-Z0-9]{1,16}$/), layerOverrideSchema);

export type AssetLayerOverride = z.infer<typeof layerOverrideSchema>;
export type AssetLayerOverrideMap = Record<string, AssetLayerOverride>;

function load(): AssetLayerOverrideMap {
  try {
    const parsed = overrideMapSchema.safeParse(JSON.parse(localStorage.getItem(KEY) || '{}'));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

let state = load();
const listeners = new Set<() => void>();

function emit() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach(listener => listener());
}

export function validateAssetLayerOverride(value: unknown) {
  return layerOverrideSchema.safeParse(value);
}

export function setAssetLayerOverride(symbol: string, value: AssetLayerOverride): boolean {
  const key = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,16}$/.test(key)) return false;
  const parsed = layerOverrideSchema.safeParse(value);
  if (!parsed.success) return false;
  state = { ...state, [key]: parsed.data };
  emit();
  return true;
}

export function clearAssetLayerOverride(symbol: string) {
  const key = symbol.trim().toUpperCase();
  if (!(key in state)) return;
  const next = { ...state };
  delete next[key];
  state = next;
  emit();
}

export function useAssetLayerOverrides(): AssetLayerOverrideMap {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    () => state,
    () => state,
  );
}