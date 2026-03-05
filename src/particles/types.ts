/** Resolved particle data from a ParticleData datablock. */
export interface ParticleDataResolved {
  dragCoefficient: number;
  windCoefficient: number;
  gravityCoefficient: number;
  inheritedVelFactor: number;
  constantAcceleration: number;
  lifetimeMS: number;
  lifetimeVarianceMS: number;
  spinSpeed: number;
  spinRandomMin: number;
  spinRandomMax: number;
  useInvAlpha: boolean;
  /** 1-4 keyframes with normalized time (0-1). */
  keys: ParticleKey[];
  textureName: string;
}

export interface ParticleKey {
  r: number;
  g: number;
  b: number;
  a: number;
  size: number;
  time: number;
}

/** Resolved emitter data from a ParticleEmitterData datablock. */
export interface EmitterDataResolved {
  ejectionPeriodMS: number;
  periodVarianceMS: number;
  ejectionVelocity: number;
  velocityVariance: number;
  ejectionOffset: number;
  thetaMin: number;
  thetaMax: number;
  phiReferenceVel: number;
  phiVariance: number;
  overrideAdvances: boolean;
  orientParticles: boolean;
  orientOnVelocity: boolean;
  lifetimeMS: number;
  lifetimeVarianceMS: number;
  particles: ParticleDataResolved;
}

/** Live particle instance during simulation. */
export interface Particle {
  pos: [number, number, number];
  vel: [number, number, number];
  /** V12: constant acceleration = vel * constantAcceleration, set once at spawn. */
  acc: [number, number, number];
  orientDir: [number, number, number];
  currentAge: number;
  totalLifetime: number;
  dataIndex: number;
  spinSpeed: number;
  currentSpin: number;
  r: number;
  g: number;
  b: number;
  a: number;
  size: number;
}
