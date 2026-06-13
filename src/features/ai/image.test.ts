import { describe, expect, it } from 'vitest';
import {
  IMAGE_GEN_CAP,
  IMAGE_STYLE_SUFFIX,
  appendImageHtml,
  atImageCap,
  imageSideForType,
  imageStorageTag,
  imagesRemaining,
  imagesUsed,
} from './image';
import type { AppSettings } from '../../db/types';

const withCount = (n?: number) => ({ imageGenCount: n }) as unknown as AppSettings;

describe('image cap helpers', () => {
  it('counts used / remaining and detects the cap', () => {
    expect(imagesUsed(undefined)).toBe(0);
    expect(imagesUsed(withCount(3))).toBe(3);
    expect(imagesRemaining(withCount(0))).toBe(IMAGE_GEN_CAP);
    expect(imagesRemaining(withCount(IMAGE_GEN_CAP - 1))).toBe(1);
    expect(atImageCap(withCount(IMAGE_GEN_CAP - 1))).toBe(false);
    expect(atImageCap(withCount(IMAGE_GEN_CAP))).toBe(true);
    expect(atImageCap(withCount(IMAGE_GEN_CAP + 5))).toBe(true);
    expect(imagesRemaining(withCount(IMAGE_GEN_CAP + 5))).toBe(0); // clamped to >= 0
  });
});

describe('image attach helpers', () => {
  it('chooses the side by card type (type-in keeps its exact answer in back)', () => {
    expect(imageSideForType('basic')).toBe('back');
    expect(imageSideForType('cloze')).toBe('back');
    expect(imageSideForType('typein')).toBe('front');
  });
  it('appends a kioku-media img, preserving existing html', () => {
    expect(imageStorageTag('u/d/x.png')).toContain('kioku-media://u/d/x.png');
    expect(appendImageHtml('', 'u/d/x.png')).toBe('<img src="kioku-media://u/d/x.png" alt="">');
    expect(appendImageHtml('Resposta', 'p')).toBe('Resposta<br><img src="kioku-media://p" alt="">');
  });
  it('exposes a non-empty fixed style suffix', () => {
    expect(IMAGE_STYLE_SUFFIX.length).toBeGreaterThan(20);
  });
});
