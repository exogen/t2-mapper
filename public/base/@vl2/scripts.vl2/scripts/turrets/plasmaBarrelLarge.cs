//--------------------------------------------------------------------------
// Plasma Turret
// 
// 
//--------------------------------------------------------------------------

//--------------------------------------------------------------------------
// Sounds
//--------------------------------------------------------------------------
datablock EffectProfile(PBLSwitchEffect)
{
   effectname = "powered/turret_light_activate";
   minDistance = 2.5;
   maxDistance = 5.0;
};

datablock EffectProfile(PBLFireEffect)
{
   effectname = "powered/turret_plasma_fire";
   minDistance = 2.5;
   maxDistance = 5.0;
};

datablock AudioProfile(PBLSwitchSound)
{
   filename    = "fx/powered/turret_light_activate.wav";
   description = AudioClose3d;
   preload = true;
   effect = PBLSwitchEffect;
};

datablock AudioProfile(PBLFireSound)
{
   filename    = "fx/powered/turret_plasma_fire.wav";
   description = AudioDefault3d;
   preload = true;
   effect = PBLFireEffect;
};

//--------------------------------------------------------------------------
// Explosion
//--------------------------------------------------------------------------

datablock AudioProfile(PlasmaBarrelExpSound)
{
   filename    = "fx/powered/turret_plasma_explode.wav";
   description = "AudioExplosion3d";
   preload = true;
};


datablock ParticleData( PlasmaBarrelCrescentParticle )
{
   dragCoefficient      = 2;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = -0.0;
   lifetimeMS           = 600;
   lifetimeVarianceMS   = 000;
   textureName          = "special/crescent3";

   colors[0]     = "0.3 0.4 1.0 1.0";
   colors[1]     = "0.3 0.4 1.0 0.5";
   colors[2]     = "0.3 0.4 1.0 0.0";
   sizes[0]      = 2.0;
   sizes[1]      = 4.0;
   sizes[2]      = 5.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData( PlasmaBarrelCrescentEmitter )
{
   ejectionPeriodMS = 25;
   periodVarianceMS = 0;
   ejectionVelocity = 20;
   velocityVariance = 5.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 80;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 200;
   particles = "PlasmaBarrelCrescentParticle";
};

datablock ParticleData(PlasmaBarrelExplosionParticle)
{
   dragCoefficient      = 2;
   gravityCoefficient   = 0.2;
   inheritedVelFactor   = 0.2;
   constantAcceleration = 0.0;
   lifetimeMS           = 750;
   lifetimeVarianceMS   = 150;
   textureName          = "particleTest";
   colors[0]     = "0.3 0.4 1.0 1.0";
   colors[1]     = "0.3 0.4 1.0 0.0";
   sizes[0]      = 1;
   sizes[1]      = 2;
};

datablock ParticleEmitterData(PlasmaBarrelExplosionEmitter)
{
   ejectionPeriodMS = 7;
   periodVarianceMS = 0;
   ejectionVelocity = 12;
   velocityVariance = 1.75;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 60;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   particles = "PlasmaBarrelExplosionParticle";
};


datablock ExplosionData(PlasmaBarrelSubExplosion1)
{
   explosionShape = "disc_explosion.dts";
   faceViewer           = true;

   delayMS = 50;

   offset = 3.0;

   playSpeed = 1.5;

   sizes[0] = "0.25 0.25 0.25";
   sizes[1] = "0.25 0.25 0.25";
   times[0] = 0.0;
   times[1] = 1.0;

};             

datablock ExplosionData(PlasmaBarrelSubExplosion2)
{
   explosionShape = "disc_explosion.dts";
   faceViewer           = true;

   delayMS = 100;

   offset = 3.5;

   playSpeed = 1.0;

   sizes[0] = "0.5 0.5 0.5";
   sizes[1] = "0.5 0.5 0.5";
   times[0] = 0.0;
   times[1] = 1.0;
};

datablock ExplosionData(PlasmaBarrelSubExplosion3)
{
   explosionShape = "disc_explosion.dts";
   faceViewer           = true;

   delayMS = 0;

   offset = 0.0;

   playSpeed = 0.7;


   sizes[0] = "0.5 0.5 0.5";
   sizes[1] = "1.0 1.0 1.0";
   times[0] = 0.0;
   times[1] = 1.0;

};

datablock ExplosionData(PlasmaBarrelBoltExplosion)
{
   soundProfile   = PlasmaBarrelExpSound;
   particleEmitter = PlasmaBarrelExplosionEmitter;
   particleDensity = 250;
   particleRadius = 1.25;
   faceViewer = true;

   emitter[0] = PlasmaBarrelCrescentEmitter;

   subExplosion[0] = PlasmaBarrelSubExplosion1;
   subExplosion[1] = PlasmaBarrelSubExplosion2;
   subExplosion[2] = PlasmaBarrelSubExplosion3;

   shakeCamera = true;
   camShakeFreq = "10.0 9.0 9.0";
   camShakeAmp = "10.0 10.0 10.0";
   camShakeDuration = 0.5;
   camShakeRadius = 15.0;
};

//--------------------------------------------------------------------------
// Projectile
//--------------------------------------

datablock LinearFlareProjectileData(PlasmaBarrelBolt)
{
   doDynamicClientHits = true;

   directDamage        = 0;
   directDamageType    = $DamageType::PlasmaTurret;
   hasDamageRadius     = true;
   indirectDamage      = 0.5;
   damageRadius        = 10.0;
   kickBackStrength    = 500;
   radiusDamageType    = $DamageType::PlasmaTurret;
   explosion           = PlasmaBarrelBoltExplosion;
   splash              = PlasmaSplash;

   dryVelocity       = 50.0;
   wetVelocity       = -1;
   velInheritFactor  = 1.0;
   fizzleTimeMS      = 4000;
   lifetimeMS        = 6000;
   explodeOnDeath    = false;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = true;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = -1;

   activateDelayMS = 100;

   scale             = "1.5 1.5 1.5";
   numFlares         = 30;
   flareColor        = "0.1 0.3 1.0";
   flareModTexture   = "flaremod";
   flareBaseTexture  = "flarebase";
};

//--------------------------------------------------------------------------
// Plasma Turret Image
//--------------------------------------------------------------------------

datablock TurretImageData(PlasmaBarrelLarge)
{
   shapeFile = "turret_fusion_large.dts";
   // ---------------------------------------------
   // z0dd - ZOD, 5/8/02. Incorrect parameter value
   //item      = PlasmaBarrelLargePack;
   item = PlasmaBarrelPack;

   projectile = PlasmaBarrelBolt;
   projectileType = LinearFlareProjectile;
   usesEnergy = true;
   fireEnergy = 10;
   minEnergy = 10;
   emap = true;

   // Turret parameters
   activationMS      = 1000;
   deactivateDelayMS = 1500;
   thinkTimeMS       = 200;
   degPerSecTheta    = 300;
   degPerSecPhi      = 500;
   attackRadius      = 120;

   // State transitions
   stateName[0]                  = "Activate";
   stateTransitionOnNotLoaded[0] = "Dead";
   stateTransitionOnLoaded[0]    = "ActivateReady";

   stateName[1]                  = "ActivateReady";
   stateSequence[1]              = "Activate";
   stateSound[1]                 = PBLSwitchSound;
   stateTimeoutValue[1]          = 1;
   stateTransitionOnTimeout[1]   = "Ready";
   stateTransitionOnNotLoaded[1] = "Deactivate";
   stateTransitionOnNoAmmo[1]    = "NoAmmo";

   stateName[2]                    = "Ready";
   stateTransitionOnNotLoaded[2]   = "Deactivate";
   stateTransitionOnTriggerDown[2] = "Fire";
   stateTransitionOnNoAmmo[2]      = "NoAmmo";

   stateName[3]                = "Fire";
   stateTransitionOnTimeout[3] = "Reload";
   stateTimeoutValue[3]        = 0.3;
   stateFire[3]                = true;
   stateRecoil[3]              = LightRecoil;
   stateAllowImageChange[3]    = false;
   stateSequence[3]            = "Fire";
   stateSound[3]               = PBLFireSound;
   stateScript[3]              = "onFire";

   stateName[4]                  = "Reload";
   stateTimeoutValue[4]          = 0.8;
   stateAllowImageChange[4]      = false;
   stateSequence[4]              = "Reload";
   stateTransitionOnTimeout[4]   = "Ready";
   stateTransitionOnNotLoaded[4] = "Deactivate";
   stateTransitionOnNoAmmo[4]    = "NoAmmo";

   stateName[5]                = "Deactivate";
   stateSequence[5]            = "Activate";
   stateDirection[5]           = false;
   stateTimeoutValue[5]        = 1;
   stateTransitionOnLoaded[5]  = "ActivateReady";
   stateTransitionOnTimeout[5] = "Dead";

   stateName[6]               = "Dead";
   stateTransitionOnLoaded[6] = "ActivateReady";

   stateName[7]             = "NoAmmo";
   stateTransitionOnAmmo[7] = "Reload";
   stateSequence[7]         = "NoAmmo";
};

















