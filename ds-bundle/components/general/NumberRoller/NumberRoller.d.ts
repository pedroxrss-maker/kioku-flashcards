import * as React from 'react';

/**
 * NumberRoller — from kioku@1.0.0.
 */
export interface NumberRollerProps {
value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; suffix?: string; ariaLabel?: string;
}

export declare const NumberRoller: React.ComponentType<NumberRollerProps>;
