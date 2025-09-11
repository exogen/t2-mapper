// Flag physics
$TR2_UpwardFlagThrust = 23;
$TR2_ForwardFlagThrust = 42.3;
$TR2_GeneralFlagBoost = 22.4;
$TR2_PlayerVelocityAddedToFlagThrust = 32;
$TR2_FlagFriction = 0.7;//0.7;//1.3;
$TR2_FlagMass = 30;
$TR2_FlagDensity = 0.25;
$TR2_FlagElasticity = 0.1;//0.2;

// This controls the range of possible strengths
$TR2_FlagThrowScale = 3.0;

$TR2::Gravity = -43;//-41;

// Misc
$TR2_BeaconStopScale = 0.7;

// Grid
$TR2_MinimumGridBoost = 80;
$TR2_GridVelocityScale = 1.15;
$TR2_MaximumGridSpeed = 310;

// Player camera
$TR2_player3rdPersonDistance = 7;
$TR2_playerObserveParameters = "1.0 18.0 18.0";

// Player physics (light armor only)
$TR2_playerNoFrictionOnSki = true;
$TR2_playerMass = 130;
$TR2_playerDrag = 0.003;//0.2; //
$TR2_playerMaxdrag = 0.005;//0.4;
$TR2_playerDensity = 1.2;//10;
$TR2_playerRechargeRate = 0.251;//0.256;
$TR2_playerJetForce = 7030;//4000;//26.21 * 90;
$TR2_playerUnderwaterJetForce = 5800;//26.21 * 90 * 1.75;
$TR2_playerUnderwaterVertJetFactor = 1.0;//1.5;
$TR2_playerJetEnergyDrain = 0.81;//0.8;
$TR2_playerUnderwaterJetEnergyDrain = 0.5;//0.6;
$TR2_playerMinJetEnergy = 5;//1;
$TR2_playerMaxJetHorizontalPercentage = 0.8;//0.8;
$TR2_playerRunForce = 12500;//12400;//4500;//55.20 * 90;
$TR2_playerMaxForwardSpeed = 25;//16;//15;
$TR2_playerMaxBackwardSpeed = 23;//16;//13;
$TR2_playerMaxSideSpeed = 23;//16;//13;
$TR2_playerMaxUnderwaterForwardSpeed = 16;
$TR2_playerMaxUnderwaterBackwardSpeed = 15;
$TR2_playerMaxUnderwaterSideSpeed = 15;
$TR2_playerJumpForce = 1800;//8.3 * 90;
$TR2_playerRecoverDelay = 0;//9;
$TR2_playerRecoverRunForceScale = 2;//1.2;
$TR2_playerMinImpactSpeed = 75;//45;
$TR2_playerSpeedDamageScale = 0.001;//0.004;
$TR2_playerBoundingBox = "2.4 2.1 4.6";//"3 3 4.0";//"1.2 1.2 2.3";
$TR2_playerRunSurfaceAngle  = 90;//70;
$TR2_playerJumpSurfaceAngle = 90;//80;
$TR2_playerMinJumpSpeed = 600;
$TR2_playerMaxJumpSpeed = 700;//30;
$TR2_playerHorizMaxSpeed = 10000;
$TR2_playerHorizResistSpeed = 10000;//200;//445;//33 * 1.15;
$TR2_playerHorizResistFactor = 0.0;//0.15;//0.35;
$TR2_playerMaxJetForwardSpeed = 50;//57;//42;//30 * 1.5;
$TR2_playerUpMaxSpeed = 10000;//80;
$TR2_playerUpResistSpeed = 38;//200;//150;//25;
$TR2_playerUpResistFactor = 0.05;//0.15;//0.55;//0.30;

// Unused
$TR2_ForwardHandGrenadeThrust = 0;

$StaticTSObjects[$NumStaticTSObjects] = "PlayerArmors TR2LightMaleHumanArmorImage TR2light_male.dts";
$NumStaticTSObjects++;
$StaticTSObjects[$NumStaticTSObjects] = "PlayerArmors TR2LightFemaleHumanArmorImage TR2light_female.dts";
$NumStaticTSObjects++;

exec("scripts/TR2light_male.cs");
exec("scripts/TR2light_female.cs");
exec("scripts/TR2medium_male.cs");
exec("scripts/TR2medium_female.cs");
exec("scripts/TR2heavy_male.cs");

datablock AudioProfile(TR2SkiAllSoftSound)
{
   filename    = "fx/armor/TR2ski_soft.wav";
   description = AudioClose3d;
   preload = true;
};

datablock PlayerData(TR2LightMaleHumanArmor) : LightPlayerDamageProfile
{
   // KP:  Use this to turn ski friction on and off
   noFrictionOnSki = $TR2_playerNoFrictionOnSki;

   emap = true;
   //offset = $TR2_playerOffset;
   
   className = Armor;
   shapeFile = "TR2light_male.dts";
   cameraMaxDist = $TR2_player3rdPersonDistance;
   computeCRC = false;
  
   canObserve = true;
   cmdCategory = "Clients";
   cmdIcon = CMDPlayerIcon;
   cmdMiniIconName = "commander/MiniIcons/TR2com_player_grey";
   //targetTypeTag = 'Flag';

   hudImageNameFriendly[0] = "gui/TR2hud_playertriangle";
   hudImageNameEnemy[0] = "gui/TR2hud_playertriangle_enemy";
   hudRenderModulated[0] = true;
   hudRenderAlways[0] = true;
   hudRenderCenter[0] = false;

   hudImageNameFriendly[1] = "commander/MiniIcons/TR2com_flag_grey";
   hudImageNameEnemy[1] = "commander/MiniIcons/TR2com_flag_grey";
   hudRenderModulated[1] = true;
   hudRenderAlways[1] = true;
   hudRenderCenter[1] = true;
   hudRenderDistance[1] = true;

   hudImageNameFriendly[2] = "commander/MiniIcons/TR2com_flag_grey";
   hudImageNameEnemy[2] = "commander/MiniIcons/TR2com_flag_grey";
   hudRenderModulated[2] = true;
   hudRenderAlways[2] = true;
   hudRenderCenter[2] = true;
   hudRenderDistance[2] = true;

   cameraDefaultFov = 97.0;
   cameraMinFov = 5.0;
   cameraMaxFov = 120.0;
   
   debrisShapeName = "debris_player.dts";
   debris = playerDebris;

   aiAvoidThis = true;

   minLookAngle = -1.5;//-1.5;
   maxLookAngle = 1.5;//1.5;
   maxFreelookAngle = 3.5;//3.0;

   // KP:  Mass affects all forces...very important
   mass = $TR2_playerMass;//90;

   // KP:  Drag affects movement through liquids
   drag = $TR2_playerDrag;
   maxdrag = $TR2_playerMaxDrag;
   
   // KP:  Density affects water buoyancy...water skiing is back!
   density = $TR2_playerDensity;//10;
   
   maxDamage = 0.62;
   maxEnergy =  60;//60;
   repairRate = 0.0033;
   energyPerDamagePoint = 70.0; // shield energy required to block one point of damage

   // KP:  How fast your jets will charge
   rechargeRate = $TR2_playerRechargeRate;
   
   // KP:  The force of your jets (critically important)
   jetForce = $TR2_playerJetForce;

   underwaterJetForce = $TR2_playerUnderwaterJetForce;
   underwaterVertJetFactor = $TR2_playerUnderwaterVertJetFactor;
   
   // KP:  How quickly your energy drains
   jetEnergyDrain = $TR2_playerJetEnergyDrain;
   
   underwaterJetEnergyDrain = $TR2_playerUnderwaterJetEnergyDrain;
   
   // KP:  Minimum amount of energy you need in order to jet
   minJetEnergy = $TR2_playerminJetEnergy;
   
   // KP:  Percentage of jets applied to strafing
   maxJetHorizontalPercentage = $TR2_playerMaxJetHorizontalPercentage;

   // KP:  This seems to affect the speed at which you can come to a stop, but if
   //      it's too low, you slide all around the terrain.
   runForce = $TR2_playerRunForce;
   
   runEnergyDrain = 0;
   minRunEnergy = 0;
   
   // KP:  These are your walking speeds
   maxForwardSpeed = $TR2_playerMaxForwardSpeed;
   maxBackwardSpeed = $TR2_playerMaxBackwardSpeed;
   maxSideSpeed = $TR2_playerMaxSideSpeed;

   maxUnderwaterForwardSpeed = $TR2_playerMaxUnderwaterForwardSpeed;
   maxUnderwaterBackwardSpeed = $TR2_playerMaxUnderwaterBackwardSpeed;
   maxUnderwaterSideSpeed = $TR2_playerMaxUnderwaterSideSpeed;

   // KP:  Your jump force
   jumpForce = $TR2_playerJumpForce;
   
   jumpEnergyDrain = 0;
   minJumpEnergy = 0;
   jumpDelay = 0;

   // KP:  Not 100% sure what this is...looking at Torque, it seems to affect
   //      your momentum when you land heavily on terrain
   recoverDelay = $TR2_playerRecoverDelay;
   recoverRunForceScale = $TR2_playerRecoverRunForceScale;

   // KP:  This controls the damage that you take on impact (most important for
   //      inserting another degree of skill into skiing)
   minImpactSpeed = $TR2_playerMinImpactSpeed;
   speedDamageScale = $TR2_playerSpeedDamageScale;

   jetSound = ArmorJetSound;
   wetJetSound = ArmorJetSound;
   jetEmitter = HumanArmorJetEmitter;
   jetEffect = HumanArmorJetEffect;
   
   boundingBox = $TR2_playerBoundingBox;
   pickupRadius = 1.5;//0.75;
   
   // damage location details
   boxNormalHeadPercentage       = 0.83;
   boxNormalTorsoPercentage      = 0.49;
   boxHeadLeftPercentage         = 0;
   boxHeadRightPercentage        = 1;
   boxHeadBackPercentage         = 0;
   boxHeadFrontPercentage        = 1;

   //Foot Prints
   decalData   = LightMaleFootprint;
   decalOffset = 0.25;
   
   footPuffEmitter = LightPuffEmitter;
   footPuffNumParts = 15;
   footPuffRadius = 0.25;

   dustEmitter = LiftoffDustEmitter;

   splash = PlayerSplash;
   splashVelocity = 4.0;
   splashAngle = 67.0;
   splashFreqMod = 300.0;
   splashVelEpsilon = 0.60;
   bubbleEmitTime = 0.4;
   splashEmitter[0] = PlayerFoamDropletsEmitter;
   splashEmitter[1] = PlayerFoamEmitter;
   splashEmitter[2] = PlayerBubbleEmitter;
   mediumSplashSoundVelocity = 10.0;   
   hardSplashSoundVelocity = 20.0;   
   exitSplashSoundVelocity = 5.0;

   // Controls over slope of runnable/jumpable surfaces
   // KP:  This seems to control your "stickiness" to surfaces.  Can affect the
   //      fluidity of skiing when friction is enabled.  Best used in
   //      conjunction with runForce.
   runSurfaceAngle  = $TR2_playerRunSurfaceAngle;
   jumpSurfaceAngle = $TR2_playerJumpSurfaceAngle;

   // KP:  These don't seem to have an obvious effect, but might be useful
   minJumpSpeed = $TR2_playerMinJumpSpeed;
   maxJumpSpeed = $TR2_playerMaxJumpSpeed;

   // KP:  Max speed settings including resistance.  High resistSpeed seems to
   //      result in faster movement.  resistFactor determines the magnitude of
   //      the resistance.
   horizMaxSpeed = $TR2_playerHorizMaxSpeed;
   horizResistSpeed = $TR2_playerHorizResistSpeed;
   horizResistFactor = $TR2_playerHorizResistFactor;
   
   // KP:  Limits how much your jets can affect your forward speed...very useful
   //      for balancing how much your speed can be increased by jets as opposed to
   //      pure skiing
   maxJetForwardSpeed = $TR2_playerMaxJetForwardSpeed;

   // KP:  Same as horizontal counterparts.  Should be set so that players can't
   //      go too high.  Must be careful not to make it feel too "floaty"
   upMaxSpeed = $TR2_playerUpMaxSpeed;
   upResistSpeed = $TR2_playerUpResistSpeed;
   upResistFactor = $TR2_playerUpResistFactor;
   
   // heat inc'ers and dec'ers
   heatDecayPerSec      = 1.0 / 4.0; // takes 4 seconds to clear heat sig.
   heatIncreasePerSec   = 1.0 / 3.0; // takes 3.0 seconds of constant jet to get full heat sig.

   footstepSplashHeight = 0.35;
   //Footstep Sounds
   LFootSoftSound       = LFootLightSoftSound;
   RFootSoftSound       = RFootLightSoftSound;
   LFootHardSound       = LFootLightHardSound;
   RFootHardSound       = RFootLightHardSound;
   LFootMetalSound      = LFootLightMetalSound;
   RFootMetalSound      = RFootLightMetalSound;
   LFootSnowSound       = LFootLightSnowSound;
   RFootSnowSound       = RFootLightSnowSound;
   LFootShallowSound    = LFootLightShallowSplashSound;
   RFootShallowSound    = RFootLightShallowSplashSound;
   LFootWadingSound     = LFootLightWadingSound;
   RFootWadingSound     = RFootLightWadingSound;
   LFootUnderwaterSound = LFootLightUnderwaterSound;
   RFootUnderwaterSound = RFootLightUnderwaterSound;
   LFootBubblesSound    = LFootLightBubblesSound;
   RFootBubblesSound    = RFootLightBubblesSound;
   movingBubblesSound   = ArmorMoveBubblesSound;
   waterBreathSound     = WaterBreathMaleSound;

   impactSoftSound      = ImpactLightSoftSound;
   impactHardSound      = ImpactLightHardSound;
   impactMetalSound     = ImpactLightMetalSound;
   impactSnowSound      = ImpactLightSnowSound;
   
   skiSoftSound         = "";//TR2SkiAllSoftSound;
   skiHardSound         = "";//SkiAllHardSound;
   skiMetalSound        = SkiAllMetalSound;
   skiSnowSound         = SkiAllSnowSound;

   impactWaterEasy      = ImpactLightWaterEasySound;
   impactWaterMedium    = ImpactLightWaterMediumSound;
   impactWaterHard      = ImpactLightWaterHardSound;
   
   // KP:  Removed the annoying shaking upon impact
   groundImpactMinSpeed    = 30.0;//10.0;
   groundImpactShakeFreq   = "4.0 4.0 4.0";
   groundImpactShakeAmp    = "0.1 0.1 0.1";//"1.0 1.0 1.0";
   groundImpactShakeDuration = 0.05;//0.8;
   groundImpactShakeFalloff = 2.0;//10.0;
   
   exitingWater         = ExitingWaterLightSound;
   
   maxWeapons = 3;           // Max number of different weapons the player can have
   maxGrenades = 1;          // Max number of different grenades the player can have
   maxMines = 1;             // Max number of different mines the player can have
   
   // Inventory restrictions
   max[RepairKit]          = 1;
   max[Mine]               = 3;
   max[Grenade]            = 5;
   max[Blaster]            = 1;
   max[Plasma]             = 1;
   max[PlasmaAmmo]         = 20;
   max[Disc]               = 1;
   max[DiscAmmo]           = 15;
   max[SniperRifle]        = 1;
   max[GrenadeLauncher]    = 1;
   max[GrenadeLauncherAmmo]= 10;
   max[Mortar]             = 0;
   max[MortarAmmo]         = 0;
   max[MissileLauncher]    = 0;
   max[MissileLauncherAmmo]= 0;
   max[Chaingun]           = 1;
   max[ChaingunAmmo]       = 100;
   max[RepairGun]          = 1;
   max[CloakingPack]       = 1;
   max[SensorJammerPack]   = 1;
   max[EnergyPack]         = 1;
   max[RepairPack]         = 1;
   max[ShieldPack]         = 1;
   max[AmmoPack]           = 1;
   max[SatchelCharge]      = 1;
   max[MortarBarrelPack]   = 0;
   max[MissileBarrelPack]  = 0;
   max[AABarrelPack]       = 0;
   max[PlasmaBarrelPack]   = 0;
   max[ELFBarrelPack]      = 0;
   max[InventoryDeployable]= 0;
   max[MotionSensorDeployable]   = 1;
   max[PulseSensorDeployable]    = 1;
   max[TurretOutdoorDeployable]  = 0;
   max[TurretIndoorDeployable]   = 0;
   max[FlashGrenade]       = 5;
   max[ConcussionGrenade]  = 5;
   max[FlareGrenade]       = 5;
   max[TargetingLaser]     = 1;
   max[ELFGun]             = 1;
   max[ShockLance]         = 1;
   max[CameraGrenade]      = 2;
   max[Beacon]             = 3;

   // TR2
   max[TR2Disc]            = 1;
   max[TR2GrenadeLauncher] = 1;
   max[TR2Chaingun]        = 1;
   max[TR2GoldTargetingLaser]  = 1;
   max[TR2SilverTargetingLaser]  = 1;
   max[TR2Grenade]            = 5;
   max[TR2DiscAmmo]            = 15;
   max[TR2GrenadeLauncherAmmo] = 10;
   max[TR2ChaingunAmmo]        = 100;
   max[TR2EnergyPack]          = 1;
   
   observeParameters = "1.0 12.0 12.0";//$TR2_playerObserveParameters;//"1.0 32.0 32.0";//"0.5 4.5 4.5";

   shieldEffectScale = "0.7 0.7 1.0";
};

datablock PlayerData(TR2LightFemaleHumanArmor) : TR2LightMaleHumanArmor
{
   shapeFile = "TR2light_female.dts";
   waterBreathSound = WaterBreathFemaleSound;
   jetEffect = HumanMediumArmorJetEffect;
};

datablock ItemData(TR2DummyArmor)// : TR2LightMaleHumanArmor
{
   shapeFile = "statue_lmale.dts";
};

datablock PlayerData(TR2MediumMaleHumanArmor) : TR2LightMaleHumanArmor
{
   emap = true;

   className = Armor;
   shapeFile = "TR2medium_male.dts";
   maxDamage = 1.55;//1.1;

   jetSound = ArmorJetSound;
   wetJetSound = ArmorWetJetSound;

   jetEmitter = HumanArmorJetEmitter;
   jetEffect = HumanMediumArmorJetEffect;

   boundingBox = "2.9 2.3 5.2";
   boxHeadFrontPercentage        = 1;

   //Foot Prints
   decalData   = MediumMaleFootprint;
   decalOffset = 0.35;

   footPuffEmitter = LightPuffEmitter;
   footPuffNumParts = 15;
   footPuffRadius = 0.25;

   dustEmitter = LiftoffDustEmitter;

   splash = PlayerSplash;
   splashVelocity = 4.0;
   splashAngle = 67.0;
   splashFreqMod = 300.0;
   splashVelEpsilon = 0.60;
   bubbleEmitTime = 0.4;
   splashEmitter[0] = PlayerFoamDropletsEmitter;
   splashEmitter[1] = PlayerFoamEmitter;
   splashEmitter[2] = PlayerBubbleEmitter;
   mediumSplashSoundVelocity = 10.0;
   hardSplashSoundVelocity = 20.0;
   exitSplashSoundVelocity = 5.0;

   footstepSplashHeight = 0.35;
   //Footstep Sounds
   LFootSoftSound       = LFootMediumSoftSound;
   RFootSoftSound       = RFootMediumSoftSound;
   LFootHardSound       = LFootMediumHardSound;
   RFootHardSound       = RFootMediumHardSound;
   LFootMetalSound      = LFootMediumMetalSound;
   RFootMetalSound      = RFootMediumMetalSound;
   LFootSnowSound       = LFootMediumSnowSound;
   RFootSnowSound       = RFootMediumSnowSound;
   LFootShallowSound    = LFootMediumShallowSplashSound;
   RFootShallowSound    = RFootMediumShallowSplashSound;
   LFootWadingSound     = LFootMediumWadingSound;
   RFootWadingSound     = RFootMediumWadingSound;
   LFootUnderwaterSound = LFootMediumUnderwaterSound;
   RFootUnderwaterSound = RFootMediumUnderwaterSound;
   LFootBubblesSound    = LFootMediumBubblesSound;
   RFootBubblesSound    = RFootMediumBubblesSound;
   movingBubblesSound   = ArmorMoveBubblesSound;
   waterBreathSound     = WaterBreathMaleSound;

   impactSoftSound      = ImpactMediumSoftSound;
   impactHardSound      = ImpactMediumHardSound;
   impactMetalSound     = ImpactMediumMetalSound;
   impactSnowSound      = ImpactMediumSnowSound;

   impactWaterEasy      = ImpactMediumWaterEasySound;
   impactWaterMedium    = ImpactMediumWaterMediumSound;
   impactWaterHard      = ImpactMediumWaterHardSound;

   exitingWater         = ExitingWaterMediumSound;

   maxWeapons = 4;            // Max number of different weapons the player can have
   maxGrenades = 1;           // Max number of different grenades the player can have
   maxMines = 1;              // Max number of different mines the player can have

   // Inventory restrictions
   max[RepairKit]          = 1;
   max[Mine]               = 3;
   max[Grenade]            = 6;
   max[Blaster]            = 1;
   max[Plasma]             = 1;
   max[PlasmaAmmo]         = 40;
   max[Disc]               = 1;
   max[DiscAmmo]           = 15;
   max[SniperRifle]        = 0;
   max[GrenadeLauncher]    = 1;
   max[GrenadeLauncherAmmo]= 12;
   max[Mortar]             = 0;
   max[MortarAmmo]         = 0;
   max[MissileLauncher]    = 1;
   max[MissileLauncherAmmo]= 4;
   max[Chaingun]           = 1;
   max[ChaingunAmmo]       = 150;
   max[RepairGun]          = 1;
   max[CloakingPack]       = 0;
   max[SensorJammerPack]   = 1;
   max[EnergyPack]         = 1;
   max[RepairPack]         = 1;
   max[ShieldPack]         = 1;
   max[AmmoPack]           = 1;
   max[SatchelCharge]      = 1;
   max[MortarBarrelPack]   = 1;
   max[MissileBarrelPack]  = 1;
   max[AABarrelPack]       = 1;
   max[PlasmaBarrelPack]   = 1;
   max[ELFBarrelPack]      = 1;
   max[InventoryDeployable]= 1;
   max[MotionSensorDeployable]   = 1;
   max[PulseSensorDeployable] = 1;
   max[TurretOutdoorDeployable]     = 1;
   max[TurretIndoorDeployable]   = 1;
   max[FlashGrenade]       = 6;
   max[ConcussionGrenade]  = 6;
   max[FlareGrenade]       = 6;
   max[TargetingLaser]         = 1;
   max[ELFGun]             = 1;
   max[ShockLance]         = 1;
   max[CameraGrenade]      = 3;
   max[Beacon]             = 3;
   
      max[TR2Shocklance]      = 1;

   shieldEffectScale = "0.7 0.7 1.0";
};

datablock PlayerData(TR2MediumFemaleHumanArmor) : TR2MediumMaleHumanArmor
{
   shapeFile = "TR2medium_female.dts";
};


datablock PlayerData(TR2HeavyMaleHumanArmor) : TR2LightMaleHumanArmor
{
   emap = true;
   
   mass = 245;
   jetForce = 14000;
   jumpForce = 3500;
   runForce = 22000;

   className = Armor;
   shapeFile = "TR2heavy_male.dts";
   cameraMaxDist = 14;

   boundingBox = "6.2 6.2 9.0";
   maxDamage = 6.0;//1.32;
   
   // Give lots of energy to goalies
   maxEnergy =  120;//60;
   maxJetHorizontalPercentage = 1.0;

   //Foot Prints
   decalData   = HeavyMaleFootprint;
   decalOffset = 0.4;

   footPuffEmitter = LightPuffEmitter;
   footPuffNumParts = 15;
   footPuffRadius = 0.25;

   dustEmitter = LiftoffDustEmitter;

   //Footstep Sounds
   LFootSoftSound       = LFootHeavySoftSound;
   RFootSoftSound       = RFootHeavySoftSound;
   LFootHardSound       = LFootHeavyHardSound;
   RFootHardSound       = RFootHeavyHardSound;
   LFootMetalSound      = LFootHeavyMetalSound;
   RFootMetalSound      = RFootHeavyMetalSound;
   LFootSnowSound       = LFootHeavySnowSound;
   RFootSnowSound       = RFootHeavySnowSound;
   LFootShallowSound    = LFootHeavyShallowSplashSound;
   RFootShallowSound    = RFootHeavyShallowSplashSound;
   LFootWadingSound     = LFootHeavyWadingSound;
   RFootWadingSound     = RFootHeavyWadingSound;
   LFootUnderwaterSound = LFootHeavyUnderwaterSound;
   RFootUnderwaterSound = RFootHeavyUnderwaterSound;
   LFootBubblesSound    = LFootHeavyBubblesSound;
   RFootBubblesSound    = RFootHeavyBubblesSound;
   movingBubblesSound   = ArmorMoveBubblesSound;
   waterBreathSound     = WaterBreathMaleSound;

   impactSoftSound      = ImpactHeavySoftSound;
   impactHardSound      = ImpactHeavyHardSound;
   impactMetalSound     = ImpactHeavyMetalSound;
   impactSnowSound      = ImpactHeavySnowSound;

   impactWaterEasy      = ImpactHeavyWaterEasySound;
   impactWaterMedium    = ImpactHeavyWaterMediumSound;
   impactWaterHard      = ImpactHeavyWaterHardSound;


   maxWeapons = 5;            // Max number of different weapons the player can have
   maxGrenades = 1;           // Max number of different grenades the player can have
   maxMines = 1;              // Max number of different mines the player can have

   // Inventory restrictions
   max[RepairKit]          = 1;
   max[Mine]               = 3;
   max[Grenade]            = 8;
   max[Blaster]            = 1;
   max[Plasma]             = 1;
   max[PlasmaAmmo]         = 50;
   max[Disc]               = 1;
   max[DiscAmmo]           = 15;
   max[SniperRifle]        = 0;
   max[GrenadeLauncher]    = 1;
   max[GrenadeLauncherAmmo]= 15;
   max[Mortar]             = 1;
   max[MortarAmmo]         = 10;
   max[MissileLauncher]    = 1;
   max[MissileLauncherAmmo]= 8;
   max[Chaingun]           = 1;
   max[ChaingunAmmo]       = 200;
   max[RepairGun]          = 1;
   max[CloakingPack]       = 0;
   max[SensorJammerPack]   = 1;
   max[EnergyPack]         = 1;
   max[RepairPack]         = 1;
   max[ShieldPack]         = 1;
   max[AmmoPack]           = 1;
   max[SatchelCharge]      = 1;
   max[MortarBarrelPack]   = 1;
   max[MissileBarrelPack]  = 1;
   max[AABarrelPack]       = 1;
   max[PlasmaBarrelPack]   = 1;
   max[ELFBarrelPack]      = 1;
   max[InventoryDeployable]= 1;
   max[MotionSensorDeployable]   = 1;
   max[PulseSensorDeployable] = 1;
   max[TurretOutdoorDeployable]     = 1;
   max[TurretIndoorDeployable]   = 1;
   max[FlashGrenade]       = 8;
   max[ConcussionGrenade]  = 8;
   max[FlareGrenade]       = 8;
   max[TargetingLaser]     = 1;
   max[ELFGun]             = 1;
   max[ShockLance]         = 1;
   max[CameraGrenade]      = 3;
   max[Beacon]             = 3;
   
   max[TR2Mortar]          = 1;
   max[TR2MortarAmmo]      = 99;
      max[TR2Shocklance]      = 1;

   shieldEffectScale = "0.7 0.7 1.0";
};

datablock PlayerData(TR2HeavyFemaleHumanArmor) : TR2HeavyMaleHumanArmor
{
   className = Armor;
};
