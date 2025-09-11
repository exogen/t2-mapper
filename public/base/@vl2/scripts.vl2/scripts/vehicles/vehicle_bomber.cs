//**************************************************************
// THUNDERSWORD BOMBER
//**************************************************************
//**************************************************************
// SOUNDS
//**************************************************************
datablock EffectProfile(BomberFlyerEngineEffect)
{
   effectname = "vehicles/bomber_engine";
   minDistance = 5.0;
   maxDistance = 10.0;
};

datablock EffectProfile(BomberFlyerThrustEffect)
{
   effectname = "vehicles/bomber_boost";
   minDistance = 5.0;
   maxDistance = 10.0;
};

datablock EffectProfile(BomberTurretFireEffect)
{
   effectname = "vehicles/bomber_turret_fire";
   minDistance = 5.0;
   maxDistance = 10.0;
};

datablock EffectProfile(BomberTurretActivateEffect)
{
   effectname = "vehicles/bomber_turret_activate";
   minDistance = 5.0;
   maxDistance = 10.0;
};

datablock EffectProfile(BomberTurretReloadEffect)
{
   effectname = "vehicles/bomber_turret_reload";
   minDistance = 5.0;
   maxDistance = 10.0;
};

datablock EffectProfile(BomberTurretDryFireEffect)
{
   effectname = "vehicles/bomber_turret_dryfire";
   minDistance = 5.0;
   maxDistance = 10.0;
};

datablock EffectProfile(BomberBombReloadEffect)
{
   effectname = "vehicles/bomber_bomb_reload";
   minDistance = 5.0;
   maxDistance = 10.0;
};

datablock EffectProfile(BomberBombDryFireEffect)
{
   effectname = "vehicles/bomber_bomb_dryfire";
   minDistance = 5.0;
   maxDistance = 10.0;
};

datablock EffectProfile(BomberBombFireEffect)
{
   effectname = "weapons/generic_throw";
   minDistance = 10.0;
   maxDistance = 20.0;
};

datablock AudioProfile(BomberFlyerEngineSound)
{
   filename    = "fx/vehicles/bomber_engine.wav";
   description = AudioDefaultLooping3d;
   preload = true;
   effect = BomberFlyerEngineEffect;
};

datablock AudioProfile(BomberFlyerThrustSound)
{
   filename    = "fx/vehicles/bomber_boost.wav";
   description = AudioDefaultLooping3d;
   preload = true;
   effect = BomberFlyerThrustEffect;
};

datablock AudioProfile(FusionExpSound)
// Sound played when mortar impacts on target
{
   filename    = "fx/powered/turret_mortar_explode.wav";
   description = "AudioBIGExplosion3d";
   preload = true;
};

datablock AudioProfile(BomberTurretFireSound)
{
   filename    = "fx/vehicles/bomber_turret_fire.wav";
   description = AudioClose3d;
   preload = true;
   effect = BomberTurretFireEffect;
};

datablock AudioProfile(BomberTurretActivateSound)
{
   filename    = "fx/vehicles/bomber_turret_activate.wav";
   description = AudioClose3d;
   preload = true;
   effect = BomberTurretActivateEffect;
};

datablock AudioProfile(BomberTurretReloadSound)
{
   filename    = "fx/vehicles/bomber_turret_reload.wav";
   description = AudioClose3d;
   preload = true;
   effect = BomberTurretReloadEffect;
};

datablock AudioProfile(BomberTurretIdleSound)
{
   filename    = "fx/misc/diagnostic_on.wav";
   description = ClosestLooping3d;
   preload = true;
};

datablock AudioProfile(BomberTurretDryFireSound)
{
   filename    = "fx/vehicles/bomber_turret_dryfire.wav";
   description = AudioClose3d;
   preload = true;
   effect = BomberTurretDryFireEffect;
};
   
datablock AudioProfile(BomberBombReloadSound)
{
   filename    = "fx/vehicles/bomber_bomb_reload.wav";
   description = AudioClose3d;
   preload = true;
   effect = BomberBombReloadEffect;
};

datablock AudioProfile(BomberBombProjectileSound)
{
   filename    = "fx/vehicles/bomber_bomb_projectile.wav";
   description = AudioDefaultLooping3d;
   preload = true;
   effect = BomberBombFireEffect;
};

datablock AudioProfile(BomberBombDryFireSound)
{
   filename    = "fx/vehicles/bomber_bomb_dryfire.wav";
   description = AudioClose3d;
   preload = true;
   effect = BomberBombDryFireEffect;
};

datablock AudioProfile(BomberBombFireSound)
{
   filename    = "fx/vehicles/bomber_bomb_reload.wav";
   description = AudioClose3d;
   preload = true;
   effect = BomberBombFireEffect;
};

datablock AudioProfile(BomberBombIdleSound)
{
   filename    = "fx/misc/diagnostic_on.wav";
   description = ClosestLooping3d;
   preload = true;
};

//**************************************************************
// VEHICLE CHARACTERISTICS
//**************************************************************

datablock FlyingVehicleData(BomberFlyer) : BomberDamageProfile
{
   spawnOffset = "0 0 2";

   catagory = "Vehicles";
   shapeFile = "vehicle_air_bomber.dts";
   multipassenger = true;
   computeCRC = true;

   weaponNode = 1;

   debrisShapeName = "vehicle_air_bomber_debris.dts";
   debris = ShapeDebris;
   renderWhenDestroyed = false;

   drag    = 0.2;
   density = 1.0;

   mountPose[0] = sitting;
   mountPose[1] = sitting;
   numMountPoints = 3;  
   isProtectedMountPoint[0] = true;
   isProtectedMountPoint[1] = true;
   isProtectedMountPoint[2] = true;

   cameraDefaultFov = 90.0;
   cameraMinFov = 5.0;
   cameraMaxFov = 120.0;
   
   cameraMaxDist = 22;
   cameraOffset = 5;
   cameraLag = 1.0;
   explosion = LargeAirVehicleExplosion;
	explosionDamage = 0.5;
	explosionRadius = 5.0;

   maxDamage = 2.80;     // Total health
   destroyedLevel = 2.80;   // Damage textures show up at this health level

   isShielded = true;
   energyPerDamagePoint = 150;
   maxEnergy = 400;      // Afterburner and any energy weapon pool
   minDrag = 60;           // Linear Drag (eventually slows you down when not thrusting...constant drag)
   rotationalDrag = 1800;        // Angular Drag (dampens the drift after you stop moving the mouse...also tumble drag)
   rechargeRate = 0.8;

   // Auto stabilize speed
   maxAutoSpeed = 15;       // Autostabilizer kicks in when less than this speed. (meters/second)
   autoAngularForce = 1500;      // Angular stabilizer force (this force levels you out when autostabilizer kicks in)
   autoLinearForce = 300;        // Linear stabilzer force (this slows you down when autostabilizer kicks in)
   autoInputDamping = 0.95;      // Dampen control input so you don't whack out at very slow speeds
   
   // Maneuvering
   maxSteeringAngle = 5;    // Max radiens you can rotate the wheel. Smaller number is more maneuverable.
   horizontalSurfaceForce = 5;   // Horizontal center "wing" (provides "bite" into the wind for climbing/diving and turning)
   verticalSurfaceForce = 8;     // Vertical center "wing" (controls side slip. lower numbers make MORE slide.)
   maneuveringForce = 4700;      // Horizontal jets (W,S,D,A key thrust)
   steeringForce = 1100;         // Steering jets (force applied when you move the mouse)
   steeringRollForce = 300;      // Steering jets (how much you heel over when you turn)
   rollForce = 8;                // Auto-roll (self-correction to right you after you roll/invert)
   hoverHeight = 5;        // Height off the ground at rest
   createHoverHeight = 3;  // Height off the ground when created
   maxForwardSpeed = 85;  // speed in which forward thrust force is no longer applied (meters/second)

   // Turbo Jet
   jetForce = 3000;      // Afterburner thrust (this is in addition to normal thrust)
   minJetEnergy = 40.0;     // Afterburner can't be used if below this threshhold.
   jetEnergyDrain = 3.0;       // Energy use of the afterburners (low number is less drain...can be fractional)
   vertThrustMultiple = 3.0;

   dustEmitter = LargeVehicleLiftoffDustEmitter;
   triggerDustHeight = 4.0;
   dustHeight = 2.0;

   damageEmitter[0] = LightDamageSmoke;
   damageEmitter[1] = HeavyDamageSmoke;
   damageEmitter[2] = DamageBubbles;
   damageEmitterOffset[0] = "3.0 -3.0 0.0 ";
   damageEmitterOffset[1] = "-3.0 -3.0 0.0 ";
   damageLevelTolerance[0] = 0.3;
   damageLevelTolerance[1] = 0.7;
   numDmgEmitterAreas = 2;

   // Rigid body
   mass = 350;        // Mass of the vehicle
   bodyFriction = 0;     // Don't mess with this.
   bodyRestitution = 0.5;   // When you hit the ground, how much you rebound. (between 0 and 1)
   minRollSpeed = 0;     // Don't mess with this.
   softImpactSpeed = 20;       // Sound hooks. This is the soft hit.
   hardImpactSpeed = 25;    // Sound hooks. This is the hard hit.

   // Ground Impact Damage (uses DamageType::Ground)
   minImpactSpeed = 20;      // If hit ground at speed above this then it's an impact. Meters/second
   speedDamageScale = 0.060;

   // Object Impact Damage (uses DamageType::Impact)
   collDamageThresholdVel = 25;
   collDamageMultiplier   = 0.020;

   //
   minTrailSpeed = 15;      // The speed your contrail shows up at.
   trailEmitter = ContrailEmitter;
   forwardJetEmitter = FlyerJetEmitter;
   downJetEmitter = FlyerJetEmitter;

   //
   jetSound = BomberFlyerThrustSound;
   engineSound = BomberFlyerEngineSound;
   softImpactSound = SoftImpactSound;
   hardImpactSound = HardImpactSound;
   //wheelImpactSound = WheelImpactSound;

   //
   softSplashSoundVelocity = 15.0; 
   mediumSplashSoundVelocity = 20.0;   
   hardSplashSoundVelocity = 30.0;   
   exitSplashSoundVelocity = 10.0;
   
   exitingWater      = VehicleExitWaterHardSound;
   impactWaterEasy   = VehicleImpactWaterSoftSound;
   impactWaterMedium = VehicleImpactWaterMediumSound;
   impactWaterHard   = VehicleImpactWaterHardSound;
   waterWakeSound    = VehicleWakeHardSplashSound; 
  
   minMountDist = 4;

   splashEmitter[0] = VehicleFoamDropletsEmitter;
   splashEmitter[1] = VehicleFoamEmitter;

   shieldImpact = VehicleShieldImpact;

   cmdCategory = "Tactical";
   cmdIcon = CMDFlyingBomberIcon;
   cmdMiniIconName = "commander/MiniIcons/com_bomber_grey";
   targetNameTag = 'Thundersword';
   targetTypeTag = 'Bomber';
   sensorData = VehiclePulseSensor;

   checkRadius = 7.1895;
   observeParameters = "1 10 10";
   shieldEffectScale = "0.75 0.975 0.375";
   showPilotInfo = 1;
};

//**************************************************************
// WEAPONS
//**************************************************************

//-------------------------------------
// BOMBER BELLY TURRET GUN (projectile)
//-------------------------------------

datablock ShockwaveData(BomberFusionShockwave)
{
   width = 0.5;
   numSegments = 13;
   numVertSegments = 1;
   velocity = 0.5;
   acceleration = 2.0;
   lifetimeMS = 900;
   height = 0.1;
   verticalCurve = 0.5;

   mapToTerrain = false;
   renderBottom = false;
   orientToNormal = true;

   texture[0] = "special/shockwave5";
   texture[1] = "special/gradient";
   texWrap = 3.0;

   times[0] = 0.0;
   times[1] = 0.5;
   times[2] = 1.0;

   colors[0] = "0.6 0.6 1.0 1.0";
   colors[1] = "0.6 0.3 1.0 0.5";
   colors[2] = "0.0 0.0 1.0 0.0";
};

datablock ParticleData(BomberFusionExplosionParticle1)
{
   dragCoefficient      = 2;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = -0.0;
   lifetimeMS           = 600;
   lifetimeVarianceMS   = 000;
   textureName          = "special/crescent4";
   colors[0] = "0.6 0.6 1.0 1.0";
   colors[1] = "0.6 0.3 1.0 1.0";
   colors[2] = "0.0 0.0 1.0 0.0";
   sizes[0]      = 0.25;
   sizes[1]      = 0.5;
   sizes[2]      = 1.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(BomberFusionExplosionEmitter)
{
   ejectionPeriodMS = 7;
   periodVarianceMS = 0;
   ejectionVelocity = 2;
   velocityVariance = 1.5;
   ejectionOffset   = 0.0;
   thetaMin         = 80;
   thetaMax         = 90;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 200;
   particles = "BomberFusionExplosionParticle1";
};

datablock ExplosionData(BomberFusionBoltExplosion)
{
   soundProfile   = blasterExpSound;
   shockwave      = BomberFusionShockwave;
   emitter[0]     = BomberFusionExplosionEmitter;
};


datablock LinearFlareProjectileData(BomberFusionBolt)
{
   projectileShapeName        = "";
   directDamage               = 0.35;
   directDamageType           = $DamageType::BellyTurret;
   hasDamageRadius            = false;
   explosion                  = BomberFusionBoltExplosion;
   sound                      = BlasterProjectileSound;

   dryVelocity                = 200.0;
   wetVelocity                = 200.0;
   velInheritFactor           = 1.0;
   fizzleTimeMS               = 2000;
   lifetimeMS                 = 3000;
   explodeOnDeath             = false;
   reflectOnWaterImpactAngle  = 0.0;
   explodeOnWaterImpact       = true;
   deflectionOnWaterImpact    = 0.0;
   fizzleUnderwaterMS         = -1;

   activateDelayMS            = 100;

   numFlares                  = 0;
   size                       = 0.15;
   flareColor                 = "0.7 0.3 1.0";
   flareModTexture            = "flaremod";
   flareBaseTexture           = "flarebase";
};

//-------------------------------------
// BOMBER BELLY TURRET CHARACTERISTICS
//-------------------------------------

datablock TurretData(BomberTurret) : TurretDamageProfile
{
   className               = VehicleTurret;
   catagory                = "Turrets";
   shapeFile               = "turret_belly_base.dts";
   preload                 = true;

   mass                    = 1.0;  // Not really relevant
   repairRate              = 0;
   maxDamage               = BomberFlyer.maxDamage;
   destroyedLevel          = BomberFlyer.destroyedLevel;

   thetaMin                = 90;
   thetaMax                = 180;

   // capacitor
   maxCapacitorEnergy      = 250;
   capacitorRechargeRate   = 0.8;
   
   inheritEnergyFromMount  = true;
   firstPersonOnly         = true;
   useEyePoint             = true;
   numWeapons              = 3;

   targetNameTag           = 'Thundersword Belly';
   targetTypeTag           = 'Turret';
};

datablock TurretImageData(BomberTurretBarrel)
{
   shapeFile                        = "turret_belly_barrell.dts";
   mountPoint                       = 0;

   projectile                       = BomberFusionBolt;
   projectileType                   = LinearFlareProjectile;

   usesEnergy                       = true;
   useCapacitor                     = true;
   useMountEnergy                   = true;
   fireEnergy                       = 16.0;
   minEnergy                        = 16.0;

   // Turret parameters
   activationMS                     = 1000;
   deactivateDelayMS                = 1500;
   thinkTimeMS                      = 200;
   degPerSecTheta                   = 360;
   degPerSecPhi                     = 360;
   
   attackRadius                     = 75;

   // State transitions
   stateName[0]                     = "Activate";
   stateTransitionOnTimeout[0]      = "WaitFire1";
   stateTimeoutValue[0]             = 0.5;
   stateSequence[0]                 = "Activate";
   stateSound[0]                    = BomberTurretActivateSound;

   stateName[1]                     = "WaitFire1";
   stateTransitionOnTriggerDown[1]  = "Fire1";
   stateTransitionOnNoAmmo[1]       = "NoAmmo1";

   stateName[2]                     = "Fire1";
   stateTransitionOnTimeout[2]      = "Reload1";
   stateTimeoutValue[2]             = 0.13;
   stateFire[2]                     = true;
   stateRecoil[2]                   = LightRecoil;
   stateAllowImageChange[2]         = false;
   stateSequence[2]                 = "Fire";
   stateScript[2]                   = "onFire";
   stateSound[2]                    = BomberTurretFireSound;

   stateName[3]                     = "Reload1";
   stateSequence[3]                 = "Reload";
   stateTimeoutValue[3]             = 0.1;
   stateAllowImageChange[3]         = false;
   stateTransitionOnTimeout[3]      = "WaitFire2";
   stateTransitionOnNoAmmo[3]       = "NoAmmo1";

   stateName[4]                     = "NoAmmo1";
   stateTransitionOnAmmo[4]         = "Reload1";
   // ---------------------------------------------
   // z0dd - ZOD, 5/8/02. Incorrect parameter value
   //stateSequence[4]                 = "NoAmmo";
   stateSequence[4] = "NoAmmo1";

   stateTransitionOnTriggerDown[4]  = "DryFire1";

   stateName[5]                     = "DryFire1";
   stateSound[5]                    = BomberTurretDryFireSound;
   stateTimeoutValue[5]             = 0.5;
   stateTransitionOnTimeout[5]      = "NoAmmo1";
   
   stateName[6]                     = "WaitFire2";
   stateTransitionOnTriggerDown[6]  = "Fire2";
   // ---------------------------------------------
   // z0dd - ZOD, 5/8/02. Incorrect parameter value
   //stateTransitionOnNoAmmo[6]       = "NoAmmo";
   stateTransitionOnNoAmmo[6] = "NoAmmo2";

   stateName[7]                     = "Fire2";
   stateTransitionOnTimeout[7]      = "Reload2";
   stateTimeoutValue[7]             = 0.13;
   stateScript[7]                   = "FirePair";

   stateName[8]                     = "Reload2";
   stateSequence[8]                 = "Reload";
   stateTimeoutValue[8]             = 0.1;
   stateAllowImageChange[8]         = false;
   stateTransitionOnTimeout[8]      = "WaitFire1";
   stateTransitionOnNoAmmo[8]       = "NoAmmo2";

   stateName[9]                     = "NoAmmo2";
   stateTransitionOnAmmo[9]         = "Reload2";
   // ---------------------------------------------
   // z0dd - ZOD, 5/8/02. Incorrect parameter value
   //stateSequence[9]                 = "NoAmmo";
   stateSequence[9] = "NoAmmo2";

   stateTransitionOnTriggerDown[9]  = "DryFire2";

   stateName[10]                     = "DryFire2";
   stateSound[10]                    = BomberTurretDryFireSound;
   stateTimeoutValue[10]             = 0.5;
   stateTransitionOnTimeout[10]      = "NoAmmo2";
                                              
};

datablock TurretImageData(BomberTurretBarrelPair) 
{
   shapeFile                = "turret_belly_barrelr.dts";
   mountPoint               = 1;
   
   projectile                       = BomberFusionBolt;
   projectileType                   = LinearFlareProjectile;

   usesEnergy                       = true;
   useCapacitor                     = true;
   useMountEnergy                   = true;
   fireEnergy                       = 16.0;
   minEnergy                        = 16.0;

   // Turret parameters
   activationMS                     = 1000;
   deactivateDelayMS                = 1500;
   thinkTimeMS                      = 200;
   degPerSecTheta                   = 360;
   degPerSecPhi                     = 360;
   
   attackRadius                     = 75;

   stateName[0]                     = "WaitFire";
   stateTransitionOnTriggerDown[0]  = "Fire";

   stateName[1]                     = "Fire";
   stateTransitionOnTimeout[1]      = "StopFire";
   stateTimeoutValue[1]             = 0.13;
   stateFire[1]                     = true;
   stateRecoil[1]                   = LightRecoil;
   stateAllowImageChange[1]         = false;
   stateSequence[1]                 = "Fire";
   stateScript[1]                   = "onFire";
   stateSound[1]                    = BomberTurretFireSound;

   stateName[2]                     = "StopFire";
   stateTimeoutValue[2]             = 0.1;
   stateTransitionOnTimeout[2]      = "WaitFire";
   stateScript[2]                   = "stopFire";
};

datablock TurretImageData(AIAimingTurretBarrel) 
{
   shapeFile            = "turret_muzzlepoint.dts";
   mountPoint           = 3;

   projectile           = BomberFusionBolt;

   // Turret parameters
   activationMS         = 1000;
   deactivateDelayMS    = 1500;
   thinkTimeMS          = 200;
   degPerSecTheta       = 500;
   degPerSecPhi         = 800;
   
   attackRadius         = 75;
};

//-------------------------------------
// BOMBER BOMB PROJECTILE
//-------------------------------------

datablock BombProjectileData(BomberBomb)
{
   projectileShapeName  = "bomb.dts";
   emitterDelay         = -1;
   directDamage         = 0.0;
   hasDamageRadius      = true;
   indirectDamage       = 1.1;
   damageRadius         = 30;
   radiusDamageType     = $DamageType::BomberBombs;
   kickBackStrength     = 2500;

   explosion            = "VehicleBombExplosion";
   velInheritFactor     = 1.0;

   grenadeElasticity    = 0.25;
   grenadeFriction      = 0.4;
   armingDelayMS        = 2000;
   muzzleVelocity       = 0.1;
   drag                 = 0.3;

   minRotSpeed          = "60.0 0.0 0.0";
   maxRotSpeed          = "80.0 0.0 0.0";
   scale                = "1.0 1.0 1.0";
   
   sound                = BomberBombProjectileSound;
};

//-------------------------------------
// BOMBER BOMB CHARACTERISTICS
//-------------------------------------

datablock ItemData(BombAmmo)
{
   className         = Ammo;
   catagory          = "Ammo";
   shapeFile         = "repair_kit.dts";
   mass              = 1;
   elasticity        = 0.2;
   friction          = 0.6;
   pickupRadius      = 1;
   computeCRC        = true;
};

datablock StaticShapeData(DropBombs)
{
   catagory             = "Turrets";
   shapeFile            = "bombers_eye.dts";
   maxDamage            = 1.0;
   disabledLevel        = 0.6;
   destroyedLevel       = 0.8;
};

datablock TurretImageData(BomberBombImage)
{
   shapeFile                        = "turret_muzzlepoint.dts";
   offset                           = "2 -4 -0.5";
   mountPoint                       = 10;

   projectile                       = BomberBomb;
   projectileType                   = BombProjectile;
   usesEnergy                       = true;
   useMountEnergy                   = true;
   useCapacitor                     = true;

   fireEnergy                       = 53.0;
   minEnergy                        = 53.0;

   
   stateName[0]                     = "Activate";
   stateTransitionOnTimeout[0]      = "WaitFire1";
   stateTimeoutValue[0]             = 0.5;
   stateSequence[0]                 = "Activate";

   stateName[1]                     = "WaitFire1";
   stateTransitionOnTriggerDown[1]  = "Fire1";
   stateTransitionOnNoAmmo[1]       = "NoAmmo1";

   stateName[2]                     = "Fire1";
   stateTransitionOnTimeout[2]      = "Reload1";
   stateTimeoutValue[2]             = 0.32;
   stateFire[2]                     = true;
   stateAllowImageChange[2]         = false;
   stateSequence[2]                 = "Fire";
   stateScript[2]                   = "onFire";
   stateSound[2]                    = BomberBombFireSound;

   stateName[3]                     = "Reload1";
   stateSequence[3]                 = "Reload";
   stateTimeoutValue[3]             = 0.1;
   stateAllowImageChange[3]         = false;
   stateTransitionOnTimeout[3]      = "WaitFire2";
   stateTransitionOnNoAmmo[3]       = "NoAmmo1";

   stateName[4]                     = "NoAmmo1";
   stateTransitionOnAmmo[4]         = "Reload1";
   // ---------------------------------------------
   // z0dd - ZOD, 5/8/02. Incorrect parameter value
   //stateSequence[4]                 = "NoAmmo";
   stateSequence[4] = "NoAmmo1";

   stateTransitionOnTriggerDown[4]  = "DryFire1";

   stateName[5]                     = "DryFire1";
   stateSound[5]                    = BomberBombDryFireSound;
   stateTimeoutValue[5]             = 0.5;
   stateTransitionOnTimeout[5]      = "NoAmmo1";
   
   stateName[6]                     = "WaitFire2";
   stateTransitionOnTriggerDown[6]  = "Fire2";
   // ---------------------------------------------
   // z0dd - ZOD, 5/8/02. Incorrect parameter value
   //stateTransitionOnNoAmmo[6]       = "NoAmmo";
   stateTransitionOnNoAmmo[6] = "NoAmmo2";

   stateName[7]                     = "Fire2";
   stateTransitionOnTimeout[7]      = "Reload2";
   stateTimeoutValue[7]             = 0.32;
   stateScript[7]                   = "FirePair";

   stateName[8]                     = "Reload2";
   stateSequence[8]                 = "Reload";
   stateTimeoutValue[8]             = 0.1;
   stateAllowImageChange[8]         = false;
   stateTransitionOnTimeout[8]      = "WaitFire1";
   stateTransitionOnNoAmmo[8]       = "NoAmmo2";

   stateName[9]                     = "NoAmmo2";
   stateTransitionOnAmmo[9]         = "Reload2";
   // ---------------------------------------------
   // z0dd - ZOD, 5/8/02. Incorrect parameter value
   //stateSequence[9]                 = "NoAmmo";
   stateSequence[9] = "NoAmmo2";

   stateTransitionOnTriggerDown[9]  = "DryFire2";

   stateName[10]                     = "DryFire2";
   stateSound[10]                    = BomberBombDryFireSound;
   stateTimeoutValue[10]             = 0.5;
   stateTransitionOnTimeout[10]      = "NoAmmo2";
};

datablock TurretImageData(BomberBombPairImage)
{
   shapeFile                        = "turret_muzzlepoint.dts";
   offset                           = "-2 -4 -0.5";
   mountPoint                       = 10;

   projectile                       = BomberBomb;
   projectileType                   = BombProjectile;
   usesEnergy                       = true;
   useMountEnergy                   = true;
   useCapacitor                     = true;
   fireEnergy                       = 53.0;
   minEnergy                        = 53.0;

   stateName[0]                     = "WaitFire";
   stateTransitionOnTriggerDown[0]  = "Fire";

   stateName[1]                     = "Fire";
   stateTransitionOnTimeout[1]      = "StopFire";
   stateTimeoutValue[1]             = 0.13;
   stateFire[1]                     = true;
   stateAllowImageChange[1]         = false;
   stateSequence[1]                 = "Fire";
   stateScript[1]                   = "onFire";
   stateSound[1]                    = BomberBombFireSound;

   stateName[2]                     = "StopFire";
   stateTimeoutValue[2]             = 0.1;
   stateTransitionOnTimeout[2]      = "WaitFire";
   stateScript[2]                   = "stopFire";
                         
};

//**************************************************************
// WEAPONS SPECIAL EFFECTS
//**************************************************************

//-------------------------------------
// BOMBER BELLY TURRET GUN (explosion)
//-------------------------------------

datablock ParticleData(FusionExplosionParticle)
{
   dragCoefficient      = 2;
   gravityCoefficient   = 0.2;
   inheritedVelFactor   = 0.2;
   constantAcceleration = 0.0;
   lifetimeMS           = 750;
   lifetimeVarianceMS   = 150;
   textureName          = "particleTest";
   colors[0]            = "0.56 0.36 0.26 1.0";
   colors[1]            = "0.56 0.36 0.26 0.0";
   sizes[0]             = 1;
   sizes[1]             = 2;
};

datablock ParticleEmitterData(FusionExplosionEmitter)
{
   ejectionPeriodMS     = 7;
   periodVarianceMS     = 0;
   ejectionVelocity     = 12;
   velocityVariance     = 1.75;
   ejectionOffset       = 0.0;
   thetaMin             = 0;
   thetaMax             = 60;
   phiReferenceVel      = 0;
   phiVariance          = 360;
   overrideAdvances     = false;
   particles            = "FusionExplosionParticle";
};

datablock ExplosionData(FusionBoltExplosion)
{
   explosionShape       = "effect_plasma_explosion.dts";
   soundProfile         = FusionExpSound;
   particleEmitter      = FusionExplosionEmitter;
   particleDensity      = 250;
   particleRadius       = 1.25;
   faceViewer           = true;
};
                                    
//--------------------------------------------------------------------------
// BOMBER TARGETING LASER
//--------------------------------------------------------------------------

datablock AudioProfile(BomberTargetingSwitchSound)
{
   filename    = "fx/weapons/generic_switch.wav";
   description = AudioClosest3d;
   preload     = true;
};

datablock AudioProfile(BomberTargetingPaintSound)
{
   filename    = "fx/weapons/targetinglaser_paint.wav";
   description = CloseLooping3d;
   preload     = true;
};

//--------------------------------------
// BOMBER TARGETING PROJECTILE
//--------------------------------------
datablock TargetProjectileData(BomberTargeter)
{
   directDamage         = 0.0;
   hasDamageRadius      = false;
   indirectDamage       = 0.0;
   damageRadius         = 0.0;
   velInheritFactor     = 1.0;

   maxRifleRange        = 1000;
   beamColor            = "0.1 1.0 0.1";
                        
   startBeamWidth       = 0.20;
   pulseBeamWidth       = 0.15;
   beamFlareAngle       = 3.0;
   minFlareSize         = 0.0;
   maxFlareSize         = 400.0;
   pulseSpeed           = 6.0;
   pulseLength          = 0.150;

   textureName[0]       = "special/nonlingradient";
   textureName[1]       = "special/flare";
   textureName[2]       = "special/pulse";
   textureName[3]      	= "special/expFlare";
};

//-------------------------------------
// BOMBER TARGETING CHARACTERISTICS
//-------------------------------------
datablock ShapeBaseImageData(BomberTargetingImage)
{
   className                           = WeaponImage;

   shapeFile                           = "turret_muzzlepoint.dts";
   offset                              = "0 -0.04 -0.01";
   mountPoint                          = 2;

   projectile                          = BomberTargeter;
   projectileType                      = TargetProjectile;
   deleteLastProjectile                = true;

   usesEnergy                          = true;
   minEnergy                           = 3;

   stateName[0]                        = "Activate";
   stateSequence[0]                    = "Activate";
   stateSound[0]                       = BomberTargetingSwitchSound;
   stateTimeoutValue[0]                = 0.5;
   stateTransitionOnTimeout[0]         = "ActivateReady";

   stateName[1]                        = "ActivateReady";
   stateTransitionOnAmmo[1]            = "Ready";
   stateTransitionOnNoAmmo[1]          = "NoAmmo";

   stateName[2]                        = "Ready";
   stateTransitionOnNoAmmo[2]          = "NoAmmo";
   stateTransitionOnTriggerDown[2]     = "Fire";

   stateName[3]                        = "Fire";
   stateEnergyDrain[3]                 = 3;
   stateFire[3]                        = true;
   stateAllowImageChange[3]            = false;
   stateScript[3]                      = "onFire";
   stateTransitionOnTriggerUp[3]       = "Deconstruction";
   stateTransitionOnNoAmmo[3]          = "Deconstruction";
   stateSound[3]                       = BomberTargetingPaintSound;

   stateName[4]                        = "NoAmmo";
   stateTransitionOnAmmo[4]            = "Ready";

   stateName[5]                        = "Deconstruction";
   stateTransitionOnTimeout[5]         = "ActivateReady";
   stateTimeoutValue[5]                = 0.05;
};

function BomberTargetingImage::onFire(%data,%obj,%slot)
{
   %bomber = %obj.getObjectMount();
   if(%bomber.beacon)
   {
      %bomber.beacon.delete();
      %bomber.beacon = "";
   }   
   %p = Parent::onFire(%data, %obj, %slot);
   %p.setTarget(%obj.team);
}

function BomberTargetingImage::deconstruct(%data, %obj, %slot)
{
   %pos = %obj.lastProjectile.getTargetPoint();
   %bomber = %obj.getObjectMount();
   
   if(%bomber.beacon)
   {
      %bomber.beacon.delete();
      %bomber.beacon = "";
   }
   %bomber.beacon = new BeaconObject() {
      dataBlock = "BomberBeacon";
      beaconType = "vehicle";
      position = %pos;
   };

   %bomber.beacon.playThread($AmbientThread, "ambient");
   %bomber.beacon.team = %bomber.team;
   %bomber.beacon.sourceObject = %bomber;

   // give it a team target
   %bomber.beacon.setTarget(%bomber.team);                  
   MissionCleanup.add(%bomber.beacon);
   
   Parent::deconstruct(%data, %obj, %slot);
}

//-------------------------------------
// BOMBER BEACON
//-------------------------------------
datablock StaticShapeData(BomberBeacon)
{
   shapeFile = "turret_muzzlepoint.dts";
   targetNameTag = 'beacon';
   isInvincible = true;
   
   dynamicType = $TypeMasks::SensorObjectType;
};
