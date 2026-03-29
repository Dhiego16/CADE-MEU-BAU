export interface BusSchedule {
  time: string;
  type: 'Dia Útil' | 'Sábado' | 'Domingo/Feriado';
}

export interface BusLine {
  id: string;
  number: string;
  name: string;
  origin: string;
  destination: string;
  schedules: BusSchedule[];
  frequencyMinutes: number;
  status: 'Normal' | 'Atrasado' | 'Indisponível';
  nextArrival?: string;
  subsequentArrival?: string;
  stopSource?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface ApiSettings {
  baseUrl: string;
  endpointTemplate: string;
  isConnected: boolean;
}

export interface FavoriteItem {
  stopId: string;
  lineNumber: string;
  destination: string;
  nickname?: string;
}

export interface SaldoData {
  cpf: string;
  tipoParceria: string;
  cartaoNumero: string;
  cartaoDescricao: string;
  tipo_saldo: 'monetario' | 'viagens';

  // tipo_saldo === 'monetario'
  saldo?: string;
  saldo_formatado: string;

  // tipo_saldo === 'viagens'
  viagens_usadas?: number;
  viagens_total?: number;
  viagens_restantes?: number;
}

export interface SaldoHistorico {
  saldo_formatado: string;
  cartaoDescricao: string;
  data: string;
  hora: string;
}

export interface PontoData {
  id: string;
  lat: number;
  lng: number;
  nome: string;
}

export interface PontoDataWithMarker extends PontoData {
  marker: LeafletMarker;
}

export interface LeafletMarker {
  setLatLng: (latlng: [number, number]) => void;
  setOpacity: (opacity: number) => void;
  remove: () => void;
  addTo: (map: LeafletMap) => LeafletMarker;
  bindPopup: (content: string) => LeafletMarker;
  on: (event: string, handler: () => void) => LeafletMarker;
}

export interface LeafletMap {
  setView: (center: [number, number], zoom: number, options?: object) => void;
  fitBounds: (bounds: [[number, number], [number, number]], options?: object) => void;
  getCenter: () => { lat: number; lng: number };
  invalidateSize: () => void;
  on: (event: string, handler: () => void) => void;
  off: (event: string, handler: () => void) => void;
  remove: () => void;
}

export type SearchError = 'offline' | 'not_found' | 'no_lines' | 'invalid_stop' | 'inactive_stop';

export interface SearchResult {
  lines: BusLine[];
  error?: SearchError;
}

export type ActiveTab = 'search' | 'favs' | 'sitpass' | 'map';

export interface LiveTrackingLine {
  lineNumber: string;
  stopId: string;
  stopLat: number;
  stopLng: number;
  destination: string;
}

export interface LeafletLib {
  icon: (opts: object) => object;
  marker: (latlng: [number, number], opts: object) => LeafletMarker;
  map: (el: HTMLElement, opts: object) => LeafletMap;
  tileLayer: (url: string, opts: object) => { addTo: (map: LeafletMap) => void };
  control: { zoom: (opts: object) => { addTo: (map: LeafletMap) => void } };
  divIcon: (opts: object) => object;
}

export interface ThemeTokens {
  bg: string;
  text: string;
  card: string;
  header: string;
  nav: string;
  input: string;
  inputWrap: string;
  subtext: string;
  divider: string;
  inactiveNav: string;
  timeCard1: string;
  timeCard2: string;
  destText: string;
  stopBadge: string;
  historyBtn: string;
  saldoText: string;
}
