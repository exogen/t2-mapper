//--------------------------------------------------------------------------
// ParticleEmitter data:
//  A note about the phiReferenceVel, it will only be useful in cases in
//   which the axis of the emitter is not changed over the life of the emission
//   i.e., a linear projectile say, or an explosion that sits in one place.  A
//   grenade, for instance, wouldn't necessarily give the desired result (though
//   it might in certain cases).
//  One more note: overrideAdvances should probably only be turned on for emitters
//   that are attached to explosions.  It prevents the emitter from advancing a particle
//   to the boundary of the update it was created in.  Its useful for explosion emitters,
//   which fake a 1000 ms update, and never update again, since we sometimes want those
//   particles to pop up with exactly the same position.  On a projectile, it's likely
//   to cause non-random looking particle "clumps" if there's a low frame rate condition
//   on the client.
//
//--------------------------------------------------------------------------

//--------------------------------------------------------------------------
//-------------------------------------- Particles
//
datablock ParticleData(DefaultParticle)
{
   dragCoefficient      = 0.0;   // Not affected by drag
   gravityCoefficient   = 0.0;   // ...or gravity
   windCoefficient      = 1.0;

   inheritedVelFactor   = 0.0;   // Do not inherit emitters velocity
   constantAcceleration = 0.0;   // No constant accel along initial velocity

   lifetimeMS           = 1000;  // lasts 1 second
   lifetimeVarianceMS   = 0;     // ...exactly

   textureName          = "particleTest";

   colors[0]     = "1 1 1 1";    // All white, no blending
   colors[1]     = "1 1 1 1";
   colors[2]     = "1 1 1 1";
   colors[3]     = "1 1 1 1";

   sizes[0]      = 1;            // One meter across
   sizes[1]      = 1;
   sizes[2]      = 1;
   sizes[3]      = 1;

   times[0] = 0.0;               // Linear blend from color[0] to color[1]
   times[1] = 1.0;               //  Note that times[0] is always 0
   times[2] = 2.0;               //  even when set in the data block.
   times[3] = 2.0;
};

datablock ParticleData(FallingParticleRed)
{
   dragCoefficient      = 1.5;
   gravityCoefficient   = 0.2;

   inheritedVelFactor   = 0.2;
   constantAcceleration = 0.0;

   lifetimeMS           = 1250;
   lifetimeVarianceMS   = 0;

   textureName          = "particleTest";

   colors[0]     = "0.46 0.36 0.26 1.0";
   colors[1]     = "0.46 0.36 0.26 0.0";
   sizes[0]      = 0.35;
   sizes[1]      = 0.30;
};


//--------------------------------------------------------------------------
//-------------------------------------- Emitters
//
datablock ParticleEmitterData(DefaultEmitter)
{
   ejectionPeriodMS = 100;    // 10 Particles Per second
   periodVarianceMS = 0;      // ...exactly

   ejectionVelocity = 2.0;    // From 1.0 - 3.0 meters per sec
   velocityVariance = 1.0;

   ejectionOffset   = 0.0;    // Emit at the emitter origin

   thetaMin         = 0.0;    // All theta angles
   thetaMax         = 90.0;  

   phiReferenceVel  = 0.0;    // All phi angles
   phiVariance      = 360.0;

   overrideAdvances = false;

   particles = "DefaultParticle";
};

datablock ParticleEmitterData(ReverseEmitter)
{
   ejectionPeriodMS = 25;
   periodVarianceMS = 5;

   ejectionVelocity = 1.1;    // From 1.0 - 3.0 meters per sec
   velocityVariance = 1.0;

   ejectionOffset   = 0.0;

   thetaMin         = 0.0;
   thetaMax         = 10.0;  

   phiReferenceVel  = 0;
   phiVariance      = 360;

   overrideAdvances = false;

   particles = "FallingParticleRed";
};