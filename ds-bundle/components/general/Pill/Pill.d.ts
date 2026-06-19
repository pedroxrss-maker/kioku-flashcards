import * as React from 'react';

/**
 * Pill — from kioku@1.0.0.
 */
export interface PillProps {
children: React.ReactNode; active?: boolean; muted?: boolean; onClick?: () => void; className?: string; title?: string;
}

export declare const Pill: React.ComponentType<PillProps>;
