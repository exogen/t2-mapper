//------------------------------------------------------------------------------
datablock EffectProfile(VehicleAppearEffect)
{
   effectname = "vehicles/inventory_pad_appear";
   minDistance = 5;
   maxDistance = 10;
};

datablock EffectProfile(ActivateVehiclePadEffect)
{
   effectname = "powered/vehicle_pad_on";
   minDistance = 20;
   maxDistance = 30;
};

datablock AudioProfile(VehicleAppearSound)
{
   filename    = "fx/vehicles/inventory_pad_appear.wav";
   description = AudioClosest3d;
   preload = true;
   effect = VehicleAppearEffect;
};

datablock AudioProfile(ActivateVehiclePadSound)
{
   filename = 	"fx/powered/vehicle_pad_on.wav";
   description = AudioClose3d;
   preload = true;
   effect = ActivateVehiclePadEffect;
};

datablock StationFXVehicleData( VehicleInvFX )
{
   lifetime = 6.0;

   glowTopHeight = 1.5;
   glowBottomHeight = 0.1;
   glowTopRadius = 12.5;
   glowBottomRadius = 12.0;
   numGlowSegments = 26;
   glowFadeTime = 3.25;
   
   armLightDelay = 2.3;
   armLightLifetime = 3.0;
   armLightFadeTime = 1.5;
   numArcSegments = 10.0;

   sphereColor = "0.1 0.1 0.5";
   spherePhiSegments = 13;
   sphereThetaSegments = 8;
   sphereRadius = 12.0;
   sphereScale = "1.05 1.05 0.85";
   
   glowNodeName = "GLOWFX";

   leftNodeName[0]   = "LFX1";
   leftNodeName[1]   = "LFX2";
   leftNodeName[2]   = "LFX3";
   leftNodeName[3]   = "LFX4";

   rightNodeName[0]  = "RFX1";
   rightNodeName[1]  = "RFX2";
   rightNodeName[2]  = "RFX3";
   rightNodeName[3]  = "RFX4";


   texture[0] = "special/stationGlow";
   texture[1] = "special/stationLight2";
};

//------------------------------------------------------------------------------
//------------------------------------------------------------------------------
function serverCmdBuyVehicle(%client, %blockName)
{
   %team = %client.getSensorGroup();
   if(vehicleCheck(%blockName, %team))        
   {
      %station = %client.player.station.pad;
      if( (%station.ready) && (%station.station.vehicle[%blockName]) )
      {
         %trans = %station.getTransform();
         %pos = getWords(%trans, 0, 2);
         %matrix = VectorOrthoBasis(getWords(%trans, 3, 6));
         %yrot = getWords(%matrix, 3, 5);
         %p = vectorAdd(%pos,vectorScale(%yrot, -3));
         %p =  getWords(%p,0, 1) @ " " @ getWord(%p,2) + 4;

//         error(%blockName);
//         error(%blockName.spawnOffset);

         %p = vectorAdd(%p, %blockName.spawnOffset);
         %rot = getWords(%trans, 3, 5);
         %angle = getWord(%trans, 6) + 3.14;
         %mask = $TypeMasks::VehicleObjectType | $TypeMasks::PlayerObjectType | 
                 $TypeMasks::StationObjectType | $TypeMasks::TurretObjectType;
	      InitContainerRadiusSearch(%p, %blockName.checkRadius, %mask);
   
	      %clear = 1;
         for (%x = 0; (%obj = containerSearchNext()) != 0; %x++) 
         {
            if((%obj.getType() & $TypeMasks::VehicleObjectType) && (%obj.getDataBlock().checkIfPlayersMounted(%obj)))
            {
               %clear = 0;
               break;
            }
            else
               %removeObjects[%x] = %obj;
         }
         if(%clear)
         {
            %fadeTime = 0;
            for(%i = 0; %i < %x; %i++)
            {
               if(%removeObjects[%i].getType() & $TypeMasks::PlayerObjectType)
               {
                  %pData = %removeObjects[%i].getDataBlock();
                  %pData.damageObject(%removeObjects[%i], 0, "0 0 0", 1000, $DamageType::VehicleSpawn);
               }
               else
               {
                  %removeObjects[%i].mountable = 0;
                  %removeObjects[%i].startFade( 1000, 0, true );
                  %removeObjects[%i].schedule(1001, "delete");
                  %fadeTime = 1500;
               }
            }
            schedule(%fadeTime, 0, "createVehicle", %client, %station, %blockName, %team , %p, %rot, %angle);
         }
         else
            MessageClient(%client, "", 'Can\'t create vehicle. A player is on the creation pad.'); 
      }
   }
}

function createVehicle(%client, %station, %blockName, %team , %pos, %rot, %angle)
{
   %obj = %blockName.create(%team);   
   if(%obj)
   {
      %station.ready = false;
      %obj.team = %team;
      %obj.useCreateHeight(true);
      %obj.schedule(5500, "useCreateHeight", false);
      %obj.getDataBlock().isMountable(%obj, false);
      %obj.getDataBlock().schedule(6500, "isMountable", %obj, true);
      
      %station.playThread($ActivateThread,"activate2");
      %station.playAudio($ActivateSound, ActivateVehiclePadSound);

      vehicleListAdd(%blockName, %obj);
      MissionCleanup.add(%obj);
                                  
      %turret = %obj.getMountNodeObject(10);
      if(%turret > 0)
      {
         %turret.setCloaked(true);
         %turret.schedule(4800, "setCloaked", false);
      }
      
      %obj.setCloaked(true);
      %obj.setTransform(%pos @ " " @ %rot @ " " @ %angle);
   
      %obj.schedule(3700, "playAudio", 0, VehicleAppearSound);
      %obj.schedule(4800, "setCloaked", false);
      
      if(%client.player.lastVehicle)
      {
         %client.player.lastVehicle.lastPilot = "";
         vehicleAbandonTimeOut(%client.player.lastVehicle);
         %client.player.lastVehicle = "";
      }   
      %client.player.lastVehicle = %obj;
      %obj.lastPilot = %client.player;

      // play the FX
      %fx = new StationFXVehicle()
      {
         dataBlock = VehicleInvFX;
         stationObject = %station;
      };

      if ( %client.isVehicleTeleportEnabled() )
         %obj.getDataBlock().schedule(5000, "mountDriver", %obj, %client.player);
   }
   if(%obj.getTarget() != -1)
      setTargetSensorGroup(%obj.getTarget(), %client.getSensorGroup());
   // We are now closing the vehicle hud when you buy a vehicle, making the following call
   // unnecessary (and it breaks stuff, too!)
   //VehicleHud.updateHud(%client, 'vehicleHud');
}

//------------------------------------------------------------------------------
function VehicleData::mountDriver(%data, %obj, %player)
{
   if(isObject(%obj) && %obj.getDamageState() !$= "Destroyed")
   {
      %player.startFade(1000, 0, true);
      schedule(1000, 0, "testVehicleForMount", %player, %obj);
      %player.schedule(1500,"startFade",1000, 0, false);
   }
}

function testVehicleForMount(%player, %obj)
{
   if(isObject(%obj) && %obj.getDamageState() !$= "Destroyed")
      %player.getDataBlock().onCollision(%player, %obj, 0);
}


//------------------------------------------------------------------------------
function VehicleData::checkIfPlayersMounted(%data, %obj)
{
   for(%i = 0; %i < %obj.getDatablock().numMountPoints; %i++)
      if (%obj.getMountNodeObject(%i))
         return true; 
   return false;
}

//------------------------------------------------------------------------------
function VehicleData::isMountable(%data, %obj, %val)
{
   %obj.mountable = %val;
}

//------------------------------------------------------------------------------
function vehicleCheck(%blockName, %team)
{
   if(($VehicleMax[%blockName] - $VehicleTotalCount[%team, %blockName]) > 0)
      return true;   
//   else
//   {
//      for(%i = 0; %i < $VehicleMax[%blockName]; %i++)
//      {
//         %obj = $VehicleInField[%blockName, %i];      
//         if(%obj.abandon)
//         {
//            vehicleListRemove(%blockName, %obj);
//            %obj.delete();
//            return true;
//         }
//      }
//   }
   return false;
}
	
//------------------------------------------------------------------------------
function VehicleHud::updateHud( %obj, %client, %tag )
{
   %station = %client.player.station;
// Not sure if we need to clear the huds... They'll always have the same num rows...
   //if ( %station.lastCount !$= "" )
   //   VehicleHud::clearHud( %client, %tag, %station.lastCount );

   %team = %client.getSensorGroup();
   %count = 0;
   if ( %station.vehicle[scoutVehicle] )
   {
      messageClient( %client, 'SetLineHud', "", %tag, %count, "GRAV CYCLE", "", ScoutVehicle, $VehicleMax[ScoutVehicle] - $VehicleTotalCount[%team, ScoutVehicle] );
//new      messageClient( %client, 'SetLineHud', "", %tag, %count, 'ScoutVehicle', $VehicleMax[ScoutVehicle] - $VehicleTotalCount[%team, ScoutVehicle], '', "GRAV CYCLE" );
      %count++;
   }
   if ( %station.vehicle[AssaultVehicle] )
   {
      messageClient( %client, 'SetLineHud', "", %tag, %count, "ASSAULT TANK", "", AssaultVehicle, $VehicleMax[AssaultVehicle] - $VehicleTotalCount[%team, AssaultVehicle] );
//new      messageClient( %client, 'SetLineHud', "", %tag, %count, 'AssaultVehicle', $VehicleMax[AssaultVehicle] - $VehicleTotalCount[%team, AssaultVehicle], '', "ASSAULT TANK");
      %count++;
   }
   if ( %station.vehicle[mobileBaseVehicle] )
   {
      messageClient( %client, 'SetLineHud', "", %tag, %count, "MOBILE POINT BASE", "", MobileBaseVehicle, $VehicleMax[MobileBaseVehicle] - $VehicleTotalCount[%team, MobileBaseVehicle] );
//new      messageClient( %client, 'SetLineHud', "", %tag, %count, 'MobileBaseVehicle', $VehicleMax[MobileBaseVehicle] - $VehicleTotalCount[%team, MobileBaseVehicle], '', "MOBILE POINT BASE" );
      %count++;
   }
   if ( %station.vehicle[scoutFlyer] )
   {
      messageClient( %client, 'SetLineHud', "", %tag, %count, "SCOUT FLIER", "", ScoutFlyer, $VehicleMax[ScoutFlyer] - $VehicleTotalCount[%team, ScoutFlyer] );
//new      messageClient( %client, 'SetLineHud', "", %tag, %count, 'ScoutFlyer', $VehicleMax[ScoutFlyer] - $VehicleTotalCount[%team, ScoutFlyer], '', "SCOUT FLIER");
      %count++;
   }
   if ( %station.vehicle[bomberFlyer] )
   {
      messageClient( %client, 'SetLineHud', "", %tag, %count, "BOMBER", "", BomberFlyer, $VehicleMax[BomberFlyer] - $VehicleTotalCount[%team, BomberFlyer] );
//new      messageClient( %client, 'SetLineHud', "", %tag, %count, 'BomberFlyer', $VehicleMax[BomberFlyer] - $VehicleTotalCount[%team, BomberFlyer], '', "BOMBER");
      %count++;
   }
   if ( %station.vehicle[hapcFlyer] )
   {
      messageClient( %client, 'SetLineHud', "", %tag, %count, "TRANSPORT", "", HAPCFlyer, $VehicleMax[HAPCFlyer] - $VehicleTotalCount[%team, HAPCFlyer] ); 
//new      messageClient( %client, 'SetLineHud', "", %tag, %count, 'HAPCFlyer', $VehicleMax[HAPCFlyer] - $VehicleTotalCount[%team, HAPCFlyer], '', "TRANSPORT"); 
      %count++;
   }
   %station.lastCount = %count;
}

//------------------------------------------------------------------------------
function VehicleHud::clearHud( %obj, %client, %tag, %count )
{
   for ( %i = 0; %i < %count; %i++ )
      messageClient( %client, 'RemoveLineHud', "", %tag, %i );
}

//------------------------------------------------------------------------------
function serverCmdEnableVehicleTeleport( %client, %enabled )
{
   %client.setVehicleTeleportEnabled( %enabled );
}																							  
