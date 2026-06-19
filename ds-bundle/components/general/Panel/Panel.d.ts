import * as React from 'react';

/**
 * Panel — from kioku@1.0.0.
 */
export interface PanelProps {
children: React.ReactNode; hoverable?: boolean; raised?: boolean; accentStrip?: string; className?: string; style?: React.CSSProperties; onClick?: () => void;
}

export declare const Panel: React.ComponentType<PanelProps>;
