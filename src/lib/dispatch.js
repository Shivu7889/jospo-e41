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
 * Returns badge metadata for co-loading status
 */
export function getCoLoadingBadge(dispatch) {
  const status = resolveCoLoadingStatus(dispatch);
  const originPlant = normalizePlant(dispatch?.from_location || 'E41 G2');
  const nextPlant = resolveNextLoadingPlant(dispatch);
  const secondPlant = resolveSecondPlant(dispatch) || nextPlant;

  if (status === 'part_loaded') {
    return {
      status: 'part_loaded',
      label: `Part Load (${originPlant} → Next: ${nextPlant || 'Next Plant'})`,
      shortLabel: `Part Load (${nextPlant || 'Stop 2'})`,
      icon: '⏳',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
      pillClass: 'bg-amber-100 text-amber-900',
      isComplete: false,
    };
  }

  if (status === 'fully_loaded') {
    return {
      status: 'fully_loaded',
      label: `Fully Loaded (${originPlant} + ${secondPlant || 'Stop 2'})`,
      shortLabel: `Co-Loaded (${originPlant} + ${secondPlant || 'Stop 2'})`,
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
  }

  const prefix = tags.join(' ');
  return clean ? `${prefix} ${clean}` : prefix;
}
