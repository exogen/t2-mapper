//--------------------------------------
// Plasma rifle
//--------------------------------------

//--------------------------------------------------------------------------
// Force-Feedback Effects
//--------------------------------------
datablock EffectProfile(PlasmaSwitchEffect)
{
   effectname = "weapons/plasma_rifle_activate";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(PlasmaFireEffect)
{
   effectname = "weapons/plasma_fire";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(PlasmaDryFireEffect)
{
   effectname = "weapons/plasma_dryfire";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(PlasmaIdleEffect)
{
   effectname = "weapons/plasma_rifle_idle";
   minDistance = 2.5;
};

datablock EffectProfile(PlasmaReloadEffect)
{
   effectname = "weapons/plasma_rifle_reload";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(PlasmaExpEffect)
{
   effectname = "explosions/explosion.xpl10";
   minDistance = 10;
   maxDistance = 25;
};

//--------------------------------------------------------------------------
// Sounds
//--------------------------------------
datablock AudioProfile(PlasmaSwitchSound)
{
   filename    = "fx/weapons/plasma_rifle_activate.wav";
   description = AudioClosest3d;
   preload = true;
   effect = PlasmaSwitchEffect;
};

datablock AudioProfile(PlasmaFireSound)
{
   filename    = "fx/weapons/plasma_rifle_fire.wav";
   description = AudioDefault3d;
   preload = true;
   effect = PlasmaFireEffect;
};

datablock AudioProfile(PlasmaIdleSound)
{
   filename    = "fx/weapons/plasma_rifle_idle.wav";
   description = ClosestLooping3d;
   preload = true;
   //effect = PlasmaIdleEffect;
};

datablock AudioProfile(PlasmaReloadSound)
{
   filename    = "fx/weapons/plasma_rifle_reload.wav";
   description = Audioclosest3d;
   preload = true;
   effect = PlasmaReloadEffect;
};

datablock AudioProfile(plasmaExpSound)
{
   filename    = "fx/explosions/explosion.xpl10.wav";
   description = AudioExplosion3d;
   effect = PlasmaExpEffect;
};

datablock AudioProfile(PlasmaProjectileSound)
{
   filename    = "fx/weapons/plasma_rifle_projectile.WAV";
   description = ProjectileLooping3d;
   preload = true;
};

datablock AudioProfile(PlasmaDryFireSound)
{
   filename    = "fx/weapons/plasma_dryfire.wav";
   description = AudioClose3d;
   preload = true;
   effect = PlasmaDryFireEffect;
};

datablock AudioProfile(PlasmaFireWetSound)
{
   filename    = "fx/weapons/plasma_fizzle.wav";
   description = AudioClose3d;
   preload = true;
};
//--------------------------------------------------------------------------
// Explosion
//--------------------------------------
datablock ParticleData(PlasmaExplosionParticle)
{
   dragCoefficient      = 2;
   gravityCoefficient   = 0.2;
   inheritedVelFactor   = 0.2;
   constantAcceleration = 0.0;
   lifetimeMS           = 750;
   lifetimeVarianceMS   = 150;
   textureName          = "particleTest";
   colors[0]     = "0.56 0.36 0.26 1.0";
   colors[1]     = "0.56 0.36 0.26 0.0";
   sizes[0]      = 0.5;
   sizes[1]      = 2;
};

datablock ParticleEmitterData(PlasmaExplosionEmitter)
{
   ejectionPeriodMS = 7;
   periodVarianceMS = 0;
   ejectionVelocity = 5;
   velocityVariance = 1.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 60;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   particles = "PlasmaExplosionParticle";
};

datablock ExplosionData(PlasmaBoltExplosion)
{
   explosionShape = "effect_plasma_explosion.dts";
   soundProfile   = plasmaExpSound;
   particleEmitter = PlasmaExplosionEmitter;
   particleDensity = 150;
   particleRadius = 1.25;
   faceViewer = true;

   sizes[0] = "1.0 1.0 1.0";
   sizes[1] = "1.0 1.0 1.0";
   times[0] = 0.0;
   times[1] = 1.5;
};


//--------------------------------------------------------------------------
// Splash
//--------------------------------------------------------------------------
datablock ParticleData(PlasmaMist)
{
   dragCoefficient      = 2.0;
   gravityCoefficient   = -0.05;
   inheritedVelFactor   = 0.0;
   constantAcceleration = 0.0;
   lifetimeMS           = 400;
   lifetimeVarianceMS   = 100;
   useInvAlpha          = false;
   spinRandomMin        = -90.0;
   spinRandomMax        = 500.0;
   textureName          = "particleTest";
   colors[0]     = "0.7 0.8 1.0 1.0";
   colors[1]     = "0.7 0.8 1.0 0.5";
   colors[2]     = "0.7 0.8 1.0 0.0";
   sizes[0]      = 0.5;
   sizes[1]      = 0.5;
   sizes[2]      = 0.8;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(PlasmaMistEmitter)
{
   ejectionPeriodMS = 5;
   periodVarianceMS = 0;
   ejectionVelocity = 3.0;
   velocityVariance = 2.0;
   ejectionOffset   = 0.0;
   thetaMin         = 85;
   thetaMax         = 85;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   lifetimeMS       = 250;
   particles = "PlasmaMist";
};

datablock ParticleData( PlasmaSplashParticle2 )
{

   dragCoeffiecient     = 0.4;
   gravityCoefficient   = -0.03;   // rises slowly
   inheritedVelFactor   = 0.025;

   lifetimeMS           = 600;
   lifetimeVarianceMS   = 300;

   textureName          = "particleTest";

   useInvAlpha =  false;
   spinRandomMin = -200.0;
   spinRandomMax =  200.0;


   colors[0]     = "0.7 0.8 1.0 1.0";
   colors[1]     = "0.7 0.8 1.0 0.5";
   colors[2]     = "0.7 0.8 1.0 0.0";
   sizes[0]      = 0.5;
   sizes[1]      = 1.0;
   sizes[2]      = 2.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData( PlasmaSplashEmitter2 )
{
   ejectionPeriodMS = 25;
   ejectionOffset = 0.2;
   periodVarianceMS = 0;
   ejectionVelocity = 2.25;
   velocityVariance = 0.50;
   thetaMin         = 0.0;
   thetaMax         = 30.0;
   lifetimeMS       = 250;

   particles = "PlasmaSplashParticle2";
};


datablock ParticleData( PlasmaSplashParticle )
{
   dragCoefficient      = 1;
   gravityCoefficient   = 0.2;
   inheritedVelFactor   = 0.2;
   constantAcceleration = -0.0;
   lifetimeMS           = 600;
   lifetimeVarianceMS   = 0;
   textureName          = "special/droplet";
   colors[0]     = "0.7 0.8 1.0 1.0";
   colors[1]     = "0.7 0.8 1.0 0.5";
   colors[2]     = "0.7 0.8 1.0 0.0";
   sizes[0]      = 0.5;
   sizes[1]      = 0.5;
   sizes[2]      = 0.5;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData( PlasmaSplashEmitter )
{
   ejectionPeriodMS = 1;
   periodVarianceMS = 0;
   ejectionVelocity = 3;
   velocityVariance = 1.0;
   ejectionOffset   = 0.0;
   thetaMin         = 60;
   thetaMax         = 80;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 100;
   particles = "PlasmaSplashParticle";
};


datablock SplashData(PlasmaSplash)
{
   numSegments = 15;
   ejectionFreq = 0.0001;
   ejectionAngle = 45;
   ringLifetime = 0.5;
   lifetimeMS = 400;
   velocity = 5.0;
   startRadius = 0.0;
   acceleration = -3.0;
   texWrap = 5.0;

   texture = "special/water2";

   emitter[0] = PlasmaSplashEmitter;
   emitter[1] = PlasmaSplashEmitter2;
   emitter[2] = PlasmaMistEmitter;

   colors[0] = "0.7 0.8 1.0 0.0";
   colors[1] = "0.7 0.8 1.0 1.0";
   colors[2] = "0.7 0.8 1.0 0.0";
   colors[3] = "0.7 0.8 1.0 0.0";
   times[0] = 0.0;
   times[1] = 0.4;
   times[2] = 0.8;
   times[3] = 1.0;
};

//--------------------------------------------------------------------------
// Projectile
//--------------------------------------
datablock ParticleData(PlasmaRifleParticle)
{
   dragCoefficient      = 2.75;
   gravityCoefficient   = 0.1;
   inheritedVelFactor   = 0.2;
   constantAcceleration = 0.0;
   lifetimeMS           = 550;
   lifetimeVarianceMS   = 0;
   textureName          = "particleTest";
   colors[0]     = "0.46 0.36 0.26 1.0";
   colors[1]     = "0.46 0.36 0.26 0.0";
   sizes[0]      = 0.25;
   sizes[1]      = 0.20;
};

datablock ParticleEmitterData(PlasmaRifleEmitter)
{
   ejectionPeriodMS = 3;
   periodVarianceMS = 0;
   ejectionVelocity = 10;
   velocityVariance = 1.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 12;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvance  = true;
   particles = "PlasmaRifleParticle";
};



//--------------------------------------------------------------------------
// Projectile
//--------------------------------------
datablock LinearFlareProjectileData(PlasmaBolt)
{
   projectileShapeName = "plasmabolt.dts";
   scale               = "2.0 2.0 2.0";
   faceViewer          = true;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 0.45;
   damageRadius        = 4.0;
   kickBackStrength    = 0.0;
   radiusDamageType    = $DamageType::Plasma;

   explosion           = "PlasmaBoltExplosion";
   splash              = PlasmaSplash;

   dryVelocity       = 55.0;
   wetVelocity       = -1;
   velInheritFactor  = 0.3;
   fizzleTimeMS      = 2000;
   lifetimeMS        = 3000;
   explodeOnDeath    = false;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = true;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = -1;

   //activateDelayMS = 100;
   activateDelayMS = -1;

   size[0]           = 0.2;
   size[1]           = 0.5;
   size[2]           = 0.1;


   numFlares         = 35;
   flareColor        = "1 0.75 0.25";
   flareModTexture   = "flaremod";
   flareBaseTexture  = "flarebase";

	sound        = PlasmaProjectileSound;
   fireSound    = PlasmaFireSound;
   wetFireSound = PlasmaFireWetSound;
   
   hasLight    = true;
   lightRadius = 3.0;
   lightColor  = "1 0.75 0.25";
};


//--------------------------------------------------------------------------
// Ammo
//--------------------------------------

datablock ItemData(PlasmaAmmo)
{
   className = Ammo;
   catagory = "Ammo";
   shapeFile = "ammo_plasma.dts";
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "some plasma gun ammo";
};

//--------------------------------------------------------------------------
// Weapon
//--------------------------------------
datablock ItemData(Plasma)
{
   className = Weapon;
   catagory = "Spawn Items";
   shapeFile = "weapon_plasma.dts";
   image = PlasmaImage;
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "a plasma gun";
};

datablock ShapeBaseImageData(PlasmaImage)
{
   className = WeaponImage;
   shapeFile = "weapon_plasma.dts";
   item = Plasma;
   ammo = PlasmaAmmo;
   offset = "0 0 0";

   projectile = PlasmaBolt;
   projectileType = LinearFlareProjectile;

   stateName[0] = "Activate";
   stateTransitionOnTimeout[0] = "ActivateReady";
   stateTimeoutValue[0] = 0.5;
   stateSequence[0] = "Activate";
   stateSound[0] = PlasmaSwitchSound;

   stateName[1] = "ActivateReady";
   stateTransitionOnLoaded[1] = "Ready";
   stateTransitionOnNoAmmo[1] = "NoAmmo";

   stateName[2] = "Ready";
   stateTransitionOnNoAmmo[2] = "NoAmmo";
   stateTransitionOnTriggerDown[2] = "CheckWet";

   stateName[3] = "Fire";
   stateTransitionOnTimeout[3] = "Reload";
   stateTimeoutValue[3] = 0.1;
   stateFire[3] = true;
   stateRecoil[3] = LightRecoil;
   stateAllowImageChange[3] = false;
   stateScript[3] = "onFire";
   stateEmitterTime[3] = 0.2;
   stateSound[3] = PlasmaFireSound;

   stateName[4] = "Reload";
   stateTransitionOnNoAmmo[4] = "NoAmmo";
   stateTransitionOnTimeout[4] = "Ready";
   stateTimeoutValue[4] = 0.6;
   stateAllowImageChange[4] = false;
   stateSequence[4] = "Reload";
   stateSound[4] = PlasmaReloadSound;

   stateName[5] = "NoAmmo";
   stateTransitionOnAmmo[5] = "Reload";
   stateSequence[5] = "NoAmmo";
   stateTransitionOnTriggerDown[5] = "DryFire";

   stateName[6]       = "DryFire";
   stateSound[6]      = PlasmaDryFireSound;
   stateTimeoutValue[6]        = 1.5;
   stateTransitionOnTimeout[6] = "NoAmmo";
   
   stateName[7]       = "WetFire";
   stateSound[7]      = PlasmaFireWetSound;
   stateTimeoutValue[7]        = 1.5;
   stateTransitionOnTimeout[7] = "Ready";
   
   stateName[8]               = "CheckWet";
   stateTransitionOnWet[8]    = "WetFire";
   stateTransitionOnNotWet[8] = "Fire"; 
};

