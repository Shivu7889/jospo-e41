'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabase } from '@/lib/supabase';
import {
  PLANTS,
  ALL_PLANTS_ID,
  DEFAULT_PLANT_ID,
  normalizePlant,
  isOwnerUser,
  resolveDestinationPlant,
  resolveTransferStatus,
  isInboundEnabledForPlant,
} from '@/lib/plants';

const PlantContext = createContext(null);

const STORAGE_KEY = 'jospo_active_plant';

export function PlantProvider({ children }) {
  const { employee, loading: authLoading } = useAuth();
  const supabase = getSupabase();

  const isOwner = useMemo(() => isOwnerUser(employee), [employee]);
  const userPlant = useMemo(() => {
    if (!employee) return DEFAULT_PLANT_ID;
    if (isOwner && employee.plant === 'ALL') return ALL_PLANTS_ID;
    return normalizePlant(employee.plant);
  }, [employee, isOwner]);

  // Active plant state
  const [activePlant, setActivePlantState] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return saved;
    }
    return DEFAULT_PLANT_ID;
  });

  const [inboundTransfersCount, setInboundTransfersCount] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem('jospo_inbound_count');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (typeof parsed?.count === 'number') return parsed.count;
        }
      } catch (e) {}
    }
    return 0;
  });
  const [loadingTransfers, setLoadingTransfers] = useState(false);

  // Sync activePlant based on role / userPlant
  useEffect(() => {
    if (authLoading) return;

    if (!isOwner) {
      // Non-owner employees are strictly bound to their assigned plant
      setActivePlantState(userPlant);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, userPlant);
      }
    } else {
      // Owner can view ALL or any specific plant
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && (saved === ALL_PLANTS_ID || PLANTS.some((p) => p.id === saved))) {
          setActivePlantState(saved);
        } else {
          setActivePlantState(ALL_PLANTS_ID);
        }
      }
    }
  }, [authLoading, isOwner, userPlant]);

  // Set active plant with permission check
  const setActivePlant = useCallback(
    (newPlant) => {
      if (!isOwner) {
        console.warn('Plant switching is restricted to Owner/Super Admin.');
        return;
      }
      const normalized = newPlant === ALL_PLANTS_ID ? ALL_PLANTS_ID : normalizePlant(newPlant);
      setActivePlantState(normalized);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, normalized);
      }
    },
    [isOwner]
  );

  // Fetch pending inbound transfers count for activePlant
  const fetchInboundTransfersCount = useCallback(async (forceRefresh = false) => {
    if (!employee) return;
    // Skip query completely if inbound tracking is disabled for this plant (or all plants)
    if (!isInboundEnabledForPlant(activePlant)) {
      setInboundTransfersCount(0);
      return;
    }

    // 15s client-side TTL cache avoids re-querying Supabase on every route navigation
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem('jospo_inbound_count');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.plant === activePlant && parsed.expiresAt > Date.now()) {
            setInboundTransfersCount(parsed.count || 0);
            return;
          }
        }
      } catch (e) {}
    }

    try {
      setLoadingTransfers(true);
      // Only fetch local transfers in_transit instead of scanning all confirmed party dispatches!
      let { data, error } = await supabase
        .from('dispatches')
        .select('id, destination, destination_plant, transfer_status, status, remarks, from_location, received_at, dispatch_type')
        .eq('status', 'confirmed')
        .eq('dispatch_type', 'local')
        .eq('transfer_status', 'in_transit')
        .is('received_at', null)
        .limit(50);

      if (error && (error.message?.includes('dispatch_type') || error.message?.includes('transfer_status') || error.message?.includes('received_at'))) {
        const retry = await supabase
          .from('dispatches')
          .select('id, destination, destination_plant, transfer_status, status, remarks, from_location')
          .eq('status', 'confirmed')
          .order('created_at', { ascending: false })
          .limit(50);
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;

      let count = 0;
      (data || []).forEach((d) => {
        const destPlant = resolveDestinationPlant(d);
        const originPlant = normalizePlant(d.from_location);
        const status = resolveTransferStatus(d);
        // Constraint: Valid inter-plant transfer must not originate and terminate at the same plant
        if (destPlant && destPlant !== originPlant && status === 'in_transit') {
          // Skip if destination plant does not have inbound transfers enabled yet (e.g. D4, C116)
          if (!isInboundEnabledForPlant(destPlant)) return;

          if (activePlant === ALL_PLANTS_ID) {
            count += 1;
          } else if (destPlant === activePlant) {
            count += 1;
          }
        }
      });

      setInboundTransfersCount(count);
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(
            'jospo_inbound_count',
            JSON.stringify({ count, plant: activePlant, expiresAt: Date.now() + 15000 })
          );
        } catch (e) {}
      }
    } catch (err) {
      console.error('Error fetching inbound transfers count:', err);
    } finally {
      setLoadingTransfers(false);
    }
  }, [employee, activePlant, supabase]);

  useEffect(() => {
    fetchInboundTransfersCount();
  }, [fetchInboundTransfersCount]);

  const value = useMemo(
    () => ({
      activePlant,
      setActivePlant,
      isOwner,
      userPlant,
      allPlants: PLANTS,
      inboundTransfersCount,
      refreshInboundTransfersCount: fetchInboundTransfersCount,
      loadingTransfers,
    }),
    [
      activePlant,
      setActivePlant,
      isOwner,
      userPlant,
      inboundTransfersCount,
      fetchInboundTransfersCount,
      loadingTransfers,
    ]
  );

  return <PlantContext.Provider value={value}>{children}</PlantContext.Provider>;
}

export function usePlant() {
  const context = useContext(PlantContext);
  if (!context) {
    throw new Error('usePlant must be used within a PlantProvider');
  }
  return context;
}
