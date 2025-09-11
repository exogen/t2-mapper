// ------------------------------------------------------------------------
// grenade (thrown by hand) script
// ------------------------------------------------------------------------
datablock EffectProfile(TR2GrenadeThrowEffect)
{
   effectname = "weapons/grenade_throw";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(TR2GrenadeSwitchEffect)
{
   effectname = "weapons/generic_switch";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock AudioProfile(TR2GrenadeThrowSound)
{
	filename = "fx/weapons/throw_grenade.wav";
	description = AudioClose3D;
   preload = true;
	effect = GrenadeThrowEffect;
};

datablock AudioProfile(TR2GrenadeSwitchSound)
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
datablock ParticleData(TR2HandGrenadeExplosionBubbleParticle)
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
datablock ParticleEmitterData(TR2HandGrenadeExplosionBubbleEmitter)
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
   particles = "TR2HandGrenadeExplosionBubbleParticle";
};

datablock ParticleData(UnderwaterTR2HandGrenadeExplosionSmoke)
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

datablock ParticleEmitterData(UnderwaterTR2HandGrenadeExplosionSmokeEmitter)
{
   ejectionPeriodMS = 10;
   periodVarianceMS = 0;

   ejectionVelocity = 5.25;
   velocityVariance = 0.25;

   thetaMin         = 0.0;
   thetaMax         = 180.0;

   lifetimeMS       = 250;

   particles = "UnderwaterTR2HandGrenadeExplosionSmoke";
};



datablock ParticleData(UnderwaterTR2HandGrenadeSparks)
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

datablock ParticleEmitterData(UnderwaterTR2HandGrenadeSparkEmitter)
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
   particles = "UnderwaterTR2HandGrenadeSparks";
};



datablock ExplosionData(UnderwaterTR2HandGrenadeSubExplosion1)
{
   offset = 1.0;
   emitter[0] = UnderwaterTR2HandGrenadeExplosionSmokeEmitter;
   emitter[1] = UnderwaterTR2HandGrenadeSparkEmitter;
};

datablock ExplosionData(UnderwaterTR2HandGrenadeSubExplosion2)
{
   offset = 1.0;
   emitter[0] = UnderwaterTR2HandGrenadeExplosionSmokeEmitter;
   emitter[1] = UnderwaterTR2HandGrenadeSparkEmitter;
};

datablock ExplosionData(UnderwaterTR2HandGrenadeExplosion)
{
   soundProfile   = TR2GrenadeExplosionSound;

   emitter[0] = UnderwaterTR2HandGrenadeExplosionSmokeEmitter;
   emitter[1] = UnderwaterTR2HandGrenadeSparkEmitter;
   emitter[2] = TR2HandGrenadeExplosionBubbleEmitter;

   subExplosion[0] = UnderwaterTR2HandGrenadeSubExplosion1;
   subExplosion[1] = UnderwaterTR2HandGrenadeSubExplosion2;
   
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

datablock ParticleData(TR2HandGrenadeExplosionSmoke)
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
   sizes[0]      = 4.0;//1.0;
   sizes[1]      = 12.0;//3.0;
   sizes[2]      = 20.0;//5.0;
   times[0]      = 0.0;
   times[1]      = 0.2;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(TR2HandGrenadeExplosionSmokeEmitter)
{
   ejectionPeriodMS = 10;
   periodVarianceMS = 0;

   ejectionVelocity = 10.25;
   velocityVariance = 0.25;

   thetaMin         = 0.0;
   thetaMax         = 180.0;

   lifetimeMS       = 250;

   particles = "TR2HandGrenadeExplosionSmoke";
};



datablock ParticleData(TR2HandGrenadeSparks)
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
   sizes[0]      = 3.0;//0.5;
   sizes[1]      = 1.5;//0.25;
   sizes[2]      = 1.0;//0.25;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(TR2HandGrenadeSparkEmitter)
{
   ejectionPeriodMS = 3;
   periodVarianceMS = 0;
   ejectionVelocity = 24;//18;
   velocityVariance = 6.75;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 180;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 100;
   particles = "TR2HandGrenadeSparks";
};




//----------------------------------------------------
//  Explosion
//----------------------------------------------------

datablock ExplosionData(TR2HandGrenadeSubExplosion1)
{
   offset = 2.0;
   emitter[0] = TR2HandGrenadeExplosionSmokeEmitter;
   emitter[1] = TR2HandGrenadeSparkEmitter;
};

datablock ExplosionData(TR2HandGrenadeSubExplosion2)
{
   offset = 2.0;
   emitter[0] = TR2HandGrenadeExplosionSmokeEmitter;
   emitter[1] = TR2HandGrenadeSparkEmitter;
};

datablock ExplosionData(TR2HandGrenadeExplosion)
{
   soundProfile   = TR2GrenadeExplosionSound;

   emitter[0] = TR2HandGrenadeExplosionSmokeEmitter;
   emitter[1] = TR2HandGrenadeSparkEmitter;

   subExplosion[0] = TR2HandGrenadeSubExplosion1;
   subExplosion[1] = TR2HandGrenadeSubExplosion2;
   
   shakeCamera = true;
   camShakeFreq = "12.0 13.0 11.0";
   camShakeAmp = "35.0 35.0 35.0";
   camShakeDuration = 1.0;
   camShakeRadius = 15.0;
};




datablock ItemData(TR2GrenadeThrown)
{
	className = Weapon;
	shapeFile = "grenade.dts";
	mass = 0.35;//0.7;
	elasticity = 0.2;
   friction = 1;
   pickupRadius = 2;
   maxDamage = 0.5;
	explosion = TR2HandGrenadeExplosion;
	underwaterExplosion = UnderwaterTR2HandGrenadeExplosion;
   indirectDamage      = 0.4;
   damageRadius        = 22.0;//10.0;
   radiusDamageType    = $DamageType::Grenade;
   kickBackStrength    = 8000;//2000;

   computeCRC = false;

};

datablock ItemData(TR2Grenade)
{
	className = HandInventory;
	catagory = "Handheld";
	shapeFile = "grenade.dts";
	mass = 0.35;//0.7;
	elasticity = 0.2;
   friction = 1;
   pickupRadius = 2;
   thrownItem = TR2GrenadeThrown;
	pickUpName = "some grenades";
	isGrenade = true;

   computeCRC = false;

};

function TR2GrenadeThrown::onThrow(%this, %gren)
{
   //AIGrenadeThrow(%gren);
   %gren.detThread = schedule(2000, %gren, "detonateGrenade", %gren);
}

