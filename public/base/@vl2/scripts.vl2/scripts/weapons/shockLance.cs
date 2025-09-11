//--------------------------------------------------------------------------
// Shock Lance
// 
// 
//--------------------------------------------------------------------------

datablock EffectProfile(ShockLanceSwitchEffect)
{
   effectname = "weapons/shocklance_activate";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(ShockLanceFireEffect)
{
   effectname = "weapons/shocklance_fire";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(ShockLanceReloadEffect)
{
   effectname = "weapons/shocklance_reload";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock AudioProfile(ShockLanceSwitchSound)
{
   filename    = "fx/weapons/shocklance_activate.wav";
   description = AudioClosest3d;
   preload = true;
   effect = ShockLanceSwitchEffect;
};

//--------------------------------------------------------------------------
// Explosion
//--------------------------------------
datablock AudioProfile(ShockLanceHitSound)
{
   filename    = "fx/weapons/shocklance_fire.WAV";
   description = AudioClose3d;
   preload = true;
   effect = ShockLanceFireEffect;
};

datablock AudioProfile(ShockLanceReloadSound)
{
   filename    = "fx/weapons/shocklance_reload.WAV";
   description = AudioClosest3d;
   preload = true;
   effect = ShockLanceReloadEffect;
};

datablock AudioProfile(ShockLanceDryFireSound)
{
   filename    = "fx/weapons/shocklance_dryfire.WAV";
   description = AudioClose3d;
   preload = true;
   effect = ShockLanceReloadEffect;
};

datablock AudioProfile(ShockLanceMissSound)
{
   filename    = "fx/weapons/shocklance_miss.WAV";
   description = AudioExplosion3d;
   preload = true;
};

//--------------------------------------------------------------------------
// Particle data
//--------------------------------------------------------------------------
datablock ParticleData(ShockParticle)
{
   dragCoeffiecient     = 0.0;
   gravityCoefficient   = -0.0;
   inheritedVelFactor   = 0.0;

   lifetimeMS           = 1000;
   lifetimeVarianceMS   = 0;

   textureName          = "particleTest";

   useInvAlpha = false;
   spinRandomMin = -100.0;
   spinRandomMax = 100.0;

   numParts = 50;
   
   animateTexture = true;
   framesPerSec = 26;

   animTexName[00]       = "special/Explosion/exp_0002";
   animTexName[01]       = "special/Explosion/exp_0004";
   animTexName[02]       = "special/Explosion/exp_0006";
   animTexName[03]       = "special/Explosion/exp_0008";
   animTexName[04]       = "special/Explosion/exp_0010";
   animTexName[05]       = "special/Explosion/exp_0012";
   animTexName[06]       = "special/Explosion/exp_0014";
   animTexName[07]       = "special/Explosion/exp_0016";
   animTexName[08]       = "special/Explosion/exp_0018";
   animTexName[09]       = "special/Explosion/exp_0020";
   animTexName[10]       = "special/Explosion/exp_0022";
   animTexName[11]       = "special/Explosion/exp_0024";
   animTexName[12]       = "special/Explosion/exp_0026";
   animTexName[13]       = "special/Explosion/exp_0028";
   animTexName[14]       = "special/Explosion/exp_0030";
   animTexName[15]       = "special/Explosion/exp_0032";
   animTexName[16]       = "special/Explosion/exp_0034";
   animTexName[17]       = "special/Explosion/exp_0036";
   animTexName[18]       = "special/Explosion/exp_0038";
   animTexName[19]       = "special/Explosion/exp_0040";
   animTexName[20]       = "special/Explosion/exp_0042";
   animTexName[21]       = "special/Explosion/exp_0044";
   animTexName[22]       = "special/Explosion/exp_0046";
   animTexName[23]       = "special/Explosion/exp_0048";
   animTexName[24]       = "special/Explosion/exp_0050";
   animTexName[25]       = "special/Explosion/exp_0052";

	
   colors[0]     = "0.5   0.5  1.0 1.0";
   colors[1]     = "0.5   0.5  1.0 0.5";
   colors[2]     = "0.25  0.25 1.0 0.0";
   sizes[0]      = 0.5;
   sizes[1]      = 0.5;
   sizes[2]      = 0.5;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(ShockParticleEmitter)
{
   ejectionPeriodMS = 1;
   periodVarianceMS = 0;

   ejectionVelocity = 0.25;
   velocityVariance = 0.0;

   thetaMin         = 0.0;
   thetaMax         = 30.0;

   particles = "ShockParticle";
};

//--------------------------------------------------------------------------
// Shockwave
//--------------------------------------------------------------------------
datablock ShockwaveData( ShocklanceHit )
{
   width = 0.5;
   numSegments = 20;
   numVertSegments = 1;
   velocity = 0.25;
   acceleration = 1.0;
   lifetimeMS = 600;
   height = 0.1;
   verticalCurve = 0.5;

   mapToTerrain = false;
   renderBottom = false;
   orientToNormal = true;

   texture[0] = "special/shocklanceHit";
   texture[1] = "special/gradient";
   texWrap = 3.0;

   times[0] = 0.0;
   times[1] = 0.5;
   times[2] = 1.0;

   colors[0] = "1.0 1.0 1.0 1.0";
   colors[1] = "1.0 1.0 1.0 0.5";
   colors[2] = "1.0 1.0 1.0 0.0";
};


//--------------------------------------
// Projectile
//--------------------------------------
datablock ShockLanceProjectileData(BasicShocker)
{
   directDamage        = 0.45;
   radiusDamageType    = $DamageType::ShockLance;
   kickBackStrength    = 2500;
   velInheritFactor    = 0;
   sound               = "";

   zapDuration = 1.0;
   impulse = 1800;
   boltLength = 14.0;
   extension = 14.0;            // script variable indicating distance you can shock people from
   lightningFreq = 25.0;
   lightningDensity = 3.0;
   lightningAmp = 0.25;
   lightningWidth = 0.05;

   shockwave = ShocklanceHit;
   							 
   boltSpeed[0] = 2.0;
   boltSpeed[1] = -0.5;

   texWrap[0] = 1.5;
   texWrap[1] = 1.5;

   startWidth[0] = 0.3;
   endWidth[0] = 0.6;
   startWidth[1] = 0.3;
   endWidth[1] = 0.6;
   
   texture[0] = "special/shockLightning01";
   texture[1] = "special/shockLightning02";
   texture[2] = "special/shockLightning03";
   texture[3] = "special/ELFBeam";

   emitter[0] = ShockParticleEmitter;
};


//--------------------------------------
// Rifle and item...
//--------------------------------------
datablock ItemData(ShockLance)
{
   className    = Weapon;
   catagory     = "Spawn Items";
   shapeFile    = "weapon_shocklance.dts";
   image        = ShockLanceImage;
   mass         = 1;
   elasticity   = 0.2;
   friction     = 0.6;
   pickupRadius = 2;
	pickUpName   = "a shocklance";

   computeCRC = true;
   emap = true;
};

datablock ShapeBaseImageData(ShockLanceImage)
{
   classname = WeaponImage;
   shapeFile = "weapon_shocklance.dts";
   item = ShockLance;
   offset = "0 0 0";
   emap = true;

   projectile = BasicShocker;

   usesEnergy = true;
   missEnergy = 0;
   hitEnergy  = 15;
   minEnergy  = 15;       // needs to change to be datablock's energy drain for a hit

   stateName[0] = "Activate";
   stateTransitionOnTimeout[0] = "ActivateReady";
   stateSound[0] = ShockLanceSwitchSound;
   stateTimeoutValue[0] = 0.5;
   stateSequence[0] = "Activate";

   stateName[1] = "ActivateReady";
   stateTransitionOnLoaded[1] = "Ready";
   stateTransitionOnNoAmmo[1] = "NoAmmo";

   stateName[2] = "Ready";
   stateTransitionOnNoAmmo[2] = "NoAmmo";
   stateTransitionOnTriggerDown[2] = "CheckWet";

   stateName[3] = "Fire";
   stateTransitionOnTimeout[3] = "Reload";
   stateTimeoutValue[3] = 0.5;
   stateFire[3] = true;
   stateAllowImageChange[3] = false;
   stateSequence[3] = "Fire";
   stateScript[3] = "onFire";
   stateSound[3] = ShockLanceDryFireSound;

   stateName[4] = "Reload";
   stateTransitionOnNoAmmo[4] = "NoAmmo";
   stateTransitionOnTimeout[4] = "Ready";
   stateTimeoutValue[4] = 2.0;
   stateAllowImageChange[4] = false;
   stateSequence[4] = "Reload";
   stateSound[4] = ShockLanceReloadSound;

   stateName[5] = "NoAmmo";
   stateTransitionOnAmmo[5] = "Ready";

   stateName[6]                  = "DryFire";
   stateSound[6]                 = ShockLanceDryFireSound;
   stateTimeoutValue[6]          = 1.0;
   stateTransitionOnTimeout[6]   = "Ready";
   
   stateName[7] = "CheckWet";
   stateTransitionOnWet[7] = "DryFire";
   stateTransitionOnNotWet[7] = "Fire";
};

