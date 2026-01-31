
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
  nextArrival?: string; // Mapeado de 'proximo'
  subsequentArrival?: string; // Mapeado de 'seguinte'
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
