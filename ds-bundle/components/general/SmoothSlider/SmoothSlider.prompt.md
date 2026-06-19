SmoothSlider from kioku. Use via `window.KiokuDS.SmoothSlider` (bundle loaded from the root `_ds_bundle.js`).

Range input that tracks its value locally while dragging — so the thumb and
label move fluidly with the pointer — and persists once, on release. Avoids
the jank of writing to the store on every intermediate step.

## Props

```ts
interface SmoothSliderProps {
value: number; min: number; max: number; step: number; onCommit: (v: number) => void; label: (v: number) => React.ReactNode; footer?: React.ReactNode; id?: string;
}
```
