declare module "@/generated/hxDif.cjs" {
  export interface Point3F {
    x: number;
    y: number;
    z: number;
    write(io: any): void;
    static read(io: any): Point3F;
  }

  export interface BSPNode {
    planeIndex: number;
    frontIndex: number;
    backIndex: number;
    isFrontLeaf: boolean;
    isFrontSolid: boolean;
    isBackLeaf: boolean;
    isBackSolid: boolean;
  }

  export interface Dif {
    static LoadFromArrayBuffer(buffer: ArrayBufferLike): {
      // Add the properties you need from the parsed DIF here
      // This is just a starting point - add more as needed
      bspNodes: BSPNode[];
      points: Point3F[];
      planes: { x: number; y: number; z: number; d: number }[];
      materials: string[];
      // ... other properties
    };
  }

  const hxDif: {
    Dif: typeof Dif;
  };

  export default hxDif;
}
