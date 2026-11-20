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

  const [inboundTransfersCount, setInboundTransfersCount] = useState(0);
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
  const fetchInboundTransfersCount = useCallback(async () => {
    if (!employee) return;
    try {
      setLoadingTransfers(true);
      // Fetch only unreceived confirmed dispatches (drastically reduces payload from thousands to just a few rows)
      let { data, error } = await supabase
        .from('dispatches')
        .select('id, destination, destination_plant, transfer_status, status, remarks, from_location, received_at')
        .eq('status', 'confirmed')
        .is('received_at', null);

      if (error && error.message?.includes('received_at')) {
        const retry = await supabase
          .from('dispatches')
          .select('id, destination, destination_plant, transfer_status, status, remarks, from_location')
          .eq('status', 'confirmed');
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
          if (activePlant === ALL_PLANTS_ID) {
            count += 1;
          } else if (destPlant === activePlant) {
            count += 1;
          }
        }
      });

      setInboundTransfersCount(count);
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
