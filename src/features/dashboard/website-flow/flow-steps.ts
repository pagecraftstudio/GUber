/** The three steps of the website flow. A plain module (not a 'use client' file) so server pages can read the list: a value exported from a client module reaches the server as an opaque reference, not as the array. */
export const FLOW_STEPS = ['design', 'preview', 'publish'] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];
