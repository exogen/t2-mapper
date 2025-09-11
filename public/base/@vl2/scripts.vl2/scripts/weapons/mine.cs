// ----------------------------------------------
// mine script
// ----------------------------------------------

$TeamDeployableMax[MineDeployed]		= 20;

// ----------------------------------------------
// force-feedback datablocks
// ----------------------------------------------

datablock EffectProfile(MineExplosionEffect)
{
   effectname = "explosions/mine_detonate";
   minDistance = 10;
   maxDistance = 50;
};

// ----------------------------------------------
// audio datablocks
// ----------------------------------------------

datablock AudioProfile(MineDeploySound)
{
   filename = "fx/weapons/mine_deploy.wav";
   description = AudioClose3D;
   preload = true;
};

datablock AudioProfile(MineExplosionSound)
{
   filename = "fx/weapons/mine_detonate.wav";
   description = AudioBIGExplosion3d;
   preload = true;
   effect = MineExplosionEffect;
};

datablock AudioProfile(UnderwaterMineExplosionSound)
{
   filename = "fx/weapons/mine_detonate_UW.wav";
   description = AudioBIGExplosion3d;
   preload = true;
   effect = MineExplosionEffect;
};

//--------------------------------------------------------------------------
// Mine Particle effects
//--------------------------------------------------------------------------
datablock ParticleData(MineExplosionBubbleParticle)
{
   dragCoefficient      = 0.0;
   gravityCoefficient   = -0.25;
   inheritedVelFactor   = 0.0;
   constantAcceleration = 0.0;
   lifetimeMS           = 2000;
   lifetimeVarianceMS   = 750;
   useInvAlpha          = false;
   textureName          = "special/bubbles";

   spinRandomMin        = -100.0;
   spinRandomMax        =  100.0;

   colors[0]     = "0.7 0.8 1.0 0.0";
   colors[1]     = "0.7 0.8 1.0 0.4";
   colors[2]     = "0.7 0.8 1.0 0.0";
   sizes[0]      = 1.0;
   sizes[1]      = 1.0;
   sizes[2]      = 1.0;
   times[0]      = 0.0;
   times[1]      = 0.3;
   times[2]      = 1.0;
};
datablock ParticleEmitterData(MineExplosionBubbleEmitter)
{
   ejectionPeriodMS = 7;
   periodVarianceMS = 0;
   ejectionVelocity = 1.0;
   ejectionOffset   = 2.0;
   velocityVariance = 0.5;
   thetaMin         = 0;
   thetaMax         = 80;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   particles = "MineExplosionBubbleParticle";
};
datablock ParticleData( UnderwaterMineCrescentParticle )
{
   dragCoefficient      = 2;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = -0.0;
   lifetimeMS           = 600;
   lifetimeVarianceMS   = 000;
   textureName          = "special/crescent3";
   colors[0] = "0.5 0.5 1.0 1.0";
   colors[1] = "0.5 0.5 1.0 1.0";
   colors[2] = "0.5 0.5 1.0 0.0";
   sizes[0]      = 0.5;
   sizes[1]      = 1.0;
   sizes[2]      = 2.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData( UnderwaterMineCrescentEmitter )
{
   ejectionPeriodMS = 10;
   periodVarianceMS = 0;
   ejectionVelocity = 10;
   velocityVariance = 5.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 80;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 200;
   particles = "UnderwaterMineCrescentParticle";
};

datablock ParticleData(UnderwaterMineExplosionSmoke)
{
   dragCoeffiecient     = 105.0;
   gravityCoefficient   = -0.0;
   inheritedVelFactor   = 0.025;
   constantAcceleration = -1.0;

   lifetimeMS           = 1200;
   lifetimeVarianceMS   = 00;

   textureName          = "particleTest";

   useInvAlpha =  false;
   spinRandomMin = -200.0;
   spinRandomMax =  200.0;

   textureName = "special/Smoke/smoke_001";

   colors[0]     = "0.7 0.7 1.0 1.0";
   colors[1]     = "0.3 0.3 1.0 1.0";
   colors[2]     = "0.0 0.0 1.0 0.0";
   sizes[0]      = 1.0;
   sizes[1]      = 3.0;
   sizes[2]      = 1.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(UnderwaterMineExplosionSmokeEmitter)
{
   ejectionPeriodMS = 8;
   periodVarianceMS = 0;

   ejectionVelocity = 4.25;
   velocityVariance = 1.25;

   thetaMin         = 0.0;
   thetaMax         = 80.0;

   lifetimeMS       = 250;

   particles = "UnderwaterMineExplosionSmoke";
};

datablock ExplosionData(UnderwaterMineExplosion)
{
   explosionShape = "disc_explosion.dts";
   playSpeed      = 1.0;
   sizes[0] = "0.4 0.4 0.4";
   sizes[1] = "0.4 0.4 0.4";
   soundProfile   = UnderwaterMineExplosionSound;
   faceViewer     = true;

   emitter[0] = UnderwaterMineExplosionSmokeEmitter;
   emitter[1] = UnderwaterMineCrescentEmitter;
   emitter[2] = MineExplosionBubbleEmitter;

   shakeCamera = true;
   camShakeFreq = "8.0 7.0 9.0";
   camShakeAmp = "50.0 50.0 50.0";
   camShakeDuration = 1.0;
   camShakeRadius = 10.0;
};

//--------------------------------------------------------------------------
// Mine Particle effects
//--------------------------------------------------------------------------
datablock ParticleData( MineCrescentParticle )
{
   dragCoefficient      = 2;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = -0.0;
   lifetimeMS           = 600;
   lifetimeVarianceMS   = 000;
   textureName          = "special/crescent3";
   colors[0] = "1.0 0.8 0.2 1.0";
   colors[1] = "1.0 0.4 0.2 1.0";
   colors[2] = "1.0 0.0 0.0 0.0";
   sizes[0]      = 0.5;
   sizes[1]      = 1.0;
   sizes[2]      = 2.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData( MineCrescentEmitter )
{
   ejectionPeriodMS = 10;
   periodVarianceMS = 0;
   ejectionVelocity = 10;
   velocityVariance = 5.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 80;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 200;
   particles = "MineCrescentParticle";
};

datablock ParticleData(MineExplosionSmoke)
{
   dragCoeffiecient     = 105.0;
   gravityCoefficient   = -0.0;
   inheritedVelFactor   = 0.025;

   lifetimeMS           = 1200;
   lifetimeVarianceMS   = 00;

   textureName          = "particleTest";

   useInvAlpha =  true;
   spinRandomMin = -200.0;
   spinRandomMax =  200.0;

   textureName = "special/Smoke/smoke_001";

   colors[0]     = "1.0 0.7 0.0 1.0";
   colors[1]     = "0.2 0.2 0.2 1.0";
   colors[2]     = "0.0 0.0 0.0 0.0";
   sizes[0]      = 1.0;
   sizes[1]      = 3.0;
   sizes[2]      = 1.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(MineExplosionSmokeEmitter)
{
   ejectionPeriodMS = 8;
   periodVarianceMS = 0;

   ejectionVelocity = 4.25;
   velocityVariance = 1.25;

   thetaMin         = 0.0;
   thetaMax         = 80.0;

   lifetimeMS       = 250;

   particles = "MineExplosionSmoke";
};



datablock ExplosionData(MineExplosion)
{
   explosionShape = "effect_plasma_explosion.dts";
   playSpeed      = 1.0;
   sizes[0] = "0.5 0.5 0.5";
   sizes[1] = "0.5 0.5 0.5";
   soundProfile   = MineExplosionSound;
   faceViewer     = true;

   emitter[0] = MineExplosionSmokeEmitter;
   emitter[1] = MineCrescentEmitter;

   shakeCamera = true;
   camShakeFreq = "8.0 7.0 9.0";
   camShakeAmp = "50.0 50.0 50.0";
   camShakeDuration = 1.0;
   camShakeRadius = 10.0;
};

// ----------------------------------------------
// Item datablocks
// ----------------------------------------------

datablock ItemData(MineDeployed)
{
   className = Weapon;
   shapeFile = "mine.dts";
   mass = 0.75;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 3;
   maxDamage = 0.2;
   explosion = MineExplosion;
   underwaterExplosion = UnderwaterMineExplosion;
   indirectDamage = 0.55;
   damageRadius = 6.0;
   radiusDamageType = $DamageType::Mine;
   kickBackStrength = 1500;
	aiAvoidThis = true;
   dynamicType = $TypeMasks::DamagableItemObjectType;
	spacing = 6.0; // how close together mines can be
	proximity = 2.5; // how close causes a detonation (by player/vehicle)
	armTime = 2200; // 2.2 seconds to arm a mine after it comes to rest
	maxDepCount = 9; // try to deploy this many times before detonating

   computeCRC = true;

};

datablock ItemData(Mine)
{     
   className = HandInventory;
   catagory = "Handheld";
   shapeFile = "ammo_mine.dts";
   mass = 1;
   elasticity = 0.2;
   friction = 0.7;
   pickupRadius = 2;

   thrownItem = MineDeployed;
	pickUpName = "some mines";

   computeCRC = true;

};

