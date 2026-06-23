// src/lib/demo/storage.ts
// Mock de `supabase.storage`: el archivo (logo) se guarda como data-URL en
// localStorage; getPublicUrl devuelve esa data-URL (sirve en <img> y en jsPDF).
const PREFIX = 'agromar-demo-file:';

function fileToDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export const storage = {
  from(_bucket: string) {
    return {
      async upload(path: string, file: File, _opts?: unknown) {
        try {
          localStorage.setItem(PREFIX + path, await fileToDataURL(file));
          return { data: { path }, error: null };
        } catch (e) {
          return { data: null, error: { message: e instanceof Error ? e.message : 'upload error' } };
        }
      },
      getPublicUrl(path: string) {
        return { data: { publicUrl: localStorage.getItem(PREFIX + path) || path } };
      },
    };
  },
};
