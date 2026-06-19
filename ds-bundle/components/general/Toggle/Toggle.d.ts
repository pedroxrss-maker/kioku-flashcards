import * as React from 'react';

/**
 * Toggle — from kioku@1.0.0.
 */
export interface ToggleProps {
checked: boolean; onChange: (next: boolean) => void; label?: string; description?: string;
}

export declare const Toggle: React.ComponentType<ToggleProps>;
