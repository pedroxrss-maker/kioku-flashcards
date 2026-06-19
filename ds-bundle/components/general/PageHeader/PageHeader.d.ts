import * as React from 'react';

/**
 * PageHeader — from kioku@1.0.0.
 */
export interface PageHeaderProps {
title: string; subtitle?: string; action?: React.ReactNode;
}

export declare const PageHeader: React.ComponentType<PageHeaderProps>;
