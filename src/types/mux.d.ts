declare module 'mux.js' {
  export interface MuxSegmentEvent {
    type?: string;
    initSegment?: Uint8Array;
    data?: Uint8Array;
  }

  export class Transmuxer {
    constructor(options?: {
      remux?: boolean;
      keepOriginalTimestamps?: boolean;
      baseMediaDecodeTime?: number;
    });
    on(event: 'data', handler: (segment: MuxSegmentEvent) => void): void;
    on(event: 'done' | 'log' | 'trackinfo', handler: (...args: unknown[]) => void): void;
    push(data: Uint8Array): void;
    flush(): void;
    reset(): void;
  }

  const muxjs: {
    mp4: {
      Transmuxer: typeof Transmuxer;
    };
  };

  export default muxjs;
}
