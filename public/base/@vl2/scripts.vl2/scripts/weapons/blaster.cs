//--------------------------------------
// Default blaster
//--------------------------------------

//--------------------------------------------------------------------------
// Force-Feedback Effects
//--------------------------------------
datablock EffectProfile(BlasterSwitchEffect)
{
   effectname = "weapons/blaster_activate";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(BlasterFireEffect)
{
   effectname = "weapons/blaster_fire";
   minDistance = 2.5;
   maxDistance = 2.5;
};

//--------------------------------------------------------------------------
// Sounds
//--------------------------------------
datablock AudioProfile(BlasterSwitchSound)
{
   filename    = "fx/weapons/blaster_activate.wav";
   description = AudioClosest3d;
   preload = true;
   effect = BlasterSwitchEffect;
};

datablock AudioProfile(BlasterFireSound)
{
   filename    = "fx/weapons/blaster_fire.WAV";
   description = AudioDefault3d;
   preload = true;
   effect = BlasterFireEffect;
};

datablock AudioProfile(BlasterProjectileSound)
{
   filename    = "fx/weapons/blaster_projectile.WAV";
   description = ProjectileLooping3d;
   preload = true;
};

datablock AudioProfile(blasterExpSound)
{
   filename    = "fx/weapons/blaster_impact.WAV";
   description = AudioClosest3d;
   preload = true;
};

datablock AudioProfile(BlasterDryFireSound)
{
   filename    = "fx/weapons/chaingun_dryfire.wav";
   description = AudioClose3d;
   preload = true;
};

//--------------------------------------------------------------------------
// Splash
//--------------------------------------------------------------------------

datablock ParticleData( BlasterSplashParticle )
{
   dragCoefficient      = 1;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = -1.4;
   lifetimeMS           = 300;
   lifetimeVarianceMS   = 0;
   textureName          = "special/droplet";
   colors[0]     = "0.7 0.8 1.0 1.0";
   colors[1]     = "0.7 0.8 1.0 0.5";
   colors[2]     = "0.7 0.8 1.0 0.0";
   sizes[0]      = 0.05;
   sizes[1]      = 0.2;
   sizes[2]      = 0.2;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData( BlasterSplashEmitter )
{
   ejectionPeriodMS = 4;
   periodVarianceMS = 0;
   ejectionVelocity = 4;
   velocityVariance = 1.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 50;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 100;
   particles = "BlasterSplashParticle";
};

datablock SplashData(BlasterSplash)
{
   numSegments = 15;
   ejectionFreq = 15;
   ejectionAngle = 40;
   ringLifetime = 0.35;
   lifetimeMS = 300;
   velocity = 3.0;
   startRadius = 0.0;
   acceleration = -3.0;
   texWrap = 5.0;

   texture = "special/water2";

   emitter[0] = BlasterSplashEmitter;

   colors[0] = "0.7 0.8 1.0 1.0";
   colors[1] = "0.7 0.8 1.0 1.0";
   colors[2] = "0.7 0.8 1.0 0.0";
   colors[3] = "0.7 0.8 1.0 0.0";
   times[0] = 0.0;
   times[1] = 0.4;
   times[2] = 0.8;
   times[3] = 1.0;
};

//--------------------------------------------------------------------------
// Explosion
//--------------------------------------
datablock ParticleData(BlasterExplosionParticle1)
{
   dragCoefficient      = 2;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = -0.0;
   lifetimeMS           = 600;
   lifetimeVarianceMS   = 000;
   textureName          = "special/crescent4";
   colors[0] = "1.0 0.8 0.2 1.0";
   colors[1] = "1.0 0.4 0.2 1.0";
   colors[2] = "1.0 0.0 0.0 0.0";
   sizes[0]      = 0.25;
   sizes[1]      = 0.5;
   sizes[2]      = 1.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(BlasterExplosionEmitter)
{
   ejectionPeriodMS = 7;
   periodVarianceMS = 0;
   ejectionVelocity = 2;
   velocityVariance = 1.5;
   ejectionOffset   = 0.0;
   thetaMin         = 70;
   thetaMax         = 80;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 200;
   particles = "BlasterExplosionParticle1";
};

datablock ParticleData(BlasterExplosionParticle2)
{
   dragCoefficient      = 2;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = -0.0;
   lifetimeMS           = 600;
   lifetimeVarianceMS   = 000;
   textureName          = "special/blasterHit";
   colors[0] = "1.0 0.2 0.2 1.0";
   colors[1] = "1.0 0.2 0.2 0.5";
   colors[2] = "1.0 0.0 0.0 0.0";
   sizes[0]      = 0.3;
   sizes[1]      = 0.90;
   sizes[2]      = 1.50;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(BlasterExplosionEmitter2)
{
   ejectionPeriodMS = 30;
   periodVarianceMS = 0;
   ejectionVelocity = 1;
   velocityVariance = 0.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 80;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = false;
   lifetimeMS       = 200;
   particles = "BlasterExplosionParticle2";
};

datablock ExplosionData(BlasterExplosion)
{
   soundProfile   = blasterExpSound;
   emitter[0]     = BlasterExplosionEmitter;
   emitter[1]     = BlasterExplosionEmitter2;
};


//--------------------------------------------------------------------------
// Projectile
//--------------------------------------

datablock EnergyProjectileData(EnergyBolt)
{
   emitterDelay        = -1;
   directDamage        = 0.15;
   directDamageType    = $DamageType::Blaster;
   kickBackStrength    = 0.0;
   bubbleEmitTime      = 1.0;

   sound = BlasterProjectileSound;
   velInheritFactor    = 0.5;

   explosion           = "BlasterExplosion";
   splash              = BlasterSplash;


   grenadeElasticity = 0.998;
   grenadeFriction   = 0.0;
   armingDelayMS     = 500;

   muzzleVelocity    = 90.0;

   drag = 0.05;

   gravityMod        = 0.0;

   dryVelocity       = 200.0;
   wetVelocity       = 150.0;

   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = false;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = 3000;

   hasLight    = true;
   lightRadius = 3.0;
   lightColor  = "0.5 0.175 0.175";

   scale = "0.25 20.0 1.0";
   crossViewAng = 0.99;
   crossSize = 0.55;

   lifetimeMS     = 3000;
   blurLifetime   = 0.2;
   blurWidth      = 0.25;
   blurColor = "0.4 0.0 0.0 1.0";

   texture[0] = "special/blasterBolt";
   texture[1] = "special/blasterBoltCross";
};


//--------------------------------------------------------------------------
// Weapon
//--------------------------------------
datablock ShapeBaseImageData(BlasterImage)
{
   className = WeaponImage;
   shapeFile = "weapon_energy.dts";
   item = Blaster;
   projectile = EnergyBolt;
   projectileType = EnergyProjectile;

   usesEnergy = true;
   fireEnergy = 4;
   minEnergy = 4;

   stateName[0] = "Activate";
   stateTransitionOnTimeout[0] = "ActivateReady";
   stateTimeoutValue[0] = 0.5;
   stateSequence[0] = "Activate";
   stateSound[0] = BlasterSwitchSound;

   stateName[1] = "ActivateReady";
   stateTransitionOnLoaded[1] = "Ready";
   stateTransitionOnNoAmmo[1] = "NoAmmo";

   stateName[2] = "Ready";
   stateTransitionOnNoAmmo[2] = "NoAmmo";
   stateTransitionOnTriggerDown[2] = "Fire";

   stateName[3] = "Fire";
   stateTransitionOnTimeout[3] = "Reload";
   stateTimeoutValue[3] = 0.3;
   stateFire[3] = true;
   stateRecoil[3] = NoRecoil;
   stateAllowImageChange[3] = false;
   stateSequence[3] = "Fire";
   stateSound[3] = BlasterFireSound;
   stateScript[3] = "onFire";

   stateName[4] = "Reload";
   stateTransitionOnNoAmmo[4] = "NoAmmo";
   stateTransitionOnTimeout[4] = "Ready";
   stateAllowImageChange[4] = false;
   stateSequence[4] = "Reload";

   stateName[5] = "NoAmmo";
   stateTransitionOnAmmo[5] = "Reload";
   stateSequence[5] = "NoAmmo";
   stateTransitionOnTriggerDown[5] = "DryFire";
   
   stateName[6] = "DryFire";
   stateTimeoutValue[6] = 0.3;
   stateSound[6] = BlasterDryFireSound;
   stateTransitionOnTimeout[6] = "Ready";
};

datablock ItemData(Blaster)
{
   className = Weapon;
   catagory = "Spawn Items";
   shapeFile = "weapon_energy.dts";
   image = BlasterImage;
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "a blaster";
};

