/** Read a File as base64 (no data: prefix), for sending PDFs to Anthropic as a
 *  document content block. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const r = String(fr.result);
      const comma = r.indexOf(',');
      resolve(comma >= 0 ? r.slice(comma + 1) : r);
    };
    fr.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    fr.readAsDataURL(file);
  });
}
