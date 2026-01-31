
import { BusLine } from './types';

export const MOCK_BUS_LINES: BusLine[] = [
  {
    id: '1',
    number: '411',
    name: 'Centro - Bairro Novo',
    origin: 'Terminal Central',
    destination: 'Bairro Novo - Setor A',
    frequencyMinutes: 15,
    status: 'Normal',
    schedules: [
      { time: '06:00', type: 'Dia Útil' },
      { time: '06:15', type: 'Dia Útil' },
      { time: '06:30', type: 'Dia Útil' },
      { time: '06:45', type: 'Dia Útil' },
      { time: '07:00', type: 'Dia Útil' },
      { time: '07:15', type: 'Dia Útil' },
      { time: '08:00', type: 'Sábado' },
    ]
  },
  {
    id: '2',
    number: '202',
    name: 'Circular Universitária',
    origin: 'Campus Norte',
    destination: 'Campus Sul',
    frequencyMinutes: 20,
    status: 'Atrasado',
    schedules: [
      { time: '07:20', type: 'Dia Útil' },
      { time: '07:40', type: 'Dia Útil' },
      { time: '08:00', type: 'Dia Útil' },
    ]
  },
  {
    id: '3',
    number: '505',
    name: 'Expresso Aeroporto',
    origin: 'Centro Histórico',
    destination: 'Aeroporto Internacional',
    frequencyMinutes: 30,
    status: 'Normal',
    schedules: [
      { time: '05:00', type: 'Dia Útil' },
      { time: '05:30', type: 'Dia Útil' },
      { time: '06:00', type: 'Dia Útil' },
    ]
  }
];
