//--------------------------------------------------------------------------
// Large Mortar Turret
// 
// 
//--------------------------------------------------------------------------

//--------------------------------------------------------------------------
// Sounds
//--------------------------------------
datablock EffectProfile(MBLSwitchEffect)
{
   effectname = "powered/turret_heavy_activate";
   minDistance = 2.5;
   maxDistance = 5.0;
};

datablock EffectProfile(MBLFireEffect)
{
   effectname = "powered/turret_mortar_fire";
   minDistance = 2.5;
   maxDistance = 5.0;
};

datablock AudioProfile(MBLSwitchSound)
{
   filename    = "fx/powered/turret_heavy_activate.wav";
   description = AudioClose3d;
   preload = true;
   effect = MBLSwitchEffect;
};

datablock AudioProfile(MBLFireSound)
{
   filename    = "fx/powered/turret_mortar_fire.wav";
   description = AudioDefault3d;
   preload = true;
   effect = MBLFireEffect;
};

//--------------------------------------------------------------------------
// Projectile
//--------------------------------------

datablock AudioProfile(MortarTurretProjectileSound)
{
	filename		= "fx/weapons/mortar_projectile.wav";
	description = ProjectileLooping3d;
    preload = true;
};

datablock GrenadeProjectileData(MortarTurretShot)
{
   projectileShapeName = "mortar_projectile.dts";
   emitterDelay        = -1;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 1.32;
   damageRadius        = 30.0;
   radiusDamageType    = $DamageType::MortarTurret;
   kickBackStrength    = 3000;

   explosion           = "MortarExplosion";
   velInheritFactor    = 0.5;
   splash              = MortarSplash;

   baseEmitter         = MortarSmokeEmitter;
   bubbleEmitter       = MortarBubbleEmitter;

   grenadeElasticity = 0.25;
   grenadeFriction   = 0.4;
   armingDelayMS     = 2000;
   muzzleVelocity    = 43.7;
   drag              = 0.1;

   sound			 = MortarTurretProjectileSound;

   hasLight    = true;
   lightRadius = 3;
   lightColor  = "0.05 0.2 0.05";
};

//--------------------------------------------------------------------------
//-------------------------------------- Fusion Turret Image
//
datablock TurretImageData(MortarBarrelLarge)
{
   shapeFile = "turret_mortar_large.dts";
   // ---------------------------------------------
   // z0dd - ZOD, 5/8/02. Incorrect parameter value
   //item      = MortarBarrelLargePack;
   item = MortarBarrelPack;

   projectile = MortarTurretShot;
   projectileType = GrenadeProjectile;
   usesEnergy = true;
   fireEnergy = 30;
   minEnergy = 30;
   emap = true;

	// don't let a mortar turret blow itself up
	dontFireInsideDamageRadius = true;
	damageRadius = 40;

   // Turret parameters
   activationMS      = 1000;
   deactivateDelayMS = 1500;
   thinkTimeMS       = 200;
   degPerSecTheta    = 580;
   degPerSecPhi      = 960;
   attackRadius      = 160;

   // State transitions
   stateName[0]                  = "Activate";
   stateTransitionOnNotLoaded[0] = "Dead";
   stateTransitionOnLoaded[0]    = "ActivateReady";

   stateName[1]                  = "ActivateReady";
   stateSequence[1]              = "Activate";
   stateSound[1]                 = MBLSwitchSound;
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
   stateSound[3]               = MBLFireSound;
   stateScript[3]              = "onFire";

   stateName[4]                  = "Reload";
   stateTimeoutValue[4]          = 1.5;
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


