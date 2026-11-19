/**
 * Jospo Enterprise - Multi-Plant Configuration & Helpers
 * Three Manufacturing Plants:
 * 1. E41 G2 (Main / Unit 1 - Formerly Jospo E41)
 * 2. D4 (Unit 2)
 * 3. C116 (Unit 3)
 */

export const PLANTS = [
  {
    id: 'E41 G2',
    name: 'E41 G2 Plant',
    code: 'E41',
    shortName: 'E41 G2',
    color: 'indigo',
    icon: '🏭',
    tagColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    description: 'Unit 1 / Main Manufacturing Facility',
  },
  {
    id: 'D4',
    name: 'D4 Plant',
    code: 'D4',
    shortName: 'D4',
    color: 'emerald',
    icon: '🏭',
    tagColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    description: 'Unit 2 Manufacturing Facility',
  },
  {
    id: 'C116',
    name: 'C116 Plant',
    code: 'C116',
    shortName: 'C116',
    color: 'amber',
    icon: '🏭',
    tagColor: 'bg-amber-100 text-amber-800 border-amber-200',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    description: 'Unit 3 Manufacturing Facility',
  },
];

export const ALL_PLANTS_ID = 'ALL';
export const DEFAULT_PLANT_ID = 'E41 G2';

/**
 * Normalizes any plant string (e.g. 'Jospo E41', 'E41', 'E41 G2', 'D4', 'C116')
 * into the canonical ID: 'E41 G2', 'D4', 'C116', or 'ALL'.
 */
export function normalizePlant(plantStr) {
  if (!plantStr) return DEFAULT_PLANT_ID;
  const str = String(plantStr).trim().toUpperCase();
  if (str === 'ALL') return ALL_PLANTS_ID;
  if (str.includes('D4')) return 'D4';
  if (str.includes('C116') || str.includes('C-116')) return 'C116';
  if (str.includes('E41') || str.includes('E-41') || str.includes('JOSPO')) return 'E41 G2';
  return DEFAULT_PLANT_ID;
}

/**
 * Checks if user has Owner / Super Admin privileges across all plants.
 */
export function isOwnerUser(employee) {
  if (!employee) return false;
  if (employee.role === 'owner') return true;
  if (employee.is_owner === true) return true;
  if (employee.plant === 'ALL') return true;
  // If user is admin and plant is explicitly 'ALL' or not restricted
  if (employee.role === 'admin' && (!employee.plant || employee.plant === 'ALL')) {
    return true;
  }
  return false;
}

/**
 * Returns plant metadata object for a given plant ID
 */
export function getPlantMeta(plantId) {
  if (plantId === ALL_PLANTS_ID) {
    return {
      id: ALL_PLANTS_ID,
      name: 'All Plants (Consolidated)',
      code: 'ALL',
      shortName: 'All Plants',
      color: 'purple',
      icon: '🌐',
      tagColor: 'bg-purple-100 text-purple-800 border-purple-200',
      badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
      description: 'Consolidated view across E41 G2, D4, and C116',
    };
  }
  const normalized = normalizePlant(plantId);
  return PLANTS.find((p) => p.id === normalized) || PLANTS[0];
}

/**
 * Returns other plants excluding the origin plant (for inter-plant transfers)
 */
export function getOtherPlants(originPlant) {
  const origin = normalizePlant(originPlant);
  return PLANTS.filter((p) => p.id !== origin);
}

/**
 * Clean multi-plant metadata tags from user remarks
 */
export function cleanPlantRemarks(remarks) {
  if (!remarks) return '';
  return remarks
    .replace(/\[Plant:\s*[^\]]+\]/gi, '')
    .replace(/\[DestPlant:\s*[^\]]+\]/gi, '')
    .replace(/\[TransferStatus:\s*[^\]]+\]/gi, '')
    .trim();
}

/**
 * Append multi-plant fallback metadata tags to remarks
 */
export function formatPlantRemarks(remarks, { plant, destinationPlant, transferStatus } = {}) {
  const clean = cleanPlantRemarks(remarks);
  const tags = [];
  if (plant) tags.push(`[Plant: ${normalizePlant(plant)}]`);
  if (destinationPlant) tags.push(`[DestPlant: ${normalizePlant(destinationPlant)}]`);
  if (transferStatus) tags.push(`[TransferStatus: ${transferStatus}]`);

  const tagStr = tags.join(' ');
  return clean ? `${tagStr} ${clean}` : tagStr;
}

/**
 * Resolve plant from record (checks column, fallback tags in remarks, or default)
 */
export function resolvePlantFromRecord(record, defaultPlant = DEFAULT_PLANT_ID) {
  if (record?.plant) {
    return normalizePlant(record.plant);
  }
  if (record?.from_location) {
    return normalizePlant(record.from_location);
  }
  if (record?.remarks) {
    const match = record.remarks.match(/\[Plant:\s*([^\]]+)\]/i);
    if (match && match[1]) {
      return normalizePlant(match[1]);
    }
  }
  return normalizePlant(defaultPlant);
}

/**
 * Resolve destination plant for inter-plant transfers
 */
export function resolveDestinationPlant(dispatch) {
  if (dispatch?.destination_plant) {
    return normalizePlant(dispatch.destination_plant);
  }
  if (dispatch?.remarks) {
    const match = dispatch.remarks.match(/\[DestPlant:\s*([^\]]+)\]/i);
    if (match && match[1]) {
      return normalizePlant(match[1]);
    }
  }
  // Try matching destination text
  if (dispatch?.destination) {
    const norm = normalizePlant(dispatch.destination);
    if (['E41 G2', 'D4', 'C116'].includes(norm)) {
      return norm;
    }
  }
  return null;
}

/**
 * Resolve transfer status: 'in_transit' | 'received' | 'completed'
 */
export function resolveTransferStatus(dispatch) {
  if (dispatch?.transfer_status) {
    return dispatch.transfer_status;
  }
  if (dispatch?.remarks) {
    const match = dispatch.remarks.match(/\[TransferStatus:\s*([^\]]+)\]/i);
    if (match && match[1]) {
      return match[1].toLowerCase().trim();
    }
  }
  // If confirmed local dispatch with destination plant, default to in_transit if not marked received
  if (dispatch?.status === 'confirmed') {
    const destPlant = resolveDestinationPlant(dispatch);
    if (destPlant) {
      return dispatch?.received_at ? 'received' : 'in_transit';
    }
  }
  return 'completed';
}

/**
 * Clean model description of [MfgPlant: ...] tags
 */
export function cleanModelDescription(desc) {
  if (!desc) return '';
  return desc.replace(/\[(?:MfgPlant|Plant):\s*[^\]]+\]/gi, '').trim();
}

/**
 * Format model description with fallback [MfgPlant: ...] tag
 */
export function formatModelDescription(desc, plant) {
  const clean = cleanModelDescription(desc);
  const tag = `[MfgPlant: ${normalizePlant(plant)}]`;
  return clean ? `${tag} ${clean}` : tag;
}

/**
 * Resolve which manufacturing plant owns/produces this model.
 * E41 G2, C116, or D4.
 */
export function resolveModelManufacturingPlant(model, defaultPlant = DEFAULT_PLANT_ID) {
  if (model?.manufacturing_plant) {
    return normalizePlant(model.manufacturing_plant);
  }
  if (model?.description) {
    const match = model.description.match(/\[(?:MfgPlant|Plant):\s*([^\]]+)\]/i);
    if (match && match[1]) {
      return normalizePlant(match[1]);
    }
  }
  return normalizePlant(defaultPlant);
}

/**
 * Check if a plant is allowed to manufacture / add production for this model.
 * - E41 G2: only manufactures E41 G2 models.
 * - C116: only manufactures C116 models.
 * - D4: only manufactures D4 models (cannot add production for E41 G2 / C116 models).
 * - ALL / Owner: permitted based on active plant selection.
 */
export function isModelManufacturableAtPlant(model, plant) {
  if (!plant || plant === ALL_PLANTS_ID) return true;
  const mfgPlant = resolveModelManufacturingPlant(model);
  return normalizePlant(plant) === mfgPlant;
}

/**
 * Check if a model should be visible in a plant's physical stock overview.
 * - E41 G2: only E41 G2 models (or models with positive physical stock from transfers).
 * - C116: only C116 models (or models with positive physical stock from transfers).
 * - D4: only D4 models (or models with positive physical stock from transfers).
 * - ALL (Owner): ALL models.
 */
export function isModelVisibleInPlantStock(model, plant, plantStock = 0) {
  const norm = normalizePlant(plant);
  if (norm === ALL_PLANTS_ID) return true;
  // D4 is the co-loading & secondary dispatch hub: all models are visible,
  // but showing D4's own warehouse stock (0 if no units physically at D4)
  if (norm === 'D4') return true;
  const mfgPlant = resolveModelManufacturingPlant(model);
  if (norm === mfgPlant) return true;
  if (Number(plantStock) > 0) return true;
  return false;
}

