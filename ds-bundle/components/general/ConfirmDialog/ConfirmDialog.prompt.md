ConfirmDialog from kioku. Use via `window.KiokuDS.ConfirmDialog` (bundle loaded from the root `_ds_bundle.js`).

Confirmação interna do Kioku (substitui o window.confirm nativo do navegador).
Mesma identidade visual dos demais modais; o botão de confirmar usa o accent
(ações destrutivas, como excluir).

## Props

```ts
interface ConfirmDialogProps {
open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: React.ReactNode; confirmLabel?: string; cancelLabel?: string;
}
```
