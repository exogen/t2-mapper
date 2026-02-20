export interface DemoKeyframe {
  time: number;
  position: [number, number, number];
  rotation: [number, number, number, number];
}

export interface DemoEntity {
  id: number | string;
  type: string;
  dataBlock?: string;
  keyframes: DemoKeyframe[];
}

export interface DemoRecording {
  duration: number;
  entities: DemoEntity[];
}
