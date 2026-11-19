/**
 * Dispatch Helpers
 * Manages Dispatch Type ('local' - inter-plant transfer vs 'party' - customer/dealer dispatch)
 */

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

export function cleanDispatchRemarks(remarks) {
  if (!remarks) return '';
  return remarks.replace(/\[Type:\s*(Local|Party)\]/gi, '').trim();
}

export function formatDispatchRemarks(remarks, dispatchType = 'party') {
  const clean = cleanDispatchRemarks(remarks);
  const typeTag = dispatchType === 'local' ? '[Type: Local]' : '[Type: Party]';
  return clean ? `${typeTag} ${clean}` : typeTag;
}
