import * as React from 'react';

/**
 * StatTile — from kioku@1.0.0.
 */
export interface StatTileProps {
label: string; value: React.ReactNode; caption?: string; accent?: string;
}

export declare const StatTile: React.ComponentType<StatTileProps>;
