//--------------------------------------------------------------------------
// Force fields:
//
//  accept the following commands:
//    open()
//    close()
//
//--------------------------------------------------------------------------


datablock ForceFieldBareData(defaultForceFieldBare)
{
   fadeMS           = 1000;
   baseTranslucency = 0.30;
   powerOffTranslucency = 0.0;
   teamPermiable    = false;
   otherPermiable   = false;
   color            = "0.0 0.55 0.99";
   powerOffColor    = "0.0 0.0 0.0";
   targetNameTag    = 'Force Field';
   targetTypeTag    = 'ForceField'; 

   texture[0] = "skins/forcef1";
   texture[1] = "skins/forcef2";
   texture[2] = "skins/forcef3";
   texture[3] = "skins/forcef4";
   texture[4] = "skins/forcef5";

   framesPerSec = 10;
   numFrames = 5;
   scrollSpeed = 15;
   umapping = 1.0;
   vmapping = 0.15;
};


datablock ForceFieldBareData(defaultTeamSlowFieldBare)
{
   fadeMS           = 1000;
   baseTranslucency = 0.3;
   powerOffTranslucency = 0.0;
   teamPermiable    = true;
   otherPermiable   = false;
   color            = "0.28 0.89 0.31";
   powerOffColor    = "0.0 0.0 0.0";
   targetTypeTag    = 'ForceField'; 

   texture[0] = "skins/forcef1";
   texture[1] = "skins/forcef2";
   texture[2] = "skins/forcef3";
   texture[3] = "skins/forcef4";
   texture[4] = "skins/forcef5";

   framesPerSec = 10;
   numFrames = 5;
   scrollSpeed = 15;
   umapping = 1.0;
   vmapping = 0.15;
};

datablock ForceFieldBareData(defaultAllSlowFieldBare)
{
   fadeMS           = 1000;
   baseTranslucency = 0.30;
   powerOffTranslucency = 0.0;
   teamPermiable    = true;
   otherPermiable   = true;
   color            = "1.0 0.4 0.0";   
   powerOffColor    = "0.0 0.0 0.0";
   targetTypeTag    = 'ForceField'; 

   texture[0] = "skins/forcef1";
   texture[1] = "skins/forcef2";
   texture[2] = "skins/forcef3";
   texture[3] = "skins/forcef4";
   texture[4] = "skins/forcef5";

   framesPerSec = 10;
   numFrames = 5;
   scrollSpeed = 15;
   umapping = 1.0;
   vmapping = 0.15;
};

datablock ForceFieldBareData(defaultNoTeamSlowFieldBare)
{
   fadeMS           = 1000;
   baseTranslucency = 0.30;
   powerOffTranslucency = 0.0;
   teamPermiable    = false;
   otherPermiable   = true;
   color            = "1.0 0.0 0.0";
   powerOffColor    = "0.0 0.0 0.0";
   targetTypeTag    = 'ForceField'; 

   texture[0] = "skins/forcef1";
   texture[1] = "skins/forcef2";
   texture[2] = "skins/forcef3";
   texture[3] = "skins/forcef4";
   texture[4] = "skins/forcef5";

   framesPerSec = 10;
   numFrames = 5;
   scrollSpeed = 15;
   umapping = 1.0;
   vmapping = 0.15;
};

datablock ForceFieldBareData(defaultSolidFieldBare)
{
   fadeMS           = 1000;
   baseTranslucency = 0.30;
   powerOffTranslucency = 0.0;
   teamPermiable    = false;
   otherPermiable   = false;
   color            = "1.0 0.0 0.0";
   powerOffColor    = "0.0 0.0 0.0";
   targetTypeTag    = 'ForceField'; 

   texture[0] = "skins/forcef1";
   texture[1] = "skins/forcef2";
   texture[2] = "skins/forcef3";
   texture[3] = "skins/forcef4";
   texture[4] = "skins/forcef5";

   framesPerSec = 10;
   numFrames = 5;
   scrollSpeed = 15;
   umapping = 1.0;
   vmapping = 0.15;
};


function ForceFieldBare::onTrigger(%this, %triggerId, %on)
{
   // Default behavior for a field:
   //  if triggered:   go to open state (last waypoint)
   //  if untriggered: go to closed state (first waypoint)

   if (%on == 1) {
      %this.triggerCount++;
   } else {
      if (%this.triggerCount > 0)
         %this.triggerCount--;
   }

   if (%this.triggerCount > 0) {
      %this.open();
   } else {
      %this.close();
   }
}

function ForceFieldBareData::gainPower(%data, %obj)
{
   Parent::gainPower(%data, %obj);
   %obj.close();
	// activate the field's physical zone
	%pzGroup = nameToID("MissionCleanup/PZones");
	if(%pzGroup > 0) {
		%ffp = -1;
		for(%i = 0; %i < %pzGroup.getCount(); %i++) {
			%pz = %pzGroup.getObject(%i);
			if(%pz.ffield == %obj) {
				%ffp = %pz;
				break;
			}
		}
		if(%ffp > 0) {
			%ffp.activate();
         if( %data.getName() $= "defaultForceFieldBare" )
         {   
            killAllPlayersWithinZone( %data, %obj );
		   }
         else if( %data.getName() $= "defaultTeamSlowFieldBare" )
         {
            %team = %obj.team;
            killAllPlayersWithinZone( %data, %obj, %team );
         }   
		}
	}
	//else
	//	error("No PZones group to search!");
}

function killAllPlayersWithinZone( %data, %obj, %team )
{
   for( %c = 0; %c < ClientGroup.getCount(); %c++ )
   {
      %client = ClientGroup.getObject(%c);
      if( isObject( %client.player ) )
      {
         if( %forceField = %client.player.isInForceField() )// isInForceField() will return the id of the ff or zero
         {
            if( %forceField == %obj )
            {
               if( %team !$= "" && %team == %client.team )
                  return; 
               else
               {   
                  %client.player.blowup(); // chunkOrama!
                  %client.player.scriptkill($DamageType::ForceFieldPowerup);
               }
            }
         }
      }
   }  
}

function ForceFieldBareData::losePower(%data, %obj)
{
   Parent::losePower(%data, %obj);
   %obj.open();
	// deactivate the field's physical zone
	%pzGroup = nameToID("MissionCleanup/PZones");
	if(%pzGroup > 0) {
		%ffp = -1;
		for(%i = 0; %i < %pzGroup.getCount(); %i++) {
			%pz = %pzGroup.getObject(%i);
			if(%pz.ffield == %obj) {
				%ffp = %pz;
				break;
			}
		}
		if(%ffp > 0) {
			%ffp.deactivate();
		}
	}
	//else
	//	error("<No PZones group to search!>");
}
 
function ForceFieldBareData::onAdd(%data, %obj)
{
   Parent::onAdd(%data, %obj);

   %pz = new PhysicalZone() {
      position = %obj.position;
      rotation = %obj.rotation;
      scale    = %obj.scale;
      polyhedron = "0.000000 1.0000000 0.0000000 1.0000000 0.0000000 0.0000000 0.0000000 -1.0000000 0.0000000 0.0000000 0.0000000 1.0000000";
      velocityMod  = 0.1;
      gravityMod   = 1.0;
      appliedForce = "0 0 0";
		ffield = %obj;
   };
	%pzGroup = nameToID("MissionCleanup/PZones");
	if(%pzGroup <= 0) {
		%pzGroup = new SimGroup("PZones");
		MissionCleanup.add(%pzGroup);
	}
	%pzGroup.add(%pz);
   //MissionCleanupGroup.add(%pz);
}


