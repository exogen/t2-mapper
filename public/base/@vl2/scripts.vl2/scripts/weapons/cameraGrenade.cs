// ------------------------------------------------------------------
// Deployable camera script
//
// Cameras will occupy grenade slots vice backpack slots. The player
// will "throw" them like grenades, and they should stick to (and
// deploy on) interior surfaces and terrain.
// ------------------------------------------------------------------

$TeamDeployableMax[DeployedCamera]  = 15;

// ------------------------------------------
// force-feedback effect datablocks
// ------------------------------------------

datablock EffectProfile(CameraGrenadeActivateEffect)
{
   effectname = "weapons/grenade_camera_activate";
   minDistance = 2.5;
   maxDistance = 5.0;
};

datablock EffectProfile(CameraGrenadeAttachEffect)
{
   effectname = "weapons/grenade_camera_activate";
   minDistance = 2.5;
   maxDistance = 5.0;
};

datablock EffectProfile(CameraGrenadeExplosionEffect)
{
   effectname = "explosions/explosion.xpl10";
   minDistance = 10;
   maxDistance = 30;
};

// ------------------------------------------
// sound datablocks
// ------------------------------------------

datablock AudioProfile(CameraGrenadeActivateSound)
{
   filename    = "fx/weapons/grenade_camera_activate.wav";
   description = AudioClosest3d;
   preload = true;
   effect = CameraGrenadeActivateEffect;
};

datablock AudioProfile(CameraGrenadeAttachSound)
{
   filename    = "fx/weapons/grenade_camera_attach.wav";
   description = AudioClosest3d;
   preload = true;
   effect = CameraGrenadeAttachEffect;
};

datablock AudioProfile(CameraGrenadeExplosionSound)
{
   filename = "fx/explosions/explosion.xpl10.wav";
   description = AudioExplosion3d;
   preload = true;
   effect = CameraGrenadeExplosionEffect;
};

//--------------------------------------------------------------------------
// Camera explosion particle effects
//--------------------------------------------------------------------------
datablock ExplosionData(CameraGrenadeExplosion)
{
   soundProfile = CameraGrenadeExplosionSound;
   faceViewer = true;

   explosionShape = "effect_plasma_explosion.dts";
   playSpeed      = 1.0;
   sizes[0] = "0.2 0.2 0.2";
   sizes[1] = "0.3 0.3 0.3";
};


// ------------------------------------------
// other datablocks
// ------------------------------------------

datablock ItemData(CameraGrenadeThrown)
{
   shapeFile = "camera.dts";
   mass = 0.7;
   elasticity = 0.2;
   friction = 1;
   pickupRadius = 2;
   maxDamage = 0.8;
   sticky = true;
   emap = true;
   
};

datablock ItemData(CameraGrenade)
{
   className = HandInventory;
   catagory = "Handheld";
   shapeFile = "camera.dts";
   mass = 0.7;
   elasticity = 0.2;
   friction = 1;
   pickupRadius = 2;
   thrownItem = CameraGrenadeThrown;
   pickUpName = "a deployable camera";

   computeCRC = true;
   emap = true;
};

datablock SensorData(CameraSensorObject)
{
   detects = true;
   detectsUsingLOS = true;
   detectionPings = false;
   detectsPassiveJammed = true;
   detectsActiveJammed = false;
   detectRadius = 40;
   detectsFOVOnly = true;
   useObjectFOV = true;
};

datablock TurretData(TurretDeployedCamera) : TurretDamageProfile
{
   className = CameraTurret;
   shapeFile = "camera.dts";

   mass = 0.7;
   maxDamage = 0.2;
   destroyedLevel = 0.2;
   disabledLevel = 0.2;
   repairRate = 0;
   explosion = CameraGrenadeExplosion;

   thetaMin = 0;
   thetaMax = 180;
   //thetaNull = 90;

	deployedObject = true;

   isShielded = false;
   energyPerDamagePoint = 40;
   maxEnergy = 30;
   renderWhenDestroyed = false;
   rechargeRate = 0.05;

   cameraDefaultFov = 150;
   cameraMinFov = 150;
   cameraMaxFov = 150;
   
   neverUpdateControl = true;

   canControl = true;
   canObserve = true;
   observeThroughObject = true;
   cmdCategory = "DSupport";
   cmdIcon = CMDCameraIcon;
   cmdMiniIconName = "commander/MiniIcons/com_camera_grey";
   targetNameTag = 'Deployed';
   targetTypeTag = 'Camera';
   sensorData = CameraSensorObject;
   sensorRadius = CameraSensorObject.detectRadius;

   firstPersonOnly = true;
   observeParameters = "0.5 4.5 4.5";

   debrisShapeName = "debris_generic_small.dts";
   debris = SmallShapeDebris;
};

datablock TurretImageData(DeployableCameraBarrel)
{
   shapeFile = "turret_muzzlepoint.dts";

   usesEnergy = false;

   // Turret parameters
   activationMS      = 100;
   deactivateDelayMS = 100;
   thinkTimeMS       = 100;
   degPerSecTheta    = 180;
   degPerSecPhi      = 360;
};

//------------------------------------------------------------------------------
// Functions:
//------------------------------------------------------------------------------
function CameraGrenadeThrown::onCollision( %data, %obj, %col )
{
   // Do nothing...
}

