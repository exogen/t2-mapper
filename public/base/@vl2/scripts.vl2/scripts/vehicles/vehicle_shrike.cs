//**************************************************************
// SHRIKE SCOUT FLIER
//**************************************************************
//**************************************************************
// SOUNDS
//**************************************************************
datablock EffectProfile(ScoutFlyerThrustEffect)
{
   effectname = "vehicles/shrike_boost";
   minDistance = 5.0;
   maxDistance = 10.0;
};

datablock EffectProfile(ScoutFlyerEngineEffect)
{
   effectname = "vehicles/shrike_engine";
   minDistance = 5.0;
   maxDistance = 10.0;
};

datablock EffectProfile(ShrikeBlasterFireEffect)
{
   effectname = "vehicles/shrike_blaster";
   minDistance = 5.0;
   maxDistance = 10.0;
};

datablock AudioProfile(ScoutFlyerThrustSound)
{
   filename    = "fx/vehicles/shrike_boost.wav";
   description = AudioDefaultLooping3d;
   preload = true;
   effect = ScoutFlyerThrustEffect;
};

datablock AudioProfile(ScoutFlyerEngineSound)
{
   filename    = "fx/vehicles/shrike_engine.wav";
   description = AudioDefaultLooping3d;
   preload = true;
};

datablock AudioProfile(ShrikeBlasterFire)
{
   filename    = "fx/vehicles/shrike_blaster.wav";
   description = AudioDefault3d;
   preload = true;
   effect = ScoutFlyerEngineEffect;
};

datablock AudioProfile(ShrikeBlasterProjectile)
{
   filename    = "fx/weapons/shrike_blaster_projectile.wav";
   description = ProjectileLooping3d;
   preload = true;
   effect = ShrikeBlasterFireEffect;
};

datablock AudioProfile(ShrikeBlasterDryFireSound)
{
   filename    = "fx/weapons/chaingun_dryfire.wav";
   description = AudioClose3d;
   preload = true;
};

//**************************************************************
// LIGHTS
//**************************************************************
datablock RunningLightData(ShrikeLight1)
{
   type        = 1;
   radius      = 2.0;
   length      = 3.0;
   color       = "1.0  1.0  1.0  1.0";
   direction   = "0.0  1.0 -1.0 ";
   offset      = "0.0  0.0 -0.5";
   texture     = "special/lightcone04";
};

datablock RunningLightData(ShrikeLight2)
{
   radius = 1.5;
   color = "1.0 1.0 1.0 0.3";
   direction = "0.0 0.0 -1.0";
   offset      = "0.0  0.8 -1.2";
   texture = "special/headlight4";
};

//**************************************************************
// VEHICLE CHARACTERISTICS
//**************************************************************

datablock FlyingVehicleData(ScoutFlyer) : ShrikeDamageProfile
{
   spawnOffset = "0 0 2";

   catagory = "Vehicles";
   shapeFile = "vehicle_air_scout.dts";
   multipassenger = false;
   computeCRC = true;

   debrisShapeName = "vehicle_air_scout_debris.dts";
   debris = ShapeDebris;
   renderWhenDestroyed = false;

   drag    = 0.15;
   density = 1.0;

   mountPose[0] = sitting;
   numMountPoints = 1;  
   isProtectedMountPoint[0] = true;
   cameraMaxDist = 15;
   cameraOffset = 2.5;
   cameraLag = 0.9;
   explosion = VehicleExplosion;
	explosionDamage = 0.5;
	explosionRadius = 5.0;

   maxDamage = 1.40;
   destroyedLevel = 1.40;

   isShielded = true;
   energyPerDamagePoint = 160;
   maxEnergy = 280;      // Afterburner and any energy weapon pool
   rechargeRate = 0.8;

   minDrag = 30;           // Linear Drag (eventually slows you down when not thrusting...constant drag)
   rotationalDrag = 900;        // Anguler Drag (dampens the drift after you stop moving the mouse...also tumble drag)

   maxAutoSpeed = 15;       // Autostabilizer kicks in when less than this speed. (meters/second)
   autoAngularForce = 400;       // Angular stabilizer force (this force levels you out when autostabilizer kicks in)
   autoLinearForce = 300;        // Linear stabilzer force (this slows you down when autostabilizer kicks in)
   autoInputDamping = 0.95;      // Dampen control input so you don't` whack out at very slow speeds
   
   // Maneuvering
   maxSteeringAngle = 5;    // Max radiens you can rotate the wheel. Smaller number is more maneuverable.
   horizontalSurfaceForce = 6;   // Horizontal center "wing" (provides "bite" into the wind for climbing/diving and turning)
   verticalSurfaceForce = 4;     // Vertical center "wing" (controls side slip. lower numbers make MORE slide.)
   maneuveringForce = 3000;      // Horizontal jets (W,S,D,A key thrust)
   steeringForce = 1200;         // Steering jets (force applied when you move the mouse)
   steeringRollForce = 400;      // Steering jets (how much you heel over when you turn)
   rollForce = 4;                // Auto-roll (self-correction to right you after you roll/invert)
   hoverHeight = 5;        // Height off the ground at rest
   createHoverHeight = 3;  // Height off the ground when created
   maxForwardSpeed = 100;  // speed in which forward thrust force is no longer applied (meters/second)

   // Turbo Jet
   jetForce = 2000;      // Afterburner thrust (this is in addition to normal thrust)
   minJetEnergy = 28;     // Afterburner can't be used if below this threshhold.
   jetEnergyDrain = 2.8;       // Energy use of the afterburners (low number is less drain...can be fractional)                                                                                                                                                                                                                                                                                          // Auto stabilize speed
   vertThrustMultiple = 3.0;

   // Rigid body
   mass = 150;        // Mass of the vehicle
   bodyFriction = 0;     // Don't mess with this.
   bodyRestitution = 0.5;   // When you hit the ground, how much you rebound. (between 0 and 1)
   minRollSpeed = 0;     // Don't mess with this.
   softImpactSpeed = 14;       // Sound hooks. This is the soft hit.
   hardImpactSpeed = 25;    // Sound hooks. This is the hard hit.

   // Ground Impact Damage (uses DamageType::Ground)
   minImpactSpeed = 10;      // If hit ground at speed above this then it's an impact. Meters/second
   speedDamageScale = 0.06;

   // Object Impact Damage (uses DamageType::Impact)
   collDamageThresholdVel = 23.0;
   collDamageMultiplier   = 0.02;

   //
   minTrailSpeed = 15;      // The speed your contrail shows up at.
   trailEmitter = ContrailEmitter;
   forwardJetEmitter = FlyerJetEmitter;
   downJetEmitter = FlyerJetEmitter;

   //
   jetSound = ScoutFlyerThrustSound;
   engineSound = ScoutFlyerEngineSound;
   softImpactSound = SoftImpactSound;
   hardImpactSound = HardImpactSound;
   //wheelImpactSound = WheelImpactSound;
   
   //
   softSplashSoundVelocity = 10.0; 
   mediumSplashSoundVelocity = 15.0;   
   hardSplashSoundVelocity = 20.0;   
   exitSplashSoundVelocity = 10.0;
   
   exitingWater      = VehicleExitWaterMediumSound;
   impactWaterEasy   = VehicleImpactWaterSoftSound;
   impactWaterMedium = VehicleImpactWaterMediumSound;
   impactWaterHard   = VehicleImpactWaterMediumSound;
   waterWakeSound    = VehicleWakeMediumSplashSound; 
    
   dustEmitter = VehicleLiftoffDustEmitter;
   triggerDustHeight = 4.0;
   dustHeight = 1.0;

   damageEmitter[0] = LightDamageSmoke;
   damageEmitter[1] = HeavyDamageSmoke;
   damageEmitter[2] = DamageBubbles;
   damageEmitterOffset[0] = "0.0 -3.0 0.0 ";
   damageLevelTolerance[0] = 0.3;
   damageLevelTolerance[1] = 0.7;
   numDmgEmitterAreas = 1;

   //
   max[chaingunAmmo] = 1000;

   minMountDist = 4;

   splashEmitter[0] = VehicleFoamDropletsEmitter;
   splashEmitter[1] = VehicleFoamEmitter;

   shieldImpact = VehicleShieldImpact;

   cmdCategory = "Tactical";
   cmdIcon = CMDFlyingScoutIcon;
   cmdMiniIconName = "commander/MiniIcons/com_scout_grey";
   targetNameTag = 'Shrike';
   targetTypeTag = 'Turbograv';
   sensorData = AWACPulseSensor;
   sensorRadius = AWACPulseSensor.detectRadius;
   sensorColor = "255 194 9";
   
   checkRadius = 5.5;
   observeParameters = "1 10 10";

   runningLight[0] = ShrikeLight1;
//   runningLight[1] = ShrikeLight2;

   shieldEffectScale = "0.937 1.125 0.60";

};

//**************************************************************
// WEAPONS
//**************************************************************

datablock ShapeBaseImageData(ScoutChaingunPairImage)
{
   className = WeaponImage;
   shapeFile = "weapon_energy_vehicle.dts";
   item      = Chaingun;
   ammo   = ChaingunAmmo;
   projectile = ScoutChaingunBullet;
   projectileType = TracerProjectile;
   mountPoint = 10;
//**original**   offset = ".73 0 0";
   offset = "1.93 -0.52 0.044";

   projectileSpread = 1.0 / 1000.0;
   
   usesEnergy = true;
   useMountEnergy = true;
   // DAVEG -- balancing numbers below!
   minEnergy = 5;
   fireEnergy = 5;
   fireTimeout = 125;

   
   //--------------------------------------
   stateName[0]             = "Activate";
   stateSequence[0]         = "Activate";
   stateAllowImageChange[0] = false;
   stateTimeoutValue[0]        = 0.05;
   stateTransitionOnTimeout[0] = "Ready";
   stateTransitionOnNoAmmo[0]  = "NoAmmo";
   //--------------------------------------
   stateName[1]       = "Ready";
   stateSpinThread[1] = Stop;
   stateTransitionOnTriggerDown[1] = "Spinup";
   stateTransitionOnNoAmmo[1]      = "NoAmmo";
   //--------------------------------------
   stateName[2]               = "NoAmmo";
   stateTransitionOnAmmo[2]   = "Ready";
   stateSpinThread[2]         = Stop;
   stateTransitionOnTriggerDown[2] = "DryFire";
   //--------------------------------------
   stateName[3]         = "Spinup";
   stateSpinThread[3]   = SpinUp;
   stateTimeoutValue[3]          = 0.01;
   stateWaitForTimeout[3]        = false;
   stateTransitionOnTimeout[3]   = "Fire";
   stateTransitionOnTriggerUp[3] = "Spindown";
   //--------------------------------------
   stateName[4]             = "Fire";
   stateSpinThread[4]       = FullSpeed;
   stateRecoil[4]           = LightRecoil;
   stateAllowImageChange[4] = false;
   stateScript[4]           = "onFire";
   stateFire[4]             = true;
   stateSound[4]            = ShrikeBlasterFire;
   // IMPORTANT! The stateTimeoutValue below has been replaced by fireTimeOut
   // above.
   stateTimeoutValue[4]          = 0.25;
   stateTransitionOnTimeout[4]   = "checkState";
   //--------------------------------------
   stateName[5]       = "Spindown";
   stateSpinThread[5] = SpinDown;
   stateTimeoutValue[5]            = 0.01;
   stateWaitForTimeout[5]          = false;
   stateTransitionOnTimeout[5]     = "Ready";
   stateTransitionOnTriggerDown[5] = "Spinup";
   //--------------------------------------
   stateName[6]       = "EmptySpindown";
//   stateSound[6]      = ChaingunSpindownSound;
   stateSpinThread[6] = SpinDown;
   stateTransitionOnAmmo[6]   = "Ready";
   stateTimeoutValue[6]        = 0.01;
   stateTransitionOnTimeout[6] = "NoAmmo";
   //--------------------------------------
   stateName[7]       = "DryFire";
   stateSound[7]      = ShrikeBlasterDryFireSound;
   stateTransitionOnTriggerUp[7] = "NoAmmo";
   stateTimeoutValue[7]        = 0.25;
   stateTransitionOnTimeout[7] = "NoAmmo";

   stateName[8] = "checkState";
   stateTransitionOnTriggerUp[8] = "Spindown";
   stateTransitionOnNoAmmo[8]    = "EmptySpindown";
   stateTimeoutValue[8]          = 0.01;
   stateTransitionOnTimeout[8]   = "ready";
};

datablock ShapeBaseImageData(ScoutChaingunImage) : ScoutChaingunPairImage
{
//**original**   offset = "-.73 0 0";
   offset = "-1.93 -0.52 0.044";
   stateScript[3]           = "onTriggerDown";
   stateScript[5]           = "onTriggerUp";
   stateScript[6]           = "onTriggerUp";
};

datablock ShapeBaseImageData(ScoutChaingunParam)
{
   mountPoint = 2;
   shapeFile = "turret_muzzlepoint.dts";

   projectile = ScoutChaingunBullet;
   projectileType = TracerProjectile;
}; 