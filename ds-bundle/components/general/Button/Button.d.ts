import * as React from 'react';

/**
 * Button — from kioku@1.0.0.
 */
export interface ButtonProps {
variant?: 'mega' | 'default' | 'accent' | 'ghost'; size?: 'sm' | 'md'; icon?: React.ReactNode; children?: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit' | 'reset'; className?: string;
}

export declare const Button: React.ComponentType<ButtonProps>;
