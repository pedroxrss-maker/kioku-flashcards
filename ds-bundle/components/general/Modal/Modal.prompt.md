Modal from kioku. Use via `window.KiokuDS.Modal` (bundle loaded from the root `_ds_bundle.js`).

Brand modal: 2px border + soft shadow, ESC + overlay close, fade/scale in
 AND out (never abrupt).

## Props

```ts
interface ModalProps {
open: boolean; onClose: () => void; title?: string; children: React.ReactNode; footer?: React.ReactNode; width?: number; onSubmit?: () => void; persistent?: boolean;
}
```
