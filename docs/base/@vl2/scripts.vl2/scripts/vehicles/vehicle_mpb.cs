//**************************************************************
// JERICHO FORWARD BASE (Mobile Point Base)
//**************************************************************
//**************************************************************
// SOUNDS
//**************************************************************
datablock EffectProfile(MPBEngineEffect)
{
   effectname = "vehicles/mpb_thrust";
   minDistance = 5.0;
   maxDistance = 10.0;
};

datablock EffectProfile(MPBThrustEffect)
{
   effectname = "vehicles/mpb_boost";
   minDistance = 5.0;
   maxDistance = 10.0;
};

datablock AudioProfile(MPBEngineSound)
{
   filename    = "fx/vehicles/mpb_thrust.wav";
   description = AudioDefaultLooping3d;
   preload = true;
   effect = MPBEngineEffect;
};

datablock AudioProfile(MPBThrustSound)
{
   filename    = "fx/vehicles/mpb_boost.wav";
   description = AudioDefaultLooping3d;
   preload = true;
   effect = MPBThrustEffect;
};

datablock AudioProfile(MobileBaseDeploySound)
{
   filename    = "fx/vehicles/MPB_deploy.wav";
   description = AudioClose3d;
   preload = true;
};

datablock AudioProfile(MobileBaseUndeploySound)
{
   filename    = "fx/vehicles/MPB_undeploy_turret.wav";
   description = AudioClose3d;
   preload = true;
};

datablock AudioProfile(MobileBaseTurretDeploySound)
{
   filename    = "fx/vehicles/MPB_deploy_turret.wav";
   description = AudioClose3d;
   preload = true;
};

datablock AudioProfile(MobileBaseTurretUndeploySound)
{
   filename    = "fx/vehicles/MPB_undeploy_turret.wav";
   description = AudioClose3d;
   preload = true;
};

datablock AudioProfile(MobileBaseStationDeploySound)
{
   filename    = "fx/vehicles/MPB_deploy_station.wav";
   description = AudioClose3d;
   preload = true;
};

datablock AudioProfile(MobileBaseStationUndeploySound)
{
   filename    = "fx/vehicles/MPB_close_lid.wav";
   description = AudioClose3d;
   preload = true;
};


//**************************************************************
// LIGHTS
//**************************************************************
datablock RunningLightData(MPBLight1)
{
   pointSize = 3.0;
   pointColor = "1.0 1.0 1.0 0.3";
   pointNodeName = "Headlight_node01";
   texture = "special/expFlare";
};

datablock RunningLightData(MPBLight2)
{
   pointSize = 3.0;
   pointColor = "1.0 1.0 1.0 0.3";
   pointNodeName = "Headlight_node02";
   texture = "special/expFlare";
};


//**************************************************************
// VEHICLE CHARACTERISTICS
//**************************************************************
datablock SensorData(MPBDeployedSensor) : VehiclePulseSensor
{
   jams = true;
   jamsOnlyGroup = true;
   jamsUsingLOS = false;
   jamRadius = 50;
};

datablock WheeledVehicleData(MobileBaseVehicle) : MPBDamageProfile
{
   spawnOffset = "0 0 1.0";
   renderWhenDestroyed = false;

   catagory = "Vehicles";
   shapeFile = "vehicle_land_mpbase.dts";
   multipassenger = false;
   computeCRC = true;

   debrisShapeName = "vehicle_land_mpbase_debris.dts";
   debris = ShapeDebris;

   drag = 0.0;
   density = 20.0;

   mountPose[0] = sitting;
   numMountPoints = 1;
   isProtectedMountPoint[0] = true;

   cantAbandon = 1;
   cantTeamSwitch = 1;
   
   cameraMaxDist = 20;
   cameraOffset = 6;
   cameraLag = 1.5;
   explosion = LargeGroundVehicleExplosion;
   explosionDamage = 0.5;
   explosionRadius = 5.0;

   maxSteeringAngle = 0.3;  // 20 deg.

   // Used to test if the station can deploy
   stationPoints[1] = "-2.3 -7.38703 -0.65";
   stationPoints[2] = "-2.3 -11.8 -0.65";
   stationPoints[3] = "0 -7.38703 -0.65";
   stationPoints[4] = "0 -11.8 -0.65";
   stationPoints[5] = "2.3 -7.38703 -0.65";
   stationPoints[6] = "2.3 -11.8 -0.65";

   // Rigid Body
   mass = 2000;
   bodyFriction = 0.8;
   bodyRestitution = 0.5;
   minRollSpeed = 3;
   gyroForce = 400;
   gyroDamping = 0.3;
   stabilizerForce = 10;
   minDrag = 10;
   softImpactSpeed = 15;       // Play SoftImpact Sound
   hardImpactSpeed = 25;      // Play HardImpact Sound

   // Ground Impact Damage (uses DamageType::Ground)
   minImpactSpeed = 12;
   speedDamageScale = 0.060;

   // Object Impact Damage (uses DamageType::Impact)
   collDamageThresholdVel = 18;
   collDamageMultiplier   = 0.070;

   // Engine
   engineTorque = 7.0 * 745;
   breakTorque = 7.0 * 745;
   maxWheelSpeed = 20;

   // Springs
   springForce = 8000;
   springDamping = 1300;
   antiSwayForce = 6000;
   staticLoadScale = 2;

   // Tires
   tireRadius = 1.6;
   tireFriction = 10.0;
   tireRestitution = 0.5;
   tireLateralForce = 3000;
   tireLateralDamping = 400;
   tireLateralRelaxation = 1;
   tireLongitudinalForce = 12000;
   tireLongitudinalDamping = 600;
   tireLongitudinalRelaxation = 1;
   tireEmitter = TireEmitter;

   //   
   maxDamage = 3.85;
   destroyedLevel = 3.85;

   isShielded = true;
   energyPerDamagePoint = 125;
   maxEnergy = 600;
   jetForce = 2800;
   minJetEnergy = 60;
   jetEnergyDrain = 2.75;
   rechargeRate = 1.0;

   jetSound = MPBThrustSound;
   engineSound = MPBEngineSound;
   squeelSound = AssaultVehicleSkid;
   softImpactSound = GravSoftImpactSound;
   hardImpactSound = HardImpactSound;
   //wheelImpactSound = WheelImpactSound;

   //
   softSplashSoundVelocity = 5.0; 
   mediumSplashSoundVelocity = 8.0;   
   hardSplashSoundVelocity = 12.0;   
   exitSplashSoundVelocity = 8.0;
   
   exitingWater      = VehicleExitWaterSoftSound;
   impactWaterEasy   = VehicleImpactWaterSoftSound;
   impactWaterMedium = VehicleImpactWaterMediumSound;
   impactWaterHard   = VehicleImpactWaterHardSound;
   waterWakeSound    = VehicleWakeMediumSplashSound; 

   minMountDist = 3;

   damageEmitter[0] = LightDamageSmoke;
   damageEmitter[1] = HeavyDamageSmoke;
   damageEmitter[2] = DamageBubbles;
   damageEmitterOffset[0] = "3.0 0.5 0.0 ";
   damageEmitterOffset[1] = "-3.0 0.5 0.0 ";
   damageLevelTolerance[0] = 0.3;
   damageLevelTolerance[1] = 0.7;
   numDmgEmitterAreas = 2;

   splashEmitter[0] = VehicleFoamDropletsEmitter;
   splashEmitter[1] = VehicleFoamEmitter;

   shieldImpact = VehicleShieldImpact;

   cmdCategory = "Tactical";
   cmdIcon = CMDGroundMPBIcon;
   cmdMiniIconName = "commander/MiniIcons/com_mpb_grey";
   targetNameTag = 'Jericho';
   targetTypeTag = 'MPB';
   sensorData = VehiclePulseSensor;

   checkRadius = 7.5225;
   
   observeParameters = "1 12 12";

   runningLight[0] = MPBLight1;
   runningLight[1] = MPBLight2;

   shieldEffectScale = "0.85 1.2 0.7";
};

//**************************************************************
// WEAPONS
//**************************************************************

datablock SensorData(MPBTurretMissileSensor)
{
   detects = true;
   detectsUsingLOS = true;
   detectsPassiveJammed = false;
   detectsActiveJammed = false;
   detectsCloaked = false;
   detectionPings = true;
   detectRadius = 200;
};

datablock TurretData(MobileTurretBase)
{
   className      = VehicleTurret;
   catagory       = "Turrets";
   shapeFile      = "turret_base_mpb.dts";
   preload        = true;

   mass           = 1.0;  // Not really relevant

   maxDamage      = MobileBaseVehicle.maxDamage;
   destroyedLevel = MobileBaseVehicle.destroyedLevel;
   
   thetaMin      = 15;
   thetaMax      = 140;

   energyPerDamagePoint = 33;
   inheritEnergyFromMount = true;
   firstPersonOnly = true;

   sensorColor = "0 212 45";
   sensorData = MPBTurretMissileSensor;
   sensorRadius = MPBTurretMissileSensor.detectRadius;
   cmdCategory = "Tactical";
   cmdMiniIconName = "commander/MiniIcons/com_turret_grey";
   targetNameTag = 'Jericho';
   targetTypeTag = 'Turret';

   canControl = true;
};



