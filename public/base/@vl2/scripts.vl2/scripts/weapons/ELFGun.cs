//--------------------------------------------------------------------------
// ELF Gun
//--------------------------------------------------------------------------
datablock EffectProfile(ELFGunSwitchEffect)
{
   effectname = "weapons/generic_switch";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(ELFGunFireEffect)
{
   effectname = "weapons/ELF_fire";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(ELFGunFireWetEffect)
{
   effectname = "weapons/ELF_underwater";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock AudioProfile(ELFGunSwitchSound)
{
   filename    = "fx/weapons/generic_switch.wav";
   description = AudioClosest3d;
   preload = true;
   effect = ELFGunSwitchEffect;
};

datablock AudioProfile(ELFGunFireSound)
{
   filename    = "fx/weapons/ELF_fire.wav";
   description = CloseLooping3d;
   preload = true;
   effect = ELFGunFireEffect;
};

datablock AudioProfile(ElfFireWetSound)
{
   filename    = "fx/weapons/ELF_underwater.wav";
   description = AudioClose3d;
   preload = true;
};

datablock AudioProfile(ELFHitTargetSound)
{
   filename    = "fx/weapons/ELF_hit.wav";
   description = CloseLooping3d;
   preload = true;
   effect = ELFGunFireEffect;
};

//--------------------------------------
// Sparks
//--------------------------------------
datablock ParticleData(ELFSparks)
{
   dragCoefficient      = 1;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = 0.0;
   lifetimeMS           = 200;
   lifetimeVarianceMS   = 0;
   textureName          = "special/blueSpark";
   colors[0]     = "0.8 0.8 1.0 1.0";
   colors[1]     = "0.8 0.8 1.0 1.0";
   colors[2]     = "0.8 0.8 1.0 0.0";
   sizes[0]      = 0.35;
   sizes[1]      = 0.15;
   sizes[2]      = 0.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(ELFSparksEmitter)
{
   ejectionPeriodMS = 5;
   periodVarianceMS = 0;
   ejectionVelocity = 4;
   velocityVariance = 2;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 180;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
//   lifetimeMS       = 100;
   particles = "ELFSparks";
};


//--------------------------------------
// Projectile                    
//--------------------------------------
datablock ELFProjectileData(BasicELF)
{
   beamRange         = 30;
   numControlPoints  = 8;
   restorativeFactor = 3.75;
   dragFactor        = 4.5;
   endFactor         = 2.25;
   randForceFactor   = 2;
   randForceTime     = 0.125;
	drainEnergy			= 1.0;
	drainHealth			= 0.0;
   directDamageType  = $DamageType::ELF;
	mainBeamWidth     = 0.1;           // width of blue wave beam
	mainBeamSpeed     = 9.0;            // speed that the beam travels forward
	mainBeamRepeat    = 0.25;           // number of times the texture repeats
   lightningWidth    = 0.1;
   lightningDist      = 0.15;           // distance of lightning from main beam

   fireSound    = ElfGunFireSound;
   wetFireSound = ElfFireWetSound;

	textures[0] = "special/ELFBeam";
   textures[1] = "special/ELFLightning";
   textures[2] = "special/BlueImpact";

   emitter = ELFSparksEmitter;
};

//--------------------------------------
// Rifle and item...
//--------------------------------------
datablock ItemData(ELFGun)
{
   className    = Weapon;
   catagory     = "Spawn Items";
   shapeFile    = "weapon_elf.dts";
   image        = ELFGunImage;
   mass         = 1;
   elasticity   = 0.2;
   friction     = 0.6;
   pickupRadius = 2;
	pickUpName = "an ELF gun";

   computeCRC = true;
   emap = true;
};

datablock ShapeBaseImageData(ELFGunImage)
{
   className = WeaponImage;

   shapeFile = "weapon_elf.dts";
   item = ELFGun;
   offset = "0 0 0";

   projectile = BasicELF;
   projectileType = ELFProjectile;
   deleteLastProjectile = true;
   emap = true;
   

	usesEnergy = true;
 	minEnergy = 3;

   stateName[0]                     = "Activate";
   stateSequence[0]                 = "Activate";
	stateSound[0]                    = ELFGunSwitchSound;
   stateTimeoutValue[0]             = 0.5;
   stateTransitionOnTimeout[0]      = "ActivateReady";

   stateName[1]                     = "ActivateReady";
   stateTransitionOnAmmo[1]         = "Ready";
   stateTransitionOnNoAmmo[1]       = "NoAmmo";

   stateName[2]                     = "Ready";
   stateTransitionOnNoAmmo[2]       = "NoAmmo";
   stateTransitionOnTriggerDown[2]  = "CheckWet";

   stateName[3]                     = "Fire";
	stateEnergyDrain[3]              = 5;
   stateFire[3]                     = true;
   stateAllowImageChange[3]         = false;
   stateScript[3]                   = "onFire";
   stateTransitionOnTriggerUp[3]    = "Deconstruction";
   stateTransitionOnNoAmmo[3]       = "Deconstruction";
   //stateSound[3]                    = ElfFireWetSound;

   stateName[4]                     = "NoAmmo";
   stateTransitionOnAmmo[4]         = "Ready";

   stateName[5]                     = "Deconstruction";
   stateScript[5]                   = "deconstruct";
   stateTransitionOnTimeout[5]      = "Ready";
   stateTransitionOnNoAmmo[6]       = "NoAmmo";
   
   stateName[6]                     = "DryFire";
   stateSound[6]                    = ElfFireWetSound;
   stateTimeoutValue[6]             = 0.5;
   stateTransitionOnTimeout[6]      = "Ready";
   
   stateName[7]                     = "CheckWet";
   stateTransitionOnWet[7]          = "DryFire";
   stateTransitionOnNotWet[7]       = "Fire";
};
