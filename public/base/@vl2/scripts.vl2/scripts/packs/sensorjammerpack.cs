// ------------------------------------------------------------------
// SENSOR JAMMER PACK
//
// When activated, the sensor jammer pack emits a sensor-jamming field of
// 20m radius. Any players within this field are completely invisible to
// all sensors, turrets and cameras.
//
// When not activated, the pack has no effect.
//
datablock EffectProfile(SensorJammerPackActivateEffect)
{
   effectname = "packs/cloak_on";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock AudioProfile(SensorJammerActivateSound)
{
   filename = "fx/packs/sensorjammerpack_on.wav";
   description = ClosestLooping3d;
   preload = true;
   effect = SensorJammerPackActivateEffect;
};

datablock ShapeBaseImageData(SensorJammerPackImage)
{
   shapeFile = "pack_upgrade_sensorjammer.dts";
   item = SensorJammerPack;
   mountPoint = 1;
   offset = "0 0 0";

   usesEnergy = true;
   minEnergy = 3;

   stateName[0] = "Idle";
   stateTransitionOnTriggerDown[0] = "Activate";
   
   stateName[1] = "Activate";
   stateScript[1] = "onActivate";
   stateSequence[1] = "fire";
   stateSound[1] = SensorJammerActivateSound;
   stateEnergyDrain[1] = 10.5;
   stateTransitionOnTriggerUp[1] = "Deactivate";
   stateTransitionOnNoAmmo[1] = "Deactivate";

   stateName[2] = "Deactivate";
   stateScript[2] = "onDeactivate";
   stateTransitionOnTimeout[2] = "Idle";
};

datablock ItemData(SensorJammerPack)
{
   className = Pack;
   catagory = "Packs";
   shapeFile = "pack_upgrade_sensorjammer.dts";
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
   rotate = true;
   image = "SensorJammerPackImage";
   pickUpName = "a sensor jammer pack";

   computeCRC = true;
};

// datablock SensorData(JammerSensorObjectPassive)
// {
//    // same detection info as 'PlayerObject' sensorData
//    detects = true;
//    detectsUsingLOS = true;
//    detectsPassiveJammed = true;
//    detectRadius = 2000;
//    detectionPings = false;
//    detectsFOVOnly = true;
//    detectFOVPercent = 1.3;
//    useObjectFOV = true;
// 
//    jams = true;
//    jamsOnlyGroup = true;
//    jamsUsingLOS = true;
//    jamRadius = 0;
// };

datablock SensorData(JammerSensorObjectActive)
{
   // same detection info as 'PlayerObject' sensorData
   detects = true;
   detectsUsingLOS = true;
   detectsPassiveJammed = true;
   detectRadius = 2000;
   detectionPings = false;
   detectsFOVOnly = true;
   detectFOVPercent = 1.3;
   useObjectFOV = true;

   jams = true;
   jamsOnlyGroup = true;
   jamsUsingLOS = true;
   jamRadius = 30;
};

function SensorJammerPackImage::onUnmount(%data, %obj, %slot)
{
    setTargetSensorData(%obj.client.target, PlayerSensor);
    %obj.setImageTrigger(%slot, false);
}

function SensorJammerPackImage::onActivate(%data, %obj, %slot)
{
   messageClient(%obj.client, 'MsgSensorJammerPackOn', '\c2Sensor jammer pack on.');
   setTargetSensorData(%obj.client.target, JammerSensorObjectActive);
   if ( !isDemo() )
      commandToClient( %obj.client, 'setSenJamIconOn' );

   %obj.setJammerFX( true );
}

function SensorJammerPackImage::onDeactivate(%data, %obj, %slot)
{
   messageClient(%obj.client, 'MsgSensorJammerPackOff', '\c2Sensor jammer pack off.');
   %obj.setImageTrigger(%slot, false);
   setTargetSensorData(%obj.client.target, PlayerSensor);
   if ( !isDemo() )
      commandToClient( %obj.client, 'setSenJamIconOff' );

   %obj.setJammerFX( false );
}

function SensorJammerPack::onPickup(%this, %obj, %shape, %amount)
{
   // created to prevent console errors
}
