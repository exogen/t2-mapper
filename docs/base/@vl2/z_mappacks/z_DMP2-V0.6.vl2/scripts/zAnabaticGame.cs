datablock ParticleData(MegaBoilBubbleParticle)
{
   dragCoefficient      = 0.1;
   gravityCoefficient   = -0.15; // Aggressively rises
   inheritedVelFactor   = 0.0;
   constantAcceleration = 0.0;
   lifetimeMS           = 3000;
   lifetimeVarianceMS   = 200;
   useInvAlpha          = false;
   spinRandomMin        = -180.0;
   spinRandomMax        = 180.0;
   textureName          = "special/bubbles"; // Swap with molten bubble or lava bubble texture for drama

   colors[0]     = "0.5 0.5 0.5 0.0";   // Start faded
   colors[1]     = "0.6 0.6 0.6 0.8";   // Become more visible
   colors[2]     = "0.1 0.1 0.1 0.0";   // Fade out at the end

   sizes[0]      = 2.0;
   sizes[1]      = 5.0;
   sizes[2]      = 7.5;

   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(MegaBoilBubbleEmitter)
{
   ejectionPeriodMS = 16; // Very rapid bubbling
   periodVarianceMS = 2;
   ejectionVelocity = 15.0;
   velocityVariance = 3.0;

   ejectionOffset   = 31.0; // Bubbles rise from slightly under the surface
   thetaMin         = 5;
   thetaMax         = 30; // Spread in angle to make it chaotic
   phiVariance      = 360;

   overrideAdvances = false;
   particles = "MegaBoilBubbleParticle";
};


datablock ParticleData(SnowParticle) {
   dragCoefficient = "0";
   windCoefficient = "-1";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "8000";
   lifetimeVarianceMS = "200";
   spinSpeed = "1";
   spinRandomMin = "-50";
   spinRandomMax = "50";
   useInvAlpha = "0";
   textureName = "precipitation/snowflake002";
   colors[0] = "0.204724 0.204724 0.204724 0.0";
   colors[1] = "0.291339 0.291339 0.291339 1";
   colors[2] = "0.259843 0.259843 0.259843 1";
   colors[3] = "0.0787402 0.0787402 0.0787402 1";
   sizes[0] = "0.5";
   sizes[1] = "0.5";
   sizes[2] = "0.5";
   sizes[3] = "0.5";
   times[0] = "0.1";
   times[1] = "0.2";
   times[2] = "0.9";
   times[3] = "1";
};

datablock ParticleEmitterData(SnowEmitter) {
   ejectionPeriodMS = "1";
   periodVarianceMS = "0";
   ejectionVelocity = "100";
   velocityVariance = "50";
   ejectionOffset = "10";
   ejectionOffsetVariance = "0";
   thetaMin = "0";
   thetaMax = "35";
   phiReferenceVel = "0";
   phiVariance = "360";
   softnessDistance = "1";
   ambientFactor = "0";
   overrideAdvance = "1";
   orientParticles = "0";
   orientOnVelocity = "1";
   particles = "SnowParticle";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0";
   reverseOrder = "0";
   alignParticles = "0";
   alignDirection = "0 1 0";
   highResOnly = "1";
};
datablock ParticleData(SnowParticle2) {
   dragCoefficient = "0";
   windCoefficient = "-1";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "10000";
   lifetimeVarianceMS = "200";
   spinSpeed = "1";
   spinRandomMin = "-50";
   spinRandomMax = "50";
   useInvAlpha = "0";
   textureName = "precipitation/snowflake005";
   colors[0] = "0.204724 0.204724 0.204724 0.0";
   colors[1] = "0.291339 0.291339 0.291339 1";
   colors[2] = "0.259843 0.259843 0.259843 1";
   colors[3] = "0.0787402 0.0787402 0.0787402 1";
   sizes[0] = "0.8";
   sizes[1] = "0.8";
   sizes[2] = "0.8";
   sizes[3] = "0.8";
   times[0] = "0.1";
   times[1] = "0.2";
   times[2] = "0.9";
   times[3] = "1";
};

datablock ParticleEmitterData(SnowEmitter2) {
   ejectionPeriodMS = "5";
   periodVarianceMS = "0";
   ejectionVelocity = "100";
   velocityVariance = "70";
   ejectionOffset = "10";
   ejectionOffsetVariance = "0";
   thetaMin = "0";
   thetaMax = "35";
   phiReferenceVel = "0";
   phiVariance = "360";
   softnessDistance = "1";
   ambientFactor = "0";
   overrideAdvance = "1";
   orientParticles = "0";
   orientOnVelocity = "1";
   particles = "SnowParticle2";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0";
   reverseOrder = "0";
   alignParticles = "0";
   alignDirection = "0 1 0";
   highResOnly = "1";
};