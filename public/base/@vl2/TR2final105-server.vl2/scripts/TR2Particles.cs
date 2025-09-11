datablock ParticleData(TR2FlagParticle)
{
   dragCoefficient      = 0.0;
   gravityCoefficient   = 0.3;
   inheritedVelFactor   = 0.8;
   constantAcceleration = 0.3;
   lifetimeMS           = 5000;
   lifetimeVarianceMS   = 50;
   textureName          = "special/Smoke/bigSmoke"; // special/Smoke/bigSmoke  special/droplet
   colors[0]     = "0.5 0.25 0 1";
   colors[1]     = "0 0.25 0.5 1";
   sizes[0]      = 0.80;
   sizes[1]      = 0.60;
};

datablock ParticleEmitterData(TR2FlagEmitter)
{
   ejectionPeriodMS = 75;
   periodVarianceMS = 0;
   ejectionVelocity = 2;
   velocityVariance = 1;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 5;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   lifetimeMS = 5000;
   overrideAdvances = false;
   particles = "TR2FlagParticle";
};

datablock ParticleData(GridjumpParticle)
{
    dragCoefficient = 0;
    gravityCoefficient = -0.017094;
    inheritedVelFactor = 0.0176125;
    constantAcceleration = -1.1129;
    lifetimeMS = 258;
    lifetimeVarianceMS = 60;
    useInvAlpha = 1;
    spinRandomMin = -200;
    spinRandomMax = 200;
    textureName = "special/Smoke/smoke_001";
    colors[0] = "0.000000 0.877165 0.000000 1.000000";
    colors[1] = "0.181102 0.981102 0.181102 1.000000";
    colors[2] = "0.000000 0.800000 0.000000 0.000000";
    colors[3] = "1.000000 1.000000 1.000000 1.000000";
    sizes[0] = 0.991882;
    sizes[1] = 2.99091;
    sizes[2] = 4.98993;
    sizes[3] = 1;
    times[0] = 0;
    times[1] = 0.2;
    times[2] = 1;
    times[3] = 2;
};

datablock ParticleEmitterData(GridjumpEmitter)
{
    ejectionPeriodMS = 10;
    periodVarianceMS = 0;
    ejectionVelocity = 100.25;
    velocityVariance = 0.25;
    ejectionOffset =   0;
    thetaMin = 0;
    thetaMax = 180;
    phiReferenceVel = 0;
    phiVariance = 360;
    overrideAdvances = 0;
    orientParticles= 0;
    orientToNormal = 0;
    orientOnVelocity = 1;
    particles = "GridjumpParticle";
    lifetimeMS = 1000;
};

datablock ParticleData(MidairDiscParticle)
{
    dragCoefficient = 0;
    gravityCoefficient = -0.017094;
    inheritedVelFactor = 0.0176125;
    constantAcceleration = -1.1129;
    lifetimeMS = 2258;
    lifetimeVarianceMS = 604;
    useInvAlpha = 1;
    spinRandomMin = -200;
    spinRandomMax = 200;
    textureName = "special/Smoke/smoke_001";
    colors[0] = "0.000000 0.077165 0.700000 1.000000";
    colors[1] = "0.181102 0.181102 0.781102 1.000000";
    colors[2] = "0.000000 0.000000 0.600000 0.000000";
    colors[3] = "1.000000 1.000000 1.000000 1.000000";
    sizes[0] = 0.991882;
    sizes[1] = 2.99091;
    sizes[2] = 4.98993;
    sizes[3] = 1;
    times[0] = 0;
    times[1] = 0.2;
    times[2] = 1;
    times[3] = 2;
};

datablock ParticleEmitterData(MidairDiscEmitter)
{
    ejectionPeriodMS = 10;
    periodVarianceMS = 0;
    ejectionVelocity = 10.25;
    velocityVariance = 0.25;
    ejectionOffset =   0;
    thetaMin = 0;
    thetaMax = 180;
    phiReferenceVel = 0;
    phiVariance = 360;
    overrideAdvances = 0;
    orientParticles= 0;
    orientToNormal = 0;
    orientOnVelocity = 1;
    lifetimeMS = 1000;
    particles = "MidairDiscParticle";
};

datablock ParticleData(CannonParticle)
{
    dragCoefficient = 0;
    gravityCoefficient = -0.017094;
    inheritedVelFactor = 0.0176125;
    constantAcceleration = -1.1129;
    lifetimeMS = 258;
    lifetimeVarianceMS = 60;
    useInvAlpha = 1;
    spinRandomMin = -200;
    spinRandomMax = 200;
    textureName = "special/Smoke/smoke_001";
    colors[0] = "0.000000 0.0 0.000000 1.000000";
    colors[1] = "0.181102 0.181102 0.181102 1.000000";
    colors[2] = "0.8000000 0.800000 0.800000 0.000000";
    colors[3] = "1.000000 1.000000 1.000000 1.000000";
    sizes[0] = 2.991882;
    sizes[1] = 4.99091;
    sizes[2] = 6.98993;
    sizes[3] = 1;
    times[0] = 0;
    times[1] = 0.2;
    times[2] = 1;
    times[3] = 2;
};

datablock ParticleEmitterData(CannonEmitter)
{
    ejectionPeriodMS = 10;
    periodVarianceMS = 0;
    ejectionVelocity = 20.25;
    velocityVariance = 0.5;
    ejectionOffset =   0;
    thetaMin = 0;
    thetaMax = 180;
    phiReferenceVel = 0;
    phiVariance = 360;
    overrideAdvances = 0;
    orientParticles= 0;
    orientToNormal = 0;
    orientOnVelocity = 1;
    particles = "CannonParticle";
    lifetimeMS = 2500;
};

datablock ParticleData( RoleChangeParticle )
{
   dragCoefficient      = 0;
   gravityCoefficient   = -1.0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = -1.4;
   lifetimeMS           = 300;
   lifetimeVarianceMS   = 0;
   textureName          = "special/droplet";
   colors[0]     = "0.7 0.8 1.0 1.0";
   colors[1]     = "0.7 0.8 1.0 0.5";
   colors[2]     = "0.7 0.8 1.0 0.0";
   sizes[0]      = 10.5;
   sizes[1]      = 30.2;
   sizes[2]      = 30.2;
   times[0]      = 0.0;
   times[1]      = 0.15;
   times[2]      = 0.2;
};

datablock ParticleEmitterData( RoleChangeEmitter )
{
   ejectionPeriodMS = 4;
   periodVarianceMS = 0;
   ejectionVelocity = 10;
   velocityVariance = 0.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 50;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 800;
   particles = "RoleChangeParticle";
};
