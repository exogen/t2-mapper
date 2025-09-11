datablock EffectProfile(IBLSwitchEffect)
{
   effectname = "powered/turret_light_activate";
   minDistance = 5.0;
   maxDistance = 5.0;
};

datablock EffectProfile(IBLFireEffect)
{
   effectname = "powered/turret_indoor_fire";
   minDistance = 2.5;
   maxDistance = 5.0;
};

datablock AudioProfile(IBLSwitchSound)
{
   filename    = "fx/powered/turret_light_activate.wav";
   description = AudioClose3d;
   preload = true;
   effect = IBLSwitchEffect;
};

datablock AudioProfile(IBLFireSound)
{
   filename    = "fx/powered/turret_indoor_fire.wav";
   description = AudioDefault3d;
   preload = true;
   effect = IBLFireEffect;
};

datablock SensorData(DeployedIndoorTurretSensor)
{
   detects = true;
   detectsUsingLOS = true;
   detectsPassiveJammed = false;
   detectsActiveJammed = false;
   detectsCloaked = false;
   detectionPings = true;
   detectRadius = 40;
};

datablock ShockwaveData(IndoorTurretMuzzleFlash)
{
   width = 0.5;
   numSegments = 13;
   numVertSegments = 1;
   velocity = 2.0;
   acceleration = -1.0;
   lifetimeMS = 300;
   height = 0.1;
   verticalCurve = 0.5;

   mapToTerrain = false;
   renderBottom = false;
   orientToNormal = true;
   renderSquare = true;
   
   texture[0] = "special/blasterHit";
   texture[1] = "special/gradient";
   texWrap = 3.0;

   times[0] = 0.0;
   times[1] = 0.5;
   times[2] = 1.0;

   colors[0] = "1.0 0.3 0.3 1.0";
   colors[1] = "1.0 0.3 0.3 1.0";
   colors[2] = "1.0 0.3 0.3 0.0";
};

datablock TurretData(TurretDeployedFloorIndoor) : TurretDamageProfile
{
   className = DeployedTurret;
   shapeFile = "turret_indoor_deployf.dts";

   mass = 5.0;
   maxDamage = 0.5;
   destroyedLevel = 0.5;
   disabledLevel = 0.21;
   explosion      = SmallTurretExplosion;
      expDmgRadius = 5.0;
      expDamage = 0.25;
      expImpulse = 500.0;
   repairRate = 0;
   heatSignature = 0.0;

	deployedObject = true;

   thetaMin = 5;
   thetaMax = 145;
   thetaNull = 90;

   primaryAxis = zaxis;

   isShielded = true;
   energyPerDamagePoint = 110;
   maxEnergy = 30;
   rechargeRate = 0.10;
   barrel = DeployableIndoorBarrel;

   canControl = true;
   cmdCategory = "DTactical";
   cmdIcon = CMDTurretIcon;
   cmdMiniIconName = "commander/MiniIcons/com_turret_grey";
   targetNameTag = 'Spider Clamp';
   targetTypeTag = 'Turret';
   sensorData = DeployedIndoorTurretSensor;
   sensorRadius = DeployedIndoorTurretSensor.detectRadius;
   sensorColor = "191 0 226";

   firstPersonOnly = true;
   renderWhenDestroyed = false;

   debrisShapeName = "debris_generic_small.dts";
   debris = TurretDebrisSmall;
};

datablock TurretData(TurretDeployedWallIndoor) : TurretDamageProfile
{
   className = DeployedTurret;
   shapeFile = "turret_indoor_deployw.dts";

   mass = 5.0;
   maxDamage = 0.5;
   destroyedLevel = 0.5;
   disabledLevel = 0.21;
   explosion      = SmallTurretExplosion;
      expDmgRadius = 5.0;
      expDamage = 0.25;
      expImpulse = 500.0;
   repairRate = 0;
   heatSignature = 0.0;

   thetaMin = 5;
   thetaMax = 145;
   thetaNull = 90;

   deployedObject = true;
   
   primaryAxis = yaxis;

   isShielded = true;
   energyPerDamagePoint = 110;
   maxEnergy = 30;
   rechargeRate = 0.10;
   barrel = DeployableIndoorBarrel;

   canControl = true;
   cmdCategory = "DTactical";
   cmdIcon = CMDTurretIcon;
   cmdMiniIconName = "commander/MiniIcons/com_turret_grey";
   targetNameTag = 'Spider Clamp';
   targetTypeTag = 'Turret';
   sensorData = DeployedIndoorTurretSensor;
   sensorRadius = DeployedIndoorTurretSensor.detectRadius;
   sensorColor = "191 0 226";

   firstPersonOnly = true;
   renderWhenDestroyed = false;

   debrisShapeName = "debris_generic_small.dts";
   debris = TurretDebrisSmall;
};

datablock TurretData(TurretDeployedCeilingIndoor) : TurretDamageProfile
{
   className = DeployedTurret;
   shapeFile = "turret_indoor_deployc.dts";

   mass = 5.0;
   maxDamage = 0.5;
   destroyedLevel = 0.5;
   disabledLevel = 0.21;
   explosion      = SmallTurretExplosion;
      expDmgRadius = 5.0;
      expDamage = 0.25;
      expImpulse = 500.0;
   repairRate = 0;
   explosion = SmallTurretExplosion;

   //thetaMin = 5;
   //thetaMax = 145;
   thetaMin = 35;
   thetaMax = 175;
   thetaNull = 90;
   heatSignature = 0.0;

   deployedObject = true;
    
   primaryAxis = revzaxis;

   isShielded = true;
   energyPerDamagePoint = 110;
   maxEnergy = 30;
   rechargeRate = 0.10;
   barrel = DeployableIndoorBarrel;

   canControl = true;
   cmdCategory = "DTactical";
   cmdIcon = CMDTurretIcon;
   cmdMiniIconName = "commander/MiniIcons/com_turret_grey";
   targetNameTag = 'Spider Clamp';
   targetTypeTag = 'Turret';
   sensorData = DeployedIndoorTurretSensor;
   sensorRadius = DeployedIndoorTurretSensor.detectRadius;
   sensorColor = "191 0 226";

   firstPersonOnly = true;
   renderWhenDestroyed = false;

   debrisShapeName = "debris_generic_small.dts";
   debris = TurretDebrisSmall;
};

datablock LinearFlareProjectileData(IndoorTurretBolt)
{
   directDamage        = 0.14;
   directDamageType    = $DamageType::IndoorDepTurret;
   explosion           = "BlasterExplosion";
   kickBackStrength  = 0.0;

   dryVelocity       = 120.0;
   wetVelocity       = 40.0;
   velInheritFactor  = 0.5;
   fizzleTimeMS      = 2000;
   lifetimeMS        = 3000;
   explodeOnDeath    = false;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = false;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = 3000;

   numFlares         = 20;
   size              = 0.45;
   flareColor        = "1 0.35 0.35";
   flareModTexture   = "flaremod";
   flareBaseTexture  = "flarebase";

   sound = BlasterProjectileSound;

   hasLight    = true;
   lightRadius = 3.0;
   lightColor  = "1 0.35 0.35";
};

datablock TurretImageData(DeployableIndoorBarrel)
{
   shapeFile = "turret_muzzlepoint.dts";
   // ---------------------------------------------
   // z0dd - ZOD, 5/8/02. Incorrect parameter value
   //item      = IndoorTurretBarrel;
   item = TurretIndoorDeployable;

   projectile = IndoorTurretBolt;
   projectileType = LinearFlareProjectile;

   usesEnergy = true;
   fireEnergy = 4.5;
   minEnergy = 4.5;

   lightType = "WeaponFireLight";
   lightColor = "0.25 0.15 0.15 1.0";
   lightTime = "1000";
   lightRadius = "2";

   muzzleFlash = IndoorTurretMuzzleFlash;

   // Turret parameters
   activationMS      = 150;
   deactivateDelayMS = 300;
   thinkTimeMS       = 150;
   degPerSecTheta    = 580;
   degPerSecPhi      = 960;
   attackRadius      = 60;

   // State transitions
   stateName[0]                  = "Activate";
   stateTransitionOnNotLoaded[0] = "Dead";
   stateTransitionOnLoaded[0]    = "ActivateReady";

   stateName[1]                  = "ActivateReady";
   stateSequence[1]              = "Activate";
   stateSound[1]                 = IBLSwitchSound;
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
   stateShockwave[3]           = true;
   stateRecoil[3]              = LightRecoil;
   stateAllowImageChange[3]    = false;
   stateSequence[3]            = "Fire";
   stateSound[3]               = IBLFireSound;
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


