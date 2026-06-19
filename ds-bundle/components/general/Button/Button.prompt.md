Button from kioku. Use via `window.KiokuDS.Button` (bundle loaded from the root `_ds_bundle.js`).

Hard-edged brand button. `mega` is the white→accent primary CTA.

## Props

```ts
interface ButtonProps {
variant?: 'mega' | 'default' | 'accent' | 'ghost'; size?: 'sm' | 'md'; icon?: React.ReactNode; children?: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit' | 'reset'; className?: string;
}
```
