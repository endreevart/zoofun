export type ParkResident = {
  id: string;
  name: string;
  seed: number;
  kindId: string;
  sideColor: string;
  accentColor: string;
  model: string;
  x: number;
  z: number;
};

/** Bundled park animals. Every garden has them; they never spend a credit. */
export const PARK_RESIDENTS: ParkResident[] = [
  {
    id: 'resident_cypa',
    name: 'Цыпа',
    seed: 202609041,
    kindId: 'jumper',
    sideColor: '#7ec8f0',
    accentColor: '#f4c14a',
    model: 'models/creatures/felt-chicken.glb',
    x: 3.4,
    z: 2.8,
  },
  {
    id: 'resident_hobotok',
    name: 'Хоботок',
    seed: 202609042,
    kindId: 'stomper',
    sideColor: '#5b8def',
    accentColor: '#ffd85e',
    model: 'models/creatures/snufflephant.glb',
    x: -8.6,
    z: -1.4,
  },
  {
    id: 'resident_zhirafik',
    name: 'Жирафик',
    seed: 202609043,
    kindId: 'stomper',
    sideColor: '#f4c14a',
    accentColor: '#e85d3a',
    model: 'models/creatures/giraffe.glb',
    x: 11.2,
    z: -6.4,
  },
  {
    id: 'resident_kroka',
    name: 'Крока',
    seed: 202609044,
    kindId: 'swimmer',
    sideColor: '#63c93f',
    accentColor: '#2f6b28',
    model: 'models/creatures/crocodoodle.glb',
    x: -15.2,
    z: -4.2,
  },
];

export function isParkResidentId(id: string): boolean {
  return id.startsWith('resident_');
}
