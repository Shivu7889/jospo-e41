/**
 * Dispatch Helpers
 * Manages Dispatch Type ('local' - inter-plant transfer vs 'party' - customer/dealer dispatch)
 * and Multi-Plant Co-Loading (Shared Vehicle across E41, D4, C116)
 */

import { normalizePlant } from './plants';

export function resolveDispatchType(dispatch) {
  if (dispatch?.dispatch_type) {
    const dt = String(dispatch.dispatch_type).toLowerCase().trim();
    if (dt === 'local') return 'local';
    return 'party';
  }
  if (dispatch?.remarks?.includes('[Type: Local]')) {
    return 'local';
  }
  return 'party';
}

export function getDispatchTypeMeta(typeOrDispatch) {
  const type = typeof typeOrDispatch === 'string' ? typeOrDispatch : resolveDispatchType(typeOrDispatch);
  if (type === 'local') {
    return {
      type: 'local',
      label: 'Local Dispatch (Other Plant)',
      shortLabel: 'Local (Plant)',
      badgeLabel: '🏭 Local Plant',
      icon: '🏭',
      description: 'Internal transfer to our other plant division',
      badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
      pillClass: 'bg-purple-100 text-purple-800',
    };
  }
  return {
    type: 'party',
    label: 'Party Dispatch',
    shortLabel: 'Party',
    badgeLabel: '🏢 Party',
    icon: '🏢',
    description: 'Commercial shipment to customer / dealer / party',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    pillClass: 'bg-blue-100 text-blue-800',
  };
}

/**
 * Checks if a dispatch is part of multi-plant co-loading (split load across 2 plants)
 */
export function isCoLoadingDispatch(dispatch) {
  if (!dispatch) return false;
  if (dispatch.is_coloading === true || dispatch.is_coloading === 'true') return true;
  if (dispatch.coloading_status && dispatch.coloading_status !== 'not_applicable') return true;
  if (dispatch.remarks && /\[CoLoading:\s*true\]/i.test(dispatch.remarks)) return true;
  return false;
}

/**
 * Resolves current co-loading status: 'not_applicable' | 'part_loaded' | 'fully_loaded'
 */
export function resolveCoLoadingStatus(dispatch) {
  if (!dispatch || !isCoLoadingDispatch(dispatch)) return 'not_applicable';
  if (dispatch.coloading_status) {
    const s = String(dispatch.coloading_status).toLowerCase().trim();
    if (s === 'part_loaded' || s === 'partially_loaded') return 'part_loaded';
    if (s === 'fully_loaded' || s === 'completed') return 'fully_loaded';
  }
  const match = dispatch.remarks?.match(/\[CoLoadingStatus:\s*([^\]]+)\]/i);
  if (match) {
    const val = match[1].toLowerCase().trim();
    if (val === 'part_loaded') return 'part_loaded';
    if (val === 'fully_loaded') return 'fully_loaded';
  }
  // If confirmed and has second_plant, it is fully loaded; otherwise part_loaded
  if (dispatch.second_plant || dispatch.second_plant_confirmed_at) return 'fully_loaded';
  return 'part_loaded';
}

/**
 * Resolves the next loading plant where this vehicle is scheduled to stop
 */
export function resolveNextLoadingPlant(dispatch) {
  if (!dispatch) return null;
  if (dispatch.next_loading_plant) return normalizePlant(dispatch.next_loading_plant);
  const match = dispatch.remarks?.match(/\[NextPlant:\s*([^\]]+)\]/i);
  if (match) return normalizePlant(match[1]);
  return null;
}

/**
 * Resolves the second plant that completed the loading
 */
export function resolveSecondPlant(dispatch) {
  if (!dispatch) return null;
  if (dispatch.second_plant) return normalizePlant(dispatch.second_plant);
  const match = dispatch.remarks?.match(/\[SecondPlant:\s*([^\]]+)\]/i);
  if (match) return normalizePlant(match[1]);
  return null;
}

/**
 * Resolves which plant a specific dispatch line item was loaded from
 */
export function resolveItemLoadedPlant(item, dispatch) {
  if (item?.loaded_plant) return normalizePlant(item.loaded_plant);
  const match = item?.notes?.match(/\[LoadedAt:\s*([^\]]+)\]/i);
  if (match) return normalizePlant(match[1]);
  // Default to dispatch from_location or E41 G2
  return normalizePlant(dispatch?.from_location || 'E41 G2');
}

/**
 * Returns an array of all distinct plants that have loaded items into this dispatch
 */
export function getDispatchLoadedPlants(dispatch) {
  if (!dispatch) return [];
  const plants = new Set();
  if (dispatch.from_location) {
    plants.add(normalizePlant(dispatch.from_location));
  }
  if (Array.isArray(dispatch.dispatch_items)) {
    dispatch.dispatch_items.forEach((item) => {
      const p = resolveItemLoadedPlant(item, dispatch);
      if (p) plants.add(p);
    });
  }
  if (dispatch.second_plant) {
    plants.add(normalizePlant(dispatch.second_plant));
  }
  if (dispatch.third_plant) {
    plants.add(normalizePlant(dispatch.third_plant));
  }
  return Array.from(plants);
}

/**
 * Checks whether this dispatch belongs to, or is scheduled to visit, a given plant
 */
export function isDispatchRelevantToPlant(dispatch, plant) {
  if (!dispatch || !plant) return false;
  const p = normalizePlant(plant);
  if (normalizePlant(dispatch.from_location) === p) return true;
  if (resolveNextLoadingPlant(dispatch) === p) return true;
  if (resolveSecondPlant(dispatch) === p) return true;
  if (dispatch.third_plant && normalizePlant(dispatch.third_plant) === p) return true;
  if (dispatch.dispatch_items?.some((it) => resolveItemLoadedPlant(it, dispatch) === p)) return true;
  return false;
}

/**
 * Formats the full multi-plant chain route string
 * e.g. "E41 G2 ➔ C116 ➔ D4 ➔ Party: XYZ"
 */
export function formatCoLoadingRoute(dispatch) {
  if (!dispatch) return '';
  const loadedPlants = getDispatchLoadedPlants(dispatch);
  const nextPlant = resolveNextLoadingPlant(dispatch);
  const status = resolveCoLoadingStatus(dispatch);
  const dest = dispatch.destination || 'Party';

  if (!isCoLoadingDispatch(dispatch)) {
    return `🏭 ${normalizePlant(dispatch.from_location || 'E41 G2')} ➔ 🏢 ${dest}`;
  }

  const parts = loadedPlants.map((p, idx) => `Stop ${idx + 1}: 🏭 ${p}`);
  if (status === 'part_loaded' && nextPlant && !loadedPlants.includes(nextPlant)) {
    parts.push(`Next: 🏭 ${nextPlant}`);
  }
  return parts.join(' ➔ ') + ` ➔ 🏢 ${dest}`;
}

/**
 * Returns badge metadata for co-loading status (supports 2 and 3 plant chains)
 */
export function getCoLoadingBadge(dispatch) {
  const status = resolveCoLoadingStatus(dispatch);
  const loadedPlants = getDispatchLoadedPlants(dispatch);
  const nextPlant = resolveNextLoadingPlant(dispatch);

  if (status === 'part_loaded') {
    return {
      status: 'part_loaded',
      label: `Part Load (${loadedPlants.join(' + ')} ➔ Next: ${nextPlant || 'Next Plant'})`,
      shortLabel: `Part Load (➔ ${nextPlant || 'Next'})`,
      icon: '⏳',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
      pillClass: 'bg-amber-100 text-amber-900',
      isComplete: false,
    };
  }

  if (status === 'fully_loaded') {
    return {
      status: 'fully_loaded',
      label: `Fully Loaded (${loadedPlants.join(' + ')})`,
      shortLabel: `Co-Loaded (${loadedPlants.join(' + ')})`,
      icon: '✅',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
      pillClass: 'bg-emerald-100 text-emerald-900',
      isComplete: true,
    };
  }

  return null;
}

export function cleanDispatchRemarks(remarks) {
  if (!remarks) return '';
  return remarks
    .replace(/\[Type:\s*(Local|Party)\]/gi, '')
    .replace(/\[CoLoading:\s*(true|false)\]/gi, '')
    .replace(/\[NextPlant:\s*[^\]]+\]/gi, '')
    .replace(/\[CoLoadingStatus:\s*[^\]]+\]/gi, '')
    .replace(/\[SecondPlant:\s*[^\]]+\]/gi, '')
    .replace(/\[ThirdPlant:\s*[^\]]+\]/gi, '')
    .trim();
}

export function formatDispatchRemarks(remarks, dispatchType = 'party', coLoadingOpts = null) {
  const clean = cleanDispatchRemarks(remarks);
  const tags = [];
  tags.push(dispatchType === 'local' ? '[Type: Local]' : '[Type: Party]');

  if (coLoadingOpts?.isCoLoading) {
    tags.push('[CoLoading: true]');
    if (coLoadingOpts.nextLoadingPlant) {
      tags.push(`[NextPlant: ${normalizePlant(coLoadingOpts.nextLoadingPlant)}]`);
    }
    if (coLoadingOpts.status) {
      tags.push(`[CoLoadingStatus: ${coLoadingOpts.status}]`);
    }
    if (coLoadingOpts.secondPlant) {
      tags.push(`[SecondPlant: ${normalizePlant(coLoadingOpts.secondPlant)}]`);
    }
    if (coLoadingOpts.thirdPlant) {
      tags.push(`[ThirdPlant: ${normalizePlant(coLoadingOpts.thirdPlant)}]`);
    }
  }

  const prefix = tags.join(' ');
  return clean ? `${prefix} ${clean}` : prefix;
}
