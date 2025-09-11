//--------------------------------------------------------------------------
// ELF Turret barrel
//--------------------------------------------------------------------------

//--------------------------------------------------------------------------
// Sounds
//--------------------------------------------------------------------------
datablock EffectProfile(EBLSwitchEffect)
{
   effectname = "powered/turret_light_activate";
   minDistance = 2.5;
   maxDistance = 5.0;
};

datablock EffectProfile(EBLFireEffect)
{
   effectname = "weapons/ELF_fire";
   minDistance = 2.5;
   maxDistance = 5.0;
};

datablock AudioProfile(EBLSwitchSound)
{
   filename    = "fx/powered/turret_light_activate.wav";
   description = AudioClose3d;
   preload = true;
   effect = EBLSwitchEffect;
};

datablock AudioProfile(EBLFireSound)
{
   filename    = "fx/weapons/ELF_fire.wav";
   description = AudioDefaultLooping3d;
   preload = true;
   effect = EBLFireEffect;
};

//--------------------------------------------------------------------------
// Projectile
//--------------------------------------

datablock ELFProjectileData(ELFTurretBolt)
{
   beamRange         = 75;
   numControlPoints  = 8;
   restorativeFactor = 3.75;
   dragFactor        = 4.5;
   endFactor         = 2.25;
   randForceFactor   = 2;
   randForceTime     = 0.125;
	drainEnergy			= 1.0;
	drainHealth			= 0.0015;
	directDamageType  = $DamageType::ELFTurret;

	mainBeamWidth     = 0.1;           // width of blue wave beam
	mainBeamSpeed     = 9.0;            // speed that the beam travels forward
	mainBeamRepeat    = 0.25;           // number of times the texture repeats
   lightningWidth    = 0.1;
   lightningDist     = 0.15;           // distance of lightning from main beam

   fireSound    = EBLFireSound;

	textures[0] = "special/ELFBeam";
   textures[1] = "special/ELFLightning";
   textures[2] = "special/BlueImpact";
   // --------------------------------------------------------------------
   // z0dd - ZOD, 5/27/02. Was missing this parameter, (console spam fix).
   emitter = ELFSparksEmitter;
};

//--------------------------------------------------------------------------
// ELF Turret Image
//--------------------------------------------------------------------------

datablock TurretImageData(ELFBarrelLarge)
{
   shapeFile = "turret_elf_large.dts";
   // ---------------------------------------------
   // z0dd - ZOD, 5/8/02. Incorrect parameter value
   //item      = ELFBarrelLargePack;
   item = ELFBarrelPack;

   projectile = ELFTurretBolt;
   projectileType = ELFProjectile;
   deleteLastProjectile = true;
   usesEnergy = true;
   fireEnergy = 0.0;
   minEnergy = 0.0;

   // Turret parameters
   activationMS      = 500;
   deactivateDelayMS = 100;
   thinkTimeMS       = 100;
   degPerSecTheta    = 580;
   degPerSecPhi      = 960;
   attackRadius      = 75;

   yawVariance          = 30.0; // these will smooth out the elf tracking code.
   pitchVariance        = 30.0; // more or less just tolerances
   
   // State transiltions
   stateName[0]                        = "Activate";
   stateTransitionOnNotLoaded[0]       = "Dead";
   stateTransitionOnLoaded[0]          = "ActivateReady";

   stateName[1]                        = "ActivateReady";
   stateSequence[1]                    = "Activate";
   stateSound[1]                       = EBLSwitchSound;
   stateTimeoutValue[1]                = 1;
   stateTransitionOnTimeout[1]         = "Ready";
   stateTransitionOnNotLoaded[1]       = "Deactivate";
   stateTransitionOnNoAmmo[1]          = "NoAmmo";

   stateName[2]                        = "Ready";
   stateTransitionOnNotLoaded[2]       = "Deactivate";
   stateTransitionOnTriggerDown[2]     = "Fire";
   stateTransitionOnNoAmmo[2]          = "NoAmmo";

   stateName[3]                        = "Fire";
   stateFire[3]                        = true;
   stateRecoil[3]                      = LightRecoil;
   stateAllowImageChange[3]            = false;
   stateSequence[3]                    = "Fire";
   stateSound[3]                       = EBLFireSound;
   stateScript[3]                      = "onFire";
   stateTransitionOnTriggerUp[3]       = "Deconstruction";
   stateTransitionOnNoAmmo[3]          = "Deconstruction";

   stateName[4]                        = "Reload";
   stateTimeoutValue[4]                = 0.01;
   stateAllowImageChange[4]            = false;
   stateSequence[4]                    = "Reload";
   stateTransitionOnTimeout[4]         = "Ready";
   stateTransitionOnNotLoaded[4]       = "Deactivate";
   stateTransitionOnNoAmmo[4]          = "NoAmmo";

   stateName[5]                        = "Deactivate";
   stateSequence[5]                    = "Activate";
   stateDirection[5]                   = false;
   stateTimeoutValue[5]                = 1;
   stateTransitionOnLoaded[5]          = "ActivateReady";
   stateTransitionOnTimeout[5]         = "Dead";

   stateName[6]                        = "Dead";
   stateTransitionOnLoaded[6]          = "ActivateReady";

   stateName[7]                        = "NoAmmo";
   stateTransitionOnAmmo[7]            = "Reload";
   stateSequence[7]                    = "NoAmmo";
   
   stateName[8]                       = "Deconstruction";
   stateScript[8]                     = "deconstruct";
   stateTransitionOnNoAmmo[8]         = "NoAmmo";
   stateTransitionOnTimeout[8]        = "Reload";
   stateTimeoutValue[8]               = 0.1;
};

