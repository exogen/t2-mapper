//--------------------------------------
// TR2Disc launcher
//--------------------------------------

//--------------------------------------------------------------------------
// Force-Feedback Effects
//--------------------------------------
datablock EffectProfile(TR2DiscFireEffect)
{
   effectname = "weapons/Tspinfusor_fire";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(TR2DiscSwitchEffect)
{
   effectname = "weapons/spinfusor_activate";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(TR2DiscDryFireEffect)
{
   effectname = "weapons/spinfusor_dryfire";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(TR2DiscIdleEffect)
{
   effectname = "weapons/spinfusor_idle";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(TR2DiscReloadEffect)
{
   effectname = "weapons/spinfusor_reload";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(TR2DiscExpEffect)
{
   effectname = "explosions/grenade_explode";
   minDistance = 5;
   maxDistance = 20;
};

//--------------------------------------------------------------------------
// Sounds
//--------------------------------------
datablock AudioProfile(TR2DiscSwitchSound)
{
   filename    = "fx/weapons/blaster_activate.wav";
   description = AudioClosest3d;
   preload = true;
   effect = TR2DiscSwitchEffect;
};

datablock AudioProfile(TR2DiscLoopSound)
{
   filename    = "fx/weapons/spinfusor_idle.wav";
   description = ClosestLooping3d;
   effect = TR2DiscIdleEffect;
};


datablock AudioProfile(TR2DiscFireSound)
{
   filename    = "fx/weapons/TR2spinfusor_fire.wav";
   description = AudioDefault3d;
   preload = true;
   effect = TR2DiscFireEffect;
};

datablock AudioProfile(TR2DiscReloadSound)
{
   filename    = "fx/weapons/spinfusor_reload.wav";
   description = AudioClosest3d;
   preload = true;
   effect = TR2DiscReloadEffect;
};

datablock AudioProfile(TR2DiscExpSound)
{
   filename    = "fx/weapons/spinfusor_impact.wav";
   description = AudioExplosion3d;
   preload = true;
   effect = TR2DiscExpEffect;
};

datablock AudioProfile(underwaterTR2DiscExpSound)
{
   filename    = "fx/weapons/spinfusor_impact_UW.wav";
   description = AudioExplosion3d;
   preload = true;
   effect = TR2DiscExpEffect;
};

datablock AudioProfile(TR2DiscProjectileSound)
{
   filename    = "fx/weapons/spinfusor_projectile.wav";
   description = ProjectileLooping3d;
   preload = true;
};

datablock AudioProfile(TR2DiscDryFireSound)
{
   filename    = "fx/weapons/spinfusor_dryfire.wav";
   description = AudioClose3d;
   preload = true;
   effect = TR2DiscDryFireEffect;
};

//--------------------------------------------------------------------------
// Explosion
//--------------------------------------
datablock ParticleData(TR2DiscExplosionBubbleParticle)
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
datablock ParticleEmitterData(TR2DiscExplosionBubbleEmitter)
{
   ejectionPeriodMS = 7;
   periodVarianceMS = 0;
   ejectionVelocity = 1.0;
   ejectionOffset   = 3.0;
   velocityVariance = 0.5;
   thetaMin         = 0;
   thetaMax         = 80;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   particles = "TR2DiscExplosionBubbleParticle";
};

datablock ExplosionData(UnderwaterTR2DiscExplosion)
{
   explosionShape = "Disc_explosion.dts";
   soundProfile   = underwaterTR2DiscExpSound;

   faceViewer     = true;

   sizes[0]      = "1.3 1.3 1.3";
   sizes[1]      = "0.75 0.75 0.75";
   sizes[2]      = "0.4 0.4 0.4";
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;

   emitter[0] = "TR2DiscExplosionBubbleEmitter";

   shakeCamera = false;//true;
   camShakeFreq = "10.0 11.0 10.0";
   camShakeAmp = "20.0 20.0 20.0";
   camShakeDuration = 0.5;
   camShakeRadius = 10.0;
};

datablock ExplosionData(TR2DiscExplosion)
{
   explosionShape = "Disc_explosion.dts";
   soundProfile   = TR2DiscExpSound;

   faceViewer     = true;
   explosionScale = "2.0 2.0 2.0";//"1 1 1";

   shakeCamera = false;//true;
   camShakeFreq = "10.0 11.0 10.0";
   camShakeAmp = "20.0 20.0 20.0";
   camShakeDuration = 0.5;
   camShakeRadius = 10.0;

   sizes[0] = "2.5 2.5 2.5";//"1.0 1.0 1.0";
   sizes[1] = "2.5 2.5 2.5";//"1.0 1.0 1.0";
   times[0] = 0.0;
   times[1] = 1.0;
};

//--------------------------------------------------------------------------
// Splash
//--------------------------------------------------------------------------
datablock ParticleData(TR2DiscMist)
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

datablock ParticleEmitterData(TR2DiscMistEmitter)
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
   particles = "TR2DiscMist";
};

datablock ParticleData( TR2DiscSplashParticle2 )
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

datablock ParticleEmitterData( TR2DiscSplashEmitter2 )
{
   ejectionPeriodMS = 25;
   ejectionOffset = 0.2;
   periodVarianceMS = 0;
   ejectionVelocity = 2.25;
   velocityVariance = 0.50;
   thetaMin         = 0.0;
   thetaMax         = 30.0;
   lifetimeMS       = 250;

   particles = "TR2DiscSplashParticle2";
};


datablock ParticleData( TR2DiscSplashParticle )
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

datablock ParticleEmitterData( TR2DiscSplashEmitter )
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
   particles = "TR2DiscSplashParticle";
};


datablock SplashData(TR2DiscSplash)
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

   emitter[0] = TR2DiscSplashEmitter;
   emitter[1] = TR2DiscMistEmitter;

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
datablock LinearProjectileData(TR2DiscProjectile)
{
   projectileShapeName = "Disc.dts";
   emitterDelay        = -1;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 0.5;//0.35;//0.50;
   damageRadius        = 15;//11;//7.5;
   radiusDamageType    = $DamageType::Disc;
   kickBackStrength    = 6100;//1750;

   sound 				= TR2DiscProjectileSound;
   explosion           = "TR2DiscExplosion";
   underwaterExplosion = "UnderwaterTR2DiscExplosion";
   splash              = TR2DiscSplash;

   dryVelocity       = 130;//90;
   wetVelocity       = 120;
   velInheritFactor  = 0.7;
   fizzleTimeMS      = 5000;
   lifetimeMS        = 5000;
   explodeOnDeath    = true;
   reflectOnWaterImpactAngle = 30.0;//15.0;
   explodeOnWaterImpact      = false;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = 5000;

   activateDelayMS = 100;

   hasLight    = true;
   lightRadius = 6.0;
   lightColor  = "0.175 0.175 1.0";
};


//--------------------------------------------------------------------------
// Ammo
//--------------------------------------

datablock ItemData(TR2DiscAmmo)
{
   className = Ammo;
   catagory = "Ammo";
   shapeFile = "ammo_disc.dts";
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "some spinfusor discs";
   computeCRC = false;
};

//--------------------------------------------------------------------------
// Weapon
//--------------------------------------

datablock ShapeBaseImageData(TR2DiscImage)
{
   className = WeaponImage;
   shapeFile = "TR2weapon_disc.dts";
   item = TR2Disc;
   ammo = TR2DiscAmmo;
   offset = "0 -0.5 0";
   emap = true;

   projectileSpread = 0.0 / 1000.0;

   projectile = TR2DiscProjectile;
   projectileType = LinearProjectile;

   // State Data
   stateName[0]                     = "Preactivate";
   stateTransitionOnLoaded[0]       = "Activate";
   stateTransitionOnNoAmmo[0]       = "NoAmmo";

   stateName[1]                     = "Activate";
   stateTransitionOnTimeout[1]      = "Ready";
   stateTimeoutValue[1]             = 0.5;
   stateSequence[1]                 = "Activated";
   stateSound[1]                    = TR2DiscSwitchSound;

   stateName[2]                     = "Ready";
   stateTransitionOnNoAmmo[2]       = "NoAmmo";
   stateTransitionOnTriggerDown[2]  = "Fire";
   stateSequence[2]                 = "TR2DiscSpin";
   stateSound[2]                    = TR2DiscLoopSound;

   stateName[3]                     = "Fire";
   stateTransitionOnTimeout[3]      = "Reload";
   stateTimeoutValue[3]             = 1.25;
   stateFire[3]                     = true;
   stateRecoil[3]                   = LightRecoil;
   stateAllowImageChange[3]         = false;
   stateSequence[3]                 = "Fire";
   stateScript[3]                   = "onFire";
   stateSound[3]                    = TR2DiscFireSound;

   stateName[4]                     = "Reload";
   stateTransitionOnNoAmmo[4]       = "NoAmmo";
   stateTransitionOnTimeout[4]      = "Ready";
   stateTimeoutValue[4]             = 0.5; // 0.25 load, 0.25 spinup
   stateAllowImageChange[4]         = false;
   stateSequence[4]                 = "Reload";
   stateSound[4]                    = TR2DiscReloadSound;

   stateName[5]                     = "NoAmmo";
   stateTransitionOnAmmo[5]         = "Reload";
   stateSequence[5]                 = "NoAmmo";
   stateTransitionOnTriggerDown[5]  = "DryFire";

   stateName[6]                     = "DryFire";
   stateSound[6]                    = TR2DiscDryFireSound;
   stateTimeoutValue[6]             = 1.0;
   stateTransitionOnTimeout[6]      = "NoAmmo";
};

datablock ItemData(TR2Disc)
{
   className = Weapon;
   catagory = "Spawn Items";
   shapeFile = "TR2weapon_disc.dts";
   image = TR2DiscImage;
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "a spinfusor";
   computeCRC = true;
   emap = true;
};
