import * as React from 'react';

/**
 * SmoothSlider — from kioku@1.0.0.
 */
export interface SmoothSliderProps {
value: number; min: number; max: number; step: number; onCommit: (v: number) => void; label: (v: number) => React.ReactNode; footer?: React.ReactNode; id?: string;
}

export declare const SmoothSlider: React.ComponentType<SmoothSliderProps>;
