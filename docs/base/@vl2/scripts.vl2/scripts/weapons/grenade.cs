// ------------------------------------------------------------------------
// grenade (thrown by hand) script
// ------------------------------------------------------------------------
datablock EffectProfile(GrenadeThrowEffect)
{
   effectname = "weapons/grenade_throw";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(GrenadeSwitchEffect)
{
   effectname = "weapons/generic_switch";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock AudioProfile(GrenadeThrowSound)
{
	filename = "fx/weapons/throw_grenade.wav";
	description = AudioClose3D;
   preload = true;
	effect = GrenadeThrowEffect;
};

datablock AudioProfile(GrenadeSwitchSound)
{
	filename = "fx/weapons/generic_switch.wav";
	description = AudioClosest3D;
   preload = true;
	effect = GrenadeSwitchEffect;
};

//**************************************************************************
// Hand Grenade underwater fx
//**************************************************************************


//--------------------------------------------------------------------------
// Underwater Hand Grenade Particle effects
//--------------------------------------------------------------------------
datablock ParticleData(HandGrenadeExplosionBubbleParticle)
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
   sizes[0]      = 0.75;
   sizes[1]      = 0.75;
   sizes[2]      = 0.75;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};
datablock ParticleEmitterData(HandGrenadeExplosionBubbleEmitter)
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
   particles = "HandGrenadeExplosionBubbleParticle";
};

datablock ParticleData(UnderwaterHandGrenadeExplosionSmoke)
{
   dragCoeffiecient     = 105.0;
   gravityCoefficient   = -0.0;   // rises slowly
   inheritedVelFactor   = 0.025;

   constantAcceleration = -1.0;
   
   lifetimeMS           = 1250;
   lifetimeVarianceMS   = 0;

   textureName          = "particleTest";

   useInvAlpha =  false;
   spinRandomMin = -200.0;
   spinRandomMax =  200.0;

   textureName = "special/Smoke/smoke_001";

   colors[0]     = "0.4 0.4 1.0 1.0";
   colors[1]     = "0.4 0.4 1.0 0.5";
   colors[2]     = "0.0 0.0 0.0 0.0";
   sizes[0]      = 1.0;
   sizes[1]      = 3.0;
   sizes[2]      = 5.0;
   times[0]      = 0.0;
   times[1]      = 0.2;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(UnderwaterHandGrenadeExplosionSmokeEmitter)
{
   ejectionPeriodMS = 10;
   periodVarianceMS = 0;

   ejectionVelocity = 5.25;
   velocityVariance = 0.25;

   thetaMin         = 0.0;
   thetaMax         = 180.0;

   lifetimeMS       = 250;

   particles = "UnderwaterHandGrenadeExplosionSmoke";
};



datablock ParticleData(UnderwaterHandGrenadeSparks)
{
   dragCoefficient      = 1;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = 0.0;
   lifetimeMS           = 500;
   lifetimeVarianceMS   = 350;
   textureName          = "special/droplet";
   colors[0]     = "0.6 0.6 1.0 1.0";
   colors[1]     = "0.6 0.6 1.0 1.0";
   colors[2]     = "0.6 0.6 1.0 0.0";
   sizes[0]      = 0.5;
   sizes[1]      = 0.25;
   sizes[2]      = 0.25;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(UnderwaterHandGrenadeSparkEmitter)
{
   ejectionPeriodMS = 3;
   periodVarianceMS = 0;
   ejectionVelocity = 10;
   velocityVariance = 6.75;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 180;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 100;
   particles = "UnderwaterHandGrenadeSparks";
};



datablock ExplosionData(UnderwaterHandGrenadeSubExplosion1)
{
   offset = 1.0;
   emitter[0] = UnderwaterHandGrenadeExplosionSmokeEmitter;
   emitter[1] = UnderwaterHandGrenadeSparkEmitter;
};

datablock ExplosionData(UnderwaterHandGrenadeSubExplosion2)
{
   offset = 1.0;
   emitter[0] = UnderwaterHandGrenadeExplosionSmokeEmitter;
   emitter[1] = UnderwaterHandGrenadeSparkEmitter;
};

datablock ExplosionData(UnderwaterHandGrenadeExplosion)
{
   soundProfile   = GrenadeExplosionSound;

   emitter[0] = UnderwaterHandGrenadeExplosionSmokeEmitter;
   emitter[1] = UnderwaterHandGrenadeSparkEmitter;
   emitter[2] = HandGrenadeExplosionBubbleEmitter;

   subExplosion[0] = UnderwaterHandGrenadeSubExplosion1;
   subExplosion[1] = UnderwaterHandGrenadeSubExplosion2;
   
   shakeCamera = true;
   camShakeFreq = "12.0 13.0 11.0";
   camShakeAmp = "35.0 35.0 35.0";
   camShakeDuration = 1.0;
   camShakeRadius = 15.0;
};

//**************************************************************************
// Hand Grenade effects
//**************************************************************************

//--------------------------------------------------------------------------
// Grenade Particle effects
//--------------------------------------------------------------------------

datablock ParticleData(HandGrenadeExplosionSmoke)
{
   dragCoeffiecient     = 105.0;
   gravityCoefficient   = -0.0;   // rises slowly
   inheritedVelFactor   = 0.025;

   constantAcceleration = -0.80;
   
   lifetimeMS           = 1250;
   lifetimeVarianceMS   = 0;

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
   sizes[2]      = 5.0;
   times[0]      = 0.0;
   times[1]      = 0.2;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(HandGrenadeExplosionSmokeEmitter)
{
   ejectionPeriodMS = 10;
   periodVarianceMS = 0;

   ejectionVelocity = 10.25;
   velocityVariance = 0.25;

   thetaMin         = 0.0;
   thetaMax         = 180.0;

   lifetimeMS       = 250;

   particles = "HandGrenadeExplosionSmoke";
};



datablock ParticleData(HandGrenadeSparks)
{
   dragCoefficient      = 1;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = 0.0;
   lifetimeMS           = 500;
   lifetimeVarianceMS   = 350;
   textureName          = "special/bigSpark";
   colors[0]     = "0.56 0.36 0.26 1.0";
   colors[1]     = "0.56 0.36 0.26 1.0";
   colors[2]     = "1.0 0.36 0.26 0.0";
   sizes[0]      = 0.5;
   sizes[1]      = 0.25;
   sizes[2]      = 0.25;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(HandGrenadeSparkEmitter)
{
   ejectionPeriodMS = 3;
   periodVarianceMS = 0;
   ejectionVelocity = 18;
   velocityVariance = 6.75;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 180;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 100;
   particles = "HandGrenadeSparks";
};




//----------------------------------------------------
//  Explosion
//----------------------------------------------------

datablock ExplosionData(HandGrenadeSubExplosion1)
{
   offset = 2.0;
   emitter[0] = HandGrenadeExplosionSmokeEmitter;
   emitter[1] = HandGrenadeSparkEmitter;
};

datablock ExplosionData(HandGrenadeSubExplosion2)
{
   offset = 2.0;
   emitter[0] = HandGrenadeExplosionSmokeEmitter;
   emitter[1] = HandGrenadeSparkEmitter;
};

datablock ExplosionData(HandGrenadeExplosion)
{
   soundProfile   = GrenadeExplosionSound;

   emitter[0] = HandGrenadeExplosionSmokeEmitter;
   emitter[1] = HandGrenadeSparkEmitter;

   subExplosion[0] = HandGrenadeSubExplosion1;
   subExplosion[1] = HandGrenadeSubExplosion2;
   
   shakeCamera = true;
   camShakeFreq = "12.0 13.0 11.0";
   camShakeAmp = "35.0 35.0 35.0";
   camShakeDuration = 1.0;
   camShakeRadius = 15.0;
};




datablock ItemData(GrenadeThrown)
{
	className = Weapon;
	shapeFile = "grenade.dts";
	mass = 0.7;
	elasticity = 0.2;
   friction = 1;
   pickupRadius = 2;
   maxDamage = 0.5;
	explosion = HandGrenadeExplosion;
	underwaterExplosion = UnderwaterHandGrenadeExplosion;
   indirectDamage      = 0.4;
   damageRadius        = 10.0;
   radiusDamageType    = $DamageType::Grenade;
   kickBackStrength    = 2000;

   computeCRC = true;

};

datablock ItemData(Grenade)
{
	className = HandInventory;
	catagory = "Handheld";
	shapeFile = "grenade.dts";
	mass = 0.7;
	elasticity = 0.2;
   friction = 1;
   pickupRadius = 2;
   thrownItem = GrenadeThrown;
	pickUpName = "some grenades";
	isGrenade = true;

   computeCRC = true;

};

