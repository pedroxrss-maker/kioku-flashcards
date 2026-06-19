Select from kioku. Use via `window.KiokuDS.Select` (bundle loaded from the root `_ds_bundle.js`).

Themed dropdown that replaces the native <select> (whose menu is OS-styled and
off-theme). The panel slides DOWN from the trigger (height reveal) and matches
the Kioku surfaces. Closes on outside click or Escape.

## Props

```ts
interface SelectProps {
value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; id?: string; ariaLabel?: string;
}
```
