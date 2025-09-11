//------------------------------------------------------------------------------
// Object control
//------------------------------------------------------------------------------
function getControlObjectType(%obj)
{
   // turrets (camera is a turret)
   if(%obj.getType() & $TypeMasks::TurretObjectType)
   {
      %barrel = %obj.getMountedImage(0);
      if(isObject(%barrel))
         return(addTaggedString(%barrel.getName()));
   }
   
   // unknown
   return('Unknown');
}

function serverCmdControlObject(%client, %targetId)
{
   // match started:
   if(!$MatchStarted)
   {
      commandToClient(%client, 'ControlObjectResponse', false, "mission has not started.");
      return;
   }
   
   // object:
   %obj = getTargetObject(%targetId);
   if(%obj == -1)
   {
      commandToClient(%client, 'ControlObjectResponse', false, "failed to find target object.");
      return;
   }

   // shapebase:
   if(!(%obj.getType() & $TypeMasks::ShapeBaseObjectType))
   {
      commandToClient(%client, 'ControlObjectResponse', false, "object cannot be controlled.");
      return;
   }

   // can control:
   if(!%obj.getDataBlock().canControl)
   {
      commandToClient(%client, 'ControlObjectResponse', false, "object cannot be controlled.");
      return;
   }

   // check damage:
   if(%obj.getDamageState() !$= "Enabled")
   {
      commandToClient(%client, 'ControlObjectResponse', false, "object is " @ %obj.getDamageState());
      return;
   }
   
   // powered:
   if(!%obj.isPowered())
   {
      commandToClient(%client, 'ControlObjectResponse', false, "object is not powered.");
      return;
   }

   // controlled already:
   %control = %obj.getControllingClient();
   if(%control)
   {
      if(%control == %client)
         commandToClient(%client, 'ControlObjectResponse', false, "you are already controlling that object.");
      else
         commandToClient(%client, 'ControlObjectResponse', false, "someone is already controlling that object.");
      return;
   }

   // same team?
   if(getTargetSensorGroup(%targetId) != %client.getSensorGroup())
   {
      commandToClient(%client, 'ControlObjectResonse', false, "cannot control enemy objects.");
      return;
   }

   // dead?
   if(%client.player == 0)
   {
      commandToClient(%client, 'ControlObjectResponse', false, "dead people cannot control objects.");
      return;
   }

   //mounted in a vehicle?
   if (%client.player.isMounted())
   {
      commandToClient(%client, 'ControlObjectResponse', false, "can't control objects while mounted in a vehicle.");
      return;
   }

   %client.setControlObject(%obj);
   commandToClient(%client, 'ControlObjectResponse', true, getControlObjectType(%obj));
}

//------------------------------------------------------------------------------
// TV Functions
//------------------------------------------------------------------------------
function resetControlObject(%client)
{
   if( isObject( %client.comCam ) )
      %client.comCam.delete();

   if(isObject(%client.player) && !%client.player.isDestroyed() && $MatchStarted)
      %client.setControlObject(%client.player);
   else
      %client.setControlObject(%client.camera);
}

function serverCmdResetControlObject(%client)
{
   resetControlObject(%client);
   commandToClient(%client, 'ControlObjectReset');
   // --------------------------------------------------------
   // z0dd - ZOD 4/18/02. Vehicle reticle disappearance fix.
   // commandToClient(%client, 'RemoveReticle');
   //if(isObject(%client.player))
   //{
   //   %weapon = %client.player.getMountedImage($WeaponSlot);
   //   %client.setWeaponsHudActive(%weapon.item);
   //}
   if(isObject(%client.player))
   {
      if(%client.player.isPilot() || %client.player.isWeaponOperator())
      {
         return;
      }
      else
      {
         commandToClient(%client, 'RemoveReticle');
         %weapon = %client.player.getMountedImage($WeaponSlot);
         %client.setWeaponsHudActive(%weapon.item);
      }
   }
   // End z0dd - ZOD
   // --------------------------------------------------------
}

function serverCmdAttachCommanderCamera(%client, %target)
{
   // dont allow observing until match has started
   if(!$MatchStarted)
   {
      commandToClient(%client, 'CameraAttachResponse', false);
      return;
   }

   %obj = getTargetObject(%target);
   if((%obj == -1) || (%target == -1))
   {
      commandToClient(%client, 'CameraAttachResponse', false);
      return;
   }

   // shape base object?
   if(!(%obj.getType() & $TypeMasks::ShapeBaseObjectType))
   {
      commandToClient(%client, 'CameraAttachResponse', false);
      return;
   }
   
   // can be observed?
   if(!%obj.getDataBlock() || !%obj.getDataBlock().canObserve)
   {
      commandToClient(%client, 'CameraAttachResponse', false);
      return;
   }

   // same team?
   if(getTargetSensorGroup(%target) != %client.getSensorGroup())
   {
      commandToClient(%client, 'CameraAttachResponse', false);
      return;
   }

   // powered?
   if(!%obj.isPowered())
   {
      commandToClient(%client, 'CameraAttachResponse', false);
      return;
   }

   // client connection?
   if(%obj.getClassName() $= "GameConnection")
   {
      %player = %obj.player;
      if(%obj == %client)
      {
         if(isObject(%player) && !%player.isDestroyed())
         {

            %client.setControlObject(%player);
            commandToClient(%client, 'CameraAttachResponse', true);
            return;
         }
      }

      %obj = %player;
   }

   if(!isObject(%obj) || %obj.isDestroyed())
   {
      commandToClient(%client, 'CameraAttachResponse', false);
      return;
   }

   %data = %obj.getDataBlock();
   %obsData = %data.observeParameters;
   %obsX = firstWord(%obsData);
   %obsY = getWord(%obsData, 1);
   %obsZ = getWord(%obsData, 2);

   // don't set the camera mode so that it does not interfere with spawning
   %transform = %obj.getTransform();

   // create a fresh camera to observe through... (could add to a list on
   // the observed camera to be removed when that object dies/...)   
   if( !isObject( %client.comCam ) )
   {
      %client.comCam = new Camera() 
      {
         dataBlock = CommanderCamera;
      };
      MissionCleanup.add(%client.comCam);
   }

   %client.comCam.setTransform(%transform);
   %client.comCam.setOrbitMode(%obj, %transform, %obsX, %obsY, %obsZ);

   %client.setControlObject(%client.comCam);
   commandToClient(%client, 'CameraAttachResponse', true);
}

//------------------------------------------------------------------------------
// Scoping
function serverCmdScopeCommanderMap(%client, %scope)
{
   if(%scope)
      resetControlObject(%client);
   %client.scopeCommanderMap(%scope);

   commandToClient(%client, 'ScopeCommanderMap', %scope);
}