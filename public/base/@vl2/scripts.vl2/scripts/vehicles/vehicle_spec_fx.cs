//==============================================================
// MISCELLANEOUS VEHICLE SOUNDS AND EFFECTS
//
// - Sounds
// - Water Splash Effects
// - Tire Dust Particles
// - Lift-Off Particles
// - Small Heavy Damage Smoke
// - Heavy Damage Smoke
// - Light Heavy Damage Smoke
// - Vehicle Smoke Spike (for debris)
// - Vehicle Medium Explosion Smoke
// - Vehicle Large Ground Explosion Smoke
// - Debris Fire Particles
// - Debris Smoke Particles
// - Debris (pieces)
// - Explosions (including Shield Impacts)
// - Vehicle Sensors
// - Flier Contrails
// - Bomb Explosions
//
//==============================================================

//--------------------------------------------------------------
// SOUNDS
//--------------------------------------------------------------
datablock EffectProfile(SoftImpactEffect)
{
   effectname = "vehicles/crash_soft";
   minDistance = 5.0;
   maxDistance = 10.0;
};

datablock EffectProfile(HardImpactEffect)
{
   effectname = "vehicles/crash_hard";
   minDistance = 5.0;
   maxDistance = 10.0;
};

datablock EffectProfile(GravSoftImpactEffect)
{
   effectname = "vehicles/crash_ground_vehicle";
   minDistance = 5.0;
   maxDistance = 10.0;
};

datablock AudioProfile(SoftImpactSound)
{
   filename    = "fx/vehicles/crash_soft.wav";
   description = AudioClose3d;
   preload = true;
   effect = SoftImpactEffect;
};

datablock AudioProfile(HardImpactSound)
{
   filename    = "fx/vehicles/crash_hard.wav";
   description = AudioExplosion3d;
   preload = true;
   effect = HardImpactEffect;
};

datablock AudioProfile(GravSoftImpactSound)
{
   filename    = "fx/vehicles/crash_grav_soft.wav";
   description = AudioClose3d;
   preload = true;
   effect = GravSoftImpactEffect;
};

datablock AudioProfile(BombExplosionSound)
{
   filename    = "fx/vehicles/bomber_bomb_impact.wav";
   description = AudioBomb3d;
   preload = true;
};


//--------------------------------------------------------------
// WATER SPLASH EFFECTS
//--------------------------------------------------------------

datablock ParticleData(VehicleFoamParticle)
{
   dragCoefficient      = 2.0;
   gravityCoefficient   = -0.05;
   inheritedVelFactor   = 0.0;
   constantAcceleration = 0.0;
   lifetimeMS           = 1200;
   lifetimeVarianceMS   = 400;
   useInvAlpha          = false;
   spinRandomMin        = -90.0;
   spinRandomMax        = 500.0;
   textureName          = "particleTest";
   colors[0]     = "0.7 0.8 1.0 1.0";
   colors[1]     = "0.7 0.8 1.0 0.5";
   colors[2]     = "0.7 0.8 1.0 0.0";
   sizes[0]      = 2;
   sizes[1]      = 4;
   sizes[2]      = 6;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(VehicleFoamEmitter)
{
   ejectionPeriodMS = 40;
   periodVarianceMS = 0;
   ejectionVelocity = 10.0;
   velocityVariance = 1.0;
   ejectionOffset   = 0.0;
   thetaMin         = 85;
   thetaMax         = 85;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   particles = "VehicleFoamParticle";
};


datablock ParticleData( VehicleFoamDropletsParticle )
{
   dragCoefficient      = 1;
   gravityCoefficient   = 0.2;
   inheritedVelFactor   = 0.2;
   constantAcceleration = -0.0;
   lifetimeMS           = 800;
   lifetimeVarianceMS   = 300;
   textureName          = "special/droplet";
   colors[0]     = "0.7 0.8 1.0 1.0";
   colors[1]     = "0.7 0.8 1.0 0.5";
   colors[2]     = "0.7 0.8 1.0 0.0";
   sizes[0]      = 8;
   sizes[1]      = 3;
   sizes[2]      = 0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData( VehicleFoamDropletsEmitter )
{
   ejectionPeriodMS = 34;
   periodVarianceMS = 0;
   ejectionVelocity = 10;
   velocityVariance = 5.0;
   ejectionOffset   = 0.0;
   thetaMin         = 60;
   thetaMax         = 80;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   particles = "VehicleFoamDropletsParticle";
};
   
//--------------------------------------------------------------
// TIRE DUST PARTICLES
//--------------------------------------------------------------
 
datablock ParticleData(TireParticle)
{
   dragCoefficient      = 2.0;
   gravityCoefficient   = -0.1;
   inheritedVelFactor   = 0.1;
   constantAcceleration = 0.0;
   lifetimeMS           = 6000;
   lifetimeVarianceMS   = 1000;
   useInvAlpha          = true;
   spinRandomMin        = -45.0;
   spinRandomMax        = 45.0;
   textureName          = "particleTest";
   colors[0]     = "0.46 0.36 0.26 0.6";
   colors[1]     = "0.46 0.46 0.36 0.0";
   sizes[0]      = 1.5;
   sizes[1]      = 7.00;
};

datablock ParticleEmitterData(TireEmitter)
{
   ejectionPeriodMS = 160;
   periodVarianceMS = 20;
   ejectionVelocity = 2;
   velocityVariance = 1.0;
   ejectionOffset   = 0.0;
   thetaMin         = 20;
   thetaMax         = 90;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   useEmitterColors = true;
   particles = "TireParticle";
};

//--------------------------------------------------------------
// LIFTOFF PARTICLES
//--------------------------------------------------------------

datablock ParticleData(TankDust)
{
   dragCoefficient      = 1.0;
   gravityCoefficient   = -0.01;
   inheritedVelFactor   = 0.0;
   constantAcceleration = 0.0;
   lifetimeMS           = 2000;
   lifetimeVarianceMS   = 200;
   useInvAlpha          = true;
   spinRandomMin        = -90.0;
   spinRandomMax        = 500.0;
   textureName          = "particleTest";
   colors[0]     = "0.46 0.36 0.26 0.0";
   colors[1]     = "0.46 0.46 0.36 0.4";
   colors[2]     = "0.46 0.46 0.36 0.0";
   sizes[0]      = 3.2;
   sizes[1]      = 4.6;
   sizes[2]      = 7.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(TankDustEmitter)
{
   ejectionPeriodMS = 12;
   periodVarianceMS = 0;
   ejectionVelocity = 20.0;
   velocityVariance = 0.0;
   ejectionOffset   = 0.0;
   thetaMin         = 90;
   thetaMax         = 90;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   useEmitterColors = true;
   particles = "TankDust";
};

datablock ParticleData(LargeVehicleLiftoffDust)
{
   dragCoefficient      = 1.0;
   gravityCoefficient   = -0.01;
   inheritedVelFactor   = 0.0;
   constantAcceleration = 0.0;
   lifetimeMS           = 1000;
   lifetimeVarianceMS   = 100;
   useInvAlpha          = true;
   spinRandomMin        = -90.0;
   spinRandomMax        = 500.0;
   textureName          = "particleTest";
   colors[0]     = "0.46 0.36 0.26 0.0";
   colors[1]     = "0.46 0.46 0.36 0.4";
   colors[2]     = "0.46 0.46 0.36 0.0";
   sizes[0]      = 3.2;
   sizes[1]      = 4.6;
   sizes[2]      = 7.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(LargeVehicleLiftoffDustEmitter)
{
   ejectionPeriodMS = 15;
   periodVarianceMS = 0;
   ejectionVelocity = 15.0;
   velocityVariance = 0.0;
   ejectionOffset   = 0.0;
   thetaMin         = 90;
   thetaMax         = 90;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   useEmitterColors = true;
   particles = "LargeVehicleLiftoffDust";
};

datablock ParticleData(VehicleLiftoffDust)
{
   dragCoefficient      = 1.0;
   gravityCoefficient   = -0.01;
   inheritedVelFactor   = 0.0;
   constantAcceleration = 0.0;
   lifetimeMS           = 1000;
   lifetimeVarianceMS   = 100;
   useInvAlpha          = true;
   spinRandomMin        = -90.0;
   spinRandomMax        = 500.0;
   textureName          = "particleTest";
   colors[0]     = "0.46 0.36 0.26 0.0";
   colors[1]     = "0.46 0.46 0.36 0.4";
   colors[2]     = "0.46 0.46 0.36 0.0";
   sizes[0]      = 1.2;
   sizes[1]      = 2.6;
   sizes[2]      = 3.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(VehicleLiftoffDustEmitter)
{
   ejectionPeriodMS = 15;
   periodVarianceMS = 0;
   ejectionVelocity = 10.0;
   velocityVariance = 0.0;
   ejectionOffset   = 0.0;
   thetaMin         = 90;
   thetaMax         = 90;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   useEmitterColors = true;
   particles = "VehicleLiftoffDust";
};

//--------------------------------------------------------------
// Damage bubbles
//--------------------------------------------------------------
datablock ParticleData(DamageBubbleParticle)
{
   dragCoefficient      = 0.0;
   gravityCoefficient   = -0.04;
   inheritedVelFactor   = 0.5;
   constantAcceleration = 0.0;
   lifetimeMS           = 2000;
   lifetimeVarianceMS   = 200;
   useInvAlpha          = false;
   spinRandomMin        = -90.0;
   spinRandomMax        = 90.0;
   textureName          = "special/bubbles";
   colors[0]     = "0.7 0.7 0.7 0.0";
   colors[1]     = "0.3 0.3 0.3 1.0";
   colors[2]     = "0.0 0.0 0.0 0.0";
   sizes[0]      = 0.2;
   sizes[1]      = 0.8;
   sizes[2]      = 1.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(DamageBubbles)
{
   ejectionPeriodMS = 15;
   periodVarianceMS = 0;
   ejectionVelocity = 3.0;
   velocityVariance = 0.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 35;
   overrideAdvances = false;
   particles = "DamageBubbleParticle";
};

//--------------------------------------------------------------
// SMALL HEAVY DAMAGE SMOKE
//--------------------------------------------------------------

datablock ParticleData(SmallHeavyDamageSmokeParticle)
{
   dragCoefficient      = 0.0;
   gravityCoefficient   = -0.01;
   inheritedVelFactor   = 0.5;
   constantAcceleration = 0.0;
   lifetimeMS           = 1000;
   lifetimeVarianceMS   = 200;
   useInvAlpha          = true;
   spinRandomMin        = -90.0;
   spinRandomMax        = 90.0;
   textureName          = "particleTest";
   colors[0]     = "0.7 0.7 0.7 0.0";
   colors[1]     = "0.3 0.3 0.3 1.0";
   colors[2]     = "0.0 0.0 0.0 0.0";
   sizes[0]      = 0.2;
   sizes[1]      = 0.8;
   sizes[2]      = 2.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(SmallHeavyDamageSmoke)
{
   ejectionPeriodMS = 25;
   periodVarianceMS = 0;
   ejectionVelocity = 3.0;
   velocityVariance = 0.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 35;
   overrideAdvances = false;
   particles = "SmallHeavyDamageSmokeParticle";
};

//--------------------------------------------------------------
// HEAVY DAMAGE SMOKE
//--------------------------------------------------------------

datablock ParticleData(HeavyDamageSmokeParticle)
{
   dragCoefficient      = 0.0;
   gravityCoefficient   = -0.01;
   inheritedVelFactor   = 0.5;
   constantAcceleration = 0.0;
   lifetimeMS           = 2000;
   lifetimeVarianceMS   = 200;
   useInvAlpha          = true;
   spinRandomMin        = -90.0;
   spinRandomMax        = 90.0;
   textureName          = "particleTest";
   colors[0]     = "0.7 0.7 0.7 0.0";
   colors[1]     = "0.3 0.3 0.3 0.7";
   colors[2]     = "0.0 0.0 0.0 0.0";
   sizes[0]      = 1.2;
   sizes[1]      = 2.6;
   sizes[2]      = 4.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(HeavyDamageSmoke)
{
   ejectionPeriodMS = 20;
   periodVarianceMS = 6;
   ejectionVelocity = 4.0;
   velocityVariance = 0.5;
   ejectionOffset   = 1.5;
   thetaMin         = 0;
   thetaMax         = 35;
   overrideAdvances = false;
   particles = "HeavyDamageSmokeParticle";
};

//--------------------------------------------------------------
// SMALL LIGHT DAMAGE SMOKE
//--------------------------------------------------------------

datablock ParticleData(SmallLightDamageSmokeParticle)
{
   dragCoefficient      = 0.0;
   gravityCoefficient   = -0.01;
   inheritedVelFactor   = 0.5;
   constantAcceleration = 0.0;
   lifetimeMS           = 1000;
   lifetimeVarianceMS   = 200;
   useInvAlpha          = true;
   spinRandomMin        = -90.0;
   spinRandomMax        = 90.0;
   textureName          = "particleTest";
   colors[0]     = "0.7 0.7 0.7 0.0";
   colors[1]     = "0.5 0.5 0.5 0.4";
   colors[2]     = "0.3 0.3 0.3 0.0";
   sizes[0]      = 0.8;
   sizes[1]      = 1.6;
   sizes[2]      = 3.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(SmallLightDamageSmoke)
{
   ejectionPeriodMS = 40;
   periodVarianceMS = 0;
   ejectionVelocity = 3.0;
   velocityVariance = 0.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 35;
   overrideAdvances = false;
   particles = "SmallLightDamageSmokeParticle";
};

//--------------------------------------------------------------
// LIGHT DAMAGE SMOKE
//--------------------------------------------------------------

datablock ParticleData(LightDamageSmokeParticle)
{
   dragCoefficient      = 0.0;
   gravityCoefficient   = -0.01;
   inheritedVelFactor   = 0.5;
   constantAcceleration = 0.0;
   lifetimeMS           = 1500;
   lifetimeVarianceMS   = 200;
   useInvAlpha          = true;
   spinRandomMin        = -90.0;
   spinRandomMax        = 90.0;
   textureName          = "particleTest";
   colors[0]     = "0.7 0.7 0.7 0.0";
   colors[1]     = "0.5 0.5 0.5 0.7";
   colors[2]     = "0.3 0.3 0.3 0.0";
   sizes[0]      = 1.2;
   sizes[1]      = 2.6;
   sizes[2]      = 4.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(LightDamageSmoke)
{
   ejectionPeriodMS = 30;
   periodVarianceMS = 6;
   ejectionVelocity = 4.0;
   velocityVariance = 0.5;
   ejectionOffset   = 1.5;
   thetaMin         = 0;
   thetaMax         = 35;
   overrideAdvances = false;
   particles = "LightDamageSmokeParticle";
};

//--------------------------------------------------------------
// VEHICLE SMOKE SPIKE (for debris)
//--------------------------------------------------------------

datablock ParticleData( VSmokeSpike )
{
   dragCoeffiecient     = 1.0;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.2;

   lifetimeMS           = 1000;  
   lifetimeVarianceMS   = 100;

   textureName          = "particleTest";

   useInvAlpha =     true;

   spinRandomMin = -60.0;
   spinRandomMax = 60.0;

   colors[0]     = "0.4 0.4 0.4 1.0";
   colors[1]     = "0.3 0.3 0.3 0.5";
   colors[2]     = "0.0 0.0 0.0 0.0";
   sizes[0]      = 0.0;
   sizes[1]      = 1.0;
   sizes[2]      = 0.5;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData( VSmokeSpikeEmitter )
{
   ejectionPeriodMS = 7;
   periodVarianceMS = 1;

   ejectionVelocity = 1.0;  // A little oomph at the back end
   velocityVariance = 0.2;

   thetaMin         = 0.0;
   thetaMax         = 40.0;

   particles = "VSmokeSpike";
};


//--------------------------------------------------------------
// VEHICLE MEDIUM EXPLOSION SMOKE
//--------------------------------------------------------------

datablock ParticleData(VehicleMESmoke)
{
   dragCoeffiecient     = 0.4;
   gravityCoefficient   = -0.5;   // rises slowly
   inheritedVelFactor   = 0.025;

   lifetimeMS           = 1250;
   lifetimeVarianceMS   = 0;

   textureName          = "particleTest";

   useInvAlpha =  true;
   spinRandomMin = -200.0;
   spinRandomMax =  200.0;

   textureName = "special/Smoke/smoke_001";

   colors[0]     = "1.0 0.7 0.5 1.0";
   colors[1]     = "0.3 0.3 0.3 1.0";
   colors[2]     = "0.0 0.0 0.0 0.0";
   sizes[0]      = 2.0;
   sizes[1]      = 6.0;
   sizes[2]      = 2.0;
   times[0]      = 0.0;
   times[1]      = 0.3;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(VehicleMESmokeEMitter)
{
   ejectionPeriodMS = 5;
   periodVarianceMS = 0;

   ejectionVelocity = 6.25;
   velocityVariance = 0.25;

   thetaMin         = 0.0;
   thetaMax         = 180.0;

   lifetimeMS       = 250;

   particles = "VehicleMESmoke";
};

//--------------------------------------------------------------
// VEHICLE LARGE GROUND EXPLOSION SMOKE
//--------------------------------------------------------------

datablock ParticleData(VehicleLGESmoke)
{
   dragCoeffiecient     = 0.3;
   gravityCoefficient   = -0.5;   // rises slowly
   inheritedVelFactor   = 0.025;

   lifetimeMS           = 1250;
   lifetimeVarianceMS   = 0;

   textureName          = "particleTest";

   useInvAlpha =  true;
   spinRandomMin = -200.0;
   spinRandomMax =  200.0;

   textureName = "special/Smoke/smoke_001";

   colors[0]     = "1.0 0.7 0.5 0.5";
   colors[1]     = "0.3 0.3 0.3 1.0";
   colors[2]     = "0.0 0.0 0.0 0.0";
   sizes[0]      = 6.0;
   sizes[1]      = 6.0;
   sizes[2]      = 2.0;
   times[0]      = 0.0;
   times[1]      = 0.3;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(VehicleLGESmokeEMitter)
{
   ejectionPeriodMS = 5;
   periodVarianceMS = 0;

   ejectionVelocity = 7.25;
   velocityVariance = 0.25;

   ejectionOffset = 5.0;

   thetaMin         = 0.0;
   thetaMax         = 80.0;

   lifetimeMS       = 350;

   particles = "VehicleLGESmoke";
};

//--------------------------------------------------------------
// DEBRIS FIRE PARTICLES
//--------------------------------------------------------------

datablock ParticleData(DebrisFireParticle)
{
   dragCoeffiecient     = 0.0;
   gravityCoefficient   = -0.2;
   inheritedVelFactor   = 0.0;

   lifetimeMS           = 350;
   lifetimeVarianceMS   = 0;

   textureName          = "particleTest";

   useInvAlpha = false;
   spinRandomMin = -160.0;
   spinRandomMax = 160.0;

   animateTexture = true;
   framesPerSec = 15;


   animTexName[0]       = "special/Explosion/exp_0016";
   animTexName[1]       = "special/Explosion/exp_0018";
   animTexName[2]       = "special/Explosion/exp_0020";
   animTexName[3]       = "special/Explosion/exp_0022";
   animTexName[4]       = "special/Explosion/exp_0024";
   animTexName[5]       = "special/Explosion/exp_0026";
   animTexName[6]       = "special/Explosion/exp_0028";
   animTexName[7]       = "special/Explosion/exp_0030";
   animTexName[8]       = "special/Explosion/exp_0032";

   colors[0]     = "1.0 0.7 0.5 1.0";
   colors[1]     = "1.0 0.5 0.2 1.0";
   colors[2]     = "1.0 0.25 0.1 0.0";
   sizes[0]      = 0.5;
   sizes[1]      = 2.0;
   sizes[2]      = 1.0;
   times[0]      = 0.0;
   times[1]      = 0.2;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(DebrisFireEmitter)
{
   ejectionPeriodMS = 20;
   periodVarianceMS = 1;

   ejectionVelocity = 0.25;
   velocityVariance = 0.0;

   thetaMin         = 0.0;
   thetaMax         = 30.0;

   particles = "DebrisFireParticle";
};

//--------------------------------------------------------------
// DEBRIS SMOKE PARTICLES
//--------------------------------------------------------------

datablock ParticleData( DebrisSmokeParticle )
{
   dragCoeffiecient     = 4.0;
   gravityCoefficient   = -0.00;   // rises slowly
   inheritedVelFactor   = 0.2;

   lifetimeMS           = 1000;  
   lifetimeVarianceMS   = 100;   // ...more or less

   textureName          = "particleTest";

   useInvAlpha =     true;

   spinRandomMin = -50.0;
   spinRandomMax = 50.0;

   colors[0]     = "0.3 0.3 0.3 0.0";
   colors[1]     = "0.3 0.3 0.3 1.0";
   colors[2]     = "0.0 0.0 0.0 0.0";
   sizes[0]      = 2;
   sizes[1]      = 3;
   sizes[2]      = 5;
   times[0]      = 0.0;
   times[1]      = 0.7;
   times[2]      = 1.0;
};

datablock ParticleEmitterData( DebrisSmokeEmitter )
{
   ejectionPeriodMS = 25;
   periodVarianceMS = 5;

   ejectionVelocity = 1.0;  // A little oomph at the back end
   velocityVariance = 0.5;

   thetaMin         = 10.0;
   thetaMax         = 30.0;

   useEmitterSizes = true;

   particles = "DebrisSmokeParticle";
};

//--------------------------------------------------------------
// DEBRIS (pieces)
//--------------------------------------------------------------

datablock EffectProfile(VehicleExplosionEffect)
{
   effectname = "explosions/vehicle_explosion";
   minDistance = 10;
   maxDistance = 40;
};

datablock AudioProfile(VehicleExplosionSound)
{
   filename = "fx/explosions/vehicle_explosion.wav";
   description = AudioBIGExplosion3d;
   preload = true;
   effect = VehicleExplosionEffect;
};

datablock ExplosionData(DebrisExplosion)
{
   explosionShape = "effect_plasma_explosion.dts";
   soundProfile = plasmaExpSound;
   faceViewer = true;
   explosionScale = "0.4 0.4 0.4";
};

datablock DebrisData( VehicleFireballDebris )
{
   emitters[0] = DebrisSmokeEmitter;
   emitters[1] = DebrisFireEmitter;

   explosion = DebrisExplosion;
   explodeOnMaxBounce = true;

   elasticity = 0.4;
   friction = 0.2;

   lifetime = 100.0;
   lifetimeVariance = 30.0;

   numBounces = 0;
   bounceVariance = 0;
};             

datablock DebrisData( VSpikeDebris )
{
   emitters[0] = VSmokeSpikeEmitter;

   explodeOnMaxBounce = true;

   elasticity = 0.4;
   friction = 0.2;

   lifetime = 0.3;
   lifetimeVariance = 0.02;

};             

datablock DebrisData( ShapeDebris )
{
   explodeOnMaxBounce = false;

   elasticity = 0.40;
   friction = 0.5;

   lifetime = 25.0;
   lifetimeVariance = 0.0;

   minSpinSpeed = 60;
   maxSpinSpeed = 600;

   numBounces = 10;
   bounceVariance = 0;

   staticOnMaxBounce = true;

   useRadiusMass = true;
   baseRadius = 1.0;

   velocity = 17.0;
   velocityVariance = 7.0;
   
};             

//**************************************************************
// EXPLOSIONS
//**************************************************************

datablock ExplosionData(VSpikeExplosion)
{
   debris = VSpikeDebris;
   debrisThetaMin = 10;
   debrisThetaMax = 170;
   debrisNum = 15;
   debrisNumVariance = 6;
   debrisVelocity = 30.0;
   debrisVelocityVariance = 7.0;
};

datablock ExplosionData(VehicleExplosion)
{
   explosionShape = "disc_explosion.dts";
   playSpeed = 1.5;
   soundProfile = VehicleExplosionSound;
   faceViewer = true;

   emitter[0] = VehicleMESmokeEmitter;

   debris = VehicleFireballDebris;
   debrisThetaMin = 10;
   debrisThetaMax = 80;
   debrisNum = 3;
   debrisNumVariance = 1;
   debrisVelocity = 20.0;
   debrisVelocityVariance = 5.0;

   subExplosion = VSpikeExplosion;

   shakeCamera = true;
   camShakeFreq = "11.0 13.0 9.0";
   camShakeAmp = "40.0 40.0 40.0";
   camShakeDuration = 0.7;
   camShakeRadius = 25.0;
};

datablock ExplosionData(VLSpikeExplosion)
{
   debris = VSpikeDebris;
   debrisThetaMin = 10;
   debrisThetaMax = 170;
   debrisNum = 10;
   debrisNumVariance = 6;
   debrisVelocity = 50.0;
   debrisVelocityVariance = 10.0;
};

datablock ExplosionData(VLGSpikeExplosion)
{
   debris = VSpikeDebris;
   debrisThetaMin = 10;
   debrisThetaMax = 70;
   debrisNum = 10;
   debrisNumVariance = 6;
   debrisVelocity = 50.0;
   debrisVelocityVariance = 10.0;
};

datablock ExplosionData(LargeGroundVehicleExplosion)
{
   explosionShape = "disc_explosion.dts";
   playSpeed = 1.5;
   soundProfile = VehicleExplosionSound;
   faceViewer = true;

   emitter[0] = VehicleLGESmokeEMitter;

   debris = VehicleFireballDebris;
   debrisThetaMin = 10;
   debrisThetaMax = 60;
   debrisNum = 3;
   debrisNumVariance = 1;
   debrisVelocity = 20.0;
   debrisVelocityVariance = 5.0;

   subExplosion = VLGSpikeExplosion;

   shakeCamera = true;
   camShakeFreq = "8.0 9.0 7.0";
   camShakeAmp = "140.0 140.0 140.0";
   camShakeDuration = 1.3;
   camShakeRadius = 30.0;
};

datablock ExplosionData(LargeAirVehicleExplosion)
{
   explosionShape = "disc_explosion.dts";
   playSpeed = 1.5;
   soundProfile = VehicleExplosionSound;
   faceViewer = true;

   emitter[0] = VehicleLGESmokeEMitter;

   debris = VehicleFireballDebris;
   debrisThetaMin = 10;
   debrisThetaMax = 80;
   debrisNum = 3;
   debrisNumVariance = 1;
   debrisVelocity = 20.0;
   debrisVelocityVariance = 5.0;

   subExplosion = VLSpikeExplosion;

   shakeCamera = true;
   camShakeFreq = "8.0 9.0 7.0";
   camShakeAmp = "140.0 140.0 140.0";
   camShakeDuration = 1.3;
   camShakeRadius = 30.0;
};

//--------------------------------------------------------------
// BOMB EXPLOSION
//--------------------------------------------------------------
datablock ParticleData(VehicleBombExplosionParticle)
{
   dragCoefficient      = 2;
   gravityCoefficient   = 0.2;
   inheritedVelFactor   = 0.2;
   constantAcceleration = 0.0;
   lifetimeMS           = 900;
   lifetimeVarianceMS   = 225;
   textureName          = "particleTest";
   colors[0]     = "0.56 0.36 0.26 1.0";
   colors[1]     = "0.56 0.36 0.26 0.0";
   sizes[0]      = 3;
   sizes[1]      = 5;
};

datablock ParticleEmitterData(VehicleBombExplosionEmitter)
{
   ejectionPeriodMS = 7;
   periodVarianceMS = 0;
   ejectionVelocity = 32;
   velocityVariance = 10;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 60;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   particles = "VehicleBombExplosionParticle";
};

datablock ShockwaveData(VehicleBombShockwave)
{
   width = 6.0;
   numSegments = 32;
   numVertSegments = 6;
   velocity = 16.0;
   acceleration = 40.0;
   lifetimeMS = 650;
   height = 1.0;
   verticalCurve = 0.5;
   is2D = false;

   texture[0] = "special/shockwave4";
   texture[1] = "special/gradient";
   texWrap = 6.0;

   times[0] = 0.0;
   times[1] = 0.5;
   times[2] = 1.0;

   colors[0] = "1.0 0.8 0.4 0.50";
   colors[1] = "1.0 0.6 0.3 0.25";
   colors[2] = "1.0 0.4 0.2 0.0";

   mapToTerrain = true;
   orientToNormal = false;
   renderBottom = false;
};

datablock ExplosionData(VehicleBombSubExplosion1)
{
   explosionShape = "effect_plasma_explosion.dts";
   faceViewer           = true;

   delayMS = 50;

   offset = 5.0;

   playSpeed = 1.5;

   sizes[0] = "1.5 1.5 1.5";
   sizes[1] = "3.0 3.0 3.0";
   times[0] = 0.0;
   times[1] = 1.0;

};             

datablock ExplosionData(VehicleBombSubExplosion2)
{
   explosionShape = "effect_plasma_explosion.dts";
   faceViewer           = true;

   delayMS = 100;

   offset = 7.0;

   playSpeed = 1.1;

   sizes[0] = "5.0 5.0 5.0";
   sizes[1] = "8.0 8.0 8.0";
   times[0] = 0.0;
   times[1] = 1.0;
};

datablock ExplosionData(VehicleBombSubExplosion3)
{
   explosionShape = "effect_plasma_explosion.dts";
   faceViewer           = true;

   delayMS = 0;

   offset = 0.0;

   playSpeed = 0.9;


   sizes[0] = "7.0 7.0 7.0";
   sizes[1] = "10.0 10.0 10.0";
   times[0] = 0.0;
   times[1] = 1.0;

};

datablock ExplosionData(VehicleBombExplosion)
{
   soundProfile   = BombExplosionSound;
   particleEmitter = VehicleBombExplosionEmitter;
   particleDensity = 250;
   particleRadius = 1.25;
   faceViewer = true;

   shockwave = VehicleBombShockwave;
   shockwaveOnTerrain = true;

   subExplosion[0] = VehicleBombSubExplosion1;
   subExplosion[1] = VehicleBombSubExplosion2;
   subExplosion[2] = VehicleBombSubExplosion3;

   shakeCamera = true;
   camShakeFreq = "5.0 7.0 5.0";
   camShakeAmp = "80.0 80.0 80.0";
   camShakeDuration = 1.0;
   camShakeRadius = 30.0;
};

////--------------------------------------------------------------
//// VEHICLE SHIELD IMPACT DATA
////--------------------------------------------------------------
//datablock ShieldImpactData( VehicleShieldImpact )
//{
//   lifetimeMS = 300;
//   startScale = 1.0;
//   endScale = 1.1;
//};

//--------------------------------------------------------------
// VEHICLE SENSORS
//--------------------------------------------------------------

datablock SensorData(VehiclePulseSensor)
{
   detects = true;
   detectsUsingLOS = true;
   detectsPassiveJammed = false;
   detectsActiveJammed = false;
   detectsCloaked = false;
   detectionPings = true;
   detectRadius = 20;
};

datablock SensorData(AWACPulseSensor)
{
   detects = true;
   detectsUsingLOS = true;
   detectsPassiveJammed = false;
   detectsActiveJammed = false;
   detectsCloaked = false;
   detectionPings = true;
   detectRadius = 300;
};

//--------------------------------------------------------------
// FLIER CONTRAILS
//--------------------------------------------------------------

datablock ParticleData(ContrailParticle)
{
   dragCoefficient      = 1.5;
   gravityCoefficient   = 0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = 0.0;
   lifetimeMS           = 3000;
   lifetimeVarianceMS   = 0;
   textureName          = "particleTest";
   colors[0]     = "0.6 0.6 0.6 0.5";
   colors[1]     = "0.2 0.2 0.2 0";
   sizes[0]      = 0.6;
   sizes[1]      = 5;
};

datablock ParticleEmitterData(ContrailEmitter)
{
   ejectionPeriodMS = 5;
   periodVarianceMS = 0;
   ejectionVelocity = 1;
   velocityVariance = 1.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 10;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   particles = "ContrailParticle";
};


datablock ParticleData(FlyerJetParticle)
{
   dragCoefficient      = 1.5;
   gravityCoefficient   = 0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = 0.0;
   lifetimeMS           = 200;
   lifetimeVarianceMS   = 0;
   textureName          = "particleTest";
   colors[0]     = "0.9 0.7 0.3 0.6";
   colors[1]     = "0.3 0.3 0.5 0";
   sizes[0]      = 2;
   sizes[1]      = 6;
};

datablock ParticleEmitterData(FlyerJetEmitter)
{
   ejectionPeriodMS = 10;
   periodVarianceMS = 0;
   ejectionVelocity = 20;
   velocityVariance = 1.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 10;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   particles = "FlyerJetParticle";
};

//--------------------------------------------------------------
// Hover Jet Emitters
//--------------------------------------------------------------

datablock ParticleData(TankJetParticle)
{
   dragCoefficient      = 1.5;
   gravityCoefficient   = 0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = 0.0;
   lifetimeMS           = 200;
   lifetimeVarianceMS   = 0;
   textureName          = "particleTest";
   colors[0]     = "0.9 0.7 0.3 0.6";
   colors[1]     = "0.3 0.3 0.5 0";
   sizes[0]      = 2;
   sizes[1]      = 6;
};

datablock ParticleEmitterData(TankJetEmitter)
{
   ejectionPeriodMS = 10;
   periodVarianceMS = 0;
   ejectionVelocity = 20;
   velocityVariance = 1.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 10;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   particles = "TankJetParticle";
};

datablock ParticleData(WildcatJetParticle)
{
   dragCoefficient      = 1.5;
   gravityCoefficient   = 0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = 0.0;
   lifetimeMS           = 100;
   lifetimeVarianceMS   = 0;
   textureName          = "particleTest";
   colors[0]     = "0.9 0.7 0.3 0.6";
   colors[1]     = "0.3 0.3 0.5 0";
   sizes[0]      = 0.5;
   sizes[1]      = 1.5;
};

datablock ParticleEmitterData(WildcatJetEmitter)
{
   ejectionPeriodMS = 5;
   periodVarianceMS = 0;
   ejectionVelocity = 20;
   velocityVariance = 1.0;
   ejectionOffset   = 0;
   thetaMin         = 0;
   thetaMax         = 10;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   particles = "WildcatJetParticle";
};


//--------------------------------------------------------------
// Vehicle Splash Sounds
//--------------------------------------------------------------
//EXIT WATER
datablock AudioProfile(VehicleExitWaterSoftSound)
{
   filename    = "fx/armor/general_water_exit2.wav";
   description = AudioClose3d;
   preload = true;
};

datablock AudioProfile(VehicleExitWaterMediumSound)
{
   filename    = "fx/armor/general_water_exit2.wav";
   description = AudioClose3d;
   preload = true;
};

datablock AudioProfile(VehicleExitWaterHardSound)
{
   filename    = "fx/armor/general_water_exit2.wav";
   description = AudioClose3d;
   preload = true;
};

//IMPACT WATER
datablock AudioProfile(VehicleImpactWaterSoftSound)
{
   filename    = "fx/armor/general_water_smallsplash2.wav";
   description = AudioClose3d;
   preload = true;
};

datablock AudioProfile(VehicleImpactWaterMediumSound)
{
   filename    = "fx/armor/general_water_medsplash.wav";
   description = AudioClose3d;
   preload = true;
};

datablock AudioProfile(VehicleImpactWaterHardSound)
{
   filename    = "fx/armor/general_water_bigsplash.wav";
   description = AudioDefault3d;
   preload = true;
};

//WATER WAKE
datablock AudioProfile(VehicleWakeSoftSplashSound)
{
   filename    = "fx/vehicles/wake_wildcat.wav";
   description = AudioDefaultLooping3d;
   preload = true;
};

datablock AudioProfile(VehicleWakeMediumSplashSound)
{
   filename    = "fx/vehicles/wake_shrike_n_tank.wav";
   description = AudioDefaultLooping3d;
   preload = true;
};

datablock AudioProfile(VehicleWakeHardSplashSound)
{
   filename    = "fx/vehicles/wake_shrike_n_tank.wav";
   description = AudioDefaultLooping3d;
   preload = true;
};

