import * as React from 'react';

/**
 * Select — from kioku@1.0.0.
 */
export interface SelectProps {
value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; id?: string; ariaLabel?: string;
}

export declare const Select: React.ComponentType<SelectProps>;
