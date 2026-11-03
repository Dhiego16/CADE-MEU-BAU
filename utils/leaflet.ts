// Carrega o Leaflet pelo npm (sob demanda, só quando um mapa é aberto) e expõe em window.L,
// que é como o resto do app o usa. Antes vinha do unpkg.com, que não existe sem internet.

let loading: Promise<void> | null = null;

export function loadLeaflet(): Promise<void> {
  if ((window as { L?: unknown }).L) return Promise.resolve();
  if (!loading) {
    loading = Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')])
      .then(([mod]) => {
        (window as unknown as { L: unknown }).L = (mod as { default?: unknown }).default ?? mod;
      })
      .catch((err) => { loading = null; throw err; }); // permite tentar de novo
  }
  return loading;
}
