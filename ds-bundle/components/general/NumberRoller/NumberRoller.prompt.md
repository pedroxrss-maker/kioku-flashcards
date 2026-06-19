NumberRoller from kioku. Use via `window.KiokuDS.NumberRoller` (bundle loaded from the root `_ds_bundle.js`).

A vertical number wheel: the previous and next values sit dimmed above and
below the bold current value, fading out at the edges. Spin it by scrolling or
dragging vertically, tap a neighbour to step, or click the center to type a
value. Clamped to [min, max].

## Props

```ts
interface NumberRollerProps {
value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; suffix?: string; ariaLabel?: string;
}
```
